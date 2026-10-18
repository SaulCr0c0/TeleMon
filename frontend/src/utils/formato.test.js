import { describe, expect, it } from 'vitest';
import { conUnidad, duracion, haceCuanto, iniciales, nivelAire, numero } from './formato';

describe('nivelAire', () => {
  it('usa los cortes 0,80 y 0,50', () => {
    expect(nivelAire(0.95)).toBe('bueno');
    expect(nivelAire(0.8)).toBe('bueno');
    expect(nivelAire(0.79)).toBe('moderado');
    expect(nivelAire(0.5)).toBe('moderado');
    expect(nivelAire(0.49)).toBe('malo');
  });

  it('sin valor queda sin calibrar', () => {
    expect(nivelAire(null)).toBe('sin_calibrar');
    expect(nivelAire(undefined)).toBe('sin_calibrar');
  });
});

describe('números', () => {
  it('formatea con decimales y unidad', () => {
    expect(numero(22.84)).toBe('22.8');
    expect(conUnidad(748.42, 'hPa')).toBe('748.4 hPa');
    expect(conUnidad(46, '%', 0)).toBe('46 %');
  });

  it('muestra una raya cuando no hay dato', () => {
    expect(numero(null)).toBe('—');
    expect(conUnidad(undefined, '°C')).toBe('—');
  });
});

describe('tiempos', () => {
  it('describe la duración', () => {
    const desde = '2026-10-18T10:00:00Z';
    expect(duracion(desde, '2026-10-18T10:06:00Z')).toBe('6 min');
    expect(duracion(desde, '2026-10-18T11:08:00Z')).toBe('1 h 08 min');
    expect(duracion(desde, '2026-10-21T10:00:00Z')).toBe('3 días');
  });

  it('describe hace cuánto', () => {
    const ahora = Date.parse('2026-10-18T10:00:00Z');
    expect(haceCuanto('2026-10-18T09:59:58Z', ahora)).toBe('hace 2 s');
    expect(haceCuanto('2026-10-18T09:54:00Z', ahora)).toBe('hace 6 min');
    expect(haceCuanto(null, ahora)).toBe('nunca');
  });
});

describe('iniciales', () => {
  it('toma las dos primeras palabras', () => {
    expect(iniciales('Ana Rojas')).toBe('AR');
    expect(iniciales('equipo')).toBe('E');
    expect(iniciales('')).toBe('?');
  });
});
