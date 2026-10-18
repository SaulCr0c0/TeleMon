import { describe, expect, it } from 'vitest';
import {
  claveValida,
  esCorreo,
  normalizarCodigo,
  normalizarMac,
  r0Valido,
  rangoValido,
  reglasClave,
} from './validacion';

describe('correo', () => {
  it('acepta correos válidos y rechaza los incompletos', () => {
    expect(esCorreo('direccion@redvallealto.edu.bo')).toBe(true);
    expect(esCorreo('sin-arroba.com')).toBe(false);
    expect(esCorreo('a@b')).toBe(false);
  });
});

describe('contraseña', () => {
  it('exige 8 caracteres, letras, números y que coincidan', () => {
    expect(claveValida('abc12345', 'abc12345')).toBe(true);
    expect(claveValida('abcdefgh', 'abcdefgh')).toBe(false);
    expect(claveValida('abc123', 'abc123')).toBe(false);
    expect(claveValida('abc12345', 'abc12346')).toBe(false);
  });

  it('informa cada regla por separado', () => {
    expect(reglasClave('abc12345', '').map((r) => r.cumple)).toEqual([true, true, false]);
  });
});

describe('MAC y código', () => {
  it('normaliza la MAC con o sin separadores', () => {
    expect(normalizarMac('f8b3b72bfc24')).toBe('F8:B3:B7:2B:FC:24');
    expect(normalizarMac('F8-B3-B7-2B-FC-24')).toBe('F8:B3:B7:2B:FC:24');
    expect(normalizarMac('F8:B3:B7')).toBeNull();
  });

  it('normaliza el código de activación', () => {
    expect(normalizarCodigo('w3fj7kta')).toBe('W3FJ-7KTA');
    expect(normalizarCodigo('W3FJ-7KTA')).toBe('W3FJ-7KTA');
    expect(normalizarCodigo('W3FJ')).toBeNull();
  });
});

describe('umbrales y R0', () => {
  it('el mínimo debe ser menor que el máximo', () => {
    expect(rangoValido('18', '28')).toBe(true);
    expect(rangoValido('28', '18')).toBe(false);
    expect(rangoValido('', '18')).toBe(false);
  });

  it('R0 debe ser un número mayor que 0', () => {
    expect(r0Valido('41.2')).toBe(true);
    expect(r0Valido('41,2')).toBe(true);
    expect(r0Valido('0')).toBe(false);
    expect(r0Valido('abc')).toBe(false);
  });
});
