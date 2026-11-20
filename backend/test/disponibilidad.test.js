import test from 'node:test';
import assert from 'node:assert/strict';
import { disponibilidad, listarServicios, listarProfesionales } from '../src/service.js';
import { nuevoCtx, falla, at } from './helpers.js';

const SEMI = 'svc-semipermanente';
const horas = (d) => d.slots.map((s) => s.hora);

test('R05 el catálogo expone duración y precio de cada servicio', async () => {
  const ctx = await nuevoCtx();
  const s = await listarServicios(ctx);
  assert.equal(s.find((x) => x.id === SEMI).duracion_min, 60);
  assert.equal((await listarProfesionales(ctx)).length, 2);
});

test('R01 R02 un miércoles ofrece huecos de 10:00 a 18:00 cada 30 min para un servicio de 60 min', async () => {
  const ctx = await nuevoCtx();
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-25' });
  assert.equal(horas(d)[0], '10:00');
  assert.equal(horas(d).at(-1), '18:00');
  assert.equal(d.slots.length, 17);
  assert.equal(d.slots[0].profesionales.length, 2);
});

test('R02 un servicio de 120 min no puede empezar después de las 17:00', async () => {
  const ctx = await nuevoCtx();
  const d = await disponibilidad(ctx, { servicio_id: 'svc-esculpidas', fecha: '2026-11-25' });
  assert.equal(horas(d).at(-1), '17:00');
});

test('R01 el domingo figura cerrado y sin huecos', async () => {
  const ctx = await nuevoCtx();
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-29' });
  assert.equal(d.cerrado, true);
  assert.equal(d.slots.length, 0);
});

test('R03 un feriado cargado figura cerrado', async () => {
  const ctx = await nuevoCtx();
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-12-08' });
  assert.equal(d.cerrado, true);
});

test('R08 hoy solo se ofrecen horarios con 2 horas de anticipación (lunes 10:00 → desde las 12:00)', async () => {
  const ctx = await nuevoCtx();
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-23' });
  assert.equal(horas(d)[0], '12:00');
});

test('R08 el pasado no tiene huecos y más allá de 30 días tampoco', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-20' })).slots.length, 0);
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2027-01-15' })).slots.length, 0);
});

test('R12 R13 R14 la respuesta incluye el precio del día calculado por el backend', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-25' })).precio, 12000);
  const sab = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-28' });
  assert.equal(sab.precio, 13800);
  assert.deepEqual(sab.detalle, ['Recargo de sábado (+15%)']);
  assert.equal((await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-24' })).precio, 10800);
});

test('R06 un hueco ocupado por un turno confirmado deja de ofrecerse a esa profesional', async () => {
  const ctx = await nuevoCtx();
  const { registrar } = await import('../src/service.js');
  const u = (await registrar(ctx, { nombre: 'Ana', email: 'ana@mail.test', password: 'clave-segura-1' })).usuario;
  const ini = at('2026-11-25', '11:00');
  await ctx.db.query(
    "INSERT INTO turnos (id, usuario_id, servicio_id, profesional_id, inicio, fin, precio, estado, creado) VALUES ('t1',$1,$2,'prof-camila',$3,$4,12000,'confirmado',$5)",
    [u.id, SEMI, ini.toISOString(), new Date(ini.getTime() + 3600000).toISOString(), ctx.clock.now().toISOString()],
  );
  const d = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-25' });
  const s1030 = d.slots.find((s) => s.hora === '10:30');
  assert.deepEqual(s1030.profesionales.map((p) => p.id), ['prof-lucia']);
  assert.equal(d.slots.find((s) => s.hora === '10:00').profesionales.length, 2); // termina justo a las 11:00
  assert.equal(d.slots.find((s) => s.hora === '12:00').profesionales.length, 2);
  const solo = await disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-25', profesional_id: 'prof-camila' });
  assert.equal(horas(solo).includes('11:00'), false);
});

test('R26 entradas inválidas devuelven errores claros', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await falla(disponibilidad(ctx, { servicio_id: SEMI, fecha: 'mañana' }))).code, 'FECHA_INVALIDA');
  assert.equal((await falla(disponibilidad(ctx, { servicio_id: 'nada', fecha: '2026-11-25' }))).status, 404);
  assert.equal((await falla(disponibilidad(ctx, { servicio_id: SEMI, fecha: '2026-11-25', profesional_id: 'x' }))).code, 'PROFESIONAL_NO_ENCONTRADO');
});
