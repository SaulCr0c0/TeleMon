import { useEffect, useRef, useState } from 'react';
import { MODO_DEMO } from '../api/cliente';

const ESPERA_MAX_MS = 15000;

function simular(alMensaje) {
  const id = setInterval(() => {
    alMensaje({ tipo: 'lectura', demo: true, fecha: new Date().toISOString() });
  }, 5000);
  return () => clearInterval(id);
}

export default function useTiempoReal(ubicacionId, alMensaje) {
  const [conectado, setConectado] = useState(false);
  const manejador = useRef(alMensaje);
  manejador.current = alMensaje;

  useEffect(() => {
    if (!ubicacionId) return undefined;
    if (MODO_DEMO) {
      setConectado(true);
      return simular((m) => manejador.current?.(m));
    }

    let socket;
    let temporizador;
    let intentos = 0;
    let cerrado = false;

    const conectar = () => {
      const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocolo}://${window.location.host}/ws/lecturas`);
      socket.onopen = () => {
        intentos = 0;
        setConectado(true);
      };
      socket.onmessage = (evento) => {
        let dato;
        try {
          dato = JSON.parse(evento.data);
        } catch {
          return;
        }
        if (!dato || typeof dato.tipo !== 'string') return;
        if (String(dato.ubicacionId) !== String(ubicacionId)) return;
        manejador.current?.(dato);
      };
      socket.onclose = () => {
        setConectado(false);
        if (cerrado) return;
        const espera = Math.min(ESPERA_MAX_MS, 1000 * 2 ** intentos);
        intentos += 1;
        temporizador = setTimeout(conectar, espera);
      };
    };

    conectar();
    return () => {
      cerrado = true;
      clearTimeout(temporizador);
      socket?.close();
    };
  }, [ubicacionId]);

  return { conectado };
}
