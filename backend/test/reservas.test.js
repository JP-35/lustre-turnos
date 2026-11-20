import test from 'node:test';
import assert from 'node:assert/strict';
import { reservar } from '../src/service.js';
import { nuevoCtx, nuevaClienta, falla, at } from './helpers.js';

const SEMI = 'svc-semipermanente';
const pedir = (ctx, u, fecha, hora, extra = {}) =>
  reservar(ctx, u, { servicio_id: SEMI, inicio: at(fecha, hora).toISOString(), ...extra });

test('R05 R07 una reserva válida se confirma, bloquea la duración y asigna la primera profesional libre', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await pedir(ctx, u, '2026-11-25', '15:00');
  assert.equal(t.estado, 'confirmado');
  assert.equal(t.profesional, 'Camila');
  assert.equal(t.fin, at('2026-11-25', '16:00').toISOString());
  const u2 = await nuevaClienta(ctx);
  assert.equal((await pedir(ctx, u2, '2026-11-25', '15:30')).profesional, 'Lucía');
});

test('R06 no se pisan turnos de la misma profesional, pero sí pueden quedar pegados', async () => {
  const ctx = await nuevoCtx();
  const [a, b, c] = [await nuevaClienta(ctx), await nuevaClienta(ctx), await nuevaClienta(ctx)];
  await pedir(ctx, a, '2026-11-25', '11:00', { profesional_id: 'prof-camila' });
  const e = await falla(pedir(ctx, b, '2026-11-25', '11:30', { profesional_id: 'prof-camila' }));
  assert.equal(e.status, 409);
  assert.equal(e.code, 'TURNO_OCUPADO');
  const pegado = await pedir(ctx, c, '2026-11-25', '12:00', { profesional_id: 'prof-camila' });
  assert.equal(pegado.estado, 'confirmado');
});

test('R06 con dos reservas simultáneas al mismo hueco y profesional, solo una avanza y la otra recibe 409', async () => {
  const ctx = await nuevoCtx();
  const clientas = await Promise.all([1, 2, 3, 4, 5].map(() => nuevaClienta(ctx)));
  const r = await Promise.allSettled(clientas.map((u) => pedir(ctx, u, '2026-11-26', '16:00', { profesional_id: 'prof-lucia' })));
  const ok = r.filter((x) => x.status === 'fulfilled');
  const mal = r.filter((x) => x.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(mal.length, 4);
  assert.ok(mal.every((x) => x.reason.status === 409));
  assert.equal((await ctx.db.query("SELECT id FROM turnos WHERE estado = 'confirmado'")).length, 1);
});

test('R07 con tres reservas simultáneas sin elegir profesional hay lugar para dos (Camila y Lucía)', async () => {
  const ctx = await nuevoCtx();
  const clientas = await Promise.all([1, 2, 3].map(() => nuevaClienta(ctx)));
  const r = await Promise.allSettled(clientas.map((u) => pedir(ctx, u, '2026-11-26', '17:00')));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 2);
  assert.equal(r.filter((x) => x.status === 'rejected' && x.reason.code === 'TURNO_OCUPADO').length, 1);
});

test('R01 R02 R03 R08 los horarios inválidos se rechazan con 422 y código estable', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  assert.equal((await falla(pedir(ctx, u, '2026-11-29', '11:00'))).code, 'DIA_CERRADO');
  assert.equal((await falla(pedir(ctx, u, '2026-12-08', '11:00'))).code, 'DIA_CERRADO');
  assert.equal((await falla(pedir(ctx, u, '2026-11-25', '18:30'))).code, 'FUERA_DE_HORARIO');
  assert.equal((await falla(pedir(ctx, u, '2026-11-25', '11:15'))).code, 'HORARIO_INVALIDO');
  assert.equal((await falla(pedir(ctx, u, '2026-11-23', '11:00'))).code, 'ANTICIPACION_MINIMA');
  const e = await falla(pedir(ctx, u, '2027-02-01', '11:00'));
  assert.equal(e.code, 'FUERA_DE_HORIZONTE');
  assert.equal(e.status, 422);
});

test('R09 como máximo 2 turnos confirmados a futuro', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  await pedir(ctx, u, '2026-11-25', '11:00');
  await pedir(ctx, u, '2026-11-26', '11:00');
  assert.equal((await falla(pedir(ctx, u, '2026-11-27', '11:00'))).code, 'LIMITE_TURNOS');
});

test('R10 como máximo 1 turno confirmado por día', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  await pedir(ctx, u, '2026-11-25', '11:00');
  assert.equal((await falla(pedir(ctx, u, '2026-11-25', '16:00'))).code, 'UN_TURNO_POR_DIA');
});

test('R11 con deuda pendiente no se puede reservar', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await pedir(ctx, u, '2026-11-25', '11:00');
  await ctx.db.query("INSERT INTO deudas (id, usuario_id, turno_id, monto, motivo, estado, creado) VALUES ('d1',$1,$2,6000,'cancelacion_tardia','pendiente',$3)", [u.id, t.id, ctx.clock.now().toISOString()]);
  const e = await falla(pedir(ctx, u, '2026-11-26', '11:00'));
  assert.equal(e.code, 'DEUDA_PENDIENTE');
  assert.equal(e.status, 403);
});

test('R12 el precio lo calcula el backend: un precio enviado por el cliente se ignora y queda congelado', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await pedir(ctx, u, '2026-11-25', '11:00', { precio: 1 });
  assert.equal(t.precio, 12000);
  await ctx.db.query("UPDATE servicios SET precio = 99999 WHERE id = $1", [SEMI]);
  const [fila] = await ctx.db.query('SELECT precio FROM turnos WHERE id = $1', [t.id]);
  assert.equal(Number(fila.precio), 12000);
});

test('R13 R14 sábado con recargo y martes con descuento en la reserva real', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  assert.equal((await pedir(ctx, u, '2026-11-28', '11:00')).precio, 13800);
  assert.equal((await pedir(ctx, u, '2026-11-24', '11:00')).precio, 10800);
});

test('R15 R16 la clienta frecuente (5 completados) paga 10% menos y el sábado combina recargo y descuento', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  for (let i = 0; i < 5; i++) {
    await ctx.db.query(
      "INSERT INTO turnos (id, usuario_id, servicio_id, profesional_id, inicio, fin, precio, estado, creado) VALUES ($1,$2,$3,'prof-camila','2026-10-01T13:00:00.000Z','2026-10-01T14:00:00.000Z',12000,'completado','2026-09-01T00:00:00.000Z')",
      [`h${i}`, u.id, SEMI],
    );
  }
  assert.equal((await pedir(ctx, u, '2026-11-25', '11:00')).precio, 10800);
  assert.equal((await pedir(ctx, u, '2026-11-28', '11:00')).precio, 12420);
});

test('R26 servicio, profesional y fecha inexistentes devuelven errores claros', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  assert.equal((await falla(reservar(ctx, u, { servicio_id: 'x', inicio: at('2026-11-25', '11:00').toISOString() }))).code, 'SERVICIO_NO_ENCONTRADO');
  assert.equal((await falla(reservar(ctx, u, { servicio_id: SEMI, inicio: 'cualquier cosa' }))).code, 'FECHA_INVALIDA');
  assert.equal((await falla(pedir(ctx, u, '2026-11-25', '11:00', { profesional_id: 'nadie' }))).code, 'PROFESIONAL_NO_ENCONTRADO');
});
