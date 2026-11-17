// Cortes de Rs/R0 que separan los niveles de calidad del aire de un nodo.
// Si nadie los cambia, el nodo usa estos valores por defecto.
export const CORTES_POR_DEFECTO = { bueno: 0.8, moderado: 0.5 };

export function cortesDe(nodo) {
  const c = nodo?.cortesAire;
  if (!c || c.porDefecto) return { ...CORTES_POR_DEFECTO, porDefecto: true };
  return { bueno: c.bueno, moderado: c.moderado, porDefecto: false };
}

export function textoCortes(c) {
  const fijo = (x) => Number(x).toFixed(2);
  return `bueno ≥ ${fijo(c.bueno)} · moderado ≥ ${fijo(c.moderado)}${c.porDefecto ? ' (por defecto)' : ''}`;
}

// Textos de los campos del formulario: vacíos cuando el nodo usa los valores por defecto.
export function camposCortes(nodo) {
  const c = cortesDe(nodo);
  return c.porDefecto
    ? { aireBueno: '', aireModerado: '' }
    : { aireBueno: String(c.bueno), aireModerado: String(c.moderado) };
}

// Convierte los campos en el valor que espera la API: null = valores por defecto.
export function leerCortes(bueno, moderado) {
  const b = String(bueno ?? '')
    .trim()
    .replace(',', '.');
  const m = String(moderado ?? '')
    .trim()
    .replace(',', '.');
  if (!b && !m) return { cortes: null };
  if (!b || !m)
    return { error: 'Completa los dos cortes de la calidad del aire o deja ambos vacíos.' };
  const nb = Number(b);
  const nm = Number(m);
  const valido = (x) => Number.isFinite(x) && x > 0 && x <= 10;
  if (!valido(nb) || !valido(nm)) {
    return {
      error: 'Los cortes de la calidad del aire deben ser números mayores que 0 y hasta 10.',
    };
  }
  const redondo = (x) => Math.round(x * 100) / 100;
  if (redondo(nm) >= redondo(nb)) {
    return { error: 'El corte de «moderado» debe ser menor que el de «bueno».' };
  }
  return { cortes: { bueno: redondo(nb), moderado: redondo(nm) } };
}

export const mismosCortes = (a, b) =>
  (a === null && b === null) ||
  (a !== null && b !== null && a.bueno === b.bueno && a.moderado === b.moderado);
