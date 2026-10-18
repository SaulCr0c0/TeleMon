import { NODOS, haceSegundos } from './datos';

export default [
  [
    'GET',
    '/api/ubicaciones/:id/ultimas',
    ({ id }) =>
      NODOS.filter((n) => n.ubicacionId === Number(id) && n.estado === 'en_uso').map((n) => ({
        dispositivoId: n.id,
        nombre: n.nombre,
        conectado: n.conectado,
        fecha: haceSegundos(n.conectado ? 2 : (n.minutosSinDatos ?? 0) * 60),
        temperatura: n.temperatura ?? null,
        humedad: n.humedad ?? null,
        presion: n.presion ?? null,
        rsR0: n.rsR0 ?? null,
        nivelAire: n.nivelAire ?? null,
      })),
  ],
];
