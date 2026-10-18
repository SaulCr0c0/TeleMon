import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import Bienvenida from './Bienvenida';

describe('Bienvenida', () => {
  it('sin monitores explica los cuatro pasos', () => {
    dibujar(<Bienvenida />, {
      usuario: { nombre: 'Luis', rol: 'cliente', monitores: 0, monitoresReservados: 0 },
    });
    expect(screen.getByText('Todavía no tienes monitores.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(
      screen.queryByRole('link', { name: 'Crear mi primera ubicación' }),
    ).not.toBeInTheDocument();
  });

  it('con monitores reservados invita a crear la primera ubicación', () => {
    dibujar(<Bienvenida />, {
      usuario: { nombre: 'Luis', rol: 'cliente', monitores: 0, monitoresReservados: 2 },
    });
    expect(screen.getByText('Tienes 2 monitores listos para activar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear mi primera ubicación' })).toHaveAttribute(
      'href',
      '/ubicaciones',
    );
  });
});
