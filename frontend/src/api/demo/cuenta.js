import { ErrorApi } from '../errores';

const CUENTA = {
  organizacion: 'Red Escolar Valle Alto',
  nombre: 'Ana Rojas',
  email: 'direccion@redvallealto.edu.bo',
  origen: 'registro',
  creadaEn: '2026-10-12T14:00:00Z',
};

export default [
  ['GET', '/api/cuenta', () => CUENTA],
  [
    'PATCH',
    '/api/cuenta',
    (_p, { organizacion, nombre }) => Object.assign(CUENTA, { organizacion, nombre }),
  ],
  [
    'POST',
    '/api/clave',
    (_p, { actual, nueva = '' }) => {
      if (actual !== undefined && actual === '')
        throw new ErrorApi(400, 'Escribe tu contraseña actual.');
      if (nueva.length < 8)
        throw new ErrorApi(400, 'La contraseña debe tener al menos 8 caracteres.');
      return { ok: true };
    },
  ],
];
