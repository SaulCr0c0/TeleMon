import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RutaProtegida from './RutaProtegida';
import { SesionProvider } from './SesionContext';

function dibujar(usuario, ruta) {
  if (usuario) localStorage.setItem('telemon.usuario', JSON.stringify(usuario));
  render(
    <SesionProvider>
      <MemoryRouter
        initialEntries={[ruta]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/login" element={<p>login</p>} />
          <Route path="/ubicaciones" element={<p>ubicaciones</p>} />
          <Route element={<RutaProtegida rol="cliente" />}>
            <Route path="/cuenta" element={<p>cuenta</p>} />
          </Route>
          <Route element={<RutaProtegida rol="admin" />}>
            <Route path="/admin/clientes" element={<p>clientes</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SesionProvider>,
  );
}

describe('RutaProtegida', () => {
  it('sin sesión manda al login', () => {
    dibujar(null, '/cuenta');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('un cliente no entra al panel del proveedor', () => {
    dibujar({ nombre: 'Ana', rol: 'cliente', monitores: 3 }, '/admin/clientes');
    expect(screen.getByText('ubicaciones')).toBeInTheDocument();
  });

  it('deja pasar al rol correcto', () => {
    dibujar({ nombre: 'Equipo', rol: 'admin' }, '/admin/clientes');
    expect(screen.getByText('clientes')).toBeInTheDocument();
  });
});
