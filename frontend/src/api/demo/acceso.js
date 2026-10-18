import { ErrorApi } from '../errores';
import { USUARIOS, nuevoId } from './datos';

export default [
  [
    'POST',
    '/api/login',
    (_p, { email = '', clave = '' }) => {
      const cuenta = USUARIOS.find((u) => u.email === email.trim().toLowerCase());
      if (!cuenta || cuenta.clave !== clave) {
        throw new ErrorApi(401, 'Correo o contraseña incorrectos.');
      }
      return { token: `demo-${cuenta.usuario.id}`, usuario: cuenta.usuario };
    },
  ],
  [
    'POST',
    '/api/registro',
    (_p, { organizacion, nombre, email = '', clave }) => {
      const correo = email.trim().toLowerCase();
      if (USUARIOS.some((u) => u.email === correo)) {
        throw new ErrorApi(409, 'Ya existe una cuenta con ese correo. Inicia sesión.');
      }
      const usuario = {
        id: nuevoId(),
        nombre,
        organizacion,
        rol: 'cliente',
        debeCambiarClave: false,
        monitores: 0,
        monitoresReservados: 0,
      };
      USUARIOS.push({ email: correo, clave, usuario });
      return { token: `demo-${usuario.id}`, usuario };
    },
  ],
  ['POST', '/api/logout', () => ({ ok: true })],
];
