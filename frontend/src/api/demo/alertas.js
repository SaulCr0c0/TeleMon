import { ALERTAS } from './datos';

export default [
  [
    'GET',
    '/api/ubicaciones/:id/alertas',
    ({ id }, _c, { estado = 'abiertas' }) =>
      ALERTAS.filter(
        (a) =>
          a.ubicacionId === Number(id) && (estado === 'abiertas' ? !a.cerradaEn : !!a.cerradaEn),
      ),
  ],
];
