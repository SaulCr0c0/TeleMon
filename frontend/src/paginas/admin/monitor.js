import { haceCuanto } from '../../utils/formato';

export const ESTADOS_MONITOR = {
  disponible: { texto: 'Disponible', tipo: 'neutro' },
  reservado: { texto: 'Reservado', tipo: 'aviso' },
  en_uso: { texto: 'En uso', tipo: 'ok' },
  desactivado: { texto: 'Desactivado', tipo: 'cuadro' },
  retirado: { texto: 'Retirado', tipo: 'romboVacio' },
};

export function conexionMonitor(m) {
  if (m.conexion === 'en_linea')
    return { tipo: 'ok', texto: `En línea · ${haceCuanto(m.ultimaLectura)}` };
  if (m.conexion === 'sin_conexion')
    return { tipo: 'neutro', texto: `Sin conexión · ${haceCuanto(m.ultimaLectura)}` };
  return { tipo: 'sinMarca', texto: 'Nunca se conectó' };
}
