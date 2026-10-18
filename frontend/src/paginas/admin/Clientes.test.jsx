import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import Clientes from './Clientes';

const opciones = { usuario: { nombre: 'Equipo TeleMon', rol: 'admin' } };

async function cargar() {
  dibujar(<Clientes />, opciones);
  await screen.findByRole('link', { name: 'Red Escolar Valle Alto' });
}

describe('Clientes', () => {
  it('lista los clientes con origen, estado y alta', async () => {
    await cargar();
    const fila = screen.getByRole('link', { name: 'Granja Avícola Tunari' }).closest('tr');
    expect(within(fila).getByText('Registro propio')).toBeInTheDocument();
    expect(within(fila).getByText('Suspendida')).toBeInTheDocument();
    expect(within(fila).getByText('21/09/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vivero Los Andes' }).closest('tr')).toHaveTextContent(
      'Creado por admin',
    );
  });

  it('busca por organización o correo', async () => {
    await cargar();
    await userEvent.type(screen.getByLabelText('Buscar cliente'), 'coopsanpedro');
    expect(screen.getByText('1 cliente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cooperativa San Pedro' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar cliente'), 'zzz');
    expect(screen.getByText('Ningún cliente coincide con «coopsanpedrozzz».')).toBeInTheDocument();
  });

  it('valida la cuenta manual', async () => {
    await cargar();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta manual' }));
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'direccion@redvallealto.edu.bo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByText('Escribe el nombre de la organización.')).toBeInTheDocument();
    expect(screen.getByText('Ese correo ya está registrado.')).toBeInTheDocument();
  });

  it('crea la cuenta y muestra la contraseña temporal una vez', async () => {
    await cargar();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta manual' }));
    await userEvent.type(screen.getByLabelText('Organización'), 'Colegio Don Bosco');
    await userEvent.type(screen.getByLabelText('Nombre del contacto'), 'Pedro Arce');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'direccion@donbosco.edu.bo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const aviso = await screen.findByRole('status');
    expect(within(aviso).getByText('Cuenta creada para Colegio Don Bosco')).toBeInTheDocument();
    expect(within(aviso).getByText(/^\w{4}-\w{4}-\w{4}$/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Colegio Don Bosco' })).toBeInTheDocument();
    await userEvent.click(within(aviso).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText(/^\w{4}-\w{4}-\w{4}$/)).not.toBeInTheDocument();
  });
});
