import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import ClienteFicha from './ClienteFicha';

function abrir(id = 1) {
  dibujar(<ClienteFicha />, {
    ruta: `/admin/clientes/${id}`,
    patron: '/admin/clientes/:clienteId',
    usuario: { nombre: 'Equipo TeleMon', rol: 'admin' },
  });
}

describe('ClienteFicha', () => {
  it('muestra datos, ubicaciones y monitores del cliente', async () => {
    abrir();
    expect(
      await screen.findByRole('heading', { name: 'Red Escolar Valle Alto', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Registro propio · Cliente desde el 12/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Escuela Adela Zamudio Punata 3/ })).toBeInTheDocument();
    const reservado = screen.getByRole('rowheader', { name: 'W3FJ-7KTA' }).closest('tr');
    expect(within(reservado).getByText('Reservado')).toBeInTheDocument();
  });

  it('edita los datos y valida el correo', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar datos' }));
    const correo = screen.getByLabelText('Correo electrónico');
    await userEvent.clear(correo);
    await userEvent.type(correo, 'mal');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completa la organización, el contacto y un correo válido.',
    );
    await userEvent.clear(correo);
    await userEvent.type(correo, 'contacto@redvallealto.edu.bo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Datos guardados')).toBeInTheDocument();
    expect(screen.getByText('contacto@redvallealto.edu.bo')).toBeInTheDocument();
  });

  it('restablece la contraseña tras confirmar', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect(await screen.findByText('Contraseña temporal')).toBeInTheDocument();
    expect(screen.getByText(/^\w{4}-\w{4}-\w{4}$/)).toBeInTheDocument();
  });

  it('suspende y reactiva la cuenta', async () => {
    abrir(2);
    await userEvent.click(await screen.findByRole('button', { name: 'Suspender cuenta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText('Cuenta suspendida')).toBeInTheDocument();
    expect(
      screen.getByText(
        'El cliente no puede iniciar sesión. Sus ubicaciones, lecturas y alertas se conservan.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar cuenta' }));
    expect(await screen.findByText('Cuenta reactivada')).toBeInTheDocument();
  });
});
