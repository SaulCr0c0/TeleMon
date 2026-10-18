import { NODOS, UMBRALES } from './datos';

const PERIODOS = {
  '1h': { puntos: 60, pasoS: 60 },
  '24h': { puntos: 96, pasoS: 900 },
  '7d': { puntos: 84, pasoS: 7200 },
};
const AMPLITUD = { temperatura: 2.4, humedad: 5, presion: 3, calidad_aire: 0.08 };
const CAMPO = {
  temperatura: 'temperatura',
  humedad: 'humedad',
  presion: 'presion',
  calidad_aire: 'rsR0',
};

function rango(ubicacionId, variable) {
  const u = UMBRALES[ubicacionId];
  if (variable === 'calidad_aire')
    return { min: u.calidadAire === 'moderado' ? 0.8 : 0.5, max: null };
  return u[variable];
}

export default [
  [
    'GET',
    '/api/dispositivos/:id/serie',
    ({ id }, _c, { periodo = '1h', variable = 'temperatura' }) => {
      const nodo = NODOS.find((n) => n.id === Number(id));
      const base = nodo?.[CAMPO[variable]];
      const { puntos, pasoS } = PERIODOS[periodo] ?? PERIODOS['1h'];
      const fin = Date.now();
      const serie =
        base == null
          ? []
          : Array.from({ length: puntos }, (_, i) => ({
              fecha: new Date(fin - (puntos - 1 - i) * pasoS * 1000).toISOString(),
              valor: +(base + AMPLITUD[variable] * Math.sin(i / 6 + id) * 0.6).toFixed(2),
            }));
      return { variable, periodo, rango: rango(nodo?.ubicacionId ?? 1, variable), puntos: serie };
    },
  ],
];
