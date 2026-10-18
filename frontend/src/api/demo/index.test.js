import { describe, expect, it } from 'vitest';
import { resolverDemo } from './index';

describe('datos de ejemplo', () => {
  it('resuelve rutas con parámetros y query', async () => {
    const ultimas = await resolverDemo('GET', '/api/ubicaciones/1/ultimas');
    expect(ultimas.length).toBeGreaterThan(0);
    expect(ultimas[0]).toHaveProperty('dispositivoId');

    const resueltas = await resolverDemo('GET', '/api/ubicaciones/1/alertas?estado=cerradas');
    expect(resueltas.every((a) => a.cerradaEn)).toBe(true);
  });

  it('responde 401 con credenciales inválidas', async () => {
    await expect(
      resolverDemo('POST', '/api/login', { email: 'x@y.com', clave: 'mala' }),
    ).rejects.toMatchObject({
      estado: 401,
    });
  });

  it('avisa cuando una ruta no tiene datos de ejemplo', async () => {
    await expect(resolverDemo('GET', '/api/no-existe')).rejects.toMatchObject({ estado: 404 });
    expect(
      await resolverDemo('GET', '/api/no-existe', undefined, { silencioso: true }),
    ).toBeUndefined();
  });

  it('devuelve copias para que una pantalla no modifique los datos de otra', async () => {
    const a = await resolverDemo('GET', '/api/ubicaciones');
    a[0].nombre = 'cambiado';
    const b = await resolverDemo('GET', '/api/ubicaciones');
    expect(b[0].nombre).not.toBe('cambiado');
  });
});
