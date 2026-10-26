import { describe, expect, it } from 'vitest';
import { resolverDemo } from './index';

const ruta = '/api/ubicaciones/1/dispositivos';

describe('activación en modo demo', () => {
  it.each(['', '   ', null, 42])('rechaza el nombre %j sin consumir la reserva', async (nombre) => {
    const antes = await resolverDemo('GET', ruta);
    await expect(resolverDemo('POST', ruta, { codigo: 'W3FJ-7KTA', nombre })).rejects.toMatchObject(
      { estado: 400 },
    );
    expect(await resolverDemo('GET', ruta)).toEqual(antes);
  });

  it('rechaza caracteres inválidos en lugar de quitarlos del código', async () => {
    await expect(
      resolverDemo('POST', ruta, { codigo: 'W3FJ$7KTA', nombre: 'Laboratorio' }),
    ).rejects.toMatchObject({ estado: 400 });
  });
});
