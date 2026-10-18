import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Panel from './Panel';

const tiempoReal = vi.hoisted(() => ({ manejador: null, conectado: true }));

vi.mock('../../hooks/useTiempoReal', () => ({
  default: (_ubicacionId, manejador) => {
    tiempoReal.manejador = manejador;
    return { conectado: tiempoReal.conectado };
  },
}));

const opciones = (ubicacionId = 1) => ({
  ruta: `/ubicaciones/${ubicacionId}/panel`,
  patron: '/ubicaciones/:ubicacionId/panel',
  usuario: { nombre: 'Ana Rojas', rol: 'cliente', monitores: 7 },
});

async function cargar(ubicacionId) {
  dibujar(<Panel />, opciones(ubicacionId));
  await screen.findByRole('button', { name: 'Patio' });
}

const fila = (nombre) => screen.getByRole('button', { name: nombre }).closest('tr');

function enviar(mensaje) {
  act(() => tiempoReal.manejador(mensaje));
}

function respuestasFalsas(rutas) {
  const original = api.get;
  vi.spyOn(api, 'get').mockImplementation((ruta) => {
    const clave = Object.keys(rutas).find((fin) => ruta.endsWith(fin));
    return clave ? rutas[clave]() : original(ruta);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  tiempoReal.conectado = true;
});

describe('Panel', () => {
  it('muestra una fila por nodo con sus valores, el canal en vivo y las alertas activas', async () => {
    await cargar();
    const nodos = within(screen.getByRole('table', { name: 'Última lectura de cada nodo' }));
    expect(nodos.getAllByRole('row')).toHaveLength(6);
    const nodo01 = within(fila('Nodo 01'));
    expect(nodo01.getByText('22.8 °C')).toBeInTheDocument();
    expect(nodo01.getByText('46 %')).toBeInTheDocument();
    expect(nodo01.getByText('748.4 hPa')).toBeInTheDocument();
    expect(nodo01.getByText('Bueno · 0.95')).toBeInTheDocument();
    expect(nodo01.getByText('En línea')).toBeInTheDocument();
    expect(screen.getByText(/^En vivo · hace \d+ s$/)).toBeInTheDocument();
    expect(await screen.findByText('3 alertas activas.')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Humedad baja en Patio · Presión sin respuesta en Patio · Salón de maestros sin conexión\./,
      ),
    ).toBeInTheDocument();
  });

  it('resalta lo fuera de rango y distingue sensor sin respuesta, sin calibrar y sin conexión', async () => {
    await cargar();
    await within(fila('Patio')).findByText('28 % · bajo');
    expect(within(fila('Patio')).getByText('sin respuesta')).toBeInTheDocument();
    expect(within(fila('Patio')).getByText('Moderado · 0.66')).toBeInTheDocument();
    expect(within(fila('Biblioteca')).getByText('sin calibrar')).toBeInTheDocument();
    const salon = within(fila('Salón de maestros'));
    expect(salon.getByText('Sin conexión · hace 6 min')).toBeInTheDocument();
    expect(salon.getAllByText('—')).toHaveLength(4);
    expect(salon.queryByText('sin respuesta')).not.toBeInTheDocument();
  });

  it('muestra los cuatro indicadores del nodo elegido', async () => {
    await cargar();
    expect(screen.getByRole('heading', { name: 'Nodo 01' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Patio' }));
    expect(screen.getByRole('button', { name: 'Patio' })).toHaveAttribute('aria-pressed', 'true');
    const detalle = within(screen.getByRole('region', { name: 'Patio' }));
    expect(detalle.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Temperatura',
      'Humedad',
      'Presión',
      'Calidad del aire',
    ]);
    expect(await detalle.findByText('Bajo el mínimo (30 %)')).toBeInTheDocument();
    expect(detalle.getByText('Normal')).toBeInTheDocument();
    expect(detalle.getByText('Sensor sin respuesta')).toBeInTheDocument();
    expect(detalle.getByText('Nivel moderado')).toBeInTheDocument();
    expect(detalle.getByText('Rs/R0')).toBeInTheDocument();
    expect(detalle.getByText('0.66')).toBeInTheDocument();
  });

  it('actualiza solo la fila del nodo que envió la lectura', async () => {
    await cargar();
    const lectura = {
      tipo: 'lectura',
      ubicacionId: 1,
      dispositivoId: 12,
      fecha: new Date().toISOString(),
      temperatura: 25.1,
      humedad: 44,
      presion: 748.6,
      rsR0: 0.93,
      nivelAire: 'bueno',
    };
    enviar(lectura);
    expect(within(fila('Aula 3')).getByText('25.1 °C')).toBeInTheDocument();
    expect(within(fila('Nodo 01')).getByText('22.8 °C')).toBeInTheDocument();

    enviar({ ...lectura, fecha: new Date(Date.now() - 60000).toISOString(), temperatura: 19 });
    expect(within(fila('Aula 3')).getByText('25.1 °C')).toBeInTheDocument();

    enviar({ ...lectura, ubicacionId: 2, dispositivoId: 11, temperatura: 30 });
    expect(within(fila('Nodo 01')).getByText('22.8 °C')).toBeInTheDocument();
  });

  it('pasa de esperar la primera lectura a en línea cuando llega', async () => {
    respuestasFalsas({
      '/ultimas': async () => [
        {
          dispositivoId: 7,
          nombre: 'Laboratorio',
          conectado: false,
          fecha: null,
          temperatura: null,
          humedad: null,
          presion: null,
          rsR0: null,
          nivelAire: null,
        },
      ],
    });
    dibujar(<Panel />, opciones());
    const laboratorio = await screen.findByRole('button', { name: 'Laboratorio' });
    expect(
      within(laboratorio.closest('tr')).getByText('Esperando la primera lectura'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin lecturas todavía')).toBeInTheDocument();
    expect(screen.getAllByText('Sin datos todavía')).toHaveLength(4);

    enviar({
      tipo: 'lectura',
      ubicacionId: 1,
      dispositivoId: 7,
      fecha: new Date().toISOString(),
      temperatura: 22.81,
      humedad: 46,
      presion: 748.4,
      rsR0: null,
      nivelAire: 'sin_calibrar',
    });
    const actualizada = within(laboratorio.closest('tr'));
    expect(actualizada.getByText('En línea')).toBeInTheDocument();
    expect(actualizada.getByText('sin calibrar')).toBeInTheDocument();
    expect(screen.getByText('Sin calibrar')).toBeInTheDocument();
  });

  it('avisa si la ubicación no tiene nodos', async () => {
    dibujar(<Panel />, opciones(99));
    expect(await screen.findByText('Esta ubicación todavía no tiene nodos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Añadir un nodo' })).toHaveAttribute(
      'href',
      '/ubicaciones/99/nodos',
    );
  });

  it('muestra el error sin inventar filas si falla la consulta', async () => {
    respuestasFalsas({
      '/ultimas': async () => {
        throw new ErrorApi(500, 'No se pudieron consultar los datos.');
      },
    });
    dibujar(<Panel />, opciones());
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los nodos.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('indica cuando el canal en vivo está caído', async () => {
    tiempoReal.conectado = false;
    await cargar();
    expect(screen.getByText('Sin conexión en vivo')).toBeInTheDocument();
  });
});
