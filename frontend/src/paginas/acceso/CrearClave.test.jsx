import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import CrearClave from './CrearClave';

const usuario = {
  id: 3,
  nombre: 'Carla Mendoza',
  rol: 'cliente',
  debeCambiarClave: true,
  monitores: 1,
};

describe('CrearClave', () => {
  it('marca cada regla a medida que se cumple', async () => {
    dibujar(<CrearClave />, { usuario });
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'vivero2026');
    expect(screen.getByText('Al menos 8 caracteres')).toHaveTextContent('(cumplida)');
    expect(screen.getByText('Letras y números')).toHaveTextContent('(cumplida)');
    expect(screen.getByText('Las dos contraseñas coinciden')).toHaveTextContent('(pendiente)');
  });

  it('no deja continuar hasta cumplir todas las reglas', async () => {
    dibujar(<CrearClave />, { usuario });
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'vivero2026');
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'vivero2026');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('guarda y entra a sus ubicaciones', async () => {
    dibujar(<CrearClave />, {
      ruta: '/crear-clave',
      usuario,
      otras: { '/ubicaciones': 'pantalla ubicaciones' },
    });
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'vivero2026');
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'vivero2026');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('pantalla ubicaciones')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('telemon.usuario')).debeCambiarClave).toBe(false);
  });
});
