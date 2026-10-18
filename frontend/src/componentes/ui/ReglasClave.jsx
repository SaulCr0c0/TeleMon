import { reglasClave } from '../../utils/validacion';
import estilos from './ReglasClave.module.css';

export default function ReglasClave({ clave, repetida }) {
  return (
    <ul className={estilos.reglas} aria-label="Reglas de la contraseña">
      {reglasClave(clave, repetida).map((r) => (
        <li key={r.texto} className={r.cumple ? estilos.cumple : estilos.pendiente}>
          <span className={estilos.marca} aria-hidden="true">
            {r.cumple ? '✓' : ''}
          </span>
          {r.texto}
          <span className="solo-lector"> {r.cumple ? '(cumplida)' : '(pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}
