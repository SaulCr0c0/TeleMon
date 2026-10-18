import { ErrorApi } from '../errores';
import { MONITORES, NODOS, nuevoId } from './datos';

const normalizar = (codigo = '') => {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpio.length === 8 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
};

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
      const monitor = MONITORES.find((m) => m.codigo === normalizar(codigo));
      if (!monitor) throw new ErrorApi(404, 'Código no válido. Revisa la etiqueta del monitor.');
      if (monitor.estado === 'en_uso') throw new ErrorApi(409, 'Este código ya está en uso.');
      if (monitor.estado !== 'reservado' || monitor.clienteId !== 1) {
        throw new ErrorApi(403, 'Este código no está disponible para tu cuenta.');
      }
      const nodo = {
        id: nuevoId(),
        ubicacionId: Number(id),
        nombre: nombre.trim() || 'Nuevo nodo',
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
