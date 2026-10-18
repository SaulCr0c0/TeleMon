import { useCallback, useEffect, useMemo, useState } from 'react';
import { alSesionVencida, api, guardarToken } from '../api/cliente';
import { SesionContext } from './contexto';

const CLAVE_USUARIO = 'telemon.usuario';

function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_USUARIO)) ?? null;
  } catch {
    return null;
  }
}

function guardarUsuario(usuario) {
  try {
    if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    else localStorage.removeItem(CLAVE_USUARIO);
  } catch {
    return;
  }
}

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(leerUsuario);

  const abrir = useCallback(({ token, usuario: nuevo }) => {
    guardarToken(token);
    guardarUsuario(nuevo);
    setUsuario(nuevo);
    return nuevo;
  }, []);

  const iniciar = useCallback(
    async (email, clave) => abrir(await api.post('/api/login', { email, clave })),
    [abrir],
  );

  const registrar = useCallback(
    async (datos) => abrir(await api.post('/api/registro', datos)),
    [abrir],
  );

  const actualizar = useCallback((cambios) => {
    setUsuario((actual) => {
      const nuevo = { ...actual, ...cambios };
      guardarUsuario(nuevo);
      return nuevo;
    });
  }, []);

  const cerrar = useCallback(() => {
    api.post('/api/logout').catch(() => {});
    guardarToken(null);
    guardarUsuario(null);
    setUsuario(null);
  }, []);

  useEffect(
    () =>
      alSesionVencida(() => {
        guardarToken(null);
        guardarUsuario(null);
        setUsuario(null);
      }),
    [],
  );

  const valor = useMemo(
    () => ({ usuario, iniciar, registrar, actualizar, cerrar }),
    [usuario, iniciar, registrar, actualizar, cerrar],
  );
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}
