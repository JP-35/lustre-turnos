import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { nuevoCtx, at } from './helpers.js';

async function servir(opts = {}) {
  const ctx = await nuevoCtx();
  const server = http.createServer(createApp(ctx, opts));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const llamar = async (metodo, ruta, { body, token, headers = {} } = {}) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const texto = await res.text();
    let json = null; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    return { status: res.status, json, texto, headers: res.headers };
  };
  return { ctx, base, llamar, cerrar: () => new Promise((r) => server.close(r)) };
}

const registro = (llamar, n = 1) => llamar('POST', '/api/registro', { body: { nombre: `Clienta ${n}`, email: `c${n}@mail.test`, password: 'clave-segura-1' } });
const turnoBody = (hora = '12:00', fecha = '2026-11-25') => ({ servicio_id: 'svc-semipermanente', inicio: at(fecha, hora).toISOString() });

test('API: salud responde con la hora del Reloj (R04)', async () => {
  const s = await servir();
  const r = await s.llamar('GET', '/api/salud');
  assert.equal(r.status, 200);
  assert.equal(r.json.hora, s.ctx.clock.now().toISOString());
  await s.cerrar();
});

test('R22 R26 registro, entrada y /yo funcionan por HTTP y no filtran el hash', async () => {
  const s = await servir();
  const reg = await registro(s.llamar);
  assert.equal(reg.status, 201);
  assert.equal(reg.texto.includes('hash'), false);
  const dup = await registro(s.llamar);
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'EMAIL_EXISTENTE');
  const ent = await s.llamar('POST', '/api/entrada', { body: { email: 'c1@mail.test', password: 'clave-segura-1' } });
  assert.equal(ent.status, 200);
  assert.equal((await s.llamar('GET', '/api/yo', { token: ent.json.token })).json.usuario.email, 'c1@mail.test');
  assert.equal((await s.llamar('POST', '/api/entrada', { body: { email: 'c1@mail.test', password: 'mala-clave-1' } })).status, 401);
  await s.cerrar();
});

test('R23 sin sesión no se reserva (401) y un token falso tampoco', async () => {
  const s = await servir();
  assert.equal((await s.llamar('POST', '/api/turnos', { body: turnoBody() })).status, 401);
  assert.equal((await s.llamar('GET', '/api/turnos/mios', { token: 'falso.token' })).status, 401);
  await s.cerrar();
});

test('flujo completo por HTTP: disponibilidad → reservar → mis turnos → cancelar sin cargo', async () => {
  const s = await servir();
  const { token } = (await registro(s.llamar)).json;
  const disp = await s.llamar('GET', '/api/disponibilidad?servicio_id=svc-semipermanente&fecha=2026-11-25');
  assert.equal(disp.status, 200);
  assert.equal(disp.json.precio, 12000);
  assert.ok(disp.json.slots.length > 10);
  const res = await s.llamar('POST', '/api/turnos', { token, body: { ...turnoBody(), precio: 1 } });
  assert.equal(res.status, 201);
  assert.equal(res.json.precio, 12000); // R12: se ignora el precio del cliente
  const lista = await s.llamar('GET', '/api/turnos/mios', { token });
  assert.equal(lista.json.length, 1);
  assert.equal(lista.json[0].sin_cargo, true);
  const canc = await s.llamar('POST', `/api/turnos/${res.json.id}/cancelar`, { token });
  assert.equal(canc.status, 200);
  assert.equal(canc.json.deuda, null);
  await s.cerrar();
});

test('R06 dos reservas HTTP simultáneas al mismo hueco: una 201 y la otra 409', async () => {
  const s = await servir();
  const a = (await registro(s.llamar, 1)).json.token;
  const b = (await registro(s.llamar, 2)).json.token;
  const cuerpo = { ...turnoBody('16:00'), profesional_id: 'prof-camila' };
  const [r1, r2] = await Promise.all([a, b].map((token) => s.llamar('POST', '/api/turnos', { token, body: cuerpo })));
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
  await s.cerrar();
});

test('R23 un cliente no entra a rutas de admin (403) y un admin sí', async () => {
  const s = await servir();
  const { token } = (await registro(s.llamar)).json;
  const r = await s.llamar('GET', '/api/admin/agenda?fecha=2026-11-25', { token });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'SIN_PERMISO');
  assert.equal((await s.llamar('GET', '/api/admin/deudas')).status, 401);
  const adm = (await s.llamar('POST', '/api/entrada', { body: { email: 'admin@lustre.test', password: 'clave-admin-1' } })).json.token;
  await s.llamar('POST', '/api/turnos', { token, body: turnoBody() });
  const ag = await s.llamar('GET', '/api/admin/agenda?fecha=2026-11-25', { token: adm });
  assert.equal(ag.status, 200);
  assert.equal(ag.json.length, 1);
  await s.cerrar();
});

test('R20 R21 R25 el admin marca ausencia por HTTP, queda deuda y la salda', async () => {
  const s = await servir();
  const { token } = (await registro(s.llamar)).json;
  const adm = (await s.llamar('POST', '/api/entrada', { body: { email: 'admin@lustre.test', password: 'clave-admin-1' } })).json.token;
  const t = (await s.llamar('POST', '/api/turnos', { token, body: turnoBody() })).json;
  assert.equal((await s.llamar('POST', `/api/admin/turnos/${t.id}/ausente`, { token: adm })).json.error.code, 'AUN_NO_COMENZO');
  s.ctx.clock.set(at('2026-11-25', '12:30'));
  const aus = await s.llamar('POST', `/api/admin/turnos/${t.id}/ausente`, { token: adm });
  assert.equal(aus.json.deuda.monto, 12000);
  assert.equal((await s.llamar('POST', '/api/turnos', { token, body: turnoBody('12:00', '2026-11-27') })).json.error.code, 'DEUDA_PENDIENTE');
  const [d] = (await s.llamar('GET', '/api/admin/deudas', { token: adm })).json;
  assert.equal((await s.llamar('POST', `/api/admin/deudas/${d.id}/saldar`, { token: adm })).status, 200);
  assert.equal((await s.llamar('POST', '/api/turnos', { token, body: turnoBody('12:00', '2026-11-27') })).status, 201);
  await s.cerrar();
});

test('R03 R12 el admin cierra días y edita servicios por HTTP', async () => {
  const s = await servir();
  const adm = (await s.llamar('POST', '/api/entrada', { body: { email: 'admin@lustre.test', password: 'clave-admin-1' } })).json.token;
  assert.equal((await s.llamar('POST', '/api/admin/dias-cerrados', { token: adm, body: { fecha: '2026-12-03', motivo: 'Capacitación' } })).status, 201);
  assert.equal((await s.llamar('DELETE', '/api/admin/dias-cerrados/2026-12-03', { token: adm })).status, 200);
  const nuevo = await s.llamar('POST', '/api/admin/servicios', { token: adm, body: { nombre: 'Nail art', duracion_min: 30, precio: 3000 } });
  assert.equal(nuevo.status, 201);
  const upd = await s.llamar('PATCH', `/api/admin/servicios/${nuevo.json.id}`, { token: adm, body: { precio: 3500 } });
  assert.equal(upd.json.precio, 3500);
  await s.cerrar();
});

test('R26 errores: JSON inválido 400, ruta inexistente 404 y formato estable {error:{code,message}}', async () => {
  const s = await servir();
  const puerto = s.base;
  const roto = await fetch(`${puerto}/api/registro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{no es json' });
  assert.equal(roto.status, 400);
  assert.equal((await roto.json()).error.code, 'JSON_INVALIDO');
  const nf = await s.llamar('GET', '/api/nada');
  assert.equal(nf.status, 404);
  assert.deepEqual(Object.keys(nf.json.error).sort(), ['code', 'message']);
  assert.equal((await s.llamar('POST', '/api/registro')).status, 400);
  await s.cerrar();
});

test('CORS: solo el origen de FRONTEND_URL recibe cabeceras de permiso y el preflight responde 204', async () => {
  const s = await servir({ frontendOrigins: ['https://lustre.netlify.app'] });
  const ok = await s.llamar('GET', '/api/salud', { headers: { Origin: 'https://lustre.netlify.app' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://lustre.netlify.app');
  const otro = await s.llamar('GET', '/api/salud', { headers: { Origin: 'https://malo.example' } });
  assert.equal(otro.headers.get('access-control-allow-origin'), null);
  const pre = await s.llamar('OPTIONS', '/api/turnos', { headers: { Origin: 'https://lustre.netlify.app' } });
  assert.equal(pre.status, 204);
  await s.cerrar();
});

test('estático: sirve el frontend y bloquea salir de la carpeta', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'front-'));
  await writeFile(path.join(dir, 'index.html'), '<h1>Lustre</h1>');
  const s = await servir({ frontendDir: dir });
  const r = await s.llamar('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.texto, /Lustre/);
  assert.equal((await s.llamar('GET', '/..%2Fpackage.json')).status, 404);
  await s.cerrar();
});
