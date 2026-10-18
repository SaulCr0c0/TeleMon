import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import estilos from './GraficaSerie.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const COLORES = {
  linea: '#0b7a66',
  area: 'rgba(11, 122, 102, 0.08)',
  franja: '#e3f3ee',
  rejilla: '#eef0ec',
  texto: '#5b6761',
};

const franjaPermitida = {
  id: 'franjaPermitida',
  beforeDatasetsDraw(grafica, _args, opciones) {
    const { min, max } = opciones;
    if (min == null && max == null) return;
    const { ctx, chartArea, scales } = grafica;
    const arriba =
      max == null ? chartArea.top : Math.max(chartArea.top, scales.y.getPixelForValue(max));
    const abajo =
      min == null ? chartArea.bottom : Math.min(chartArea.bottom, scales.y.getPixelForValue(min));
    if (abajo <= arriba) return;
    ctx.save();
    ctx.fillStyle = COLORES.franja;
    ctx.fillRect(chartArea.left, arriba, chartArea.right - chartArea.left, abajo - arriba);
    ctx.restore();
  },
};

export default function GraficaSerie({
  puntos,
  rango,
  etiquetaX,
  formatoY,
  decimales = 1,
  descripcion,
}) {
  const datos = {
    labels: puntos.map((p) => etiquetaX(p.fecha)),
    datasets: [
      {
        data: puntos.map((p) => p.valor),
        borderColor: COLORES.linea,
        backgroundColor: COLORES.area,
        borderWidth: 2,
        fill: 'start',
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25,
      },
    ],
  };

  const opciones = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      franjaPermitida: { min: rango?.min, max: rango?.max },
      tooltip: {
        displayColors: false,
        callbacks: {
          label: (c) => (formatoY ? formatoY(c.parsed.y) : c.parsed.y.toFixed(decimales)),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: COLORES.texto, font: { size: 12 }, maxTicksLimit: 3, maxRotation: 0 },
      },
      y: {
        grid: { color: COLORES.rejilla, drawTicks: false },
        border: { display: false },
        ticks: {
          color: COLORES.texto,
          font: { family: "'Geist Mono', ui-monospace, monospace", size: 12 },
          maxTicksLimit: 3,
          padding: 12,
          callback: (v) => Number(v).toFixed(decimales),
        },
      },
    },
  };

  return (
    <div className={estilos.contenedor}>
      <Line
        data={datos}
        options={opciones}
        plugins={[franjaPermitida]}
        role="img"
        aria-label={descripcion}
      />
    </div>
  );
}
