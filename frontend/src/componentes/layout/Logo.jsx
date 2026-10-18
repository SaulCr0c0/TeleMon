import Icono from '../ui/Icono';
import estilos from './Logo.module.css';

export default function Logo({ className = '' }) {
  return (
    <div className={`${estilos.logo} ${className}`}>
      <span className={estilos.marca}>
        <Icono nombre="logo" tamano={16} grosor={2.2} color="var(--acento-claro)" />
      </span>
      TeleMon
    </div>
  );
}
