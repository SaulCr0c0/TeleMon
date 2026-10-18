import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Umbrales from './Umbrales';

const iniciales = {
  temperatura: { min: 18, max: 28 },
  humedad: { min: 30, max: 60 },
  presion: { min: 740, max: 760 },
  calidadAire: 'malo',
  esperaSinConexionS: 120,
  actualizadoPor: 'Ana Rojas',
  actualizadoEn: '2026-10-16T22:40:00Z',
};
const opciones = { ruta: '/ubicaciones/1/umbrales', patron: '/ubicaciones/:ubicacionId/umbrales' };
const minimo = () => screen.getByRole('spinbutton', { name: 'Temperatura: mínimo (°C)' });
const guardar = () => screen.getByRole('button', { name: 'Guardar umbrales' });

async function abrir(elemento = <Umbrales />) {
  dibujar(elemento, opciones);
  await screen.findByRole('form');
}

describe('Umbrales', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue(structuredClone(iniciales));
    vi.spyOn(api, 'put').mockImplementation(async (_ruta, valores) => ({
      ...valores,
      actualizadoPor: 'Ana Rojas',
      actualizadoEn: '2026-10-18T20:00:00Z',
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('carga los rangos y las opciones de la ubicación', async () => {
    await abrir();
    expect(api.get).toHaveBeenCalledWith('/api/ubicaciones/1/umbrales');
    expect(screen.getAllByRole('spinbutton').map((campo) => campo.value)).toEqual([
      '18',
      '28',
      '30',
      '60',
      '740',
      '760',
    ]);
    expect(screen.getByLabelText('Alertar cuando el nivel sea')).toHaveValue('malo');
    expect(screen.getByLabelText('Esperar')).toHaveValue('120');
    expect(screen.getByText(/Última modificación: Ana Rojas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al Panel/ })).toHaveAttribute(
      'href',
      '/ubicaciones/1/panel',
    );
  });

  it.each(['28', '29', ''])('bloquea guardar si el mínimo es inválido: %s', async (valor) => {
    await abrir();
    fireEvent.change(minimo(), { target: { value: valor } });
    expect(minimo()).toHaveAttribute('aria-invalid', 'true');
    expect(guardar()).toBeDisabled();
    expect(minimo()).toHaveAccessibleDescription(
      valor
        ? 'El mínimo debe ser menor que el máximo.'
        : 'Completa el mínimo y el máximo con números válidos.',
    );
    fireEvent.submit(screen.getByRole('form'));
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.change(minimo(), { target: { value: '19' } });
    expect(guardar()).toBeEnabled();
  });

  it('guarda valores numéricos y descarta hasta el último guardado', async () => {
    const usuario = userEvent.setup();
    await abrir();
    fireEvent.change(minimo(), { target: { value: '19.5' } });
    await usuario.selectOptions(screen.getByLabelText('Alertar cuando el nivel sea'), 'moderado');
    await usuario.selectOptions(screen.getByLabelText('Esperar'), '300');
    await usuario.click(guardar());
    expect(await screen.findByText('Umbrales guardados')).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith('/api/ubicaciones/1/umbrales', {
      temperatura: { min: 19.5, max: 28 },
      humedad: { min: 30, max: 60 },
      presion: { min: 740, max: 760 },
      calidadAire: 'moderado',
      esperaSinConexionS: 300,
    });
    expect(screen.getByText(/Última modificación/)).toHaveTextContent('18/10/2026');
    fireEvent.change(minimo(), { target: { value: '22' } });
    await usuario.selectOptions(screen.getByLabelText('Alertar cuando el nivel sea'), 'nunca');
    await usuario.selectOptions(screen.getByLabelText('Esperar'), '60');
    await usuario.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(minimo()).toHaveValue(19.5);
    expect(screen.getByLabelText('Alertar cuando el nivel sea')).toHaveValue('moderado');
    expect(screen.getByLabelText('Esperar')).toHaveValue('300');
    expect(screen.queryByText('Umbrales guardados')).not.toBeInTheDocument();
  });

  it('descarta un rango inválido sin enviar una petición', async () => {
    await abrir();
    fireEvent.change(minimo(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(minimo()).toHaveValue(18);
    expect(guardar()).toBeEnabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('conserva las ediciones tras un error y permite reintentar', async () => {
    api.put.mockRejectedValueOnce(new Error('Sin conexión'));
    await abrir();
    fireEvent.change(minimo(), { target: { value: '20' } });
    fireEvent.click(guardar());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron guardar los umbrales. Sin conexión',
    );
    expect(minimo()).toHaveValue(20);
    fireEvent.click(guardar());
    expect(await screen.findByText('Umbrales guardados')).toBeInTheDocument();
  });

  it('deshabilita los controles mientras guarda y evita envíos repetidos', async () => {
    let resolver;
    api.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    await abrir();
    fireEvent.click(guardar());
    expect(minimo()).toBeDisabled();
    expect(screen.getByLabelText('Esperar')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(api.put).toHaveBeenCalledTimes(1);
    await act(async () => resolver(iniciales));
    expect(guardar()).toBeEnabled();
  });

  it('permite reintentar una carga fallida', async () => {
    api.get.mockRejectedValueOnce(new Error('Sin conexión'));
    dibujar(<Umbrales />, opciones);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los umbrales.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('form');
    expect(minimo()).toHaveValue(18);
  });

  it('descarta el borrador de otra ubicación y guarda en la nueva ruta', async () => {
    let resolver;
    await abrir(
      <>
        <Link to="/ubicaciones/3/umbrales">Otra ubicación</Link>
        <Umbrales />
      </>,
    );
    fireEvent.change(minimo(), { target: { value: '21' } });
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Otra ubicación' }));
    expect(screen.getByText('Cargando umbrales…')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    await act(async () => resolver({ ...iniciales, temperatura: { min: 15, max: 32 } }));
    expect(minimo()).toHaveValue(15);
    fireEvent.click(guardar());
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/ubicaciones/3/umbrales',
        expect.objectContaining({ temperatura: { min: 15, max: 32 } }),
      ),
    );
    await screen.findByText('Umbrales guardados');
  });
});
