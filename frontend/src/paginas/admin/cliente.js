export const ESTADOS_CLIENTE = {
  activa: { texto: 'Activa', tipo: 'ok' },
  sin_monitores: { texto: 'Sin monitores', tipo: 'aviso' },
  suspendida: { texto: 'Suspendida', tipo: 'error' },
};

export const ORIGENES = {
  registro: 'Registro propio',
  admin: 'Creado por admin',
};

export function fechaCorta(aaaammdd) {
  if (!aaaammdd) return '—';
  const [a, m, d] = aaaammdd.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
