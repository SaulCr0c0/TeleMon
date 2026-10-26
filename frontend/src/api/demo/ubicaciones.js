import { ErrorApi } from '../errores';
import { ALERTAS, NODOS, UBICACIONES, UMBRALES, nuevoId } from './datos';

function resumen(u) {
  const nodos = NODOS.filter((n) => n.ubicacionId === u.id && n.estado === 'en_uso');
  return {
    ...u,
    nodos: { total: nodos.length, enLinea: nodos.filter((n) => n.conectado).length },
    alertasActivas: ALERTAS.filter((a) => a.ubicacionId === u.id && !a.cerradaEn).length,
  };
}

function buscar(id) {
  const u = UBICACIONES.find((x) => x.id === Number(id));
  if (!u) throw new ErrorApi(404, 'Ubicación no encontrada.');
  return u;
}

function validarNombre(nombre) {
  if (typeof nombre !== 'string' || !nombre.trim()) {
    throw new ErrorApi(400, 'Escribe el nombre de cada ubicación.');
  }
  return nombre.trim();
}

export default [
  ['GET', '/api/ubicaciones', () => UBICACIONES.filter((u) => !u.archivada).map(resumen)],
  ['GET', '/api/ubicaciones/:id', ({ id }) => resumen(buscar(id))],
  [
    'POST',
    '/api/ubicaciones',
    (_p, { localidad = '', nombre = '' }) => {
      const nombreValido = validarNombre(nombre);
      const u = {
        id: nuevoId(),
        localidad: localidad.trim(),
        nombre: nombreValido,
        archivada: false,
      };
      UBICACIONES.push(u);
      UMBRALES[u.id] = structuredClone(UMBRALES[1]);
      return resumen(u);
    },
  ],
  [
    'PATCH',
    '/api/ubicaciones/:id',
    ({ id }, cambios) => {
      const u = buscar(id);
      const normalizados = { ...cambios };
      if (Object.hasOwn(cambios, 'nombre')) {
        normalizados.nombre = validarNombre(cambios.nombre);
      }
      Object.assign(u, normalizados);
      return resumen(u);
    },
  ],
];
