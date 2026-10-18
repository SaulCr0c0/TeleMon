import { Outlet, useNavigate } from 'react-router-dom';
import { useSesion } from '../../sesion/useSesion';
import { iniciales } from '../../utils/formato';
import BarraLateral from './BarraLateral';
import estilos from './LayoutCliente.module.css';

const GRUPOS = [
  {
    etiqueta: 'Administración',
    titulo: 'Administración',
    enlaces: [
      { a: '/admin/clientes', icono: 'clientes', texto: 'Clientes' },
      { a: '/admin/inventario', icono: 'inventario', texto: 'Inventario' },
    ],
  },
];

export default function LayoutAdmin() {
  const { usuario, cerrar } = useSesion();
  const navegar = useNavigate();
  return (
    <div className={estilos.marco}>
      <BarraLateral
        grupos={GRUPOS}
        usuario={{
          iniciales: iniciales(usuario?.nombre),
          nombre: usuario?.nombre,
          detalle: 'Administrador',
        }}
        alCerrarSesion={() => {
          cerrar();
          navegar('/login', { replace: true });
        }}
      />
      <main className={estilos.principal}>
        <div className={estilos.contenido}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
