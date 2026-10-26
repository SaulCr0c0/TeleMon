import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_MODO_DEMO', 'false');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('API real de activación', () => {
  it.each(['get', 'post'])(
    'conserva el 404 de %s sin sustituirlo por datos demo',
    async (metodo) => {
      fetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
        text: async () => JSON.stringify({ mensaje: 'Código no encontrado.' }),
      });
      const { api } = await import('./cliente');
      await expect(
        api[metodo]('/api/ubicaciones/1/dispositivos', {
          codigo: 'W3FJ-7KTA',
          nombre: 'Laboratorio',
        }),
      ).rejects.toMatchObject({ estado: 404, message: 'Código no encontrado.' });
    },
  );

  it('devuelve el nodo confirmado por el servidor y envía la sesión', async () => {
    const nodo = {
      id: 42,
      ubicacionId: 1,
      nombre: 'Laboratorio',
      estado: 'en_uso',
      conectado: false,
      esperando: true,
    };
    fetch.mockResolvedValueOnce({ status: 201, ok: true, text: async () => JSON.stringify(nodo) });
    localStorage.setItem('telemon.token', 'sesion-de-prueba');
    const { api } = await import('./cliente');
    const cuerpo = { codigo: 'W3FJ-7KTA', nombre: 'Laboratorio' };
    await expect(api.post('/api/ubicaciones/1/dispositivos', cuerpo)).resolves.toEqual(nodo);
    expect(fetch).toHaveBeenCalledWith('/api/ubicaciones/1/dispositivos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sesion-de-prueba',
      },
      body: JSON.stringify(cuerpo),
    });
  });
});
