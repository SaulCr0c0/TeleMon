import { UMBRALES } from './datos';

export default [
  ['GET', '/api/ubicaciones/:id/umbrales', ({ id }) => UMBRALES[id]],
  [
    'PUT',
    '/api/ubicaciones/:id/umbrales',
    ({ id }, valores) => {
      UMBRALES[id] = { ...UMBRALES[id], ...valores, actualizadoEn: new Date().toISOString() };
      return UMBRALES[id];
    },
  ],
];
