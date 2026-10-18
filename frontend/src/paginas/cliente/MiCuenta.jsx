import { useState } from 'react';
import { api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import ReglasClave from '../../componentes/ui/ReglasClave';
import useApi from '../../hooks/useApi';
import { useSesion } from '../../sesion/useSesion';
import { claveValida } from '../../utils/validacion';
import estilos from './MiCuenta.module.css';

const ORIGEN = { registro: 'Registro propio', admin: 'Creada por el proveedor' };

function FormularioDatos({ cuenta }) {
  const { actualizar } = useSesion();
  const [organizacion, setOrganizacion] = useState(cuenta.organizacion);
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento) {
    evento.preventDefault();
    setMensaje('');
    if (!organizacion.trim() || !nombre.trim()) {
      setError('Completa la organización y tu nombre.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      const datos = { organizacion: organizacion.trim(), nombre: nombre.trim() };
      await api.patch('/api/cuenta', datos);
      actualizar(datos);
      setMensaje('Datos guardados');
    } catch (e) {
      setError(e.message || 'No se pudieron guardar los datos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className={estilos.tarjeta} onSubmit={guardar} noValidate>
      <h2 className={estilos.subtitulo}>Datos</h2>
      <Campo
        etiqueta="Organización"
        autoComplete="organization"
        value={organizacion}
        invalido={Boolean(error) && !organizacion.trim()}
        onChange={(e) => {
          setOrganizacion(e.target.value);
          setMensaje('');
        }}
      />
      <Campo
        etiqueta="Tu nombre"
        autoComplete="name"
        value={nombre}
        invalido={Boolean(error) && !nombre.trim()}
        onChange={(e) => {
          setNombre(e.target.value);
          setMensaje('');
        }}
      />
      <Campo
        etiqueta="Correo electrónico"
        type="email"
        value={cuenta.email}
        readOnly
        className={estilos.soloLectura}
        ayuda="El correo no se puede cambiar desde aquí."
      />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className={estilos.acciones}>
        <Boton type="submit" variante="primario" deshabilitado={guardando}>
          Guardar datos
        </Boton>
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      </div>
    </form>
  );
}

function FormularioClave() {
  const [actual, setActual] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const lista = claveValida(clave, repetida) && actual.length > 0;

  const limpiarMensajes = () => {
    setMensaje('');
    setError('');
  };

  async function cambiar(evento) {
    evento.preventDefault();
    if (!lista) return;
    setGuardando(true);
    try {
      await api.post('/api/clave', { actual, nueva: clave });
      setActual('');
      setClave('');
      setRepetida('');
      setMensaje('Contraseña cambiada');
    } catch (e) {
      setError(
        e.estado === 401
          ? 'La contraseña actual no es correcta.'
          : e.message || 'No se pudo cambiar la contraseña.',
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className={estilos.tarjeta} onSubmit={cambiar} noValidate>
      <h2 className={estilos.subtitulo}>Cambiar contraseña</h2>
      <Campo
        etiqueta="Contraseña actual"
        type="password"
        autoComplete="current-password"
        value={actual}
        onChange={(e) => {
          setActual(e.target.value);
          limpiarMensajes();
        }}
      />
      <Campo
        etiqueta="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={clave}
        onChange={(e) => {
          setClave(e.target.value);
          limpiarMensajes();
        }}
      />
      <Campo
        etiqueta="Repite la contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={repetida}
        onChange={(e) => {
          setRepetida(e.target.value);
          limpiarMensajes();
        }}
      />
      <ReglasClave clave={clave} repetida={repetida} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className={estilos.acciones}>
        <Boton type="submit" variante="primario" deshabilitado={!lista || guardando}>
          Cambiar contraseña
        </Boton>
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      </div>
    </form>
  );
}

export default function MiCuenta() {
  const { datos: cuenta, error } = useApi('/api/cuenta');
  return (
    <div className={estilos.pagina}>
      <BarraRuta
        volver={{ a: '/ubicaciones', texto: 'Volver a Ubicaciones' }}
        migas={[{ a: '/ubicaciones', texto: 'Ubicaciones' }, { texto: 'Mi cuenta' }]}
      />
      <EncabezadoPagina titulo="Mi cuenta" subtitulo="Tus datos y tu contraseña." />

      {error && (
        <Aviso tipo="error">No se pudieron cargar los datos de tu cuenta. Recarga la página.</Aviso>
      )}
      {!cuenta && !error && <p className={estilos.cargando}>Cargando tu cuenta…</p>}

      {cuenta && (
        <>
          <FormularioDatos cuenta={cuenta} />
          <FormularioClave />
          <section className={estilos.info}>
            <h2 className={estilos.subtitulo}>Información de la cuenta</h2>
            <dl className={estilos.lista}>
              <dt>Estado</dt>
              <dd>Activa</dd>
              <dt>Alta</dt>
              <dd>{ORIGEN[cuenta.origen] ?? 'Registro propio'}</dd>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
