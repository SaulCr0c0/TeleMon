import { NavLink } from 'react-router-dom';
import Icono from '../ui/Icono';
import Logo from './Logo';
import estilos from './BarraLateral.module.css';

function Enlace({ a, icono, texto, contador, fin }) {
  return (
    <NavLink
      to={a}
      end={fin}
      className={({ isActive }) => (isActive ? estilos.activo : estilos.enlace)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <>
              <span className={estilos.curvaArriba} aria-hidden="true" />
              <span className={estilos.curvaAbajo} aria-hidden="true" />
            </>
          )}
          <span className={estilos.icono}>
            <Icono nombre={icono} />
          </span>
          {texto}
          {contador > 0 && (
            <span className={estilos.contador}>
              <span className="solo-lector">activas: </span>
              {contador}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function BarraLateral({ grupos, usuario, alCerrarSesion }) {
  return (
    <aside className={estilos.barra} aria-label="Navegación principal">
      <Logo className={estilos.logo} />

      {grupos.map((g, i) => (
        <div key={g.etiqueta}>
          {g.titulo && (
            <div className={i === 0 ? estilos.tituloPrimero : estilos.titulo}>{g.titulo}</div>
          )}
          <nav aria-label={g.etiqueta} className={estilos.lista}>
            {g.enlaces.map((e) => (
              <Enlace key={e.a} {...e} />
            ))}
          </nav>
        </div>
      ))}

      <div className={estilos.pie}>
        {usuario.a ? (
          <NavLink
            to={usuario.a}
            className={({ isActive }) =>
              `${estilos.usuario} ${isActive ? estilos.usuarioActivo : ''}`
            }
          >
            <span className={estilos.avatar}>{usuario.iniciales}</span>
            <span className={estilos.datos}>
              <span>{usuario.nombre}</span>
              <span className={estilos.detalle}>{usuario.detalle}</span>
            </span>
          </NavLink>
        ) : (
          <div className={estilos.usuario}>
            <span className={estilos.avatar}>{usuario.iniciales}</span>
            <span className={estilos.datos}>
              <span>{usuario.nombre}</span>
              <span className={estilos.detalle}>{usuario.detalle}</span>
            </span>
          </div>
        )}
        <button type="button" className={estilos.enlace} onClick={alCerrarSesion}>
          <span className={estilos.icono}>
            <Icono nombre="salir" />
          </span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
