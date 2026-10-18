export function rutaInicio(usuario) {
  if (!usuario) return '/login';
  if (usuario.rol === 'admin') return '/admin/clientes';
  if (usuario.debeCambiarClave) return '/crear-clave';
  if (!usuario.monitores) return '/bienvenida';
  return '/ubicaciones';
}
