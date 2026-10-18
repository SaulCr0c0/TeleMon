import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTiempoReal from './useTiempoReal';

vi.mock('../api/cliente', () => ({ MODO_DEMO: false }));

let sockets = [];

class SocketFalso {
  constructor(url) {
    this.url = url;
    sockets.push(this);
  }

  close() {
    this.onclose?.();
  }

  recibir(dato) {
    this.onmessage?.({ data: typeof dato === 'string' ? dato : JSON.stringify(dato) });
  }
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal('WebSocket', SocketFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useTiempoReal', () => {
  it('se conecta a /ws/lecturas', () => {
    renderHook(() => useTiempoReal(1, () => {}));
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe(`ws://${window.location.host}/ws/lecturas`);
  });

  it('solo entrega los mensajes válidos de su ubicación', () => {
    const alMensaje = vi.fn();
    renderHook(() => useTiempoReal('1', alMensaje));
    const lectura = { tipo: 'lectura', ubicacionId: 1, dispositivoId: 1, temperatura: 22.8 };
    act(() => {
      sockets[0].recibir({ tipo: 'lectura', ubicacionId: 2, dispositivoId: 5 });
      sockets[0].recibir('no es JSON');
      sockets[0].recibir([1, 2]);
      sockets[0].recibir({ ubicacionId: 1 });
      sockets[0].recibir(lectura);
    });
    expect(alMensaje).toHaveBeenCalledTimes(1);
    expect(alMensaje).toHaveBeenCalledWith(lectura);
  });

  it('indica la conexión y se reconecta cuando se cae el canal', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTiempoReal(1, () => {}));
    expect(result.current.conectado).toBe(false);

    act(() => sockets[0].onopen());
    expect(result.current.conectado).toBe(true);

    act(() => sockets[0].onclose());
    expect(result.current.conectado).toBe(false);

    act(() => vi.advanceTimersByTime(1000));
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe(sockets[0].url);
  });

  it('cierra el canal y no se reconecta al desmontar', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useTiempoReal(1, () => {}));
    unmount();
    act(() => vi.advanceTimersByTime(20000));
    expect(sockets).toHaveLength(1);
  });
});
