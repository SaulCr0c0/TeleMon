import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import MonitorFicha from './MonitorFicha';

async function abrir(id) {
  dibujar(<MonitorFicha />, {
    ruta: `/admin/inventario/${id}`,
    patron: '/admin/inventario/:dispositivoId',
    usuario: { nombre: 'Equipo TeleMon', rol: 'admin' },
  });
  await screen.findByRole('heading', { level: 1 });
}

describe('MonitorFicha', () => {
  it('muestra el estado técnico, los sensores y el historial', async () => {
    await abrir(1);
    expect(screen.getByRole('heading', { name: 'F8:B3:B7:2B:FC:24' })).toBeInTheDocument();
    expect(screen.getByText('84 ms')).toBeInTheDocument();
    expect(screen.getByText('−58 dBm · buena')).toBeInTheDocument();
    expect(screen.getByText('DS18B20').closest('li')).toHaveTextContent('Responde');
    expect(screen.getByText('Activado por el cliente como «Aula 3»')).toBeInTheDocument();
    expect(screen.getByText(/Está en uso/)).toBeInTheDocument();
  });

  it('rechaza un R0 inválido y guarda uno correcto', async () => {
    await abrir(2);
    const r0 = screen.getByLabelText('R0 (kΩ)');
    await userEvent.type(r0, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar R0' }));
    expect(screen.getByRole('alert')).toHaveTextContent('mayor que 0');
    await userEvent.clear(r0);
    await userEvent.type(r0, '40,5');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar R0' }));
    expect(await screen.findByText(/R0 guardado/)).toBeInTheDocument();
    expect(await screen.findByText('R0 del MQ-135 cargado: 40.5 kΩ')).toBeInTheDocument();
  });

  it('reserva un monitor disponible para un cliente', async () => {
    await abrir(7);
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige un cliente.');
    await userEvent.selectOptions(screen.getByLabelText('Reservar para'), 'Vivero Los Andes');
    await userEvent.click(screen.getByRole('button', { name: 'Reservar' }));
    expect(await screen.findByText(/Reservado para Vivero Los Andes. Lo verá/)).toBeInTheDocument();
    const asignacion = screen.getByRole('heading', { name: 'Asignación' }).closest('section');
    expect(within(asignacion).getByText('Vivero Los Andes')).toBeInTheDocument();
  });

  it('libera un monitor desactivado con un código nuevo tras confirmar', async () => {
    await abrir(8);
    await userEvent.click(screen.getByRole('button', { name: 'Liberar' }));
    expect(screen.getByText(/Vuelve a Disponible con un código nuevo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Liberar' }));
    expect(
      await screen.findByText(/Liberado con el código nuevo [A-Z0-9]{4}-[A-Z0-9]{4}/),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin cliente. Resérvalo para quien lo contrate.')).toBeInTheDocument();
  });
});
