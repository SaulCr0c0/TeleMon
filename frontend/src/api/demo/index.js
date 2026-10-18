import { ErrorApi } from '../errores';
import acceso from './acceso';
import ubicaciones from './ubicaciones';
import panel from './panel';
import graficas from './graficas';
import alertas from './alertas';
import nodos from './nodos';
import historial from './historial';
import umbrales from './umbrales';
import cuenta from './cuenta';
import admin from './admin';

const RUTAS = [
  ...acceso,
  ...ubicaciones,
  ...panel,
  ...graficas,
  ...alertas,
  ...nodos,
  ...historial,
  ...umbrales,
  ...cuenta,
  ...admin,
].map(([metodo, patron, manejador]) => ({
  metodo,
  manejador,
  claves: [...patron.matchAll(/:(\w+)/g)].map((m) => m[1]),
  regex: new RegExp(`^${patron.replace(/:\w+/g, '([^/]+)')}$`),
}));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function resolverDemo(metodo, rutaCompleta, cuerpo, { silencioso = false } = {}) {
  const [ruta, cadenaQuery = ''] = rutaCompleta.split('?');
  const query = Object.fromEntries(new URLSearchParams(cadenaQuery));
  const ruta_ = RUTAS.find((r) => r.metodo === metodo && r.regex.test(ruta));
  if (!ruta_) {
    if (silencioso) return undefined;
    throw new ErrorApi(404, `Sin datos de ejemplo para ${metodo} ${ruta}`);
  }
  const valores = ruta.match(ruta_.regex).slice(1).map(decodeURIComponent);
  const params = Object.fromEntries(ruta_.claves.map((k, i) => [k, valores[i]]));
  await esperar(150);
  return structuredClone(await ruta_.manejador(params, cuerpo ?? {}, query));
}
