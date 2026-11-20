import { createClock, fromLocal } from '../src/clock.js';

/** Instante UTC para una fecha local de Argentina: at('2026-11-25', '15:00'). */
export function at(fecha, hora = '10:00') {
  const [h, m] = hora.split(':').map(Number);
  return fromLocal(fecha, h * 60 + m);
}

// Lunes 23/11/2026 10:00 hora de Argentina. Martes 24, miércoles 25, sábado 28, domingo 29.
export const AHORA = at('2026-11-23', '10:00');

/** Contexto de prueba: base nueva y vacía (SQLite en memoria, o PostgreSQL si hay TEST_DATABASE_URL). */
export async function nuevoCtx({ ahora = AHORA } = {}) {
  const { createContext } = await import('../src/context.js');
  const clock = createClock(ahora);
  return createContext({
    databaseUrl: process.env.TEST_DATABASE_URL || '',
    sqliteFile: ':memory:',
    secret: 'secreto-de-prueba',
    clock,
    reset: true,
    admin: { email: 'admin@lustre.test', password: 'clave-admin-1' },
  });
}

let n = 0;
export async function nuevaClienta(ctx, nombre = 'Clienta') {
  const { registrar } = await import('../src/service.js');
  n += 1;
  const s = await registrar(ctx, { nombre, email: `c${n}-${Date.now()}@mail.test`, password: 'clave-segura-1' });
  return s.usuario;
}

export async function admin(ctx) {
  const { usuarioPorEmail } = await import('../src/service.js');
  return usuarioPorEmail(ctx, 'admin@lustre.test');
}

export async function falla(promesa) {
  try { await promesa; } catch (e) { return e; }
  throw new Error('Se esperaba un error y no ocurrió');
}
