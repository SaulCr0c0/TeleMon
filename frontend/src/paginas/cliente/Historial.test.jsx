import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import rutasHistorial from '../../api/demo/historial';
import { NODOS } from '../../api/demo/datos';
import { dibujar } from '../../test/dibujar';
import Historial from './Historial';

const lecturasDemo = rutasHistorial[0][2];
const opciones = {
  ruta: '/ubicaciones/1/historial',
  patron: '/ubicaciones/:ubicacionId/historial',
};
const alertas = [
  {
    id: 1,
    dispositivoId: 13,
    nodo: 'Patio',
    tipo: 'UMBRAL',
    mensaje: 'Humedad baja',
    abiertaEn: new Date(Date.now() - 60000).toISOString(),
    cerradaEn: null,
  },
  {
    id: 2,
    dispositivoId: 11,
    nodo: 'Nodo 01',
    tipo: 'SENSOR',
    mensaje: 'Presión recuperada',
    abiertaEn: new Date(Date.now() - 120000).toISOString(),
    cerradaEn: new Date().toISOString(),
  },
];

async function responder(ruta) {
  const url = new URL(ruta, 'http://localhost');
  const id = url.pathname.split('/')[3];
  if (url.pathname.endsWith('/ultimas'))
    return NODOS.filter((nodo) => nodo.ubicacionId === Number(id)).map((nodo) => ({
      ...nodo,
      dispositivoId: nodo.id,
    }));
  if (url.pathname.endsWith('/lecturas'))
    return lecturasDemo({ id }, null, Object.fromEntries(url.searchParams));
  return alertas.filter((alerta) =>
    url.searchParams.get('estado') === 'abiertas' ? !alerta.cerradaEn : alerta.cerradaEn,
  );
}

async function abrir(elemento = <Historial />) {
  dibujar(elemento, opciones);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: '7 días' }));
  await screen.findByRole('table');
}

function filas() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('Historial', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockImplementation(responder);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('muestra 20 lecturas, valores ausentes y paginación', async () => {
    await abrir();
    expect(filas()).toHaveLength(20);
    expect(screen.getByText(/Página 1 de 12/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(within(filas()[2]).getByText('—')).toBeInTheDocument();
    expect(within(filas()[3]).getByText('sin calibrar')).toBeInTheDocument();
    const primeraFecha = filas()[0].textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText(/Página 2 de 12/);
    expect(filas()[0].textContent).not.toBe(primeraFecha);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('aplica el filtro de nodo antes de paginar y permite limpiarlo', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText(/Página 2/);
    fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }));
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/Página 1 de 3/);
    expect(filas().every((fila) => within(fila).getByText('Patio'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await screen.findByRole('table');
    expect(screen.getByLabelText('Nodo')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('valida fechas y muestra el estado vacío sin habilitar CSV', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2099-10-18T10:00' } });
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Desde debe ser anterior');
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2099-10-19T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('No hay lecturas para estos filtros.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('cambia el periodo y aplica agrupación por nodo', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Última hora' }));
    await screen.findByRole('table');
    expect(filas().length).toBeLessThanOrEqual(13);
    fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }));
    fireEvent.change(screen.getByLabelText('Agrupar'), { target: { value: 'hora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await screen.findByRole('table');
    expect(filas().length).toBeLessThanOrEqual(8);
    expect(api.get.mock.calls.at(-1)[0]).toContain('agrupar=hora');
  });

  it('muestra alertas activas y resueltas y respeta el filtro de nodo', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Alertas', exact: true }));
    await screen.findByRole('table', { name: 'Historial de alertas' });
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Resuelta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }));
    expect(screen.queryByLabelText('Agrupar')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nodo'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await screen.findByRole('table');
    expect(filas()).toHaveLength(1);
    expect(screen.getByText('Humedad baja')).toBeInTheDocument();
    expect(screen.queryByText('Presión recuperada')).not.toBeInTheDocument();
  });

  it('reintenta una carga fallida', async () => {
    api.get.mockImplementation(async (ruta) => {
      if (ruta.includes('/lecturas')) throw new Error('Red');
      return responder(ruta);
    });
    dibujar(<Historial />, opciones);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el historial');
    api.get.mockImplementation(responder);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('ignora la respuesta pendiente de una ubicación anterior', async () => {
    let resolver;
    api.get.mockImplementation((ruta) =>
      ruta.includes('/1/lecturas')
        ? new Promise((resolve) => {
            resolver = resolve;
          })
        : responder(ruta),
    );
    dibujar(
      <>
        <Link to="/ubicaciones/3/historial">Otra ubicación</Link>
        <Historial />
      </>,
      opciones,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Otra ubicación' }));
    await screen.findByRole('table');
    await act(async () => resolver({ total: 0, filas: [] }));
    expect(filas().every((fila) => within(fila).getByText('Invernadero'))).toBe(true);
  });

  it('exporta todas las páginas filtradas y conserva el CSV válido', async () => {
    let blob;
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL(valor) {
          blob = valor;
          return 'blob:prueba';
        }
        static revokeObjectURL() {}
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const texto = await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.readAsText(blob);
    });
    expect(texto.split('\r\n')).toHaveLength(241);
    expect(texto).toContain('"Presión (hPa)"');
    expect(texto).toContain('"sin calibrar"');
    const peticiones = api.get.mock.calls
      .map(([ruta]) => ruta)
      .filter((ruta) => ruta.includes('porPagina=200'));
    expect(peticiones).toHaveLength(2);
    expect(peticiones[1]).toContain('pagina=2');
    expect(click.mock.instances[0].download).toBe('historial-lecturas.csv');
  });

  it('escapa comillas y fórmulas al exportar alertas', async () => {
    let blob;
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL(valor) {
          blob = valor;
          return 'blob:prueba';
        }
        static revokeObjectURL() {}
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await abrir();
    api.get.mockImplementation(async (ruta) =>
      ruta.includes('/alertas')
        ? ruta.includes('abiertas')
          ? [{ ...alertas[0], nodo: '=1+1', mensaje: 'Sensor "Patio"; humedad' }]
          : []
        : responder(ruta),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alertas', exact: true }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => expect(blob).toBeDefined());
    const texto = await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.readAsText(blob);
    });
    expect(texto).toContain('"\'=1+1"');
    expect(texto).toContain('"Sensor ""Patio""; humedad"');
    expect(texto.split('\r\n')).toHaveLength(2);
  });

  it('muestra errores de exportación sin perder la tabla', async () => {
    await abrir();
    api.get.mockRejectedValueOnce(new Error('Red'));
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descargar el CSV');
    expect(filas()).toHaveLength(20);
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
  });
});

describe('Historial de ejemplo', () => {
  it('filtra fechas antes de paginar y mantiene resultados estables', () => {
    const todo = lecturasDemo({ id: 1 }, null, { porPagina: '1000' });
    const desde = todo.filas[30].fecha;
    const hasta = todo.filas[10].fecha;
    const primera = lecturasDemo({ id: 1 }, null, { desde, hasta, porPagina: '10' });
    const segunda = lecturasDemo({ id: 1 }, null, { desde, hasta, porPagina: '10', pagina: '2' });
    expect(primera.total).toBe(21);
    expect(primera.filas).toEqual(todo.filas.slice(10, 20));
    expect(segunda.filas).toEqual(todo.filas.slice(20, 30));
  });

  it('calcula promedios reales por nodo y conserva sensores sin respuesta', () => {
    const todo = lecturasDemo({ id: 1 }, null, { nodo: '13', porPagina: '1000' });
    const agrupadas = lecturasDemo({ id: 1 }, null, {
      nodo: '13',
      agrupar: 'dia',
      porPagina: '1000',
    });
    expect(agrupadas.total).toBeLessThan(todo.total);
    for (const fila of agrupadas.filas) {
      const lecturas = todo.filas.filter(
        (lectura) => new Date(lectura.fecha).toDateString() === new Date(fila.fecha).toDateString(),
      );
      const promedio =
        lecturas.reduce((suma, lectura) => suma + lectura.temperatura, 0) / lecturas.length;
      expect(fila.temperatura).toBe(Number(promedio.toFixed(2)));
      expect(fila.presion).toBeNull();
    }
  });
});
