import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import MiCuenta from './MiCuenta';

const usuario = {
  nombre: 'Ana Rojas',
  organizacion: 'Red Escolar Valle Alto',
  rol: 'cliente',
  monitores: 7,
};

describe('MiCuenta', () => {
  it('muestra los datos y el correo de solo lectura', async () => {
    dibujar(<MiCuenta />, { usuario });
    expect(await screen.findByLabelText('Organización')).toHaveValue('Red Escolar Valle Alto');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('readonly');
    expect(screen.getByText('Registro propio')).toBeInTheDocument();
  });

  it('guarda los datos y actualiza la sesión', async () => {
    dibujar(<MiCuenta />, { usuario });
    const nombre = await screen.findByLabelText('Tu nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Ana María Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(await screen.findByText('Datos guardados')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('telemon.usuario')).nombre).toBe('Ana María Rojas');
  });

  it('no guarda datos vacíos', async () => {
    dibujar(<MiCuenta />, { usuario });
    await userEvent.clear(await screen.findByLabelText('Organización'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Completa la organización y tu nombre.');
  });

  it('cambia la contraseña solo con la actual y las reglas cumplidas', async () => {
    dibujar(<MiCuenta />, { usuario });
    const boton = await screen.findByRole('button', { name: 'Cambiar contraseña' });
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'nueva2026');
    await userEvent.type(screen.getByLabelText('Repite la contraseña nueva'), 'nueva2026');
    expect(boton).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'telemon123');
    expect(boton).toBeEnabled();
    await userEvent.click(boton);
    expect(await screen.findByText('Contraseña cambiada')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
  });
});
