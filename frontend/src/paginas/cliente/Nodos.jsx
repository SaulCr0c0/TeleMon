import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { MODO_DEMO, api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Boton from '../../componentes/ui/Boton';
import Estado from '../../componentes/ui/Estado';
import Icono from '../../componentes/ui/Icono';
import useApi from '../../hooks/useApi';
import { normalizarCodigo } from '../../utils/validacion';
import estilos from './Nodos.module.css';

const SENSORES = [
  ['temperatura', 'Temperatura'],
  ['humedad', 'Humedad'],
  ['presion', 'Presión'],
  ['aire', 'Calidad del aire'],
];

const REFRESCOS = [
  ['5', '5 segundos'],
  ['10', '10 segundos'],
  ['30', '30 segundos'],
  ['60', '1 minuto'],
];

const CLAVE_REFRESCO = 'telemon.refresco';

function leerRefresco() {
  try {
    return localStorage.getItem(CLAVE_REFRESCO) ?? '5';
  } catch {
    return '5';
  }
}

function guardarRefresco(valor) {
  try {
    localStorage.setItem(CLAVE_REFRESCO, valor);
  } catch {
    return;
  }
}

const sinPresion = (n) => n.presion === null;
const sinCalibrar = (n) => n.rsR0 == null || n.nivelAire === 'sin_calibrar';

function estadoNodo(n) {
  if (n.estado === 'desactivado') return ['apagado', 'Desactivado'];
  if (n.esperando) return ['apagado', 'Esperando la primera lectura'];
  if (!n.conectado) return ['apagado', 'Sin conexión'];
  if (sinPresion(n)) return ['aviso', 'En línea · 1 sensor sin respuesta'];
  if (sinCalibrar(n)) return ['aviso', 'En línea · 1 sensor sin calibrar'];
  return ['ok', 'En línea'];
}

function estadoSensor(n, sensor) {
  if (n.estado === 'desactivado') return ['apagado', 'Desactivado'];
  if (n.esperando) return ['apagado', 'Sin datos todavía'];
  if (!n.conectado) return ['apagado', 'Sin conexión'];
  if (sensor === 'presion' && sinPresion(n)) return ['aviso', 'Sin respuesta'];
  if (sensor === 'aire' && sinCalibrar(n)) return ['aviso', 'Sin calibrar'];
  return ['ok', 'Funcionando'];
}

const enLinea = (n) => n.estado !== 'desactivado' && n.conectado && !n.esperando;

function TarjetaNodo({ n, abierto, alAlternar }) {
  const [tipo, texto] = estadoNodo(n);
  return (
    <div className={estilos.tarjeta}>
      <div className={estilos.cabecera}>
        <div className={estilos.resumen}>
          <span className={estilos.nombre}>{n.nombre}</span>
          <Estado tipo={tipo}>{texto}</Estado>
        </div>
        <Boton onClick={alAlternar} aria-expanded={abierto} className={estilos.mas}>
          {abierto ? 'Mostrar menos' : 'Mostrar más'}
          <Icono
            nombre="abajo"
            tamano={16}
            grosor={2.2}
            className={abierto ? estilos.girado : estilos.flecha}
          />
        </Boton>
      </div>
      {abierto && (
        <div className={estilos.sensores}>
          {SENSORES.map(([clave, etiqueta]) => {
            const [t, x] = estadoSensor(n, clave);
            return (
              <div key={clave} className={estilos.sensor}>
                <span className={estilos.sensorNombre}>{etiqueta}</span>
                <span className={estilos.sensorEstado}>
                  <Estado tipo={t}>{x}</Estado>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TarjetaEdicion({ n, destinos, alCambiar }) {
  return (
    <div className={estilos.edicion}>
      <label className={`${estilos.campo} ${estilos.campoNombre}`}>
        Nombre del nodo
        <input
          className={estilos.control}
          type="text"
          value={n.nombre}
          placeholder="Ej. Aula 3"
          onChange={(e) => alCambiar({ nombre: e.target.value })}
        />
      </label>
      <label className={`${estilos.campo} ${estilos.campoMover}`}>
        Mover a
        <select
          className={`${estilos.control} ${estilos.select}`}
          value={n.destino}
          onChange={(e) => alCambiar({ destino: e.target.value })}
        >
          <option value="">Esta ubicación</option>
          {destinos.map((u) => (
            <option key={u.id} value={u.id}>
              {u.localidad ? `${u.localidad} · ${u.nombre}` : u.nombre}
            </option>
          ))}
        </select>
      </label>
      <Boton
        onClick={() => alCambiar({ estado: n.estado === 'desactivado' ? 'en_uso' : 'desactivado' })}
      >
        {n.estado === 'desactivado' ? 'Reactivar' : 'Desactivar'}
      </Boton>
    </div>
  );
}

function FormularioAgregar({ ubicacionId, alAgregar }) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function agregar() {
    const normalizado = normalizarCodigo(codigo);
    if (!normalizado) {
      setError('Código no válido. Revisa la etiqueta del monitor.');
      return;
    }
    setEnviando(true);
    try {
      const nodo = await api.post(`/api/ubicaciones/${ubicacionId}/dispositivos`, {
        codigo: normalizado,
        nombre: nombre.trim() || 'Nuevo nodo',
      });
      alAgregar(nodo);
      setCodigo('');
      setNombre('');
      setError('');
    } catch (e) {
      setError(e.message || 'No se pudo añadir el nodo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className={estilos.agregar}
      onSubmit={(e) => {
        e.preventDefault();
        agregar();
      }}
      noValidate
    >
      <span className={estilos.agregarTitulo}>Añadir un nodo</span>
      <div className={estilos.agregarFila}>
        <label className={`${estilos.campo} ${estilos.campoNombre}`}>
          Código de la etiqueta
          <input
            className={`${estilos.control} mono`}
            type="text"
            value={codigo}
            placeholder="W3FJ-7KTA"
            autoComplete="off"
            onChange={(e) => {
              setCodigo(e.target.value.toUpperCase());
              setError('');
            }}
          />
        </label>
        <label className={`${estilos.campo} ${estilos.campoNombre}`}>
          Nombre del nodo
          <input
            className={estilos.control}
            type="text"
            value={nombre}
            placeholder="Ej. Aula 3"
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <Boton type="submit" variante="primario" deshabilitado={enviando}>
          Añadir nodo
        </Boton>
      </div>
      {error && (
        <p role="alert" className={estilos.error}>
          <Icono nombre="error" tamano={16} grosor={2} />
          {error}
        </p>
      )}
      {MODO_DEMO && (
        <p className={estilos.nota}>
          Para probar el prototipo: W3FJ-7KTA funciona; H7QD-4MXA muestra «ya está en uso»;
          M5RY-2QFJ muestra «no disponible para tu cuenta».
        </p>
      )}
    </form>
  );
}

export default function Nodos() {
  const { ubicacionId } = useParams();
  const contexto = useOutletContext();
  const nombreUbicacion = contexto?.ubicacion?.nombre ?? 'Ubicación';
  const ruta = `/api/ubicaciones/${ubicacionId}/dispositivos`;
  const { datos, cargando, error, reemplazar } = useApi(ruta);
  const { datos: ubicaciones } = useApi('/api/ubicaciones');
  const [borrador, setBorrador] = useState(null);
  const [abiertos, setAbiertos] = useState({});
  const [aviso, setAviso] = useState('');
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [refresco, setRefresco] = useState(leerRefresco);
  const editando = borrador !== null;

  const nodos = editando ? borrador : (datos?.nodos ?? []);
  const reservados = datos?.reservadosSinActivar ?? 0;
  const destinos = (ubicaciones ?? []).filter((u) => String(u.id) !== String(ubicacionId));
  const todosAbiertos = nodos.length > 0 && nodos.every((n) => abiertos[n.id]);
  const base = `/ubicaciones/${ubicacionId}`;

  function empezar() {
    setAviso('');
    setErrorGuardar('');
    setBorrador((datos?.nodos ?? []).map((n) => ({ ...n, destino: '' })));
  }

  function cambiar(id, cambios) {
    setBorrador((lista) => lista.map((n) => (n.id === id ? { ...n, ...cambios } : n)));
  }

  async function guardar() {
    setGuardando(true);
    setErrorGuardar('');
    try {
      const originales = Object.fromEntries((datos?.nodos ?? []).map((n) => [n.id, n]));
      const movidos = [];
      for (const n of borrador) {
        const antes = originales[n.id];
        const nombre = n.nombre.trim() || 'Nuevo nodo';
        const cambios = {};
        if (antes && nombre !== antes.nombre) cambios.nombre = nombre;
        if (antes && n.estado !== antes.estado) cambios.estado = n.estado;
        if (n.destino) cambios.ubicacionId = Number(n.destino);
        if (Object.keys(cambios).length) await api.patch(`/api/dispositivos/${n.id}`, cambios);
        if (n.destino) {
          const u = destinos.find((d) => String(d.id) === String(n.destino));
          movidos.push(
            `${nombre} se movió a ${u.localidad ? `${u.localidad} · ${u.nombre}` : u.nombre}.`,
          );
        }
      }
      reemplazar(await api.get(ruta));
      setAviso(movidos.join(' '));
      setBorrador(null);
    } catch (e) {
      setErrorGuardar(e.message || 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  }

  function alAgregar(nodo) {
    setBorrador((lista) => [...lista, { ...nodo, destino: '' }]);
    reemplazar({
      nodos: [...(datos?.nodos ?? []), nodo],
      reservadosSinActivar: Math.max(0, reservados - 1),
    });
  }

  return (
    <>
      <BarraRuta
        volver={{ a: `${base}/panel`, texto: 'Volver al Panel' }}
        migas={[
          { a: '/ubicaciones', texto: 'Ubicaciones' },
          { a: `${base}/panel`, texto: nombreUbicacion },
          { texto: 'Nodos' },
        ]}
      />

      <EncabezadoPagina
        titulo="Gestionar nodos"
        subtitulo={
          datos
            ? `${nodos.length} ${nodos.length === 1 ? 'nodo' : 'nodos'} · ${nodos.filter(enLinea).length} en línea`
            : ''
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
          <>
            <Boton
              onClick={() =>
                setAbiertos(Object.fromEntries(nodos.map((n) => [n.id, !todosAbiertos])))
              }
              deshabilitado={!nodos.length}
            >
              {todosAbiertos
                ? 'Ocultar sensores de todos los nodos'
                : 'Mostrar sensores de todos los nodos'}
            </Boton>
            <Boton icono="editar" onClick={empezar} deshabilitado={cargando || Boolean(error)}>
              Editar
            </Boton>
          </>
        )}
      </EncabezadoPagina>

      {!editando && reservados > 0 && (
        <div className={estilos.reservados}>
          <Icono nombre="error" tamano={18} grosor={2} className={estilos.reservadosIcono} />
          <span>
            <strong>
              Tienes{' '}
              {reservados === 1 ? '1 monitor reservado' : `${reservados} monitores reservados`} sin
              activar.
            </strong>{' '}
            Pulsa Editar y añádelo con el código de su etiqueta.
          </span>
        </div>
      )}

      {aviso && !editando && (
        <div role="status" className={estilos.aviso}>
          {aviso}
        </div>
      )}
      {errorGuardar && (
        <p role="alert" className={estilos.error}>
          <Icono nombre="error" tamano={16} grosor={2} />
          {errorGuardar}
        </p>
      )}
      {error && (
        <p role="alert" className={estilos.error}>
          <Icono nombre="error" tamano={16} grosor={2} />
          No se pudieron cargar los nodos. Recarga la página.
        </p>
      )}
      {cargando && !datos && <p className={estilos.nota}>Cargando nodos…</p>}

      {editando && <FormularioAgregar ubicacionId={ubicacionId} alAgregar={alAgregar} />}

      {datos && !nodos.length && !editando && (
        <div className={estilos.vacia}>
          Esta ubicación todavía no tiene nodos. Pulsa Editar para añadir uno.
        </div>
      )}

      <ul className={estilos.lista}>
        {nodos.map((n) => (
          <li key={n.id}>
            {editando ? (
              <TarjetaEdicion n={n} destinos={destinos} alCambiar={(c) => cambiar(n.id, c)} />
            ) : (
              <TarjetaNodo
                n={n}
                abierto={Boolean(abiertos[n.id])}
                alAlternar={() => setAbiertos((a) => ({ ...a, [n.id]: !a[n.id] }))}
              />
            )}
          </li>
        ))}
      </ul>

      {editando && (
        <p className={estilos.nota}>
          Un nodo desactivado deja de guardar lecturas y sale del panel; su historial se conserva.
          Al moverlo, las lecturas nuevas van a la otra ubicación y las anteriores se quedan en
          esta.
        </p>
      )}

      <div className={estilos.pie}>
        <label className={estilos.refresco}>
          Actualizar el panel cada
          <select
            className={`${estilos.control} ${estilos.selectPequeno}`}
            value={refresco}
            onChange={(e) => {
              setRefresco(e.target.value);
              guardarRefresco(e.target.value);
            }}
          >
            {REFRESCOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        {MODO_DEMO && <span className={estilos.nota}>Datos de ejemplo.</span>}
      </div>
    </>
  );
}
