// R22: contraseñas con scrypt (salt aleatorio) y tokens firmados con HMAC-SHA256. Solo módulos nativos.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const b64 = (s) => Buffer.from(s).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verificarPassword(password, guardado) {
  const [salt, hex] = String(guardado).split(':');
  if (!salt || !hex) return false;
  const esperado = Buffer.from(hex, 'hex');
  const hash = await scryptAsync(password, salt, 64);
  return esperado.length === hash.length && timingSafeEqual(esperado, hash);
}

export function firmarToken(payload, secret) {
  const cuerpo = b64(JSON.stringify(payload));
  const firma = createHmac('sha256', secret).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/** Devuelve el payload si la firma es válida y no venció; si no, null. */
export function verificarToken(token, secret, ahoraMs) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = createHmac('sha256', secret).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return payload.exp * 1000 > ahoraMs ? payload : null;
  } catch { return null; }
}
