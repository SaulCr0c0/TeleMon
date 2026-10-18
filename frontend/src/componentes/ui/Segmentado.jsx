import estilos from './Segmentado.module.css';

export default function Segmentado({ opciones, valor, alCambiar, etiqueta }) {
  return (
    <div role="group" aria-label={etiqueta} className={estilos.grupo}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            className={activo ? estilos.activo : estilos.opcion}
            onClick={() => alCambiar(o.valor)}
          >
            {o.texto}
            {o.extra !== undefined && <span className={estilos.extra}>{o.extra}</span>}
          </button>
        );
      })}
    </div>
  );
}
