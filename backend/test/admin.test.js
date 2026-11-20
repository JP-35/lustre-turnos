import test from 'node:test';
import assert from 'node:assert/strict';
import { reservar, agenda, completarTurno, marcarAusente, listarDeudas, saldarDeuda, misDeudas, cerrarDia, abrirDia, listarDiasCerrados, crearServicio, actualizarServicio, listarServicios, disponibilidad } from '../src/service.js';
import { nuevoCtx, nuevaClienta, falla, at } from './helpers.js';

const SEMI = 'svc-semipermanente';
const reservaMiercoles = (ctx, u, hora = '12:00') => reservar(ctx, u, { servicio_id: SEMI, inicio: at('2026-11-25', hora).toISOString() });

test('R23 la agenda del día muestra clienta, servicio y profesional', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx, 'Lola Gómez');
  await reservaMiercoles(ctx, u);
  const a = await agenda(ctx, { fecha: '2026-11-25' });
  assert.equal(a.length, 1);
  assert.equal(a[0].cliente, 'Lola Gómez');
  assert.equal(a[0].ya_comenzo, false);
  assert.equal((await agenda(ctx, { fecha: '2026-11-26' })).length, 0);
});

test('R25 solo se puede cerrar un turno desde que empezó', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  assert.equal((await falla(completarTurno(ctx, t.id))).code, 'AUN_NO_COMENZO');
  assert.equal((await falla(marcarAusente(ctx, t.id))).code, 'AUN_NO_COMENZO');
  ctx.clock.set(at('2026-11-25', '12:00'));
  assert.equal((await completarTurno(ctx, t.id)).turno.estado, 'completado');
  assert.equal((await falla(completarTurno(ctx, t.id))).code, 'ESTADO_INVALIDO');
});

test('R20 la ausencia genera deuda del 100% y R21 saldarla libera para reservar', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(at('2026-11-25', '13:30'));
  const r = await marcarAusente(ctx, t.id);
  assert.equal(r.deuda.monto, 12000);
  assert.equal((await falla(reservar(ctx, u, { servicio_id: SEMI, inicio: at('2026-11-27', '12:00').toISOString() }))).code, 'DEUDA_PENDIENTE');
  const [pend] = await listarDeudas(ctx);
  assert.equal(pend.email, u.email);
  await saldarDeuda(ctx, pend.id);
  assert.equal((await listarDeudas(ctx)).length, 0);
  assert.equal((await listarDeudas(ctx, { estado: 'saldada' })).length, 1);
  assert.equal((await misDeudas(ctx, u))[0].estado, 'saldada');
  assert.equal((await reservar(ctx, u, { servicio_id: SEMI, inicio: at('2026-11-27', '12:00').toISOString() })).estado, 'confirmado');
});

test('R21 una deuda no se salda dos veces ni si no existe', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await falla(saldarDeuda(ctx, 'nada'))).code, 'DEUDA_NO_ENCONTRADA');
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(at('2026-11-25', '13:00'));
  await marcarAusente(ctx, t.id);
  const [d] = await listarDeudas(ctx);
  await saldarDeuda(ctx, d.id);
  assert.equal((await falla(saldarDeuda(ctx, d.id))).code, 'DEUDA_YA_SALDADA');
});

test('R15 cinco turnos completados convierten a la clienta en frecuente', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const dias = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01'];
  for (const d of dias) {
    ctx.clock.set(at('2026-11-23', '10:00'));
    const t = await reservar(ctx, u, { servicio_id: SEMI, inicio: at(d, '12:00').toISOString() });
    ctx.clock.set(at(d, '12:30'));
    await completarTurno(ctx, t.id);
  }
  ctx.clock.set(at('2026-12-02', '09:00'));
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-12-03' }, u);
  assert.equal(d.precio, 10800);
  assert.deepEqual(d.detalle, ['Clienta frecuente (−10%)']);
});

test('R03 el admin cierra y reabre días; no puede cerrar uno con turnos confirmados', async () => {
  const ctx = await nuevoCtx();
  await cerrarDia(ctx, { fecha: '2026-12-02', motivo: 'Capacitación' });
  assert.ok((await listarDiasCerrados(ctx)).some((d) => d.fecha === '2026-12-02'));
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-12-02' })).cerrado, true);
  assert.equal((await falla(cerrarDia(ctx, { fecha: '2026-12-02', motivo: 'Otra vez' }))).code, 'DIA_YA_CERRADO');
  await abrirDia(ctx, '2026-12-02');
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-12-02' })).cerrado, false);
  assert.equal((await falla(abrirDia(ctx, '2026-12-02'))).code, 'DIA_NO_CERRADO');
  const u = await nuevaClienta(ctx);
  await reservaMiercoles(ctx, u);
  const e = await falla(cerrarDia(ctx, { fecha: '2026-11-25', motivo: 'Feriado puente' }));
  assert.equal(e.code, 'HAY_TURNOS_CONFIRMADOS');
  assert.equal(e.status, 409);
});

test('R12 el admin edita precios y servicios sin alterar los turnos ya tomados', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  const s = await actualizarServicio(ctx, SEMI, { precio: 15000 });
  assert.equal(s.precio, 15000);
  assert.equal((await agenda(ctx, { fecha: '2026-11-25' }))[0].precio, t.precio);
  const nuevo = await crearServicio(ctx, { nombre: 'Nail art', duracion_min: 30, precio: 3000 });
  assert.equal((await listarServicios(ctx)).some((x) => x.id === nuevo.id), true);
  await actualizarServicio(ctx, nuevo.id, { activo: false });
  assert.equal((await listarServicios(ctx)).some((x) => x.id === nuevo.id), false);
  assert.equal((await listarServicios(ctx, { todos: true })).some((x) => x.id === nuevo.id), true);
});

test('R26 el catálogo valida precio y duración', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await falla(crearServicio(ctx, { nombre: 'X', duracion_min: 30, precio: 100 }))).code, 'NOMBRE_INVALIDO');
  assert.equal((await falla(crearServicio(ctx, { nombre: 'Nail art', duracion_min: 45, precio: 100 }))).code, 'DURACION_INVALIDA');
  assert.equal((await falla(crearServicio(ctx, { nombre: 'Nail art', duracion_min: 30, precio: -5 }))).code, 'PRECIO_INVALIDO');
  assert.equal((await falla(actualizarServicio(ctx, 'nada', { precio: 5 }))).status, 404);
});
