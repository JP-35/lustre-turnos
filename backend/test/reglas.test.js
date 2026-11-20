import test from 'node:test';
import assert from 'node:assert/strict';
import { validarHorario, validarVentana, calcularPrecio, cancelacionSinCargo, montoDeuda, seSuperponen } from '../src/rules.js';
import { at, AHORA } from './helpers.js';

const v = (fecha, hora, duracionMin = 60, diasCerrados) =>
  validarHorario({ inicio: at(fecha, hora), duracionMin, diasCerrados });

test('R01 de lunes a sábado se atiende y el domingo no', () => {
  assert.equal(v('2026-11-25', '10:00'), null);
  assert.equal(v('2026-11-28', '10:00'), null);
  assert.equal(v('2026-11-29', '10:00').code, 'DIA_CERRADO');
});

test('R01 antes de las 10:00 está fuera de horario', () => {
  assert.equal(v('2026-11-25', '09:30').code, 'FUERA_DE_HORARIO');
});

test('R02 los turnos empiezan en múltiplos de 30 minutos', () => {
  assert.equal(v('2026-11-25', '10:15').code, 'HORARIO_INVALIDO');
  assert.equal(v('2026-11-25', '10:30'), null);
});

test('R02 debe terminar a las 19:00 como máximo (borde exacto permitido)', () => {
  assert.equal(v('2026-11-25', '18:00', 60), null);
  assert.equal(v('2026-11-25', '18:30', 60).code, 'FUERA_DE_HORARIO');
  assert.equal(v('2026-11-25', '17:00', 120), null);
  assert.equal(v('2026-11-25', '17:30', 120).code, 'FUERA_DE_HORARIO');
});

test('R03 un día cerrado por el admin no admite turnos', () => {
  assert.equal(v('2026-12-08', '11:00', 60, new Set(['2026-12-08'])).code, 'DIA_CERRADO');
});

test('R08 se exige 2 horas de anticipación (borde exacto permitido)', () => {
  assert.equal(validarVentana({ inicio: at('2026-11-23', '12:00'), ahora: AHORA }), null);
  assert.equal(validarVentana({ inicio: at('2026-11-23', '11:30'), ahora: AHORA }).code, 'ANTICIPACION_MINIMA');
});

test('R08 el horizonte máximo es de 30 días', () => {
  assert.equal(validarVentana({ inicio: at('2026-12-23', '10:00'), ahora: AHORA }), null);
  assert.equal(validarVentana({ inicio: at('2026-12-24', '10:00'), ahora: AHORA }).code, 'FUERA_DE_HORIZONTE');
});

test('R06 intervalos pegados no se superponen; los que se pisan, sí', () => {
  const t = (h) => at('2026-11-25', h);
  assert.equal(seSuperponen(t('10:00'), t('11:00'), t('11:00'), t('12:00')), false);
  assert.equal(seSuperponen(t('10:00'), t('11:00'), t('10:30'), t('11:30')), true);
});

const precio = (fecha, frecuente = false, base = 12000) => calcularPrecio({ base, inicio: at(fecha, '11:00'), frecuente });

test('R12 un miércoles se cobra el precio de catálogo', () => {
  assert.equal(precio('2026-11-25').precio, 12000);
});
test('R13 los sábados hay 15% de recargo', () => {
  assert.equal(precio('2026-11-28').precio, 13800);
});
test('R14 los martes hay 10% de descuento', () => {
  assert.equal(precio('2026-11-24').precio, 10800);
});
test('R15 la clienta frecuente tiene 10% de descuento', () => {
  assert.equal(precio('2026-11-25', true).precio, 10800);
});
test('R16 los descuentos no se acumulan (martes + frecuente = un solo 10%)', () => {
  assert.equal(precio('2026-11-24', true).precio, 10800);
});
test('R16 el recargo va antes del descuento y se redondea al peso', () => {
  assert.equal(precio('2026-11-28', true).precio, 12420);
  assert.equal(precio('2026-11-28', true, 18000).precio, 18630);
});

test('R17 con 24 h exactas no hay cargo; con 23 h sí', () => {
  const ini = at('2026-11-25', '12:00');
  assert.equal(cancelacionSinCargo(ini, new Date(ini.getTime() - 24 * 3600000)), true);
  assert.equal(cancelacionSinCargo(ini, new Date(ini.getTime() - 23 * 3600000)), false);
});

test('R18 la cancelación tardía genera deuda del 50% y R20 la ausencia del 100%', () => {
  assert.equal(montoDeuda(12000, 'cancelacion_tardia'), 6000);
  assert.equal(montoDeuda(12000, 'ausencia'), 12000);
});
