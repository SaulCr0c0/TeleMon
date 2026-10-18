import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/cliente';

export default function useApi(ruta) {
  const [estado, setEstado] = useState({ datos: null, cargando: Boolean(ruta), error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ruta) return undefined;
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    api
      .get(ruta)
      .then((datos) => vigente && setEstado({ datos, cargando: false, error: null }))
      .catch((error) => vigente && setEstado({ datos: null, cargando: false, error }));
    return () => {
      vigente = false;
    };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const reemplazar = useCallback((datos) => setEstado((e) => ({ ...e, datos })), []);

  return { ...estado, recargar, reemplazar };
}
