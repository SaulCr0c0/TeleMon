import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import CrearCuenta from './CrearCuenta';

async function llenar({
  organizacion = 'Escuela Sucre',
  nombre = 'Marta Paz',
  email,
  clave = 'secreta12',
  terminos = true,
}) {
  await userEvent.type(screen.getByLabelText('Organización'), organizacion);
  await userEvent.type(screen.getByLabelText('Tu nombre'), nombre);
  await userEvent.type(screen.getByLabelText('Correo electrónico'), email);
  await userEvent.type(screen.getByLabelText('Contraseña'), clave);
  if (terminos) await userEvent.click(screen.getByLabelText('Acepto los términos del servicio.'));
  await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('CrearCuenta', () => {
  it('valida los campos antes de enviar', async () => {
    dibujar(<CrearCuenta />);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Completa la organización y tu nombre.');
    expect(screen.getByLabelText('Organización')).toHaveAttribute('aria-invalid', 'true');
  });

  it('cuenta los caracteres que faltan en la contraseña', async () => {
    dibujar(<CrearCuenta />);
    await userEvent.type(screen.getByLabelText('Contraseña'), 'abc');
    expect(screen.getByText('Faltan 5 caracteres.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Contraseña'), 'defgh');
    expect(screen.getByText('Contraseña válida.')).toBeInTheDocument();
  });

  it('rechaza un correo ya registrado', async () => {
    dibujar(<CrearCuenta />);
    await llenar({ email: 'direccion@redvallealto.edu.bo' });
    expect(
      await screen.findByText('Ya existe una cuenta con ese correo. Inicia sesión.'),
    ).toBeInTheDocument();
  });

  it('crea la cuenta y ofrece entrar', async () => {
    dibujar(<CrearCuenta />);
    await llenar({ email: 'Marta@EscuelaSucre.bo' });
    expect(await screen.findByText('Cuenta creada')).toBeInTheDocument();
    expect(screen.getByText('marta@escuelasucre.bo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/bienvenida');
  });
});
