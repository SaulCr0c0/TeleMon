import estilos from './Estado.module.css';

export default function Estado({ tipo = 'ok', children }) {
  return (
    <span className={`${estilos.estado} ${estilos[tipo]}`}>
      <span className={estilos.marca} aria-hidden="true" />
      {children}
    </span>
  );
}
