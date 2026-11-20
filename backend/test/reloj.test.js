import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, localParts, fromLocal, fechaValida } from '../src/clock.js';

test('R04 el miércoles 22:30 local es jueves 01:30 UTC y el sistema lo trata como miércoles', () => {
  const d = fromLocal('2026-10-21', 22 * 60 + 30);
  assert.equal(d.toISOString(), '2026-10-22T01:30:00.000Z');
  const p = localParts(d);
  assert.equal(p.fecha, '2026-10-21');
  assert.equal(p.dow, 3);
});

test('R04 el domingo 22:00 local todavía pertenece al domingo (no al lunes UTC)', () => {
  const p = localParts(fromLocal('2026-10-25', 22 * 60));
  assert.equal(p.dow, 0);
  assert.equal(p.fecha, '2026-10-25');
});

test('R04 el Reloj se maneja a control remoto: fijar y adelantar', () => {
  const c = createClock('2026-11-23T13:00:00Z');
  assert.equal(c.now().toISOString(), '2026-11-23T13:00:00.000Z');
  c.advance(23 * 3600000);
  assert.equal(c.now().toISOString(), '2026-11-24T12:00:00.000Z');
  c.set('2027-01-01T00:00:00Z');
  assert.equal(c.now().getUTCFullYear(), 2027);
});

test('R04 fechaValida rechaza fechas imposibles', () => {
  assert.equal(fechaValida('2026-02-30'), false);
  assert.equal(fechaValida('26-11-23'), false);
  assert.equal(fechaValida('2026-11-23'), true);
});
