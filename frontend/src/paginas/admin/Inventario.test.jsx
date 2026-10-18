import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import Inventario from './Inventario';

const opciones = { usuario: { nombre: 'Equipo TeleMon', rol: 'admin' } };

async function cargar() {
  dibujar(<Inventario />, opciones);
  await screen.findByRole('link', { name: 'F8:B3:B7:2B:FC:24' });
}

async function abrirRegistro() {
  await cargar();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar monitor' }));
}

describe('Inventario', () => {
  it('lista los monitores con su estado, cliente y conexión', async () => {
    await cargar();
    const fila = screen.getByRole('link', { name: 'F8:B3:B7:2B:FC:24' }).closest('tr');
    expect(within(fila).getByText('H7QD-4MXA')).toBeInTheDocument();
    expect(within(fila).getByText('En uso')).toBeInTheDocument();
    expect(within(fila).getByText('Red Escolar Valle Alto')).toBeInTheDocument();
    expect(within(fila).getByText(/En línea · hace/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'F8:B3:B7:2B:FC:24' })).toHaveAttribute(
      'href',
      '/admin/inventario/1',
    );
  });

  it('filtra por estado y busca por texto', async () => {
    await cargar();
    await userEvent.click(screen.getByRole('button', { name: /Disponibles/ }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /Todos/ }));
    await userEvent.type(screen.getByLabelText('Buscar monitor'), 'tunari');
    expect(screen.getByText('R3GW-5NSK')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText('Buscar monitor'));
    await userEvent.type(screen.getByLabelText('Buscar monitor'), 'no-existe');
    expect(screen.getByText('Ningún monitor coincide con ese filtro.')).toBeInTheDocument();
  });

  it('valida la MAC y rechaza una repetida', async () => {
    await abrirRegistro();
    await userEvent.type(screen.getByLabelText('MAC del monitor'), 'F8B3');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar y generar código' }));
    expect(
      screen.getByText('Escribe la MAC con el formato AA:BB:CC:DD:EE:FF.'),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('MAC del monitor'));
    await userEvent.type(screen.getByLabelText('MAC del monitor'), 'F8:B3:B7:2B:FC:24');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar y generar código' }));
    expect(await screen.findByText('Esa MAC ya está registrada.')).toBeInTheDocument();
  });

  it('registra, reserva y muestra la etiqueta con el código', async () => {
    await abrirRegistro();
    await userEvent.type(screen.getByLabelText('MAC del monitor'), 'a4:cf:12:00:11:22');
    await userEvent.selectOptions(screen.getByLabelText('Reservar para'), 'Cooperativa San Pedro');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar y generar código' }));
    const aviso = await screen.findByRole('status');
    expect(within(aviso).getByText('Monitor registrado')).toBeInTheDocument();
    expect(within(aviso).getByText(/Reservado para Cooperativa San Pedro/)).toBeInTheDocument();
    expect(within(aviso).getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'A4:CF:12:00:11:22' })).toBeInTheDocument();
  });
});
