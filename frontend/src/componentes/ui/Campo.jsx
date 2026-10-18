import { useId } from 'react';
import estilos from './Campo.module.css';

export default function Campo({
  etiqueta,
  ayuda,
  error,
  opciones,
  mono = false,
  ancho,
  tamano = 'grande',
  className = '',
  ...resto
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const clases = [
    estilos.control,
    estilos[tamano],
    mono ? estilos.mono : '',
    error ? estilos.conError : '',
  ]
    .filter(Boolean)
    .join(' ');
  const comunes = {
    id,
    className: clases,
    style: ancho ? { width: ancho } : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': ayuda || error ? idAyuda : undefined,
    ...resto,
  };
  return (
    <div className={`${estilos.campo} ${className}`}>
      <label htmlFor={id} className={estilos.etiqueta}>
        {etiqueta}
      </label>
      {opciones ? (
        <select {...comunes}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      ) : (
        <input {...comunes} />
      )}
      {(error || ayuda) && (
        <span id={idAyuda} className={error ? estilos.textoError : estilos.ayuda}>
          {error || ayuda}
        </span>
      )}
    </div>
  );
}
