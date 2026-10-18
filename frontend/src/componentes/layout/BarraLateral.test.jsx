import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BarraLateral from './BarraLateral';

const grupos = [
  {
    etiqueta: 'Secciones de la ubicación',
    titulo: 'Escuela Adela Zamudio',
    enlaces: [
      { a: '/ubicaciones/1/panel', icono: 'panel', texto: 'Panel' },
      { a: '/ubicaciones/1/alertas', icono: 'alertas', texto: 'Alertas', contador: 3 },
    ],
  },
];

function dibujar(ruta, alCerrarSesion = () => {}) {
  render(
    <MemoryRouter
      initialEntries={[ruta]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <BarraLateral
        grupos={grupos}
        usuario={{ a: '/cuenta', iniciales: 'AR', nombre: 'Ana Rojas', detalle: 'Mi cuenta' }}
        alCerrarSesion={alCerrarSesion}
      />
    </MemoryRouter>,
  );
}

describe('BarraLateral', () => {
  it('marca la sección actual', () => {
    dibujar('/ubicaciones/1/alertas');
    expect(screen.getByRole('link', { name: /Alertas/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('muestra el contador de alertas y el nombre de la ubicación', () => {
    dibujar('/ubicaciones/1/panel');
    expect(screen.getByText('Escuela Adela Zamudio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alertas activas: 3/ })).toBeInTheDocument();
  });

  it('cierra la sesión', async () => {
    const alCerrar = vi.fn();
    dibujar('/ubicaciones/1/panel', alCerrar);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(alCerrar).toHaveBeenCalledOnce();
  });
});
