import test from 'node:test';
import assert from 'node:assert/strict';
import { reservar, cancelar, misTurnos, misDeudas } from '../src/service.js';
import { nuevoCtx, nuevaClienta, falla, at, AHORA } from './helpers.js';

const SEMI = 'svc-semipermanente';
const reservaMiercoles = (ctx, u, hora = '12:00') => reservar(ctx, u, { servicio_id: SEMI, inicio: at('2026-11-25', hora).toISOString() });

test('R17 cancelar con 24 h o más no genera deuda y libera el hueco', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(new Date(at('2026-11-25', '12:00').getTime() - 24 * 3600000));
  const r = await cancelar(ctx, u, t.id);
  assert.equal(r.turno.estado, 'cancelado');
  assert.equal(r.deuda, null);
  assert.equal((await misDeudas(ctx, u)).length, 0);
  const otra = await nuevaClienta(ctx);
  assert.equal((await reservar(ctx, otra, { servicio_id: SEMI, inicio: at('2026-11-25', '12:00').toISOString(), profesional_id: 'prof-camila' })).estado, 'confirmado');
});

test('R18 cancelar con 23 h genera deuda del 50% ($6.000 sobre $12.000)', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(new Date(at('2026-11-25', '12:00').getTime() - 23 * 3600000));
  const r = await cancelar(ctx, u, t.id);
  assert.equal(r.deuda.monto, 6000);
  const [d] = await misDeudas(ctx, u);
  assert.equal(d.estado, 'pendiente');
  assert.equal(d.motivo, 'cancelacion_tardia');
});

test('R18 cancelar con una hora de anticipación deja deuda del 50% (caso de la clase)', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(new Date(at('2026-11-25', '12:00').getTime() - 3600000));
  assert.equal((await cancelar(ctx, u, t.id)).deuda.monto, 6000);
});

test('R11 R18 tras una cancelación tardía queda bloqueada para reservar hasta saldar', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  ctx.clock.set(new Date(at('2026-11-25', '12:00').getTime() - 3600000));
  await cancelar(ctx, u, t.id);
  const e = await falla(reservar(ctx, u, { servicio_id: SEMI, inicio: at('2026-11-27', '12:00').toISOString() }));
  assert.equal(e.code, 'DEUDA_PENDIENTE');
});

test('R19 no se puede cancelar un turno ya comenzado, ya cancelado ni ajeno', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const otra = await nuevaClienta(ctx);
  const t = await reservaMiercoles(ctx, u);
  assert.equal((await falla(cancelar(ctx, otra, t.id))).code, 'TURNO_NO_ENCONTRADO');
  await cancelar(ctx, u, t.id);
  assert.equal((await falla(cancelar(ctx, u, t.id))).code, 'NO_CANCELABLE');
  const t2 = await reservaMiercoles(ctx, u, '15:00');
  ctx.clock.set(at('2026-11-25', '15:30'));
  assert.equal((await falla(cancelar(ctx, u, t2.id))).code, 'TURNO_COMENZADO');
});

test('R23 misTurnos lista solo los propios e indica si la cancelación sería sin cargo', async () => {
  const ctx = await nuevoCtx();
  const u = await nuevaClienta(ctx);
  const otra = await nuevaClienta(ctx);
  await reservaMiercoles(ctx, u);
  await reservaMiercoles(ctx, otra, '16:00');
  const lista = await misTurnos(ctx, u);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].cancelable, true);
  assert.equal(lista[0].sin_cargo, true);
  ctx.clock.set(new Date(at('2026-11-25', '12:00').getTime() - 3600000));
  assert.equal((await misTurnos(ctx, u))[0].sin_cargo, false);
});
