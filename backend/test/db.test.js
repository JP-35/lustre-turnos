import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb, migrar, sembrar } from '../src/db.js';

async function base() {
  const db = await createDb({ url: process.env.TEST_DATABASE_URL || '', sqliteFile: ':memory:' });
  await migrar(db, { reset: true });
  await sembrar(db);
  return db;
}

test('R05 la semilla carga el catálogo, las profesionales y los feriados', async () => {
  const db = await base();
  const s = await db.query('SELECT nombre, duracion_min, precio FROM servicios ORDER BY precio');
  assert.equal(s.length, 4);
  assert.equal(s[0].nombre, 'Retiro de material');
  assert.equal((await db.query('SELECT id FROM profesionales')).length, 2);
  assert.ok((await db.query('SELECT fecha FROM dias_cerrados')).length >= 3);
  await db.close();
});

test('la semilla es idempotente (no duplica al correr dos veces)', async () => {
  const db = await base();
  await sembrar(db);
  assert.equal((await db.query('SELECT id FROM servicios')).length, 4);
  await db.close();
});

test('los parámetros $n se respetan aunque se repitan o cambien de orden', async () => {
  const db = await base();
  const r = await db.query('SELECT id FROM servicios WHERE precio >= $2 AND duracion_min <= $1 ORDER BY id', [60, 12000]);
  assert.deepEqual(r.map((x) => x.id), ['svc-semipermanente']);
  await db.close();
});

test('una transacción con error hace rollback completo', async () => {
  const db = await base();
  await assert.rejects(db.tx(async (t) => {
    await t.query("INSERT INTO dias_cerrados (fecha, motivo) VALUES ('2027-05-01','x')");
    throw new Error('falla');
  }));
  assert.equal((await db.query("SELECT fecha FROM dias_cerrados WHERE fecha = '2027-05-01'")).length, 0);
  await db.close();
});
