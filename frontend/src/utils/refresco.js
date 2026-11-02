export const REFRESCOS = [
  { valor: 'vivo', texto: 'En vivo', largo: 'En vivo' },
  { valor: '10', texto: '10 s', largo: '10 segundos' },
  { valor: '30', texto: '30 s', largo: '30 segundos' },
  { valor: '60', texto: '60 s', largo: '1 minuto' },
];

const CLAVE_REFRESCO = 'telemon.refresco';

export function leerRefresco() {
  try {
    const valor = localStorage.getItem(CLAVE_REFRESCO);
    return REFRESCOS.some((r) => r.valor === valor) ? valor : 'vivo';
  } catch {
    return 'vivo';
  }
}

export function guardarRefresco(valor) {
  try {
    localStorage.setItem(CLAVE_REFRESCO, valor);
  } catch {
    return;
  }
}
