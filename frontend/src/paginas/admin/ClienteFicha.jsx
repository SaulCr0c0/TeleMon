import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MODO_DEMO, api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Estado from '../../componentes/ui/Estado';
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import { esCorreo } from '../../utils/validacion';
import ClaveTemporal from './ClaveTemporal';
import { ESTADOS_CLIENTE, ORIGENES, fechaCorta } from './cliente';
import { ESTADOS_MONITOR } from './monitor';
import estilos from './ClienteFicha.module.css';

function fechaHoraCompleta(iso) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fecha} ${hora}`;
}

function Datos({ cliente, alGuardar }) {
  const [borrador, setBorrador] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const datos = {
      organizacion: borrador.organizacion.trim(),
      nombre: borrador.nombre.trim(),
      email: borrador.email.trim().toLowerCase(),
    };
    if (!datos.organizacion || !datos.nombre || !esCorreo(datos.email)) {
      setError('Completa la organización, el contacto y un correo válido.');
      return;
    }
    setGuardando(true);
    try {
      await alGuardar(datos);
      setBorrador(null);
      setMensaje('Datos guardados');
    } catch (e) {
      setError(e.message || 'No se pudieron guardar los datos.');
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (campo) => (e) => {
    setBorrador((b) => ({ ...b, [campo]: e.target.value }));
    setError('');
  };

  return (
    <section className={estilos.tarjeta}>
      <div className={estilos.cabecera}>
        <h2 className={estilos.subtitulo}>Datos</h2>
        {!borrador && (
          <Boton
            onClick={() => {
              setBorrador({
                organizacion: cliente.organizacion,
                nombre: cliente.nombre,
                email: cliente.email,
              });
              setMensaje('');
            }}
          >
            Editar datos
          </Boton>
        )}
      </div>
      {borrador ? (
        <div className={estilos.edicion}>
          <Campo
            etiqueta="Organización"
            value={borrador.organizacion}
            onChange={cambiar('organizacion')}
          />
          <Campo etiqueta="Contacto" value={borrador.nombre} onChange={cambiar('nombre')} />
          <Campo
            etiqueta="Correo electrónico"
            type="email"
            value={borrador.email}
            onChange={cambiar('email')}
          />
          {error && (
            <span role="alert" className={estilos.error}>
              {error}
            </span>
          )}
          <div className={estilos.botones}>
            <Boton
              onClick={() => {
                setBorrador(null);
                setError('');
              }}
            >
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={guardar} deshabilitado={guardando}>
              Guardar cambios
            </Boton>
          </div>
        </div>
      ) : (
        <dl className={estilos.lista}>
          <dt>Organización</dt>
          <dd>{cliente.organizacion}</dd>
          <dt>Contacto</dt>
          <dd>{cliente.nombre}</dd>
          <dt>Correo</dt>
          <dd>{cliente.email}</dd>
          <dt>Origen</dt>
          <dd>{ORIGENES[cliente.origen]}</dd>
          <dt>Alta</dt>
          <dd className="mono">{fechaCorta(cliente.desde)}</dd>
        </dl>
      )}
      {mensaje && !borrador && (
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      )}
    </section>
  );
}

function Acceso({ cliente }) {
  const [confirmar, setConfirmar] = useState(false);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  async function restablecer() {
    setConfirmar(false);
    try {
      const { claveTemporal } = await api.post(
        `/api/admin/clientes/${cliente.id}/restablecer-clave`,
      );
      setClave(claveTemporal);
    } catch (e) {
      setError(e.message || 'No se pudo restablecer la contraseña.');
    }
  }

  return (
    <section className={estilos.tarjetaLateral}>
      <h2 className={estilos.subtitulo}>Acceso</h2>
      <dl className={estilos.listaCorta}>
        <dt>Último ingreso</dt>
        <dd className="mono">{fechaHoraCompleta(cliente.ultimoIngreso)}</dd>
      </dl>
      <p className={estilos.nota}>
        La contraseña la elige el cliente. Tú solo puedes restablecerla.
      </p>
      {!confirmar && !clave && (
        <Boton className={estilos.inicio} onClick={() => setConfirmar(true)}>
          Restablecer contraseña
        </Boton>
      )}
      {confirmar && (
        <div className={estilos.confirmar}>
          <p className={estilos.texto}>
            Se genera una contraseña temporal. El cliente la usa una vez y elige una nueva al
            ingresar.
          </p>
          <div className={estilos.botonesIzq}>
            <Boton onClick={() => setConfirmar(false)}>Cancelar</Boton>
            <Boton variante="primario" onClick={restablecer}>
              Restablecer
            </Boton>
          </div>
        </div>
      )}
      {clave && (
        <div role="status" className={estilos.temporal}>
          <p className={estilos.temporalTitulo}>Contraseña temporal</p>
          <ClaveTemporal clave={clave} tamano="normal" />
          <p className={estilos.textoPequeno}>
            Envíasela por un canal seguro. Solo se muestra ahora; el cliente volverá a la pantalla
            de crear contraseña.
          </p>
          <Boton className={estilos.inicio} onClick={() => setClave('')}>
            Listo
          </Boton>
        </div>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}

function EstadoCuenta({ cliente, alCambiar }) {
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const suspendida = cliente.estado === 'suspendida';

  async function cambiar(estado, texto) {
    setConfirmar(false);
    await alCambiar({ estado });
    setMensaje(texto);
  }

  return (
    <section className={estilos.tarjetaLateral}>
      <h2 className={estilos.subtitulo}>Estado de la cuenta</h2>
      <p className={estilos.textoSuave}>
        {suspendida
          ? 'El cliente no puede iniciar sesión. Sus ubicaciones, lecturas y alertas se conservan.'
          : 'La cuenta está activa. Suspéndela si el servicio se interrumpe.'}
      </p>
      {!suspendida && !confirmar && (
        <Boton
          variante="peligro"
          className={estilos.inicio}
          onClick={() => {
            setConfirmar(true);
            setMensaje('');
          }}
        >
          Suspender cuenta
        </Boton>
      )}
      {confirmar && (
        <div className={estilos.confirmarPeligro}>
          <p className={estilos.texto}>
            Mientras esté suspendida, el cliente no podrá iniciar sesión. Puedes reactivarla cuando
            quieras.
          </p>
          <div className={estilos.botonesIzq}>
            <Boton onClick={() => setConfirmar(false)}>Cancelar</Boton>
            <button
              type="button"
              className={estilos.suspender}
              onClick={() => cambiar('suspendida', 'Cuenta suspendida')}
            >
              Suspender
            </button>
          </div>
        </div>
      )}
      {suspendida && (
        <Boton
          variante="primario"
          className={estilos.inicio}
          onClick={() =>
            cambiar(cliente.monitores ? 'activa' : 'sin_monitores', 'Cuenta reactivada')
          }
        >
          Reactivar cuenta
        </Boton>
      )}
      {mensaje && (
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      )}
    </section>
  );
}

export default function ClienteFicha() {
  const { clienteId } = useParams();
  const ruta = `/api/admin/clientes/${clienteId}`;
  const { datos: cliente, error, reemplazar } = useApi(ruta);

  async function actualizar(cambios) {
    await api.patch(ruta, cambios);
    reemplazar(await api.get(ruta));
  }

  const estado = cliente ? ESTADOS_CLIENTE[cliente.estado] : null;

  return (
    <>
      <BarraRuta
        volver={{ a: '/admin/clientes', texto: 'Volver a Clientes' }}
        migas={[
          { a: '/admin/clientes', texto: 'Clientes' },
          { texto: cliente?.organizacion ?? '…' },
        ]}
      />

      {error && <Aviso tipo="error">No se encontró el cliente.</Aviso>}

      {cliente && (
        <>
          <div className={estilos.encabezado}>
            <div className={estilos.textos}>
              <h1 className={estilos.titulo}>{cliente.organizacion}</h1>
              <p className={estilos.bajada}>
                {ORIGENES[cliente.origen]} · Cliente desde el {fechaCorta(cliente.desde)}
              </p>
            </div>
            <span className={estilos.pastilla}>
              <Estado tipo={estado.tipo}>{estado.texto}</Estado>
            </span>
          </div>

          <div className={estilos.columnas}>
            <div className={estilos.principal}>
              <Datos cliente={cliente} alGuardar={actualizar} />

              <section className={estilos.tarjetaTabla}>
                <h2 className={estilos.subtituloTabla}>Ubicaciones</h2>
                <div className={tabla.desplazable}>
                  <table className={`${tabla.tabla} ${estilos.tablaUbicaciones}`}>
                    <thead>
                      <tr>
                        <th scope="col">Ubicación</th>
                        <th scope="col">Localidad</th>
                        <th scope="col" className={tabla.derecha}>
                          Nodos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.listaUbicaciones.map((u) => (
                        <tr key={u.id}>
                          <th scope="row">{u.nombre}</th>
                          <td>{u.localidad || '—'}</td>
                          <td className={`${tabla.derecha} mono`}>{u.nodos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!cliente.listaUbicaciones.length && (
                  <p className={estilos.vacio}>Todavía no creó ubicaciones.</p>
                )}
              </section>

              <section className={estilos.tarjetaTabla}>
                <h2 className={estilos.subtituloTabla}>Monitores</h2>
                <div className={tabla.desplazable}>
                  <table className={`${tabla.tabla} ${estilos.tablaMonitores}`}>
                    <thead>
                      <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Nodo</th>
                        <th scope="col">Ubicación</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.listaMonitores.map((m) => {
                        const e = ESTADOS_MONITOR[m.estado];
                        return (
                          <tr key={m.id}>
                            <th scope="row" className={estilos.codigo}>
                              {m.codigo}
                            </th>
                            <td>{m.nodo ?? '—'}</td>
                            <td>{m.ubicacion ?? '—'}</td>
                            <td>
                              <Estado tipo={e.tipo}>{e.texto}</Estado>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!cliente.listaMonitores.length && (
                  <p className={estilos.vacio}>No tiene monitores reservados.</p>
                )}
              </section>
            </div>

            <aside aria-label="Acceso a la cuenta" className={estilos.lateral}>
              <Acceso cliente={cliente} />
              <EstadoCuenta cliente={cliente} alCambiar={actualizar} />
            </aside>
          </div>

          <p className={estilos.nota}>
            {MODO_DEMO ? 'Datos de ejemplo. ' : ''}No puedes cambiar umbrales ni borrar lecturas del
            cliente.
          </p>
        </>
      )}
    </>
  );
}
