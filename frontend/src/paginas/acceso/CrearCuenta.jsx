import { useState } from 'react';
import BarraRuta from '../../componentes/layout/BarraRuta';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import { useSesion } from '../../sesion/useSesion';
import { esCorreo } from '../../utils/validacion';
import estilos from './CrearCuenta.module.css';

const VACIO = { organizacion: '', nombre: '', email: '', clave: '', terminos: false };

function validar(f) {
  if (!f.organizacion.trim() || !f.nombre.trim()) return 'Completa la organización y tu nombre.';
  if (!esCorreo(f.email)) return 'El correo no es válido.';
  if (f.clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!f.terminos) return 'Debes aceptar los términos para continuar.';
  return '';
}

export default function CrearCuenta() {
  const { registrar } = useSesion();
  const [form, setForm] = useState(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState(false);

  const cambiar = (campo) => (e) =>
    setForm((f) => ({
      ...f,
      [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const claveOk = form.clave.length >= 8;
  const ayudaClave =
    form.clave.length === 0 ? (
      'Mínimo 8 caracteres.'
    ) : claveOk ? (
      <span className={estilos.ok}>Contraseña válida.</span>
    ) : (
      `Faltan ${8 - form.clave.length} caracteres.`
    );

  async function enviar(evento) {
    evento.preventDefault();
    setIntentado(true);
    const problema = validar(form);
    setError(problema);
    if (problema) return;
    setEnviando(true);
    try {
      await registrar({
        organizacion: form.organizacion.trim(),
        nombre: form.nombre.trim(),
        email: form.email.trim().toLowerCase(),
        clave: form.clave,
      });
      setCreada(true);
    } catch (e) {
      setError(
        e.estado === 409
          ? 'Ya existe una cuenta con ese correo. Inicia sesión.'
          : 'No se pudo crear la cuenta. Intenta de nuevo.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <BarraRuta
        volver={{ a: '/login', texto: 'Volver a iniciar sesión' }}
        migas={[{ a: '/login', texto: 'Iniciar sesión' }, { texto: 'Crear cuenta' }]}
      />

      <form className={estilos.tarjeta} onSubmit={enviar} noValidate>
        <div>
          <h1 className={estilos.titulo}>Crear cuenta</h1>
          <p className={estilos.subtitulo}>Regístrate para contratar el servicio de monitoreo.</p>
        </div>

        {creada ? (
          <div role="status" className={estilos.listo}>
            <p className={estilos.listoTitulo}>Cuenta creada</p>
            <p className={estilos.listoTexto}>
              Ya puedes entrar con <strong>{form.email.trim().toLowerCase()}</strong>. Cuando
              contrates el servicio, da este correo al proveedor para que te reserve tus monitores.
            </p>
            <Boton a="/bienvenida" variante="primario" tamano="grande" bloque>
              Entrar
            </Boton>
          </div>
        ) : (
          <>
            <Campo
              etiqueta="Organización"
              placeholder="Ej. Red de escuelas"
              autoComplete="organization"
              value={form.organizacion}
              invalido={intentado && !form.organizacion.trim()}
              onChange={cambiar('organizacion')}
            />
            <Campo
              etiqueta="Tu nombre"
              placeholder="Nombre y apellido"
              autoComplete="name"
              value={form.nombre}
              invalido={intentado && !form.nombre.trim()}
              onChange={cambiar('nombre')}
            />
            <Campo
              etiqueta="Correo electrónico"
              type="email"
              placeholder="nombre@correo.com"
              autoComplete="email"
              value={form.email}
              ayuda="Con este correo el proveedor te asigna tus monitores."
              invalido={intentado && !esCorreo(form.email)}
              onChange={cambiar('email')}
            />
            <Campo
              etiqueta="Contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              value={form.clave}
              ayuda={ayudaClave}
              invalido={intentado && !claveOk}
              onChange={cambiar('clave')}
            />

            <label className={estilos.terminos}>
              <input type="checkbox" checked={form.terminos} onChange={cambiar('terminos')} />
              Acepto los términos del servicio.
            </label>

            {error && <Aviso tipo="error">{error}</Aviso>}

            <Boton
              type="submit"
              variante="primario"
              tamano="grande"
              bloque
              deshabilitado={enviando}
            >
              {enviando ? 'Creando…' : 'Crear cuenta'}
            </Boton>
          </>
        )}
      </form>
    </>
  );
}
