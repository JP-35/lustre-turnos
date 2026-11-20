// Punto de entrada: lee el entorno, arma el contexto y levanta el servidor HTTP.
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext } from './context.js';
import { createApp } from './app.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(aqui, '..', '.env')); } catch { /* sin .env: se usan variables del sistema */ }

const env = process.env;
const produccion = env.NODE_ENV === 'production';
if (produccion && (!env.JWT_SECRET || env.JWT_SECRET.length < 16)) throw new Error('En producción JWT_SECRET es obligatorio (mínimo 16 caracteres).');
if (produccion && !env.DATABASE_URL) console.warn('⚠ Producción sin DATABASE_URL: se usará SQLite local (los datos no persisten en Render).');
if (!env.JWT_SECRET) console.warn('⚠ Sin JWT_SECRET: usando uno de desarrollo.');

const ctx = await createContext({
  databaseUrl: env.DATABASE_URL ?? '',
  sqliteFile: env.SQLITE_FILE || path.join(aqui, '..', 'lustre.sqlite'),
  secret: env.JWT_SECRET || 'secreto-solo-para-desarrollo-local',
  admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
});
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) console.warn('⚠ Sin ADMIN_EMAIL/ADMIN_PASSWORD: no se creó un admin inicial.');

const frontendDir = path.join(aqui, '..', '..', 'frontend');
const origenes = (env.FRONTEND_URL ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const app = createApp(ctx, { frontendOrigins: origenes, frontendDir: existsSync(frontendDir) ? frontendDir : null });

const puerto = Number(env.PORT) || 3000;
const server = http.createServer(app).listen(puerto, () => {
  console.log(`Lustre Turnos escuchando en http://localhost:${puerto} (${ctx.db.dialect})`);
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(async () => { await ctx.db.close(); process.exit(0); }));
