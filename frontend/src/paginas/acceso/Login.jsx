import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MODO_DEMO } from '../../api/cliente';
import Logo from '../../componentes/layout/Logo';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import { rutaInicio } from '../../sesion/rutas';
import { useSesion } from '../../sesion/useSesion';
import estilos from './Login.module.css';

const CUENTAS_DEMO = [
  { texto: 'Entrar como administrador', email: 'admin@telemon.bo', clave: 'admin1234' },
  {
    texto: 'Entrar con una cuenta sin monitores',
    email: 'nuevo@coopsanpedro.bo',
    clave: 'telemon123',
  },
  {
    texto: 'Entrar con contraseña temporal',
    email: 'temporal@viveroandes.com',
    clave: 'temporal1',
  },
];

export default function Login() {
  const { iniciar } = useSesion();
  const navegar = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(correo, contrasena) {
    setError('');
    setEnviando(true);
    try {
      const usuario = await iniciar(correo, contrasena);
      const destino = state?.desde && !usuario.debeCambiarClave ? state.desde : rutaInicio(usuario);
      navegar(destino, { replace: true });
    } catch (e) {
      setError(
        e.estado === 401
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Intenta de nuevo.',
      );
      setEnviando(false);
    }
  }

  function alEnviar(evento) {
    evento.preventDefault();
    if (!email.trim() || !clave) {
      setError('Escribe tu correo y tu contraseña.');
      return;
    }
    entrar(email, clave);
  }

  return (
    <div className={estilos.marco}>
      <section className={estilos.marca}>
        <Logo />
        <div className={estilos.lema}>
          <h2 className={estilos.titular}>Tu ambiente, siempre a la vista.</h2>
          <p className={estilos.bajada}>
            Monitoreo ambiental en tiempo real para cada una de tus ubicaciones.
          </p>
        </div>
        <p className={estilos.pie}>Servicios telemáticos · UMSS</p>
      </section>

      <section className={estilos.lado}>
        <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
          <div>
            <h1 className={estilos.titulo}>Iniciar sesión</h1>
            <p className={estilos.subtitulo}>Ingresa con la cuenta de tu servicio.</p>
          </div>

          <Campo
            etiqueta="Correo electrónico"
            className={estilos.campo}
            type="email"
            placeholder="nombre@correo.com"
            autoComplete="email"
            value={email}
            invalido={Boolean(error)}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Campo
            etiqueta="Contraseña"
            className={estilos.campo}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={clave}
            invalido={Boolean(error)}
            onChange={(e) => setClave(e.target.value)}
          />

          {error && <Aviso tipo="error">{error}</Aviso>}

          <Boton type="submit" variante="primario" tamano="grande" bloque deshabilitado={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>

          <div className={estilos.ayudas}>
            <span>
              ¿Aún no tienes cuenta?{' '}
              <Link to="/crear-cuenta" className={estilos.enlaceFuerte}>
                Crear cuenta
              </Link>
            </span>
            <span>¿Olvidaste tu contraseña? Pide a tu proveedor que la restablezca.</span>
          </div>

          {MODO_DEMO && (
            <div className={estilos.demo}>
              <span className={estilos.demoTitulo}>Solo en el prototipo</span>
              {CUENTAS_DEMO.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  className={estilos.demoEnlace}
                  onClick={() => entrar(c.email, c.clave)}
                >
                  {c.texto}
                </button>
              ))}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
