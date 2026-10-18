import Icono from './Icono';
import estilos from './Aviso.module.css';

export default function Aviso({ tipo = 'exito', children }) {
  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`${estilos.caja} ${estilos[tipo]}`}
    >
      {tipo === 'aviso' && (
        <Icono nombre="aviso" tamano={18} grosor={2} className={estilos.icono} />
      )}
      <span>{children}</span>
    </div>
  );
}
