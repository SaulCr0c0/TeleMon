export const esCorreo = (texto = '') => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto.trim());

export function reglasClave(clave = '', repetida = '') {
  return [
    { texto: 'Al menos 8 caracteres', cumple: clave.length >= 8 },
    { texto: 'Letras y números', cumple: /[A-Za-z]/.test(clave) && /[0-9]/.test(clave) },
    { texto: 'Las dos contraseñas coinciden', cumple: clave.length > 0 && clave === repetida },
  ];
}

export const claveValida = (clave, repetida) => reglasClave(clave, repetida).every((r) => r.cumple);

export function normalizarMac(texto = '') {
  const hex = texto.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

export function normalizarCodigo(texto = '') {
  if (typeof texto !== 'string') return null;
  const limpio = texto.toUpperCase().replace(/[-\s]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(limpio)) return null;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

export function rangoValido(min, max) {
  const a = parseFloat(min);
  const b = parseFloat(max);
  return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
}

export const r0Valido = (texto = '') =>
  /^\d+([.,]\d+)?$/.test(String(texto).trim()) && parseFloat(String(texto).replace(',', '.')) > 0;
