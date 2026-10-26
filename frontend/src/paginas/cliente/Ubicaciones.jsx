import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Icono from '../../componentes/ui/Icono';
import useApi from '../../hooks/useApi';
import estilos from './Ubicaciones.module.css';

function textoNodos({ total, enLinea }) {
  if (!total) return 'Sin nodos todavía';
  const cuantos = total === 1 ? '1 nodo' : `${total} nodos`;
  if (enLinea === total)
    return total === 1 ? `${cuantos} · en línea` : `${cuantos} · todos en línea`;
  return `${cuantos} · ${enLinea} en línea`;
}

function colorPunto(u) {
  if (u.alertasActivas > 0 || (u.nodos.total && u.nodos.enLinea < u.nodos.total))
    return estilos.puntoAviso;
  if (u.nodos.total) return estilos.puntoOk;
  return estilos.puntoVacio;
}

function TarjetaUbicacion({ u }) {
  return (
    <Link to={`/ubicaciones/${u.id}/panel`} className={estilos.tarjeta}>
      <div className={estilos.textos}>
        {u.localidad && <span className={estilos.localidad}>{u.localidad}</span>}
        <span className={estilos.nombre}>{u.nombre}</span>
        <span className={estilos.nodos}>
          <span className={`${estilos.punto} ${colorPunto(u)}`} aria-hidden="true" />
          {textoNodos(u.nodos)}
        </span>
        {u.alertasActivas > 0 && (
          <span className={estilos.alertas}>
            {u.alertasActivas === 1 ? '1 alerta activa' : `${u.alertasActivas} alertas activas`}
          </span>
        )}
      </div>
      <span className={estilos.flecha}>
        <Icono nombre="adelante" tamano={18} grosor={2.2} />
      </span>
    </Link>
  );
}

function TarjetaEdicion({ u, alCambiar }) {
  return (
    <div className={estilos.edicion}>
      <label className={estilos.campo}>
        Localidad
        <input
          className={estilos.control}
          type="text"
          value={u.localidad}
          placeholder="Ej. Punata"
          onChange={(e) => alCambiar({ localidad: e.target.value })}
        />
      </label>
      <label className={estilos.campo}>
        Nombre de la ubicación
        <input
          className={estilos.control}
          type="text"
          value={u.nombre}
          placeholder="Ej. Escuela Adela Zamudio"
          onChange={(e) => alCambiar({ nombre: e.target.value })}
        />
      </label>
      {!u.nueva && (
        <div className={estilos.archivo}>
          <span className={u.archivar ? estilos.archivoAviso : estilos.archivoNota}>
            {u.archivar
              ? 'Se archivará al guardar.'
              : 'Deja de aparecer; su historial se conserva.'}
          </span>
          <Boton
            onClick={() => alCambiar({ archivar: !u.archivar })}
            className={estilos.archivoBoton}
          >
            {u.archivar ? 'Deshacer' : 'Archivar'}
          </Boton>
        </div>
      )}
    </div>
  );
}

export default function Ubicaciones() {
  const { datos, cargando, error, reemplazar } = useApi('/api/ubicaciones');
  const [borrador, setBorrador] = useState(null);
  const [aviso, setAviso] = useState('');
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const editando = borrador !== null;

  function empezar() {
    setAviso('');
    setErrorGuardar('');
    setBorrador((datos ?? []).map((u) => ({ ...u, archivar: false })));
  }

  function cambiar(clave, cambios) {
    setBorrador((lista) =>
      lista.map((u) => (u.clave === clave || u.id === clave ? { ...u, ...cambios } : u)),
    );
  }

  function agregar() {
    const clave = `nueva-${Date.now()}`;
    setBorrador((lista) => [
      ...lista,
      {
        clave,
        nueva: true,
        localidad: '',
        nombre: '',
        nodos: { total: 0, enLinea: 0 },
        alertasActivas: 0,
      },
    ]);
  }

  async function guardar() {
    setGuardando(true);
    setErrorGuardar('');
    try {
      const cambios = borrador.map((u) => ({
        ...u,
        nombre: u.nombre.trim(),
        localidad: u.localidad.trim(),
      }));
      if (cambios.some((u) => !u.nombre)) {
        throw new Error('Escribe el nombre de cada ubicación.');
      }
      const originales = Object.fromEntries((datos ?? []).map((u) => [u.id, u]));
      const archivadas = [];
      for (const u of cambios) {
        const { nombre, localidad } = u;
        if (u.nueva) {
          await api.post('/api/ubicaciones', { localidad, nombre });
        } else if (u.archivar) {
          await api.patch(`/api/ubicaciones/${u.id}`, { archivada: true });
          archivadas.push(nombre);
        } else if (
          nombre !== originales[u.id].nombre ||
          localidad !== (originales[u.id].localidad ?? '')
        ) {
          await api.patch(`/api/ubicaciones/${u.id}`, { localidad, nombre });
        }
      }
      reemplazar(await api.get('/api/ubicaciones'));
      setAviso(
        archivadas.length
          ? `Ubicación archivada: ${archivadas.join(', ')}. Su historial se conserva.`
          : '',
      );
      setBorrador(null);
    } catch (e) {
      setErrorGuardar(e.message || 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  }

  const lista = editando ? borrador : (datos ?? []);

  return (
    <>
      <BarraRuta migas={[{ texto: 'Ubicaciones' }]} />

      <EncabezadoPagina
        titulo="Ubicaciones"
        subtitulo={
          editando
            ? 'Cambia los nombres o añade una ubicación nueva. Los cambios se aplican al guardar.'
            : 'Elige una ubicación para ver su panel y gestionar sus monitores.'
        }
      >
        {editando ? (
          <>
            <Boton onClick={() => setBorrador(null)} deshabilitado={guardando}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={guardar} deshabilitado={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
          </>
        ) : (
          <Boton icono="editar" onClick={empezar} deshabilitado={cargando || Boolean(error)}>
            Editar
          </Boton>
        )}
      </EncabezadoPagina>

      {aviso && !editando && <Aviso>{aviso}</Aviso>}
      {errorGuardar && <Aviso tipo="error">{errorGuardar}</Aviso>}
      {error && (
        <Aviso tipo="error">No se pudieron cargar tus ubicaciones. Recarga la página.</Aviso>
      )}
      {cargando && !datos && <p className={estilos.cargando}>Cargando ubicaciones…</p>}

      {!cargando && !error && !editando && lista.length === 0 && (
        <div className={estilos.vacia}>
          <span className={estilos.vaciaTitulo}>Todavía no tienes ubicaciones</span>
          <span>Crea la primera con «Editar» › «Añadir ubicación».</span>
        </div>
      )}

      <div className={estilos.rejilla}>
        {lista.map((u) =>
          editando ? (
            <TarjetaEdicion
              key={u.clave ?? u.id}
              u={u}
              alCambiar={(c) => cambiar(u.clave ?? u.id, c)}
            />
          ) : (
            <TarjetaUbicacion key={u.id} u={u} />
          ),
        )}
        {editando && (
          <button type="button" className={estilos.agregar} onClick={agregar}>
            <Icono nombre="mas" tamano={22} grosor={2} />
            Añadir ubicación
          </button>
        )}
      </div>
    </>
  );
}
