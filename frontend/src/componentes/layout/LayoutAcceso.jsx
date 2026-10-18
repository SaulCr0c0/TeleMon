import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSesion } from '../../sesion/useSesion';
import Logo from './Logo';
import estilos from './LayoutAcceso.module.css';

const ANCHO = { '/bienvenida': 'ancho' };

export default function LayoutAcceso() {
  const { pathname } = useLocation();
  const { usuario, cerrar } = useSesion();
  const navegar = useNavigate();
  const conSesion = Boolean(usuario) && pathname === '/bienvenida';

  return (
    <div className={estilos.marco}>
      <header className={estilos.encabezado}>
        <div className={estilos.barra}>
          <Logo />
          {conSesion && (
            <button
              type="button"
              className={estilos.salir}
              onClick={() => {
                cerrar();
                navegar('/login', { replace: true });
              }}
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </header>
      <main className={`${estilos.principal} ${estilos[ANCHO[pathname] ?? 'angosto']}`}>
        <Outlet />
      </main>
    </div>
  );
}
