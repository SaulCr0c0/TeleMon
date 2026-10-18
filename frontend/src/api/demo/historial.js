import { NODOS } from './datos';
import { nivelAire } from '../../utils/formato';

const PASO_S = { minuto: 60, hora: 3600, dia: 86400 };
const FIN = Math.floor(Date.now() / 300000) * 300000;

function agruparLecturas(filas, agrupar) {
  if (!PASO_S[agrupar]) return filas;
  const grupos = new Map();
  for (const fila of filas) {
    const fecha = new Date(fila.fecha);
    if (agrupar === 'dia') fecha.setHours(0, 0, 0, 0);
    else if (agrupar === 'hora') fecha.setMinutes(0, 0, 0);
    else fecha.setSeconds(0, 0);
    const clave = `${fila.dispositivoId}-${fecha.toISOString()}`;
    if (!grupos.has(clave)) grupos.set(clave, { fecha: fecha.toISOString(), filas: [] });
    grupos.get(clave).filas.push(fila);
  }
  return [...grupos.values()]
    .map(({ fecha, filas: grupo }) => {
      const fila = { ...grupo[0], fecha };
      for (const campo of ['temperatura', 'humedad', 'presion', 'rsR0']) {
        const valores = grupo
          .map((lectura) => lectura[campo])
          .filter((valor) => Number.isFinite(valor));
        fila[campo] = valores.length
          ? Number((valores.reduce((suma, valor) => suma + valor, 0) / valores.length).toFixed(2))
          : null;
      }
      fila.nivelAire = nivelAire(fila.rsR0);
      return fila;
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

export default [
  [
    'GET',
    '/api/ubicaciones/:id/lecturas',
    (
      { id },
      _c,
      { nodo = '', agrupar = 'ninguno', pagina = '1', porPagina = '20', desde = '', hasta = '' },
    ) => {
      const nodos = NODOS.filter((n) => n.ubicacionId === Number(id) && n.conectado);
      const total = nodos.length ? 240 : 0;
      const tam = Math.max(1, Math.min(1000, Number(porPagina) || 20));
      const pag = Math.max(1, Number(pagina) || 1);
      const inicio = (pag - 1) * tam;
      const lecturas = Array.from({ length: total }, (_, i) => {
        const n = nodos[i % nodos.length];
        const vaiven = Math.sin(i / 7);
        const rsR0 = n.rsR0 == null ? null : +(n.rsR0 + vaiven * 0.04).toFixed(2);
        return {
          fecha: new Date(FIN - i * 300000).toISOString(),
          dispositivoId: n.id,
          nodo: n.nombre,
          temperatura: +(n.temperatura + vaiven * 0.6).toFixed(1),
          humedad: Math.round(n.humedad + vaiven * 2),
          presion: n.presion == null ? null : +(n.presion + vaiven * 0.3).toFixed(1),
          rsR0,
          nivelAire:
            rsR0 == null
              ? 'sin_calibrar'
              : rsR0 >= 0.8
                ? 'bueno'
                : rsR0 >= 0.5
                  ? 'moderado'
                  : 'malo',
        };
      });
      const filtradas = lecturas.filter(
        (fila) =>
          (!nodo || fila.dispositivoId === Number(nodo)) &&
          (!desde || new Date(fila.fecha) >= new Date(desde)) &&
          (!hasta || new Date(fila.fecha) <= new Date(hasta)),
      );
      const filas = agruparLecturas(filtradas, agrupar);
      return {
        total: filas.length,
        pagina: pag,
        porPagina: tam,
        filas: filas.slice(inicio, inicio + tam),
      };
    },
  ],
];
