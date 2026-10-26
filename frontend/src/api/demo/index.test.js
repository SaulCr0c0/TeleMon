import { describe, expect, it } from 'vitest';
import { resolverDemo } from './index';

describe('datos de ejemplo', () => {
  it('genera series suaves con el identificador de la ruta recibido como texto', async () => {
    const { puntos } = await resolverDemo('GET', '/api/dispositivos/11/serie');
    expect(puntos).toHaveLength(60);
    const saltos = puntos.slice(1).map((punto, i) => Math.abs(punto.valor - puntos[i].valor));
    expect(Math.max(...saltos)).toBeLessThan(0.26);
  });

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

  it.each(['', '   ', null, 64])('rechaza crear una ubicación con nombre %j', async (nombre) => {
    const antes = await resolverDemo('GET', '/api/ubicaciones');
    await expect(
      resolverDemo('POST', '/api/ubicaciones', { localidad: 'Punata', nombre }),
    ).rejects.toMatchObject({ estado: 400 });
    expect(await resolverDemo('GET', '/api/ubicaciones')).toEqual(antes);
  });

  it('rechaza renombrar en blanco sin modificar otros campos de la ubicación', async () => {
    const antes = await resolverDemo('GET', '/api/ubicaciones/1');
    await expect(
      resolverDemo('PATCH', '/api/ubicaciones/1', {
        nombre: '   ',
        localidad: 'Otra localidad',
        archivada: true,
      }),
    ).rejects.toMatchObject({ estado: 400 });
    expect(await resolverDemo('GET', '/api/ubicaciones/1')).toEqual(antes);
  });
});
