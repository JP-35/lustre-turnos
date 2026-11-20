// R04: reglas en hora de Argentina (UTC-3, sin horario de verano); la base guarda UTC.
export const OFFSET_MIN = -180;
const MIN = 60000;

/** Reloj inyectable: real por defecto, o fijo y manejable "a control remoto" para tests. */
export function createClock(initial = null) {
  let fixed = initial ? new Date(initial) : null;
  return {
    now: () => (fixed ? new Date(fixed.getTime()) : new Date()),
    set(d) { fixed = new Date(d); },
    advance(ms) { fixed = new Date(this.now().getTime() + ms); },
  };
}

/** Descompone un instante UTC en fecha/día/minutos del club. dow: 0=domingo … 6=sábado. */
export function localParts(date) {
  const l = new Date(date.getTime() + OFFSET_MIN * MIN);
  return {
    fecha: l.toISOString().slice(0, 10),
    dow: l.getUTCDay(),
    minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
    resto: l.getUTCSeconds() * 1000 + l.getUTCMilliseconds(),
  };
}

/** Instante UTC que corresponde a una fecha local 'YYYY-MM-DD' y minutos desde medianoche. */
export function fromLocal(fecha, minutos) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutos) - OFFSET_MIN * MIN);
}

export function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
