import test from 'node:test';
import assert from 'node:assert/strict';
import { registrar, entrar, usuarioPorToken, usuarioPorEmail } from '../src/service.js';
import { asegurarAdmin } from '../src/service.js';
import { firmarToken, verificarToken } from '../src/auth.js';
import { nuevoCtx, falla } from './helpers.js';

const datos = { nombre: 'Sofía Paz', email: 'sofia@mail.test', password: 'clave-segura-1' };

test('R22 registrar crea la cuenta, devuelve token y nunca expone el hash', async () => {
  const ctx = await nuevoCtx();
  const s = await registrar(ctx, datos);
  assert.ok(s.token);
  assert.equal(s.usuario.rol, 'cliente');
  assert.equal(JSON.stringify(s).includes('password'), false);
  const [fila] = await ctx.db.query('SELECT password_hash FROM usuarios WHERE email = $1', [datos.email]);
  assert.notEqual(fila.password_hash, datos.password);
  assert.match(fila.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test('R22 valida nombre, email y contraseña con mensajes en español (R26)', async () => {
  const ctx = await nuevoCtx();
  assert.equal((await falla(registrar(ctx, { ...datos, nombre: 'A' }))).code, 'NOMBRE_INVALIDO');
  assert.equal((await falla(registrar(ctx, { ...datos, email: 'sin-arroba' }))).code, 'EMAIL_INVALIDO');
  const e = await falla(registrar(ctx, { ...datos, password: 'corta' }));
  assert.equal(e.code, 'PASSWORD_INVALIDA');
  assert.equal(e.status, 400);
  assert.match(e.message, /contraseña/);
});

test('R22 el email es único sin distinguir mayúsculas', async () => {
  const ctx = await nuevoCtx();
  await registrar(ctx, datos);
  const e = await falla(registrar(ctx, { ...datos, email: 'SOFIA@mail.test' }));
  assert.equal(e.status, 409);
  assert.equal(e.code, 'EMAIL_EXISTENTE');
});

test('R22 entrar con credenciales correctas y rechazar las incorrectas con el mismo mensaje', async () => {
  const ctx = await nuevoCtx();
  await registrar(ctx, datos);
  assert.ok((await entrar(ctx, { email: datos.email, password: datos.password })).token);
  const a = await falla(entrar(ctx, { email: datos.email, password: 'otra-clave-1' }));
  const b = await falla(entrar(ctx, { email: 'nadie@mail.test', password: 'otra-clave-1' }));
  assert.equal(a.status, 401);
  assert.equal(a.message, b.message);
});

test('R22 el token se valida, no se puede alterar y vence a los 7 días', async () => {
  const ctx = await nuevoCtx();
  const { token, usuario } = await registrar(ctx, datos);
  assert.equal((await usuarioPorToken(ctx, token)).id, usuario.id);
  const [cuerpo, firma] = token.split('.');
  assert.equal(await usuarioPorToken(ctx, `${cuerpo}x.${firma}`), null);
  assert.equal(await usuarioPorToken(ctx, 'basura'), null);
  const otro = firmarToken({ sub: usuario.id, exp: 9999999999 }, 'otro-secreto');
  assert.equal(await usuarioPorToken(ctx, otro), null);
  ctx.clock.advance(8 * 24 * 3600 * 1000);
  assert.equal(await usuarioPorToken(ctx, token), null);
});

test('R22 verificarToken rechaza un payload vencido', () => {
  const t = firmarToken({ sub: 'x', exp: 10 }, 's');
  assert.equal(verificarToken(t, 's', 11 * 1000), null);
  assert.equal(verificarToken(t, 's', 5 * 1000).sub, 'x');
});

test('R24 el admin inicial se crea desde el entorno y es idempotente', async () => {
  const ctx = await nuevoCtx();
  const admin = await usuarioPorEmail(ctx, 'admin@lustre.test');
  assert.equal(admin.rol, 'admin');
  assert.equal(await asegurarAdmin(ctx, { email: 'admin@lustre.test', password: 'otra-clave-9' }), null);
  assert.equal((await ctx.db.query("SELECT id FROM usuarios WHERE rol = 'admin'")).length, 1);
  assert.ok((await entrar(ctx, { email: 'admin@lustre.test', password: 'clave-admin-1' })).token);
});
