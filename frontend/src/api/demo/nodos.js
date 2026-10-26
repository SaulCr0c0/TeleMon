import { ErrorApi } from '../errores';
import { normalizarCodigo } from '../../utils/validacion';
import { MONITORES, NODOS, nuevoId } from './datos';

export default [
  [
    'GET',
    '/api/ubicaciones/:id/dispositivos',
    ({ id }) => ({
      nodos: NODOS.filter((n) => n.ubicacionId === Number(id)),
      reservadosSinActivar: MONITORES.filter((m) => m.estado === 'reservado' && m.clienteId === 1)
        .length,
    }),
  ],
  [
    'POST',
    '/api/ubicaciones/:id/dispositivos',
    ({ id }, { codigo, nombre = '' }) => {
      const normalizado = normalizarCodigo(codigo);
      if (!normalizado) {
        throw new ErrorApi(400, 'Código no válido. Revisa la etiqueta del monitor.');
      }
      if (typeof nombre !== 'string' || !nombre.trim()) {
        throw new ErrorApi(400, 'Escribe el nombre del nodo.');
      }
      const monitor = MONITORES.find((m) => m.codigo === normalizado);
      if (!monitor) throw new ErrorApi(404, 'Código no válido. Revisa la etiqueta del monitor.');
      if (monitor.estado === 'en_uso') throw new ErrorApi(409, 'Este código ya está en uso.');
      if (monitor.estado !== 'reservado' || monitor.clienteId !== 1) {
        throw new ErrorApi(403, 'Este código no está disponible para tu cuenta.');
      }
      const nodo = {
        id: nuevoId(),
        ubicacionId: Number(id),
        nombre: nombre.trim(),
        estado: 'en_uso',
        conectado: false,
        esperando: true,
      };
      monitor.estado = 'en_uso';
      monitor.nodo = nodo.nombre;
      NODOS.push(nodo);
      return nodo;
    },
  ],
  [
    'PATCH',
    '/api/dispositivos/:id',
    ({ id }, cambios) => {
      const nodo = NODOS.find((n) => n.id === Number(id));
      if (!nodo) throw new ErrorApi(404, 'Nodo no encontrado.');
      Object.assign(nodo, cambios);
      return nodo;
    },
  ],
];
