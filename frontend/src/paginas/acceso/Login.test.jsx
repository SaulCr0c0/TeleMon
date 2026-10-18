import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import Login from './Login';

const destinos = {
  '/ubicaciones': 'pantalla ubicaciones',
  '/admin/clientes': 'pantalla clientes',
  '/crear-clave': 'pantalla crear clave',
  '/bienvenida': 'pantalla bienvenida',
};

describe('Login', () => {
  it('muestra el formulario del mockup', () => {
    dibujar(<Login />, { ruta: '/login' });
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByText('Tu ambiente, siempre a la vista.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/crear-cuenta',
    );
  });

  it('avisa si faltan datos o si las credenciales son incorrectas', async () => {
    dibujar(<Login />, { ruta: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu correo y tu contraseña.');

    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'direccion@redvallealto.edu.bo',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala1234');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('lleva a cada rol a su pantalla de inicio', async () => {
    dibujar(<Login />, { ruta: '/login', otras: destinos });
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'direccion@redvallealto.edu.bo',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'telemon123');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('pantalla ubicaciones')).toBeInTheDocument();
  });

  it('con contraseña temporal obliga a crear una nueva', async () => {
    dibujar(<Login />, { ruta: '/login', otras: destinos });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar con contraseña temporal' }));
    expect(await screen.findByText('pantalla crear clave')).toBeInTheDocument();
  });
});
