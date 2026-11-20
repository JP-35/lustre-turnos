// Acceso a datos con la misma interfaz para SQLite (local/tests) y PostgreSQL (producción).
//   db.query(sql, params) -> filas        db.tx(async (t) => { t.query(...); await t.lock('clave'); })
import { ESQUEMA, TABLAS, SEMILLA } from './schema.js';

/** Convierte $1,$2… a "?" respetando el orden de aparición (SQLite usa parámetros posicionales). */
function adaptar(sql, params) {
  const orden = [];
  const texto = sql.replace(/\$(\d+)/g, (_, n) => { orden.push(Number(n) - 1); return '?'; });
  return { texto, args: orden.map((i) => params[i]) };
}

async function sqliteDb(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  const ejecutar = (sql, params = []) => {
    const { texto, args } = adaptar(sql, params);
    const st = raw.prepare(texto);
    return /^\s*(SELECT|WITH)/i.test(texto) ? st.all(...args).map((r) => ({ ...r })) : (st.run(...args), []);
  };
  let cola = Promise.resolve(); // una sola operación a la vez: hace atómica cada transacción
  const serializar = (fn) => { const r = cola.then(fn); cola = r.catch(() => {}); return r; };
  return {
    dialect: 'sqlite',
    query: (sql, params) => serializar(async () => ejecutar(sql, params)),
    tx: (fn) => serializar(async () => {
      raw.exec('BEGIN');
      try {
        const r = await fn({ query: async (s, p) => ejecutar(s, p), lock: async () => {} });
        raw.exec('COMMIT');
        return r;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    }),
    close: async () => raw.close(),
  };
}

async function pgDb(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
  return {
    dialect: 'postgres',
    query: (sql, params = []) => pool.query(sql, params).then((r) => r.rows),
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({
          query: (s, p = []) => c.query(s, p).then((x) => x.rows),
          lock: (clave) => c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [clave]),
        });
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

export const createDb = ({ url, sqliteFile = './lustre.sqlite' } = {}) => (url ? pgDb(url) : sqliteDb(sqliteFile));

export async function migrar(db, { reset = false } = {}) {
  if (reset) for (const t of TABLAS) await db.query(`DROP TABLE IF EXISTS ${t}`);
  for (const sql of ESQUEMA) await db.query(sql);
}

/** Datos iniciales (catálogo, profesionales, feriados). No pisa lo que ya existe. */
export async function sembrar(db) {
  const n = async (t) => Number((await db.query(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${t}`))[0].n);
  if ((await n('servicios')) === 0) {
    for (const [id, nombre, dur, precio] of SEMILLA.servicios) {
      await db.query('INSERT INTO servicios (id, nombre, duracion_min, precio, activo) VALUES ($1,$2,$3,$4,1)', [id, nombre, dur, precio]);
    }
  }
  if ((await n('profesionales')) === 0) {
    for (const [id, nombre] of SEMILLA.profesionales) {
      await db.query('INSERT INTO profesionales (id, nombre, activo) VALUES ($1,$2,1)', [id, nombre]);
    }
  }
  if ((await n('dias_cerrados')) === 0) {
    for (const [fecha, motivo] of SEMILLA.diasCerrados) {
      await db.query('INSERT INTO dias_cerrados (fecha, motivo) VALUES ($1,$2)', [fecha, motivo]);
    }
  }
}
