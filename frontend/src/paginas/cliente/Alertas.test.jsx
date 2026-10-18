import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Alertas from './Alertas';

const ahora = new Date(2026, 9, 18, 15, 40);
const haceMinutos = (minutos) => new Date(ahora.getTime() - minutos * 60000).toISOString();
const opciones = {
  ruta: '/ubicaciones/1/alertas',
  patron: '/ubicaciones/:ubicacionId/alertas',
  usuario: { nombre: 'Ana Rojas', rol: 'cliente', monitores: 7 },
};
const activas = [
  {
    id: 101,
    nodo: 'Patio',
    tipo: 'UMBRAL',
    mensaje: 'Humedad bajo el mínimo (30 %)',
    abiertaEn: haceMinutos(68),
    cerradaEn: null,
    peorValor: '28 %',
  },
  {
    id: 102,
    nodo: 'Patio',
    tipo: 'SENSOR',
    mensaje: 'Presión sin respuesta',
    abiertaEn: haceMinutos(275),
    cerradaEn: null,
    peorValor: null,
  },
  {
    id: 103,
    nodo: 'Salón de maestros',
    tipo: 'SIN_CONEXION',
    mensaje: 'No envía datos',
    abiertaEn: haceMinutos(6),
    cerradaEn: null,
    peorValor: null,
  },
];
const resueltas = [
  {
    id: 98,
    nodo: 'Aula 3',
    tipo: 'UMBRAL',
    mensaje: 'Calidad del aire en nivel malo',
    abiertaEn: haceMinutos(380),
    cerradaEn: haceMinutos(355),
    peorValor: '0.46 Rs/R0',
  },
  {
    id: 99,
    nodo: 'Biblioteca',
    tipo: 'UMBRAL',
    mensaje: 'Temperatura sobre el máximo (28 °C)',
    abiertaEn: haceMinutos(230),
    cerradaEn: haceMinutos(192),
    peorValor: '29.4 °C',
  },
  {
    id: 97,
    nodo: 'Nodo de ayer',
    tipo: 'SENSOR',
    mensaje: 'Sensor recuperado ayer',
    abiertaEn: new Date(2026, 9, 17, 23, 30).toISOString(),
    cerradaEn: new Date(2026, 9, 17, 23, 59).toISOString(),
    peorValor: null,
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(ahora);
  vi.spyOn(api, 'get').mockImplementation(async (ruta) => {
    if (!ruta.startsWith('/api/ubicaciones/1/')) return [];
    return ruta.endsWith('estado=abiertas') ? activas : resueltas;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Alertas', () => {
  it('muestra las tres activas con los tipos, duración, unidades y navegación del diseño', async () => {
    dibujar(<Alertas />, opciones);
    const tabla = await screen.findByRole('table', { name: 'Alertas activas' });
    expect(within(tabla).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Activas 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Resueltas hoy 2' })).toBeInTheDocument();
    for (const texto of [
      'Umbral',
      'Sensor',
      'Sin conexión',
      '1 h 08 min',
      '4 h 35 min',
      '6 min',
      '28 %',
    ]) {
      expect(within(tabla).getByText(texto)).toBeInTheDocument();
    }
    expect(within(tabla).getAllByText('—')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Volver al Panel' })).toHaveAttribute(
      'href',
      '/ubicaciones/1/panel',
    );
    expect(screen.getByText('Datos de ejemplo.')).toBeInTheDocument();
  });

  it('cambia a resueltas y excluye los cierres de ayer usando la fecha local', async () => {
    dibujar(<Alertas />, opciones);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Resueltas hoy 2' }));
    const tabla = screen.getByRole('table', { name: 'Alertas resueltas hoy' });
    expect(within(tabla).getAllByRole('row')).toHaveLength(3);
    for (const texto of ['Aula 3', 'Biblioteca', '25 min', '38 min', '0.46 Rs/R0', '29.4 °C']) {
      expect(within(tabla).getByText(texto)).toBeInTheDocument();
    }
    expect(screen.queryByText('Nodo de ayer')).not.toBeInTheDocument();
    expect(screen.queryByText('No envía datos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activas 3' }));
    expect(screen.getByText('No envía datos')).toBeInTheDocument();
  });

  it('muestra los estados vacíos de otra ubicación y consulta su identificador', async () => {
    dibujar(<Alertas />, { ...opciones, ruta: '/ubicaciones/2/alertas' });
    expect(await screen.findByText('No hay alertas activas.')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/ubicaciones/2/alertas?estado=abiertas');
    expect(api.get).toHaveBeenCalledWith('/api/ubicaciones/2/alertas?estado=cerradas');
    await userEvent.click(screen.getByRole('button', { name: 'Resueltas hoy 0' }));
    expect(screen.getByText('Nada resuelto hoy.')).toBeInTheDocument();
  });

  it('indica la carga sin presentar una lista vacía como resultado', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    dibujar(<Alertas />, opciones);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando alertas');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No hay alertas activas.')).not.toBeInTheDocument();
  });

  it('permite reintentar una consulta fallida', async () => {
    api.get.mockRejectedValueOnce(new Error('Servicio no disponible'));
    dibujar(<Alertas />, opciones);
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Alertas activas' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('conserva cero como peor valor válido', async () => {
    api.get.mockResolvedValueOnce([{ ...activas[0], peorValor: 0 }]);
    dibujar(<Alertas />, opciones);
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByRole('cell', { name: '0' })).toBeInTheDocument();
  });

  it('actualiza la duración de las activas y mantiene fija la de las cerradas', async () => {
    const vista = dibujar(<Alertas />, opciones);
    await screen.findByRole('table');
    await act(async () => vi.advanceTimersByTime(60000));
    expect(screen.getByText('1 h 09 min')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resueltas hoy 2' }));
    expect(screen.getByText('25 min')).toBeInTheDocument();
    vista.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('actualiza resueltas hoy al pasar la medianoche', async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 30));
    dibujar(<Alertas />, opciones);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Resueltas hoy 2' }));
    await act(async () => vi.advanceTimersByTime(60000));
    expect(screen.getByRole('button', { name: 'Resueltas hoy 0' })).toBeInTheDocument();
    expect(screen.getByText('Nada resuelto hoy.')).toBeInTheDocument();
  });

  it('limpia los datos de la ubicación anterior durante la navegación', async () => {
    dibujar(
      <>
        <Link to="/ubicaciones/2/alertas">Otra ubicación</Link>
        <Alertas />
      </>,
      opciones,
    );
    await screen.findByRole('table');
    api.get.mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole('link', { name: 'Otra ubicación' }));
    expect(screen.queryByText('No envía datos')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando alertas');
  });
});
