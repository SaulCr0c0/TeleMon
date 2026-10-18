import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SesionProvider } from '../sesion/SesionContext';

export function dibujar(elemento, { ruta = '/', patron = ruta, usuario, otras = {} } = {}) {
  if (usuario) localStorage.setItem('telemon.usuario', JSON.stringify(usuario));
  return render(
    <SesionProvider>
      <MemoryRouter
        initialEntries={[ruta]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path={patron} element={elemento} />
          {Object.entries(otras).map(([camino, texto]) => (
            <Route key={camino} path={camino} element={<p>{texto}</p>} />
          ))}
        </Routes>
      </MemoryRouter>
    </SesionProvider>,
  );
}
