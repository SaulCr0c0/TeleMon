import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { rutaInicio } from './rutas';
import { useSesion } from './useSesion';

export default function RutaProtegida({ rol }) {
  const { usuario } = useSesion();
  const ubicacion = useLocation();
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (rol && usuario.rol !== rol) return <Navigate to={rutaInicio(usuario)} replace />;
  return <Outlet />;
}
