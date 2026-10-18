import { act, fireEvent, screen, within } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Graficas from './Graficas';

vi.mock('../../componentes/graficas/GraficaSerie', () => ({
  default: ({ descripcion, rango, puntos }) => (
    <div
      role="img"
      aria-label={descripcion}
      data-rango={JSON.stringify(rango)}
      data-puntos={puntos.length}
    />
  ),
}));

const nodos = [
  {
    dispositivoId: 11,
    nombre: 'Nodo 01',
    conectado: true,
    temperatura: 22.8,
    humedad: 46,
    presion: 748,
    rsR0: 0.95,
  },
  {
    dispositivoId: 13,
    nombre: 'Patio',
    conectado: true,
    temperatura: 21.9,
    humedad: 28,
    presion: null,
    rsR0: 0.66,
  },
  { dispositivoId: 14, nombre: 'Biblioteca', conectado: true, temperatura: 24, rsR0: null },
  { dispositivoId: 15, nombre: 'Salón', conectado: false },
];
const serie = {
  puntos: [20, 22, 24, null].map((valor) => ({ fecha: '2026-10-18T12:00:00Z', valor })),
  rango: { min: 18, max: 28 },
};
const opciones = { ruta: '/ubicaciones/1/graficas', patron: '/ubicaciones/:ubicacionId/graficas' };

describe('Gráficas', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockImplementation(async (ruta) =>
      ruta.endsWith('/ultimas') ? nodos : serie,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('muestra valor, rango y estadísticas de los puntos válidos', async () => {
    dibujar(<Graficas />, opciones);
    const grafica = await screen.findByRole('img');
    expect(grafica).toHaveAccessibleName('Gráfica de Temperatura de Nodo 01');
    expect(grafica).toHaveAttribute('data-puntos', '3');
    expect(screen.getByText('Rango permitido 18.0 – 28.0 °C')).toBeInTheDocument();
    for (const [titulo, valor] of [
      ['Mínimo', '20.0'],
      ['Máximo', '24.0'],
      ['Promedio', '22.0'],
    ]) {
      expect(
        within(screen.getByRole('heading', { name: titulo }).parentElement).getByText(valor),
      ).toBeInTheDocument();
    }
  });

  it('cambia variable y periodo sin mostrar datos de la selección anterior', async () => {
    dibujar(<Graficas />, opciones);
    await screen.findByRole('img');
    let resolver;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Humedad' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await act(async () => resolver({ ...serie, rango: { min: 30, max: 60 } }));
    expect(screen.getByText('Rango permitido 30.0 – 60.0 %')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '24 horas' }));
    await screen.findByRole('img');
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/dispositivos/11/serie?periodo=24h&variable=humedad',
    );
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await screen.findByRole('img');
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/dispositivos/11/serie?periodo=7d&variable=humedad',
    );
  });

  it('representa el nivel bueno del aire con el mismo rango de la leyenda', async () => {
    dibujar(<Graficas />, opciones);
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Calidad del aire' }));
    expect(await screen.findByRole('img')).toHaveAttribute(
      'data-rango',
      JSON.stringify({ min: 0.8, max: null }),
    );
    expect(screen.getByText('Nivel bueno: 0.80 o más')).toBeInTheDocument();
  });

  it('bloquea nodos desconectados, presión sin respuesta y aire sin calibrar', async () => {
    dibujar(<Graficas />, opciones);
    await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '15' } });
    expect(screen.getByRole('heading', { name: 'Sin conexión' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Presión' }));
    expect(screen.getByRole('heading', { name: 'Sensor sin respuesta' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calidad del aire' }));
    expect(screen.getByRole('heading', { name: 'Sin calibrar' })).toBeInTheDocument();
    expect(
      api.get.mock.calls.some(
        ([ruta]) =>
          ruta.includes('/15/serie') || ruta.includes('/13/serie?periodo=1h&variable=presion'),
      ),
    ).toBe(false);
  });

  it('permite reintentar la serie y muestra periodos vacíos', async () => {
    api.get.mockResolvedValueOnce(nodos).mockRejectedValueOnce(new Error('Red'));
    dibujar(<Graficas />, opciones);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la gráfica.');
    api.get.mockResolvedValueOnce({ puntos: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar gráfica' }));
    expect(await screen.findByText('No hay lecturas para este periodo.')).toBeInTheDocument();
  });

  it('permite reintentar nodos y muestra una ubicación vacía', async () => {
    api.get.mockRejectedValueOnce(new Error('Red'));
    dibujar(<Graficas />, opciones);
    await screen.findByRole('alert');
    api.get.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay nodos en esta ubicación.')).toBeInTheDocument();
  });

  it('reinicia los selectores al cambiar de ubicación', async () => {
    dibujar(
      <>
        <Link to="/ubicaciones/3/graficas">Otra ubicación</Link>
        <Graficas />
      </>,
      opciones,
    );
    await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '15' } });
    api.get.mockResolvedValueOnce([{ ...nodos[0], dispositivoId: 31, nombre: 'Invernadero' }]);
    fireEvent.click(screen.getByRole('link', { name: 'Otra ubicación' }));
    expect(await screen.findByRole('img')).toHaveAccessibleName(
      'Gráfica de Temperatura de Invernadero',
    );
    expect(api.get).toHaveBeenCalledWith('/api/ubicaciones/3/ultimas');
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/dispositivos/31/serie?periodo=1h&variable=temperatura',
    );
  });
});
