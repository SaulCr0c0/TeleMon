import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Bienvenida from './Bienvenida';

const modo = vi.hoisted(() => ({ demo: true }));

vi.mock('../../api/cliente', async (original) => {
  const real = await original();
  return {
    ...real,
    get MODO_DEMO() {
      return modo.demo;
    },
  };
});

afterEach(() => {
  modo.demo = true;
  vi.restoreAllMocks();
});

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

  it('se actualiza sola cuando el proveedor reserva un monitor', async () => {
    modo.demo = false;
    vi.spyOn(api, 'get').mockResolvedValue({
      nombre: 'Luis',
      rol: 'cliente',
      monitores: 0,
      monitoresReservados: 1,
    });
    dibujar(<Bienvenida />, {
      usuario: { nombre: 'Luis', rol: 'cliente', monitores: 0, monitoresReservados: 0 },
    });
    expect(await screen.findByText('Tienes 1 monitor listo para activar')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/cuenta');
  });
});
