import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import useApi from '../../hooks/useApi';
import { useSesion } from '../../sesion/useSesion';
import { iniciales } from '../../utils/formato';
import BarraLateral from './BarraLateral';
import estilos from './LayoutCliente.module.css';

export default function LayoutCliente() {
  const { usuario, cerrar } = useSesion();
  const navegar = useNavigate();
  const coincidencia = useMatch('/ubicaciones/:ubicacionId/*');
  const ubicacionId = coincidencia?.params.ubicacionId;
  const { datos: ubicacion } = useApi(ubicacionId ? `/api/ubicaciones/${ubicacionId}` : null);

  const grupos = [
    {
      etiqueta: 'Cuenta',
      enlaces: [{ a: '/ubicaciones', icono: 'ubicaciones', texto: 'Ubicaciones', fin: true }],
    },
  ];
  if (ubicacionId) {
    const base = `/ubicaciones/${ubicacionId}`;
    grupos.push({
      etiqueta: 'Secciones de la ubicación',
      titulo: ubicacion?.nombre ?? '…',
      enlaces: [
        { a: `${base}/panel`, icono: 'panel', texto: 'Panel' },
        { a: `${base}/graficas`, icono: 'graficas', texto: 'Gráficas' },
        {
          a: `${base}/alertas`,
          icono: 'alertas',
          texto: 'Alertas',
          contador: ubicacion?.alertasActivas,
        },
        { a: `${base}/nodos`, icono: 'nodos', texto: 'Nodos' },
        { a: `${base}/historial`, icono: 'historial', texto: 'Historial' },
        { a: `${base}/umbrales`, icono: 'umbrales', texto: 'Umbrales' },
      ],
    });
  }

  return (
    <div className={estilos.marco}>
      <BarraLateral
        grupos={grupos}
        usuario={{
          a: '/cuenta',
          iniciales: iniciales(usuario?.nombre),
          nombre: usuario?.nombre,
          detalle: 'Mi cuenta',
        }}
        alCerrarSesion={() => {
          cerrar();
          navegar('/login', { replace: true });
        }}
      />
      <main className={estilos.principal}>
        <div className={estilos.contenido}>
          <Outlet context={{ ubicacion }} />
        </div>
      </main>
    </div>
  );
}
