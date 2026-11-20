// Casos de uso. Cada función recibe ctx = { db, clock, secret } y aplica las reglas de docs/SPEC.md.
import { randomUUID } from 'node:crypto';
import { fail } from './errors.js';
import { hashPassword, verificarPassword, firmarToken, verificarToken } from './auth.js';
import { fromLocal, localParts, fechaValida, hhmm } from './clock.js';
import { REGLAS, validarHorario, validarVentana, seSuperponen, calcularPrecio, cancelacionSinCargo, montoDeuda } from './rules.js';

const SIETE_DIAS_S = 7 * 24 * 3600;
const esUnica = (e) => e?.code === '23505' || /UNIQUE/i.test(e?.message ?? '');

export const usuarioPublico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

function sesion(ctx, u) {
  const exp = Math.floor(ctx.clock.now().getTime() / 1000) + SIETE_DIAS_S;
  return { token: firmarToken({ sub: u.id, exp }, ctx.secret), usuario: usuarioPublico(u) };
}

/** R22: registro de clienta. */
export async function registrar(ctx, { nombre, email, password } = {}) {
  nombre = String(nombre ?? '').trim();
  email = String(email ?? '').trim().toLowerCase();
  if (nombre.length < 2 || nombre.length > 60) throw fail(400, 'NOMBRE_INVALIDO', 'El nombre debe tener entre 2 y 60 caracteres.');
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'EMAIL_INVALIDO', 'El email no es válido.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
    throw fail(400, 'PASSWORD_INVALIDA', 'La contraseña debe tener al menos 8 caracteres.');
  }
  const u = { id: randomUUID(), nombre, email, rol: 'cliente' };
  try {
    if ((await ctx.db.query('SELECT id FROM usuarios WHERE email = $1', [email])).length) throw fail(409, 'EMAIL_EXISTENTE', 'Ya existe una cuenta con ese email.');
    await ctx.db.query(
      'INSERT INTO usuarios (id, nombre, email, password_hash, rol, creado) VALUES ($1,$2,$3,$4,$5,$6)',
      [u.id, u.nombre, u.email, await hashPassword(password), u.rol, ctx.clock.now().toISOString()],
    );
  } catch (e) {
    if (esUnica(e)) throw fail(409, 'EMAIL_EXISTENTE', 'Ya existe una cuenta con ese email.');
    throw e;
  }
  return sesion(ctx, u);
}

export async function entrar(ctx, { email, password } = {}) {
  const e = String(email ?? '').trim().toLowerCase();
  const [u] = await ctx.db.query('SELECT * FROM usuarios WHERE email = $1', [e]);
  const ok = u && typeof password === 'string' && (await verificarPassword(password, u.password_hash));
  if (!ok) throw fail(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
  return sesion(ctx, u);
}

/** Devuelve el usuario dueño del token o null (token inválido, vencido o usuario inexistente). */
export async function usuarioPorToken(ctx, token) {
  const p = verificarToken(token, ctx.secret, ctx.clock.now().getTime());
  if (!p) return null;
  const [u] = await ctx.db.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [p.sub]);
  return u ?? null;
}

export async function usuarioPorEmail(ctx, email) {
  const [u] = await ctx.db.query('SELECT id, nombre, email, rol FROM usuarios WHERE email = $1', [String(email).toLowerCase()]);
  return u ?? null;
}

/** R24: el primer admin sale de variables de entorno. Idempotente. */
export async function asegurarAdmin(ctx, { email, password }) {
  if (!email || !password) return null;
  const e = email.trim().toLowerCase();
  if (await usuarioPorEmail(ctx, e)) return null;
  const id = randomUUID();
  await ctx.db.query(
    "INSERT INTO usuarios (id, nombre, email, password_hash, rol, creado) VALUES ($1,'Administración',$2,$3,'admin',$4)",
    [id, e, await hashPassword(password), ctx.clock.now().toISOString()],
  );
  return id;
}

// ───────────────────────── Catálogo y disponibilidad ─────────────────────────
const MIN = 60000;
const num = (v) => Number(v);

export async function listarServicios(ctx, { todos = false } = {}) {
  const filas = await ctx.db.query(`SELECT id, nombre, duracion_min, precio, activo FROM servicios ${todos ? '' : 'WHERE activo = 1'} ORDER BY precio, nombre`);
  return filas.map((f) => ({ ...f, duracion_min: num(f.duracion_min), precio: num(f.precio), activo: num(f.activo) === 1 }));
}

export const listarProfesionales = (ctx) => ctx.db.query('SELECT id, nombre FROM profesionales WHERE activo = 1 ORDER BY nombre');

async function servicioActivo(db, id) {
  const [s] = await db.query('SELECT id, nombre, duracion_min, precio, activo FROM servicios WHERE id = $1', [String(id ?? '')]);
  if (!s || num(s.activo) !== 1) throw fail(404, 'SERVICIO_NO_ENCONTRADO', 'El servicio no existe o no está disponible.');
  return { ...s, duracion_min: num(s.duracion_min), precio: num(s.precio) };
}

export async function diasCerradosSet(db) {
  return new Set((await db.query('SELECT fecha FROM dias_cerrados')).map((r) => r.fecha));
}

/** R15: clienta frecuente = 5 o más turnos completados. */
export async function esFrecuente(db, usuarioId) {
  if (!usuarioId) return false;
  const [r] = await db.query("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM turnos WHERE usuario_id = $1 AND estado = 'completado'", [usuarioId]);
  return num(r.n) >= REGLAS.FRECUENTE_MIN;
}

/** R01–R08, R12–R16: huecos libres de un día para un servicio, con el precio que corresponde ese día. */
export async function disponibilidad(ctx, { servicio_id, fecha, profesional_id } = {}, usuario = null) {
  if (!fechaValida(fecha)) throw fail(400, 'FECHA_INVALIDA', 'La fecha debe tener formato AAAA-MM-DD.');
  const servicio = await servicioActivo(ctx.db, servicio_id);
  let profs = await listarProfesionales(ctx);
  if (profesional_id) {
    profs = profs.filter((p) => p.id === profesional_id);
    if (!profs.length) throw fail(404, 'PROFESIONAL_NO_ENCONTRADO', 'La profesional no existe.');
  }
  const ahora = ctx.clock.now();
  const cerrados = await diasCerradosSet(ctx.db);
  const dur = servicio.duracion_min;
  const frecuente = await esFrecuente(ctx.db, usuario?.id);
  const base = { fecha, servicio: { id: servicio.id, nombre: servicio.nombre, duracion_min: dur }, slots: [] };
  const mediodia = fromLocal(fecha, 12 * 60);
  const { precio, detalle } = calcularPrecio({ base: servicio.precio, inicio: mediodia, frecuente });
  const cierre = validarHorario({ inicio: mediodia, duracionMin: 30, diasCerrados: cerrados });
  if (cierre) return { ...base, cerrado: true, motivo: cierre.message, precio, detalle };

  const turnos = await ctx.db.query(
    "SELECT profesional_id, inicio, fin FROM turnos WHERE estado = 'confirmado' AND inicio >= $1 AND inicio < $2",
    [fromLocal(fecha, 0).toISOString(), fromLocal(fecha, 1440).toISOString()],
  );
  const ocupados = turnos.map((t) => ({ ...t, ini: new Date(t.inicio), fin: new Date(t.fin) }));
  const slots = [];
  for (let m = REGLAS.APERTURA; m + dur <= REGLAS.CIERRE; m += REGLAS.PASO) {
    const ini = fromLocal(fecha, m);
    const fin = new Date(ini.getTime() + dur * MIN);
    if (validarVentana({ inicio: ini, ahora })) continue;
    const libres = profs.filter((p) => !ocupados.some((t) => t.profesional_id === p.id && seSuperponen(ini, fin, t.ini, t.fin)));
    if (libres.length) slots.push({ inicio: ini.toISOString(), hora: hhmm(m), profesionales: libres });
  }
  return { ...base, cerrado: false, slots, precio, detalle };
}

// ───────────────────────────── Reservas ─────────────────────────────
function parsearInicio(v) {
  const d = new Date(v);
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw fail(400, 'FECHA_INVALIDA', 'El inicio del turno no es una fecha válida (ISO 8601).');
  return d;
}

const dtoTurno = (t) => ({
  id: t.id, estado: t.estado, inicio: t.inicio, fin: t.fin, precio: num(t.precio),
  servicio: t.servicio, profesional: t.profesional, ...(t.detalle ? { detalle: t.detalle } : {}),
});

/**
 * R05–R16. Todo ocurre dentro de una transacción con candado de agenda:
 * si dos personas piden el mismo hueco, una gana y la otra recibe 409 (R06).
 * El precio NUNCA viene del cliente (R12).
 */
export async function reservar(ctx, usuario, { servicio_id, inicio, profesional_id } = {}) {
  const servicio = await servicioActivo(ctx.db, servicio_id);
  const ini = parsearInicio(inicio);
  const fin = new Date(ini.getTime() + servicio.duracion_min * MIN);
  const ahora = ctx.clock.now();
  const error = validarHorario({ inicio: ini, duracionMin: servicio.duracion_min, diasCerrados: await diasCerradosSet(ctx.db) })
    || validarVentana({ inicio: ini, ahora });
  if (error) throw fail(422, error.code, error.message);

  return ctx.db.tx(async (t) => {
    await t.lock('agenda');
    if ((await t.query("SELECT id FROM deudas WHERE usuario_id = $1 AND estado = 'pendiente'", [usuario.id])).length) {
      throw fail(403, 'DEUDA_PENDIENTE', 'Tenés una deuda pendiente. Saldala en el estudio para poder reservar.');
    }
    const activos = await t.query("SELECT inicio FROM turnos WHERE usuario_id = $1 AND estado = 'confirmado' AND inicio > $2", [usuario.id, ahora.toISOString()]);
    if (activos.length >= REGLAS.MAX_ACTIVOS) throw fail(422, 'LIMITE_TURNOS', 'Podés tener como máximo 2 turnos confirmados a futuro.');
    const dia = localParts(ini).fecha;
    if (activos.some((a) => localParts(new Date(a.inicio)).fecha === dia)) throw fail(422, 'UN_TURNO_POR_DIA', 'Ya tenés un turno ese día.');

    let candidatas = await t.query('SELECT id, nombre FROM profesionales WHERE activo = 1 ORDER BY nombre');
    if (profesional_id) {
      candidatas = candidatas.filter((p) => p.id === profesional_id);
      if (!candidatas.length) throw fail(404, 'PROFESIONAL_NO_ENCONTRADO', 'La profesional no existe.');
    }
    const ocupadas = await t.query("SELECT profesional_id FROM turnos WHERE estado = 'confirmado' AND inicio < $1 AND fin > $2", [fin.toISOString(), ini.toISOString()]);
    const libre = candidatas.find((p) => !ocupadas.some((o) => o.profesional_id === p.id));
    if (!libre) throw fail(409, 'TURNO_OCUPADO', 'Ese horario ya no está disponible. Elegí otro.');

    const frecuente = await esFrecuente(t, usuario.id);
    const { precio, detalle } = calcularPrecio({ base: servicio.precio, inicio: ini, frecuente });
    const id = randomUUID();
    await t.query(
      "INSERT INTO turnos (id, usuario_id, servicio_id, profesional_id, inicio, fin, precio, estado, creado) VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmado',$8)",
      [id, usuario.id, servicio.id, libre.id, ini.toISOString(), fin.toISOString(), precio, ahora.toISOString()],
    );
    return dtoTurno({ id, estado: 'confirmado', inicio: ini.toISOString(), fin: fin.toISOString(), precio, servicio: servicio.nombre, profesional: libre.nombre, detalle });
  });
}

// ─────────────────────── Mis turnos, cancelación y deudas ───────────────────────
const SQL_TURNOS = `SELECT t.id, t.inicio, t.fin, t.precio, t.estado, s.nombre AS servicio, p.nombre AS profesional,
    u.nombre AS cliente, u.email AS email
  FROM turnos t JOIN servicios s ON s.id = t.servicio_id JOIN profesionales p ON p.id = t.profesional_id
  JOIN usuarios u ON u.id = t.usuario_id`;

/** R23: la clienta solo ve sus turnos. Incluye si hoy cancelaría sin cargo (R17). */
export async function misTurnos(ctx, usuario) {
  const ahora = ctx.clock.now();
  const filas = await ctx.db.query(`${SQL_TURNOS} WHERE t.usuario_id = $1 ORDER BY t.inicio DESC`, [usuario.id]);
  return filas.map((t) => {
    const ini = new Date(t.inicio);
    const cancelable = t.estado === 'confirmado' && ini > ahora;
    return { ...dtoTurno(t), cancelable, sin_cargo: cancelable ? cancelacionSinCargo(ini, ahora) : null };
  });
}

/** R17–R19: cancelar. Con menos de 24 h genera deuda del 50%. */
export async function cancelar(ctx, usuario, id) {
  return ctx.db.tx(async (t) => {
    await t.lock('agenda');
    const [turno] = await t.query('SELECT * FROM turnos WHERE id = $1', [String(id)]);
    if (!turno || turno.usuario_id !== usuario.id) throw fail(404, 'TURNO_NO_ENCONTRADO', 'No encontramos ese turno.');
    if (turno.estado !== 'confirmado') throw fail(409, 'NO_CANCELABLE', 'Ese turno ya no se puede cancelar.');
    const ahora = ctx.clock.now();
    const ini = new Date(turno.inicio);
    if (ahora >= ini) throw fail(422, 'TURNO_COMENZADO', 'El turno ya comenzó y no se puede cancelar.');
    let deuda = null;
    if (!cancelacionSinCargo(ini, ahora)) {
      deuda = { id: randomUUID(), monto: montoDeuda(num(turno.precio), 'cancelacion_tardia'), motivo: 'cancelacion_tardia' };
      await t.query(
        "INSERT INTO deudas (id, usuario_id, turno_id, monto, motivo, estado, creado) VALUES ($1,$2,$3,$4,$5,'pendiente',$6)",
        [deuda.id, usuario.id, turno.id, deuda.monto, deuda.motivo, ahora.toISOString()],
      );
    }
    await t.query("UPDATE turnos SET estado = 'cancelado', cancelado_en = $1 WHERE id = $2", [ahora.toISOString(), turno.id]);
    return { turno: { id: turno.id, estado: 'cancelado' }, deuda };
  });
}

const dtoDeuda = (d) => ({ ...d, monto: num(d.monto) });

export async function misDeudas(ctx, usuario) {
  const filas = await ctx.db.query(
    `SELECT d.id, d.monto, d.motivo, d.estado, d.creado, d.saldada_en, t.inicio FROM deudas d JOIN turnos t ON t.id = d.turno_id
     WHERE d.usuario_id = $1 ORDER BY d.creado DESC`, [usuario.id]);
  return filas.map(dtoDeuda);
}

// ───────────────────────────── Administración (rol admin) ─────────────────────────────
/** R23: agenda del día con datos de cada clienta. */
export async function agenda(ctx, { fecha } = {}) {
  if (!fechaValida(fecha)) throw fail(400, 'FECHA_INVALIDA', 'La fecha debe tener formato AAAA-MM-DD.');
  const filas = await ctx.db.query(`${SQL_TURNOS} WHERE t.inicio >= $1 AND t.inicio < $2 ORDER BY t.inicio, p.nombre`,
    [fromLocal(fecha, 0).toISOString(), fromLocal(fecha, 1440).toISOString()]);
  const ahora = ctx.clock.now();
  return filas.map((t) => ({ ...dtoTurno(t), cliente: t.cliente, email: t.email, ya_comenzo: new Date(t.inicio) <= ahora }));
}

/** R20, R25: cerrar un turno como completado o ausente (ausente genera deuda del 100%). */
async function cerrarTurno(ctx, id, nuevoEstado) {
  return ctx.db.tx(async (t) => {
    await t.lock('agenda');
    const [turno] = await t.query('SELECT * FROM turnos WHERE id = $1', [String(id)]);
    if (!turno) throw fail(404, 'TURNO_NO_ENCONTRADO', 'No encontramos ese turno.');
    if (turno.estado !== 'confirmado') throw fail(409, 'ESTADO_INVALIDO', 'Solo se puede cerrar un turno confirmado.');
    const ahora = ctx.clock.now();
    if (ahora < new Date(turno.inicio)) throw fail(422, 'AUN_NO_COMENZO', 'El turno todavía no comenzó.');
    await t.query('UPDATE turnos SET estado = $1 WHERE id = $2', [nuevoEstado, turno.id]);
    let deuda = null;
    if (nuevoEstado === 'ausente') {
      deuda = { id: randomUUID(), monto: montoDeuda(num(turno.precio), 'ausencia'), motivo: 'ausencia' };
      await t.query("INSERT INTO deudas (id, usuario_id, turno_id, monto, motivo, estado, creado) VALUES ($1,$2,$3,$4,$5,'pendiente',$6)",
        [deuda.id, turno.usuario_id, turno.id, deuda.monto, deuda.motivo, ahora.toISOString()]);
    }
    return { turno: { id: turno.id, estado: nuevoEstado }, deuda };
  });
}
export const completarTurno = (ctx, id) => cerrarTurno(ctx, id, 'completado');
export const marcarAusente = (ctx, id) => cerrarTurno(ctx, id, 'ausente');

/** R21: el admin ve y salda deudas. */
export async function listarDeudas(ctx, { estado = 'pendiente' } = {}) {
  const filas = await ctx.db.query(
    `SELECT d.id, d.monto, d.motivo, d.estado, d.creado, d.saldada_en, u.nombre AS cliente, u.email AS email, t.inicio
     FROM deudas d JOIN usuarios u ON u.id = d.usuario_id JOIN turnos t ON t.id = d.turno_id
     WHERE d.estado = $1 ORDER BY d.creado`, [estado === 'saldada' ? 'saldada' : 'pendiente']);
  return filas.map(dtoDeuda);
}

export async function saldarDeuda(ctx, id) {
  const [d] = await ctx.db.query('SELECT id, estado FROM deudas WHERE id = $1', [String(id)]);
  if (!d) throw fail(404, 'DEUDA_NO_ENCONTRADA', 'No encontramos esa deuda.');
  if (d.estado === 'saldada') throw fail(409, 'DEUDA_YA_SALDADA', 'Esa deuda ya estaba saldada.');
  await ctx.db.query("UPDATE deudas SET estado = 'saldada', saldada_en = $1 WHERE id = $2", [ctx.clock.now().toISOString(), d.id]);
  return { id: d.id, estado: 'saldada' };
}

/** R03: días cerrados. */
export const listarDiasCerrados = (ctx) => ctx.db.query('SELECT fecha, motivo FROM dias_cerrados ORDER BY fecha');

export async function cerrarDia(ctx, { fecha, motivo } = {}) {
  if (!fechaValida(fecha)) throw fail(400, 'FECHA_INVALIDA', 'La fecha debe tener formato AAAA-MM-DD.');
  motivo = String(motivo ?? '').trim();
  if (motivo.length < 2 || motivo.length > 80) throw fail(400, 'MOTIVO_INVALIDO', 'Escribí un motivo de entre 2 y 80 caracteres.');
  if ((await ctx.db.query('SELECT fecha FROM dias_cerrados WHERE fecha = $1', [fecha])).length) throw fail(409, 'DIA_YA_CERRADO', 'Ese día ya estaba cerrado.');
  const hay = await ctx.db.query("SELECT id FROM turnos WHERE estado = 'confirmado' AND inicio >= $1 AND inicio < $2",
    [fromLocal(fecha, 0).toISOString(), fromLocal(fecha, 1440).toISOString()]);
  if (hay.length) throw fail(409, 'HAY_TURNOS_CONFIRMADOS', `No se puede cerrar: hay ${hay.length} turno(s) confirmado(s) ese día.`);
  await ctx.db.query('INSERT INTO dias_cerrados (fecha, motivo) VALUES ($1,$2)', [fecha, motivo]);
  return { fecha, motivo };
}

export async function abrirDia(ctx, fecha) {
  if (!fechaValida(fecha)) throw fail(400, 'FECHA_INVALIDA', 'La fecha debe tener formato AAAA-MM-DD.');
  if (!(await ctx.db.query('SELECT fecha FROM dias_cerrados WHERE fecha = $1', [fecha])).length) throw fail(404, 'DIA_NO_CERRADO', 'Ese día no estaba cerrado.');
  await ctx.db.query('DELETE FROM dias_cerrados WHERE fecha = $1', [fecha]);
  return { fecha };
}

/** R12: el admin edita el catálogo; los turnos ya tomados conservan su precio. */
function validarServicio({ nombre, duracion_min, precio }) {
  if (nombre !== undefined && (String(nombre).trim().length < 2 || String(nombre).trim().length > 60)) throw fail(400, 'NOMBRE_INVALIDO', 'El nombre debe tener entre 2 y 60 caracteres.');
  if (duracion_min !== undefined && (!Number.isInteger(duracion_min) || duracion_min < 30 || duracion_min > 240 || duracion_min % 30 !== 0)) {
    throw fail(400, 'DURACION_INVALIDA', 'La duración debe ser múltiplo de 30 minutos, entre 30 y 240.');
  }
  if (precio !== undefined && (!Number.isInteger(precio) || precio <= 0 || precio > 1000000)) throw fail(400, 'PRECIO_INVALIDO', 'El precio debe ser un entero positivo en pesos.');
}

export async function crearServicio(ctx, datos = {}) {
  if (datos.nombre === undefined || datos.duracion_min === undefined || datos.precio === undefined) throw fail(400, 'DATOS_INCOMPLETOS', 'Faltan nombre, duración o precio.');
  validarServicio(datos);
  const id = `svc-${randomUUID().slice(0, 8)}`;
  await ctx.db.query('INSERT INTO servicios (id, nombre, duracion_min, precio, activo) VALUES ($1,$2,$3,$4,1)', [id, String(datos.nombre).trim(), datos.duracion_min, datos.precio]);
  return { id, nombre: String(datos.nombre).trim(), duracion_min: datos.duracion_min, precio: datos.precio, activo: true };
}

export async function actualizarServicio(ctx, id, datos = {}) {
  const [s] = await ctx.db.query('SELECT id FROM servicios WHERE id = $1', [String(id)]);
  if (!s) throw fail(404, 'SERVICIO_NO_ENCONTRADO', 'El servicio no existe.');
  validarServicio(datos);
  if (datos.activo !== undefined && typeof datos.activo !== 'boolean') throw fail(400, 'ACTIVO_INVALIDO', 'El campo activo debe ser verdadero o falso.');
  const sets = [];
  const vals = [];
  for (const [campo, valor] of [['nombre', datos.nombre === undefined ? undefined : String(datos.nombre).trim()], ['duracion_min', datos.duracion_min], ['precio', datos.precio], ['activo', datos.activo === undefined ? undefined : (datos.activo ? 1 : 0)]]) {
    if (valor !== undefined) { vals.push(valor); sets.push(`${campo} = $${vals.length}`); }
  }
  if (!sets.length) throw fail(400, 'DATOS_INCOMPLETOS', 'No hay nada para actualizar.');
  vals.push(s.id);
  await ctx.db.query(`UPDATE servicios SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  return (await listarServicios(ctx, { todos: true })).find((x) => x.id === s.id);
}
