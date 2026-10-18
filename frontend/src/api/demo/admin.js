import { ErrorApi } from '../errores';
import {
  CLIENTES,
  EVENTOS_MONITOR,
  MONITORES,
  UBICACIONES,
  claveTemporal,
  codigoAleatorio,
  nuevoId,
} from './datos';

const buscarCliente = (id) => {
  const c = CLIENTES.find((x) => x.id === Number(id));
  if (!c) throw new ErrorApi(404, 'Cliente no encontrado.');
  return c;
};

const buscarMonitor = (id) => {
  const m = MONITORES.find((x) => x.id === Number(id));
  if (!m) throw new ErrorApi(404, 'Monitor no encontrado.');
  return m;
};

const evento = (m, texto) => {
  EVENTOS_MONITOR[m.id] = [
    { fecha: new Date().toISOString(), texto },
    ...(EVENTOS_MONITOR[m.id] ?? []),
  ];
};

export default [
  ['GET', '/api/admin/clientes', () => CLIENTES],
  [
    'POST',
    '/api/admin/clientes',
    (_p, { organizacion, nombre, email = '' }) => {
      const correo = email.trim().toLowerCase();
      if (CLIENTES.some((c) => c.email === correo))
        throw new ErrorApi(409, 'Ya existe una cuenta con ese correo.');
      const c = {
        id: nuevoId(),
        organizacion,
        nombre,
        email: correo,
        origen: 'admin',
        estado: 'sin_monitores',
        ubicaciones: 0,
        monitores: 0,
        desde: new Date().toISOString().slice(0, 10),
        ultimoIngreso: null,
      };
      CLIENTES.unshift(c);
      return { cliente: c, claveTemporal: claveTemporal() };
    },
  ],
  [
    'GET',
    '/api/admin/clientes/:id',
    ({ id }) => {
      const c = buscarCliente(id);
      return {
        ...c,
        listaUbicaciones:
          c.id === 1
            ? UBICACIONES.slice(0, 2).map((u) => ({ ...u, nodos: u.id === 1 ? 3 : 0 }))
            : [],
        listaMonitores: MONITORES.filter((m) => m.clienteId === c.id),
      };
    },
  ],
  [
    'PATCH',
    '/api/admin/clientes/:id',
    ({ id }, cambios) => Object.assign(buscarCliente(id), cambios),
  ],
  [
    'POST',
    '/api/admin/clientes/:id/restablecer-clave',
    ({ id }) => (buscarCliente(id), { claveTemporal: claveTemporal() }),
  ],
  [
    'GET',
    '/api/admin/dispositivos',
    (_p, _c, { estado = 'todos' }) =>
      MONITORES.filter((m) => estado === 'todos' || m.estado === estado),
  ],
  [
    'POST',
    '/api/admin/dispositivos',
    (_p, { mac = '', clienteId = null }) => {
      const limpia = mac.trim().toUpperCase();
      if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(limpia))
        throw new ErrorApi(400, 'La MAC debe tener el formato AA:BB:CC:DD:EE:FF.');
      if (MONITORES.some((m) => m.mac === limpia))
        throw new ErrorApi(409, 'Esa MAC ya está registrada.');
      const cliente = clienteId ? buscarCliente(clienteId) : null;
      const m = {
        id: nuevoId(),
        mac: limpia,
        codigo: codigoAleatorio(),
        estado: cliente ? 'reservado' : 'disponible',
        clienteId: cliente?.id ?? null,
        cliente: cliente?.organizacion ?? null,
        ubicacion: null,
        nodo: null,
        conexion: 'nunca',
        ultimaLectura: null,
        r0: null,
        notas: '',
      };
      MONITORES.unshift(m);
      evento(m, `Registrado con el código ${m.codigo}`);
      if (cliente) evento(m, `Reservado para ${cliente.organizacion}`);
      return m;
    },
  ],
  [
    'GET',
    '/api/admin/dispositivos/:id',
    ({ id }) => {
      const m = buscarMonitor(id);
      return {
        ...m,
        tecnico:
          m.conexion === 'en_linea'
            ? { latenciaMs: 84, ntp: true, rssi: -58, fw: '1.1.0' }
            : {
                latenciaMs: null,
                ntp: false,
                rssi: null,
                fw: m.conexion === 'nunca' ? null : '1.1.0',
              },
        sensores: [
          {
            nombre: 'DS18B20',
            rol: 'Temperatura',
            estado: m.conexion !== 'en_linea' ? 'sin_datos' : 'responde',
          },
          {
            nombre: 'DHT11',
            rol: 'Humedad',
            estado: m.conexion !== 'en_linea' ? 'sin_datos' : 'responde',
          },
          {
            nombre: 'BMP280',
            rol: 'Presión',
            estado: m.conexion !== 'en_linea' ? 'sin_datos' : 'responde',
          },
          {
            nombre: 'MQ-135',
            rol: 'Calidad del aire',
            estado: m.conexion !== 'en_linea' ? 'sin_datos' : m.r0 ? 'responde' : 'sin_calibrar',
          },
        ],
        eventos: EVENTOS_MONITOR[m.id] ?? [],
      };
    },
  ],
  [
    'PATCH',
    '/api/admin/dispositivos/:id',
    ({ id }, cambios) => {
      const m = buscarMonitor(id);
      if ('r0' in cambios && !(Number(cambios.r0) > 0))
        throw new ErrorApi(400, 'R0 debe ser un número mayor que 0.');
      if ('clienteId' in cambios) {
        const c = cambios.clienteId ? buscarCliente(cambios.clienteId) : null;
        Object.assign(m, {
          clienteId: c?.id ?? null,
          cliente: c?.organizacion ?? null,
          estado: c ? 'reservado' : 'disponible',
        });
        evento(m, c ? `Reservado para ${c.organizacion}` : 'Reserva quitada');
        delete cambios.clienteId;
      }
      if ('r0' in cambios) {
        cambios.r0 = Number(cambios.r0);
        evento(m, `R0 del MQ-135 cargado: ${cambios.r0} kΩ`);
      }
      return Object.assign(m, cambios);
    },
  ],
  [
    'POST',
    '/api/admin/dispositivos/:id/liberar',
    ({ id }) => {
      const m = buscarMonitor(id);
      Object.assign(m, {
        estado: 'disponible',
        clienteId: null,
        cliente: null,
        ubicacion: null,
        nodo: null,
        codigo: codigoAleatorio(),
      });
      evento(m, `Liberado. Código nuevo ${m.codigo}`);
      return m;
    },
  ],
  [
    'POST',
    '/api/admin/dispositivos/:id/retirar',
    ({ id }) => {
      const m = buscarMonitor(id);
      Object.assign(m, {
        estado: 'retirado',
        clienteId: null,
        cliente: null,
        ubicacion: null,
        nodo: null,
      });
      evento(m, 'Retirado. Código anulado');
      return m;
    },
  ],
];
