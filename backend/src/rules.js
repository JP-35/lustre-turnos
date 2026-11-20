// Reglas de negocio PURAS (sin base de datos ni reloj propio). Ver docs/SPEC.md.
import { localParts } from './clock.js';

const H = 3600000;
export const REGLAS = {
  APERTURA: 10 * 60,            // R01
  CIERRE: 19 * 60,              // R01
  PASO: 30,                     // R02
  ANTICIPACION_MS: 2 * H,       // R08
  HORIZONTE_MS: 30 * 24 * H,    // R08
  MAX_ACTIVOS: 2,               // R09
  CANCEL_SIN_CARGO_MS: 24 * H,  // R17
  DEUDA_CANCELACION_TARDIA: 0.5,// R18
  DEUDA_AUSENCIA: 1,            // R20
  RECARGO_SABADO: 0.15,         // R13
  DESCUENTO: 0.1,               // R14, R15
  FRECUENTE_MIN: 5,             // R15
};

const err = (code, message) => ({ code, message });

/** R01, R02, R03: ¿el turno cae en un horario atendible? Devuelve null si está bien. */
export function validarHorario({ inicio, duracionMin, diasCerrados = new Set() }) {
  const p = localParts(inicio);
  if (p.dow === 0) return err('DIA_CERRADO', 'Los domingos el estudio está cerrado.');
  if (diasCerrados.has(p.fecha)) return err('DIA_CERRADO', 'El estudio está cerrado ese día.');
  if (p.minutos % REGLAS.PASO !== 0 || p.resto !== 0) {
    return err('HORARIO_INVALIDO', 'Los turnos empiezan en punto o y media.');
  }
  if (p.minutos < REGLAS.APERTURA || p.minutos + duracionMin > REGLAS.CIERRE) {
    return err('FUERA_DE_HORARIO', 'El turno debe estar entre las 10:00 y las 19:00.');
  }
  return null;
}

/** R08: anticipación mínima y horizonte máximo. */
export function validarVentana({ inicio, ahora }) {
  if (inicio.getTime() < ahora.getTime() + REGLAS.ANTICIPACION_MS) {
    return err('ANTICIPACION_MINIMA', 'Hay que reservar con al menos 2 horas de anticipación.');
  }
  if (inicio.getTime() > ahora.getTime() + REGLAS.HORIZONTE_MS) {
    return err('FUERA_DE_HORIZONTE', 'Solo se puede reservar hasta 30 días hacia adelante.');
  }
  return null;
}

/** R06: dos intervalos [ini, fin) se superponen. Tocarse en el borde no cuenta. */
export const seSuperponen = (aIni, aFin, bIni, bFin) => aIni < bFin && aFin > bIni;

/** R12–R16: precio final y detalle legible. */
export function calcularPrecio({ base, inicio, frecuente = false }) {
  const { dow } = localParts(inicio);
  let precio = base;
  const detalle = [];
  if (dow === 6) {
    precio *= 1 + REGLAS.RECARGO_SABADO;
    detalle.push('Recargo de sábado (+15%)');
  }
  if (dow === 2) {
    precio *= 1 - REGLAS.DESCUENTO;
    detalle.push('Martes de descuento (−10%)');
  } else if (frecuente) {
    precio *= 1 - REGLAS.DESCUENTO;
    detalle.push('Clienta frecuente (−10%)');
  }
  return { precio: Math.round(precio), detalle };
}

/** R17: sin cargo si falta 24 h o más para el inicio. */
export const cancelacionSinCargo = (inicio, ahora) =>
  inicio.getTime() - ahora.getTime() >= REGLAS.CANCEL_SIN_CARGO_MS;

/** R18, R20: monto de deuda según el motivo. */
export function montoDeuda(precio, motivo) {
  const f = motivo === 'ausencia' ? REGLAS.DEUDA_AUSENCIA : REGLAS.DEUDA_CANCELACION_TARDIA;
  return Math.round(precio * f);
}
