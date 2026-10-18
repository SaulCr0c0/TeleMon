import { NODOS } from './datos';

const PASO_S = { ninguno: 5, minuto: 60, hora: 3600, dia: 86400 };

export default [
  [
    'GET',
    '/api/ubicaciones/:id/lecturas',
    ({ id }, _c, { nodo = '', agrupar = 'ninguno', pagina = '1', porPagina = '20' }) => {
      const nodos = NODOS.filter(
        (n) => n.ubicacionId === Number(id) && n.conectado && (!nodo || n.id === Number(nodo)),
      );
      const total = nodos.length ? 240 : 0;
      const tam = Number(porPagina);
      const inicio = (Number(pagina) - 1) * tam;
      const paso = PASO_S[agrupar] ?? 5;
      const filas = Array.from({ length: Math.max(0, Math.min(tam, total - inicio)) }, (_, k) => {
        const i = inicio + k;
        const n = nodos[i % nodos.length];
        const vaiven = Math.sin(i / 7);
        const rsR0 = n.rsR0 == null ? null : +(n.rsR0 + vaiven * 0.04).toFixed(2);
        return {
          fecha: new Date(Date.now() - i * paso * 1000).toISOString(),
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
      return { total, pagina: Number(pagina), porPagina: tam, filas };
    },
  ],
];
