import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MODO_DEMO, api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Estado from '../../componentes/ui/Estado';
import useApi from '../../hooks/useApi';
import { fechaHora, haceCuanto } from '../../utils/formato';
import { r0Valido } from '../../utils/validacion';
import { ESTADOS_MONITOR } from './monitor';
import estilos from './MonitorFicha.module.css';

const SENSOR = {
  responde: { tipo: 'ok', texto: 'Responde' },
  sin_datos: { tipo: 'apagado', texto: 'Sin datos' },
  sin_calibrar: { tipo: 'aviso', texto: 'Sin calibrar' },
};

const CICLO = {
  disponible: () => 'Sin cliente. Resérvalo para quien lo contrate.',
  reservado: (m) =>
    `Reservado para ${m.cliente}. Esperando que el cliente lo active con el código.`,
  en_uso: () =>
    'Está en uso. Solo el cliente puede desactivarlo; después podrás liberarlo o retirarlo.',
  desactivado: () =>
    'El cliente lo desactivó. Libéralo para reutilizarlo o retíralo si está dañado.',
  retirado: () => 'Retirado. El código quedó anulado y el historial se conserva.',
};

function senal(rssi) {
  if (rssi == null) return '—';
  const calidad = rssi >= -60 ? 'buena' : rssi >= -75 ? 'regular' : 'débil';
  return `${String(rssi).replace('-', '−')} dBm · ${calidad}`;
}

function conexion(m) {
  if (m.conexion === 'en_linea')
    return {
      tipo: 'ok',
      texto: 'En línea',
      detalle: `Última lectura ${haceCuanto(m.ultimaLectura)}`,
    };
  if (m.conexion === 'sin_conexion') {
    return {
      tipo: 'apagado',
      texto: 'Sin conexión',
      detalle: `Última lectura ${haceCuanto(m.ultimaLectura)}`,
    };
  }
  return { tipo: 'sinMarca', texto: 'Nunca se conectó', detalle: 'Sin lecturas' };
}

function Calibracion({ monitor, alGuardar }) {
  const [r0, setR0] = useState(monitor.r0 == null ? '' : String(monitor.r0));
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  async function guardar() {
    if (!r0Valido(r0)) {
      setError('Escribe un valor en kΩ mayor que 0, por ejemplo 41.2.');
      setMensaje('');
      return;
    }
    const valor = parseFloat(r0.replace(',', '.'));
    try {
      await alGuardar({ r0: valor });
      setR0(String(valor));
      setError('');
      setMensaje('R0 guardado. Desde la próxima lectura se calcula el nivel de aire.');
    } catch (e) {
      setError(e.message || 'No se pudo guardar el R0.');
    }
  }

  return (
    <section className={estilos.tarjeta}>
      <div>
        <h2 className={estilos.subtituloConTexto}>Calibración del MQ-135</h2>
        <p className={estilos.textoSuave}>
          R0 es el promedio de Rs en aire limpio, tras 24 a 48 h de quemado. Con R0 cargado, el
          cliente ve el nivel de calidad del aire.
        </p>
      </div>
      <div className={estilos.fila}>
        <Campo
          etiqueta="R0 (kΩ)"
          className={estilos.campoR0}
          mono
          inputMode="decimal"
          placeholder="Sin calibrar"
          value={r0}
          invalido={Boolean(error)}
          onChange={(e) => {
            setR0(e.target.value);
            setError('');
            setMensaje('');
          }}
        />
        <Boton variante="primario" tamano="grande" className={estilos.botonFila} onClick={guardar}>
          Guardar R0
        </Boton>
      </div>
      {error && (
        <span role="alert" className={estilos.error}>
          {error}
        </span>
      )}
      {mensaje && (
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      )}
    </section>
  );
}

function Notas({ monitor, alGuardar }) {
  const [notas, setNotas] = useState(monitor.notas ?? '');
  const [mensaje, setMensaje] = useState('');
  return (
    <section className={estilos.tarjeta}>
      <h2 className={estilos.subtitulo}>Notas</h2>
      <div className={estilos.fila}>
        <Campo
          etiqueta="Nota interna"
          className={estilos.campoNota}
          placeholder="Ej.: antena externa instalada"
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
            setMensaje('');
          }}
        />
        <Boton
          tamano="grande"
          className={`${estilos.botonFila} ${estilos.botonNota}`}
          onClick={async () => {
            await alGuardar({ notas: notas.trim() });
            setMensaje('Nota guardada');
          }}
        >
          Guardar nota
        </Boton>
      </div>
      {mensaje && (
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      )}
    </section>
  );
}

function CicloDeVida({ monitor, clientes, alReservar, alLiberar, alRetirar }) {
  const [confirmar, setConfirmar] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function ejecutar(accion) {
    setConfirmar('');
    setError('');
    try {
      setMensaje(await accion());
    } catch (e) {
      setError(e.message || 'No se pudo completar la acción.');
    }
  }

  return (
    <section className={estilos.tarjeta}>
      <h2 className={estilos.subtitulo}>Ciclo de vida</h2>
      <p className={estilos.textoSuave}>{CICLO[monitor.estado](monitor)}</p>

      {monitor.estado === 'disponible' && (
        <div className={estilos.reservar}>
          <Campo
            etiqueta="Reservar para"
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setError('');
            }}
            opciones={[
              { valor: '', texto: 'Elige un cliente' },
              ...(clientes ?? [])
                .filter((c) => c.estado !== 'suspendida')
                .map((c) => ({ valor: String(c.id), texto: c.organizacion })),
            ]}
          />
          <Boton
            variante="primario"
            className={estilos.inicio}
            onClick={() => {
              if (!clienteId) {
                setError('Elige un cliente.');
                return;
              }
              ejecutar(() => alReservar(Number(clienteId)));
            }}
          >
            Reservar
          </Boton>
        </div>
      )}

      {monitor.estado === 'desactivado' && !confirmar && (
        <div className={estilos.botones}>
          <Boton
            onClick={() => {
              setConfirmar('liberar');
              setMensaje('');
            }}
          >
            Liberar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              setConfirmar('retirar');
              setMensaje('');
            }}
          >
            Retirar…
          </Boton>
        </div>
      )}

      {confirmar === 'liberar' && (
        <div className={estilos.confirmar}>
          <p className={estilos.texto}>
            Vuelve a Disponible con un código nuevo, para entregarlo a otro cliente. El historial se
            conserva.
          </p>
          <div className={estilos.botones}>
            <Boton onClick={() => setConfirmar('')}>Cancelar</Boton>
            <Boton variante="primario" onClick={() => ejecutar(alLiberar)}>
              Liberar
            </Boton>
          </div>
        </div>
      )}

      {confirmar === 'retirar' && (
        <div className={estilos.confirmarPeligro}>
          <p className={estilos.texto}>
            Retirar es definitivo. El código queda anulado y el historial se conserva. Úsalo solo
            con monitores dañados.
          </p>
          <div className={estilos.botones}>
            <Boton onClick={() => setConfirmar('')}>Cancelar</Boton>
            <button type="button" className={estilos.retirar} onClick={() => ejecutar(alRetirar)}>
              Retirar monitor
            </button>
          </div>
        </div>
      )}

      {mensaje && (
        <span role="status" className={estilos.mensaje}>
          {mensaje}
        </span>
      )}
      {error && (
        <span role="alert" className={estilos.error}>
          {error}
        </span>
      )}
    </section>
  );
}

export default function MonitorFicha() {
  const { dispositivoId } = useParams();
  const ruta = `/api/admin/dispositivos/${dispositivoId}`;
  const { datos: m, error, reemplazar } = useApi(ruta);
  const { datos: clientes } = useApi('/api/admin/clientes');

  async function recargar() {
    const nuevo = await api.get(ruta);
    reemplazar(nuevo);
    return nuevo;
  }

  async function actualizar(cambios) {
    await api.patch(ruta, cambios);
    await recargar();
  }

  const estado = m ? ESTADOS_MONITOR[m.estado] : null;
  const con = m ? conexion(m) : null;

  return (
    <>
      <BarraRuta
        volver={{ a: '/admin/inventario', texto: 'Volver a Inventario' }}
        migas={[
          { a: '/admin/inventario', texto: 'Inventario' },
          { texto: m?.mac ?? '…', mono: true },
        ]}
      />

      {error && <Aviso tipo="error">No se encontró el monitor.</Aviso>}

      {m && (
        <>
          <div className={estilos.encabezado}>
            <div className={estilos.textos}>
              <h1 className={estilos.titulo}>{m.mac}</h1>
              <p className={estilos.bajada}>
                Código <span className={estilos.codigo}>{m.codigo}</span> ·{' '}
                {m.cliente ?? 'Sin cliente'}
              </p>
            </div>
            <span className={estilos.pastilla}>
              <Estado tipo={estado.tipo}>{estado.texto}</Estado>
            </span>
          </div>

          <div className={estilos.columnas}>
            <div className={estilos.principal}>
              <section className={estilos.tarjeta}>
                <h2 className={estilos.subtitulo}>Estado técnico</h2>
                <dl className={estilos.tecnico}>
                  <div>
                    <dt>Conexión</dt>
                    <dd>
                      <Estado tipo={con.tipo}>{con.texto}</Estado>
                    </dd>
                    <dd className={estilos.detalle}>{con.detalle}</dd>
                  </div>
                  <div>
                    <dt>Latencia</dt>
                    <dd className="mono">
                      {m.tecnico.latenciaMs == null ? '—' : `${m.tecnico.latenciaMs} ms`}
                    </dd>
                  </div>
                  <div>
                    <dt>Hora (NTP)</dt>
                    <dd>{m.tecnico.ntp ? 'Sincronizada' : '—'}</dd>
                  </div>
                  <div>
                    <dt>Señal Wi-Fi</dt>
                    <dd>{senal(m.tecnico.rssi)}</dd>
                  </div>
                  <div>
                    <dt>Firmware</dt>
                    <dd className="mono">{m.tecnico.fw ?? '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className={estilos.tarjetaLista}>
                <h2 className={estilos.subtituloLista}>Sensores</h2>
                <ul className={estilos.lista}>
                  {m.sensores.map((s) => (
                    <li key={s.nombre} className={estilos.sensor}>
                      <span>
                        <span className={estilos.sensorNombre}>{s.nombre}</span>{' '}
                        <span className={estilos.textoSuave}>· {s.rol.toLowerCase()}</span>
                      </span>
                      <Estado tipo={SENSOR[s.estado].tipo}>{SENSOR[s.estado].texto}</Estado>
                    </li>
                  ))}
                </ul>
              </section>

              <Calibracion key={`r0-${m.id}`} monitor={m} alGuardar={actualizar} />
              <Notas key={`notas-${m.id}`} monitor={m} alGuardar={actualizar} />

              <section className={estilos.tarjetaLista}>
                <h2 className={estilos.subtituloLista}>Historial del monitor</h2>
                <ul className={estilos.lista}>
                  {m.eventos.map((ev, i) => (
                    <li key={`${ev.fecha}-${i}`} className={estilos.evento}>
                      <span className={estilos.eventoFecha}>{fechaHora(ev.fecha)}</span>
                      <span className={estilos.eventoTexto}>{ev.texto}</span>
                    </li>
                  ))}
                </ul>
                {!m.eventos.length && <p className={estilos.vacio}>Sin eventos todavía.</p>}
              </section>
            </div>

            <aside aria-label="Asignación y ciclo de vida" className={estilos.lateral}>
              <section className={estilos.tarjeta}>
                <h2 className={estilos.subtitulo}>Asignación</h2>
                <dl className={estilos.asignacion}>
                  <dt>Cliente</dt>
                  <dd>{m.cliente ?? '—'}</dd>
                  <dt>Ubicación</dt>
                  <dd>{m.ubicacion ?? '—'}</dd>
                  <dt>Nodo</dt>
                  <dd>{m.nodo ?? '—'}</dd>
                </dl>
              </section>

              <CicloDeVida
                monitor={m}
                clientes={clientes}
                alReservar={async (clienteId) => {
                  await actualizar({ clienteId });
                  const c = clientes.find((x) => x.id === clienteId);
                  return `Reservado para ${c.organizacion}. Lo verá en «Gestionar nodos».`;
                }}
                alLiberar={async () => {
                  await api.post(`${ruta}/liberar`);
                  const nuevo = await recargar();
                  return `Liberado con el código nuevo ${nuevo.codigo}. Imprime la etiqueta nueva.`;
                }}
                alRetirar={async () => {
                  await api.post(`${ruta}/retirar`);
                  await recargar();
                  return 'Monitor retirado. El historial se conserva.';
                }}
              />
            </aside>
          </div>

          <p className={estilos.nota}>
            {MODO_DEMO ? 'Datos de ejemplo. ' : ''}Tú no puedes borrar lecturas ni cambiar umbrales
            del cliente.
          </p>
        </>
      )}
    </>
  );
}
