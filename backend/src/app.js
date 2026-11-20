// Capa HTTP: rutas, autenticación, CORS, JSON y mapeo de errores (R23, R26). Sin lógica de negocio.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, fail } from './errors.js';
import * as S from './service.js';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const MAX_BODY = 100 * 1024;

// acceso: publica | opcional (usa la sesión si hay) | sesion | admin
const ruta = (metodo, patron, acceso, run, status = 200) => ({
  metodo, acceso, run, status,
  re: new RegExp(`^${patron.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
});

const RUTAS = [
  ruta('GET', '/api/salud', 'publica', (ctx) => ({ ok: true, hora: ctx.clock.now().toISOString() })),
  ruta('POST', '/api/registro', 'publica', (ctx, r) => S.registrar(ctx, r.body), 201),
  ruta('POST', '/api/entrada', 'publica', (ctx, r) => S.entrar(ctx, r.body)),
  ruta('GET', '/api/yo', 'sesion', (ctx, r) => ({ usuario: S.usuarioPublico(r.usuario) })),
  ruta('GET', '/api/servicios', 'publica', (ctx) => S.listarServicios(ctx)),
  ruta('GET', '/api/profesionales', 'publica', (ctx) => S.listarProfesionales(ctx)),
  ruta('GET', '/api/disponibilidad', 'opcional', (ctx, r) => S.disponibilidad(ctx, r.query, r.usuario)),
  ruta('POST', '/api/turnos', 'sesion', (ctx, r) => S.reservar(ctx, r.usuario, r.body), 201),
  ruta('GET', '/api/turnos/mios', 'sesion', (ctx, r) => S.misTurnos(ctx, r.usuario)),
  ruta('POST', '/api/turnos/:id/cancelar', 'sesion', (ctx, r) => S.cancelar(ctx, r.usuario, r.params.id)),
  ruta('GET', '/api/deudas/mias', 'sesion', (ctx, r) => S.misDeudas(ctx, r.usuario)),
  ruta('GET', '/api/admin/agenda', 'admin', (ctx, r) => S.agenda(ctx, r.query)),
  ruta('POST', '/api/admin/turnos/:id/completar', 'admin', (ctx, r) => S.completarTurno(ctx, r.params.id)),
  ruta('POST', '/api/admin/turnos/:id/ausente', 'admin', (ctx, r) => S.marcarAusente(ctx, r.params.id)),
  ruta('GET', '/api/admin/deudas', 'admin', (ctx, r) => S.listarDeudas(ctx, r.query)),
  ruta('POST', '/api/admin/deudas/:id/saldar', 'admin', (ctx, r) => S.saldarDeuda(ctx, r.params.id)),
  ruta('GET', '/api/admin/dias-cerrados', 'admin', (ctx) => S.listarDiasCerrados(ctx)),
  ruta('POST', '/api/admin/dias-cerrados', 'admin', (ctx, r) => S.cerrarDia(ctx, r.body), 201),
  ruta('DELETE', '/api/admin/dias-cerrados/:fecha', 'admin', (ctx, r) => S.abrirDia(ctx, r.params.fecha)),
  ruta('GET', '/api/admin/servicios', 'admin', (ctx) => S.listarServicios(ctx, { todos: true })),
  ruta('POST', '/api/admin/servicios', 'admin', (ctx, r) => S.crearServicio(ctx, r.body), 201),
  ruta('PATCH', '/api/admin/servicios/:id', 'admin', (ctx, r) => S.actualizarServicio(ctx, r.params.id, r.body)),
];

async function leerJson(req) {
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > MAX_BODY) throw fail(413, 'CUERPO_DEMASIADO_GRANDE', 'El pedido es demasiado grande.');
    partes.push(p);
  }
  if (!total) return {};
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { throw fail(400, 'JSON_INVALIDO', 'El cuerpo del pedido no es un JSON válido.'); }
}

export function createApp(ctx, { frontendOrigins = [], frontendDir = null } = {}) {
  const enviar = (res, status, datos) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(datos));
  };

  function cors(req, res) {
    const origen = req.headers.origin;
    if (!origen) return;
    if (frontendOrigins.length && !frontendOrigins.includes(origen)) return; // el navegador bloqueará la respuesta
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }

  async function api(req, res, url) {
    const r = RUTAS.find((x) => x.metodo === req.method && x.re.test(url.pathname));
    if (!r) throw fail(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe.');
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const usuario = token ? await S.usuarioPorToken(ctx, token) : null;
    if ((r.acceso === 'sesion' || r.acceso === 'admin') && !usuario) throw fail(401, 'NO_AUTENTICADO', 'Iniciá sesión para continuar.');
    if (r.acceso === 'admin' && usuario.rol !== 'admin') throw fail(403, 'SIN_PERMISO', 'No tenés permiso para esta acción.');
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await leerJson(req);
    const params = Object.fromEntries(Object.entries(url.pathname.match(r.re).groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    const salida = await r.run(ctx, { usuario, params, query: Object.fromEntries(url.searchParams), body });
    enviar(res, r.status, salida);
  }

  async function estatico(req, res, url) {
    if (!frontendDir || !['GET', 'HEAD'].includes(req.method)) throw fail(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe.');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const archivo = path.resolve(frontendDir, rel);
    if (!archivo.startsWith(path.resolve(frontendDir) + path.sep)) throw fail(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe.');
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : datos);
    } catch { throw fail(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe.'); }
  }

  return async function handler(req, res) {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      cors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://local');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await estatico(req, res, url);
    } catch (e) {
      if (e instanceof AppError) return enviar(res, e.status, { error: { code: e.code, message: e.message } });
      console.error('Error inesperado:', e);
      enviar(res, 500, { error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado. Probá de nuevo en un rato.' } });
    }
  };
}
