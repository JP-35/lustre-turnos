// Arma las dependencias de la app: base, reloj y secreto. Se inyectan en service.js y app.js.
import { createDb, migrar, sembrar } from './db.js';
import { createClock } from './clock.js';

export async function createContext({ databaseUrl = '', sqliteFile = ':memory:', secret, clock = createClock(), reset = false, admin = null } = {}) {
  if (!secret) throw new Error('Falta JWT_SECRET.');
  const db = await createDb({ url: databaseUrl, sqliteFile });
  await migrar(db, { reset });
  await sembrar(db);
  const ctx = { db, clock, secret };
  if (admin) {
    const { asegurarAdmin } = await import('./service.js');
    await asegurarAdmin(ctx, admin);
  }
  return ctx;
}
