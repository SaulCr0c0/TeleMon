import { resolverDemo } from './demo';
import { ErrorApi } from './errores';

export { ErrorApi };

export const MODO_DEMO = import.meta.env.VITE_MODO_DEMO !== 'false';

const CLAVE_TOKEN = 'telemon.token';

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    return;
  }
}

function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

const oyentes401 = new Set();
export function alSesionVencida(fn) {
  oyentes401.add(fn);
  return () => oyentes401.delete(fn);
}

async function pedir(metodo, ruta, cuerpo) {
  if (MODO_DEMO) return resolverDemo(metodo, ruta, cuerpo);

  const token = leerToken();
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  const esRutaDeNodos = /^\/api\/ubicaciones\/[^/]+\/dispositivos(?:\?|$)/.test(ruta);
  if (respuesta.status === 404 && !esRutaDeNodos) {
    const demo = await resolverDemo(metodo, ruta, cuerpo, { silencioso: true });
    if (demo !== undefined) return demo;
  }

  const texto = await respuesta.text();
  let datos = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = { mensaje: texto };
    }
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401) oyentes401.forEach((fn) => fn());
    throw new ErrorApi(respuesta.status, datos?.mensaje ?? `Error ${respuesta.status}`, datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
  delete: (ruta) => pedir('DELETE', ruta),
};
