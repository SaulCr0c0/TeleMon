export const NIVELES_AIRE = {
  bueno: 'Bueno',
  moderado: 'Moderado',
  malo: 'Malo',
  sin_calibrar: 'sin calibrar',
};

export function nivelAire(rsR0) {
  if (rsR0 == null || Number.isNaN(rsR0)) return 'sin_calibrar';
  if (rsR0 >= 0.8) return 'bueno';
  if (rsR0 >= 0.5) return 'moderado';
  return 'malo';
}

export function numero(valor, decimales = 1) {
  if (valor == null || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toFixed(decimales);
}

export function conUnidad(valor, unidad, decimales = 1) {
  const texto = numero(valor, decimales);
  return texto === '—' ? texto : `${texto} ${unidad}`;
}

export function hora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
  return `${fecha} ${hora(iso)}`;
}

export function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function duracion(desdeIso, hastaIso = new Date().toISOString()) {
  const minutos = Math.max(0, Math.round((new Date(hastaIso) - new Date(desdeIso)) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h < 24) return `${h} h ${String(m).padStart(2, '0')} min`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 día' : `${d} días`;
}

export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((ahora - new Date(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

export function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}
