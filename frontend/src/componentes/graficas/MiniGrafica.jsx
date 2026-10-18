import estilos from './MiniGrafica.module.css';

export default function MiniGrafica({ valores = [], color = 'var(--primario-borde)' }) {
  const numeros = valores.filter((v) => v != null);
  if (numeros.length < 2) return <div className={estilos.vacia} aria-hidden="true" />;
  const min = Math.min(...numeros);
  const max = Math.max(...numeros);
  const alto = max - min || 1;
  const paso = 120 / (valores.length - 1);
  const puntos = valores
    .map((v, i) =>
      v == null ? null : `${(i * paso).toFixed(1)},${(26 - ((v - min) / alto) * 24).toFixed(1)}`,
    )
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      viewBox="0 0 120 28"
      width="100%"
      height="28"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={estilos.grafica}
    >
      <polyline
        points={puntos}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
