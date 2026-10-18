import { Link } from 'react-router-dom';
import Icono from './Icono';
import estilos from './Boton.module.css';

export default function Boton({
  variante = 'secundario',
  tamano = 'normal',
  icono,
  a,
  deshabilitado = false,
  bloque = false,
  className = '',
  children,
  ...resto
}) {
  const clases = [
    estilos.boton,
    estilos[variante],
    estilos[tamano],
    bloque ? estilos.bloque : '',
    deshabilitado ? estilos.deshabilitado : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const contenido = (
    <>
      {icono && <Icono nombre={icono} tamano={16} grosor={2.2} />}
      {children}
    </>
  );
  if (a && !deshabilitado) {
    return (
      <Link to={a} className={clases} {...resto}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={clases}
      disabled={deshabilitado}
      aria-disabled={deshabilitado || undefined}
      {...resto}
    >
      {contenido}
    </button>
  );
}
