// Lustre Turnos · frontend. Solo muestra y envía datos: TODAS las reglas viven en el backend.
const API = ((window.APP_CONFIG && window.APP_CONFIG.API_URL) || '').replace(/\/$/, '');
const TZ = 'America/Argentina/Buenos_Aires';
const app = document.getElementById('app');

// ── utilidades ─────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmt = (opts, iso) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...opts }).format(new Date(iso));
const fechaHora = (iso) => fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, iso);
const soloHora = (iso) => fmt({ hour: '2-digit', minute: '2-digit', hour12: false }, iso);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaLargo = (f) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${f}T12:00:00Z`));
const ESTADOS = { confirmado: 'Confirmado', cancelado: 'Cancelado', completado: 'Completado', ausente: 'Ausente' };
const MOTIVOS = { cancelacion_tardia: 'Cancelación con menos de 24 h', ausencia: 'Ausencia' };

const almacen = {
  leer() { try { return JSON.parse(localStorage.getItem('lustre.sesion')); } catch { return null; } },
  guardar(v) { try { localStorage.setItem('lustre.sesion', JSON.stringify(v)); } catch { /* modo privado */ } },
  borrar() { try { localStorage.removeItem('lustre.sesion'); } catch { /* modo privado */ } },
};
let sesion = almacen.leer();
let volverA = null;
let preseleccion = null;

let timerAviso;
function aviso(texto, tipo = 'ok') {
  const el = document.getElementById('aviso');
  el.textContent = texto; el.className = `aviso ${tipo}`; el.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, 6000);
}

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const despertar = document.getElementById('despertar');
  const t = setTimeout(() => { despertar.hidden = false; }, 2500); // Render gratuito se duerme
  let res;
  try {
    res = await fetch(`${API}/api${ruta}`, {
      method: metodo,
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw { message: 'No pudimos conectar con el servidor. Si recién arrancó, esperá unos segundos y probá de nuevo.' };
  } finally { clearTimeout(t); despertar.hidden = true; }
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && sesion) { sesion = null; almacen.borrar(); renderNav(); }
    throw { ...(datos?.error ?? { message: 'Ocurrió un error inesperado.' }), status: res.status };
  }
  return datos;
}

// ── navegación ─────────────────────────────────────────────
function renderNav() {
  const actual = location.hash.replace(/^#\/?/, '');
  const link = (ruta, texto) => `<a href="#/${ruta}" ${actual === ruta ? 'aria-current="page"' : ''}>${texto}</a>`;
  const partes = [link('', 'Inicio')];
  if (!sesion || sesion.usuario.rol !== 'admin') partes.push(link('reservar', 'Reservar'));
  if (sesion && sesion.usuario.rol !== 'admin') partes.push(link('mis-turnos', 'Mis turnos'));
  if (sesion && sesion.usuario.rol === 'admin') partes.push(link('admin', 'Administración'));
  partes.push(sesion ? `<button id="salir" type="button">Salir (${esc(sesion.usuario.nombre.split(' ')[0])})</button>` : link('entrar', 'Entrar'));
  document.getElementById('nav').innerHTML = partes.join('');
  const salir = document.getElementById('salir');
  if (salir) salir.onclick = () => { sesion = null; almacen.borrar(); aviso('Cerraste sesión.'); location.hash = '#/'; renderNav(); };
}

const RUTAS = { '': inicio, entrar: () => pantallaAcceso('entrar'), registro: () => pantallaAcceso('registro'), reservar, 'mis-turnos': misTurnos, admin };

async function render() {
  const nombre = location.hash.replace(/^#\/?/, '');
  renderNav();
  app.innerHTML = '<p class="cargando">Cargando…</p>';
  try { await (RUTAS[nombre] ?? inicio)(); } catch (e) {
    app.innerHTML = `<div class="vacio"><h2>No pudimos cargar esta pantalla</h2><p>${esc(e.message)}</p><button id="reintentar" type="button">Reintentar</button></div>`;
    document.getElementById('reintentar').onclick = render;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

// ── inicio ─────────────────────────────────────────────────
async function inicio() {
  const servicios = await api('/servicios');
  app.innerHTML = `
    <section class="hero">
      <h1>Tu turno de uñas, sin llamar.</h1>
      <p class="bajada">Elegí servicio, día y horario. Confirmás en un minuto y el precio lo ves antes de reservar.</p>
      <ul class="unias" aria-label="Datos del estudio">
        <li class="c1">Lun a sáb<small>10 a 19 h</small></li>
        <li class="c2">Martes<small>10% menos</small></li>
        <li class="c4">Sábados<small>15% más</small></li>
        <li class="c3">Cancelá gratis<small>hasta 24 h antes</small></li>
      </ul>
      <a class="boton" href="#/reservar">Reservar turno</a>
    </section>
    <section class="panel" aria-labelledby="t-serv">
      <h2 id="t-serv">Servicios</h2>
      ${servicios.map((s) => `
        <div class="fila">
          <div class="info"><b>${esc(s.nombre)}</b><span class="suave">${s.duracion_min} minutos</span></div>
          <span class="precio">${peso(s.precio)}</span>
          <button class="sec" type="button" data-servicio="${esc(s.id)}">Reservar</button>
        </div>`).join('')}
    </section>
    <section class="panel">
      <h2>Cómo funciona</h2>
      <ul class="lista-simple">
        <li>Reservás con 2 horas de anticipación como mínimo y hasta 30 días adelante.</li>
        <li>Hasta 2 turnos a futuro y 1 por día.</li>
        <li>Si cancelás con menos de 24 horas, queda una deuda del 50% que se abona en el estudio.</li>
        <li>Si no podés venir y no avisás, la deuda es del 100%. Con una deuda pendiente no se puede reservar.</li>
        <li>Con 5 turnos completados tenés 10% de descuento fijo.</li>
      </ul>
    </section>`;
  app.querySelectorAll('[data-servicio]').forEach((b) => { b.onclick = () => { preseleccion = b.dataset.servicio; location.hash = '#/reservar'; }; });
}

// ── acceso ─────────────────────────────────────────────────
function pantallaAcceso(modo) {
  const nuevo = modo === 'registro';
  app.innerHTML = `
    <h1 style="font-size:2.4rem">${nuevo ? 'Crear cuenta' : 'Entrar'}</h1>
    <form id="form" class="form-chico panel" novalidate>
      ${nuevo ? '<div><label for="nombre">Nombre y apellido</label><input id="nombre" autocomplete="name" required minlength="2" maxlength="60"></div>' : ''}
      <div><label for="email">Email</label><input id="email" type="email" autocomplete="email" required></div>
      <div><label for="password">Contraseña${nuevo ? ' (mínimo 8 caracteres)' : ''}</label><input id="password" type="password" autocomplete="${nuevo ? 'new-password' : 'current-password'}" required minlength="8"></div>
      <button type="submit">${nuevo ? 'Crear mi cuenta' : 'Entrar'}</button>
      <p class="suave" style="margin:0">${nuevo ? '¿Ya tenés cuenta? <a href="#/entrar">Entrá acá</a>.' : '¿Primera vez? <a href="#/registro">Creá tu cuenta</a>.'}</p>
    </form>`;
  document.getElementById('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const boton = ev.target.querySelector('button[type=submit]');
    boton.disabled = true;
    const v = (id) => document.getElementById(id)?.value ?? '';
    try {
      const r = await api(nuevo ? '/registro' : '/entrada', { metodo: 'POST', cuerpo: nuevo ? { nombre: v('nombre'), email: v('email'), password: v('password') } : { email: v('email'), password: v('password') } });
      sesion = r; almacen.guardar(r);
      aviso(`¡Hola, ${r.usuario.nombre.split(' ')[0]}!`);
      const destino = r.usuario.rol === 'admin' ? 'admin' : (volverA ?? 'mis-turnos');
      volverA = null; location.hash = `#/${destino}`;
    } catch (e) { aviso(e.message, 'error'); boton.disabled = false; }
  };
}

// ── reservar ───────────────────────────────────────────────
async function reservar() {
  if (!sesion) { volverA = 'reservar'; aviso('Entrá o creá tu cuenta para reservar.', 'ok'); location.hash = '#/entrar'; return; }
  if (sesion.usuario.rol === 'admin') { app.innerHTML = '<div class="vacio"><h2>Estás como administradora</h2><p>Las reservas las hacen las clientas. Mirá la agenda en Administración.</p></div>'; return; }
  const [servicios, profesionales] = await Promise.all([api('/servicios'), api('/profesionales')]);
  const st = { servicio: servicios.some((s) => s.id === preseleccion) ? preseleccion : servicios[0]?.id, fecha: sumarDias(hoy(), 1), profesional: '', slot: null, disp: null };
  preseleccion = null;

  app.innerHTML = `
    <h1 style="font-size:2.4rem">Reservar turno</h1>
    <h2>1. Servicio</h2>
    <div class="opciones" id="servicios">${servicios.map((s) => `<button type="button" class="opcion" data-id="${esc(s.id)}" aria-pressed="${s.id === st.servicio}">${esc(s.nombre)}<small>${s.duracion_min} min · desde ${peso(s.precio)}</small></button>`).join('')}</div>
    <h2>2. Día y profesional</h2>
    <div class="campos">
      <div><label for="fecha">Día</label><input id="fecha" type="date" value="${st.fecha}" min="${hoy()}" max="${sumarDias(hoy(), 30)}"></div>
      <div><label for="prof">Profesional</label><select id="prof"><option value="">Cualquiera (la primera libre)</option>${profesionales.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></div>
    </div>
    <h2>3. Horario</h2>
    <div id="horarios" aria-live="polite"></div>
    <div id="resumen"></div>`;

  const pintarServicios = () => app.querySelectorAll('#servicios .opcion').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === st.servicio)));

  async function cargar() {
    st.slot = null;
    const cont = document.getElementById('horarios');
    document.getElementById('resumen').innerHTML = '';
    if (!st.fecha) { cont.innerHTML = '<p class="suave">Elegí un día.</p>'; return; }
    cont.innerHTML = '<p class="cargando">Buscando horarios…</p>';
    try {
      const q = new URLSearchParams({ servicio_id: st.servicio, fecha: st.fecha, ...(st.profesional ? { profesional_id: st.profesional } : {}) });
      st.disp = await api(`/disponibilidad?${q}`);
    } catch (e) { cont.innerHTML = `<p class="banner">${esc(e.message)}</p>`; return; }
    const d = st.disp;
    if (d.cerrado) { cont.innerHTML = `<p class="banner">${esc(diaLargo(d.fecha))}: ${esc(d.motivo)}</p>`; return; }
    if (!d.slots.length) { cont.innerHTML = '<p class="suave">No quedan horarios libres ese día. Probá con otro día o con otra profesional.</p>'; return; }
    cont.innerHTML = `<p class="suave">${esc(diaLargo(d.fecha))} · ${esc(d.servicio.nombre)} (${d.servicio.duracion_min} min) · ${peso(d.precio)}${d.detalle.length ? ' · ' + esc(d.detalle.join(', ')) : ''}</p>
      <div class="horarios">${d.slots.map((s) => `<button type="button" class="unia" data-inicio="${esc(s.inicio)}" aria-pressed="false" aria-label="${esc(s.hora)} horas">${esc(s.hora)}</button>`).join('')}</div>`;
    cont.querySelectorAll('.unia').forEach((b) => { b.onclick = () => elegir(b.dataset.inicio); });
  }

  function elegir(inicio) {
    st.slot = inicio;
    app.querySelectorAll('.unia').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.inicio === inicio)));
    const d = st.disp;
    const slot = d.slots.find((s) => s.inicio === inicio);
    const quien = st.profesional ? slot.profesionales[0].nombre : 'Asignación automática';
    document.getElementById('resumen').innerHTML = `
      <div class="panel resumen"><h2>4. Confirmá tu turno</h2>
        <p><b>${esc(d.servicio.nombre)}</b><br>${esc(fechaHora(inicio))} h · ${d.servicio.duracion_min} min<br>Profesional: ${esc(quien)}</p>
        <p class="precio">${peso(d.precio)}</p>
        ${d.detalle.length ? `<p class="suave">${esc(d.detalle.join(' · '))}</p>` : ''}
        <button id="confirmar" type="button">Confirmar turno</button></div>`;
    const c = document.getElementById('confirmar');
    c.onclick = async () => {
      c.disabled = true;
      try {
        const t = await api('/turnos', { metodo: 'POST', cuerpo: { servicio_id: st.servicio, inicio, ...(st.profesional ? { profesional_id: st.profesional } : {}) } });
        app.innerHTML = `<div class="panel resumen"><h1 style="font-size:2.2rem">¡Turno confirmado!</h1>
          <p><b>${esc(t.servicio)}</b> con ${esc(t.profesional)}<br>${esc(fechaHora(t.inicio))} h</p><p class="precio">${peso(t.precio)}</p>
          <p class="suave">Se abona en el estudio. Podés cancelar sin cargo hasta 24 horas antes.</p>
          <a class="boton" href="#/mis-turnos">Ver mis turnos</a> <a class="boton sec" href="#/reservar" id="otro">Reservar otro</a></div>`;
      } catch (e) {
        aviso(e.message, 'error');
        if (e.code === 'DEUDA_PENDIENTE') { app.insertAdjacentHTML('afterbegin', '<p class="banner">Tenés una deuda pendiente. Mirá el detalle en <a href="#/mis-turnos">Mis turnos</a>.</p>'); c.disabled = false; return; }
        if (e.status === 409) await cargar(); else c.disabled = false;
      }
    };
    document.getElementById('resumen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  app.querySelectorAll('#servicios .opcion').forEach((b) => { b.onclick = () => { st.servicio = b.dataset.id; pintarServicios(); cargar(); }; });
  document.getElementById('fecha').oninput = (ev) => { st.fecha = ev.target.value; cargar(); };
  document.getElementById('prof').onchange = (ev) => { st.profesional = ev.target.value; cargar(); };
  await cargar();
}

// ── mis turnos ─────────────────────────────────────────────
async function misTurnos() {
  if (!sesion) { volverA = 'mis-turnos'; location.hash = '#/entrar'; return; }
  const [turnos, deudas] = await Promise.all([api('/turnos/mios'), api('/deudas/mias')]);
  const pend = deudas.filter((d) => d.estado === 'pendiente');
  const total = pend.reduce((a, d) => a + d.monto, 0);
  app.innerHTML = `
    <h1 style="font-size:2.4rem">Mis turnos</h1>
    ${pend.length ? `<div class="banner">Tenés una deuda pendiente de ${peso(total)}. Abonala en el estudio para volver a reservar.<ul class="lista-simple" style="color:inherit">${pend.map((d) => `<li>${peso(d.monto)} · ${esc(MOTIVOS[d.motivo] ?? d.motivo)} (turno del ${esc(fechaHora(d.inicio))})</li>`).join('')}</ul></div>` : ''}
    ${turnos.length ? `<div class="panel">${turnos.map((t) => `
      <div class="fila">
        <div class="info"><b>${esc(t.servicio)} · ${esc(fechaHora(t.inicio))} h</b><span class="suave">con ${esc(t.profesional)} · ${peso(t.precio)}</span></div>
        <span class="estado e-${esc(t.estado)}">${esc(ESTADOS[t.estado] ?? t.estado)}</span>
        ${t.cancelable ? `<button class="peligro" type="button" data-cancelar="${esc(t.id)}" data-sin-cargo="${t.sin_cargo}">Cancelar</button>` : ''}
      </div>`).join('')}</div>`
      : '<div class="vacio"><h2>Todavía no tenés turnos</h2><a class="boton" href="#/reservar">Reservar mi primer turno</a></div>'}`;
  app.querySelectorAll('[data-cancelar]').forEach((b) => {
    b.onclick = async () => {
      const msg = b.dataset.sinCargo === 'true' ? '¿Cancelar este turno? No tiene cargo.' : 'Faltan menos de 24 horas: si cancelás se genera una deuda del 50% del turno y no vas a poder reservar hasta abonarla. ¿Cancelar igual?';
      if (!window.confirm(msg)) return;
      b.disabled = true;
      try {
        const r = await api(`/turnos/${encodeURIComponent(b.dataset.cancelar)}/cancelar`, { metodo: 'POST' });
        aviso(r.deuda ? `Turno cancelado. Quedó una deuda de ${peso(r.deuda.monto)}.` : 'Turno cancelado sin cargo.');
        await misTurnos();
      } catch (e) { aviso(e.message, 'error'); b.disabled = false; }
    };
  });
}

// ── administración ─────────────────────────────────────────
let adminTab = 'agenda';
let adminFecha = null;

async function admin() {
  if (!sesion) { volverA = 'admin'; location.hash = '#/entrar'; return; }
  if (sesion.usuario.rol !== 'admin') { app.innerHTML = '<div class="vacio"><h2>Sección solo para administración</h2></div>'; return; }
  adminFecha = adminFecha ?? hoy();
  app.innerHTML = `<h1 style="font-size:2.4rem">Administración</h1>
    <div class="pestanas" role="tablist">${[['agenda', 'Agenda'], ['deudas', 'Deudas'], ['dias', 'Días cerrados'], ['servicios', 'Servicios']].map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === adminTab}">${n}</button>`).join('')}</div>
    <div id="adm"></div>`;
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { adminTab = b.dataset.tab; admin(); }; });
  const cont = document.getElementById('adm');
  ({ agenda: tabAgenda, deudas: tabDeudas, dias: tabDias, servicios: tabServicios })[adminTab](cont);
}

async function accion(boton, fn, okMsg) {
  boton.disabled = true;
  try { await fn(); aviso(okMsg); await admin(); } catch (e) { aviso(e.message, 'error'); boton.disabled = false; }
}

async function tabAgenda(cont) {
  cont.innerHTML = `<div class="campos"><div><label for="adm-fecha">Día</label><input id="adm-fecha" type="date" value="${adminFecha}"></div></div><div id="lista"><p class="cargando">Cargando…</p></div>`;
  document.getElementById('adm-fecha').onchange = (ev) => { if (ev.target.value) { adminFecha = ev.target.value; admin(); } };
  const turnos = await api(`/admin/agenda?fecha=${adminFecha}`);
  document.getElementById('lista').innerHTML = turnos.length ? `<div class="panel">${turnos.map((t) => `
    <div class="fila">
      <div class="info"><b>${esc(soloHora(t.inicio))} a ${esc(soloHora(t.fin))} · ${esc(t.servicio)}</b>
        <span class="suave">${esc(t.cliente)} (${esc(t.email)}) · con ${esc(t.profesional)} · ${peso(t.precio)}</span></div>
      <span class="estado e-${esc(t.estado)}">${esc(ESTADOS[t.estado] ?? t.estado)}</span>
      ${t.estado === 'confirmado' ? (t.ya_comenzo
        ? `<button type="button" data-completar="${esc(t.id)}">Completado</button><button type="button" class="peligro" data-ausente="${esc(t.id)}">Ausente</button>`
        : '<span class="suave">Se puede cerrar desde el inicio</span>') : ''}
    </div>`).join('')}</div>` : `<div class="vacio">No hay turnos el ${esc(diaLargo(adminFecha))}.</div>`;
  cont.querySelectorAll('[data-completar]').forEach((b) => { b.onclick = () => accion(b, () => api(`/admin/turnos/${encodeURIComponent(b.dataset.completar)}/completar`, { metodo: 'POST' }), 'Turno completado.'); });
  cont.querySelectorAll('[data-ausente]').forEach((b) => { b.onclick = () => { if (window.confirm('Se genera una deuda del 100% para la clienta. ¿Marcar como ausente?')) accion(b, () => api(`/admin/turnos/${encodeURIComponent(b.dataset.ausente)}/ausente`, { metodo: 'POST' }), 'Marcado como ausente. Se generó la deuda.'); }; });
}

async function tabDeudas(cont) {
  const deudas = await api('/admin/deudas');
  cont.innerHTML = deudas.length ? `<div class="panel">${deudas.map((d) => `
    <div class="fila"><div class="info"><b>${esc(d.cliente)} · ${peso(d.monto)}</b><span class="suave">${esc(d.email)} · ${esc(MOTIVOS[d.motivo] ?? d.motivo)} · turno del ${esc(fechaHora(d.inicio))}</span></div>
      <button type="button" data-saldar="${esc(d.id)}">Marcar como saldada</button></div>`).join('')}</div>` : '<div class="vacio"><h2>No hay deudas pendientes</h2></div>';
  cont.querySelectorAll('[data-saldar]').forEach((b) => { b.onclick = () => accion(b, () => api(`/admin/deudas/${encodeURIComponent(b.dataset.saldar)}/saldar`, { metodo: 'POST' }), 'Deuda saldada.'); });
}

async function tabDias(cont) {
  const dias = await api('/admin/dias-cerrados');
  cont.innerHTML = `
    <form id="f-dia" class="panel campos" novalidate>
      <div><label for="d-fecha">Fecha a cerrar</label><input id="d-fecha" type="date" required min="${hoy()}"></div>
      <div><label for="d-motivo">Motivo</label><input id="d-motivo" maxlength="80" placeholder="Feriado, capacitación…" required></div>
      <div style="align-self:end"><button type="submit">Cerrar día</button></div>
    </form>
    ${dias.length ? `<div class="panel">${dias.map((d) => `<div class="fila"><div class="info"><b>${esc(diaLargo(d.fecha))}</b><span class="suave">${esc(d.motivo)}</span></div><button class="sec" type="button" data-abrir="${esc(d.fecha)}">Reabrir</button></div>`).join('')}</div>` : '<div class="vacio">No hay días cerrados.</div>'}`;
  document.getElementById('f-dia').onsubmit = (ev) => { ev.preventDefault(); accion(ev.target.querySelector('button'), () => api('/admin/dias-cerrados', { metodo: 'POST', cuerpo: { fecha: document.getElementById('d-fecha').value, motivo: document.getElementById('d-motivo').value } }), 'Día cerrado.'); };
  cont.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => accion(b, () => api(`/admin/dias-cerrados/${encodeURIComponent(b.dataset.abrir)}`, { metodo: 'DELETE' }), 'Día reabierto.'); });
}

async function tabServicios(cont) {
  const servicios = await api('/admin/servicios');
  cont.innerHTML = `
    <div class="panel"><p class="suave">Cambiar un precio no modifica los turnos ya reservados.</p>
    ${servicios.map((s) => `<div class="fila" data-fila="${esc(s.id)}">
      <div class="info"><b>${esc(s.nombre)}</b><span class="suave">${s.duracion_min} min</span></div>
      <div style="width:130px"><label class="suave" for="p-${esc(s.id)}">Precio ($)</label><input id="p-${esc(s.id)}" type="number" min="1" step="100" value="${s.precio}"></div>
      <label style="display:flex;gap:.4rem;align-items:center;margin:0"><input type="checkbox" style="width:auto" ${s.activo ? 'checked' : ''} data-activo="${esc(s.id)}"> Activo</label>
      <button type="button" data-guardar="${esc(s.id)}">Guardar</button></div>`).join('')}</div>
    <form id="f-serv" class="panel campos" novalidate><h3 style="grid-column:1/-1;margin:0">Nuevo servicio</h3>
      <div><label for="n-nombre">Nombre</label><input id="n-nombre" maxlength="60" required></div>
      <div><label for="n-dur">Duración (min)</label><select id="n-dur">${[30, 60, 90, 120, 150, 180].map((m) => `<option value="${m}">${m}</option>`).join('')}</select></div>
      <div><label for="n-precio">Precio ($)</label><input id="n-precio" type="number" min="1" step="100" required></div>
      <div style="align-self:end"><button type="submit">Agregar</button></div></form>`;
  cont.querySelectorAll('[data-guardar]').forEach((b) => {
    b.onclick = () => { const id = b.dataset.guardar; accion(b, () => api(`/admin/servicios/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo: { precio: Number(document.getElementById(`p-${id}`).value), activo: cont.querySelector(`[data-activo="${id}"]`).checked } }), 'Servicio actualizado.'); };
  });
  document.getElementById('f-serv').onsubmit = (ev) => {
    ev.preventDefault();
    accion(ev.target.querySelector('button'), () => api('/admin/servicios', { metodo: 'POST', cuerpo: { nombre: document.getElementById('n-nombre').value, duracion_min: Number(document.getElementById('n-dur').value), precio: Number(document.getElementById('n-precio').value) } }), 'Servicio agregado.');
  };
}

render();
