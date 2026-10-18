import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MODO_DEMO, api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Estado from '../../componentes/ui/Estado';
import Icono from '../../componentes/ui/Icono';
import Segmentado from '../../componentes/ui/Segmentado';
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import { normalizarMac } from '../../utils/validacion';
import { ESTADOS_MONITOR, conexionMonitor } from './monitor';
import estilos from './Inventario.module.css';

const FILTROS = [
  ['todos', 'Todos'],
  ['disponible', 'Disponibles'],
  ['reservado', 'Reservados'],
  ['en_uso', 'En uso'],
  ['desactivado', 'Desactivados'],
  ['retirado', 'Retirados'],
];

function Etiqueta({ codigo, mac }) {
  return (
    <div className={estilos.etiqueta}>
      <div className={estilos.etiquetaMarca}>
        <span className={estilos.etiquetaLogo}>
          <Icono nombre="logo" tamano={12} grosor={2.4} color="var(--acento-claro)" />
        </span>
        TeleMon
      </div>
      <span className={estilos.etiquetaTexto}>Código de activación</span>
      <span className={estilos.etiquetaCodigo}>{codigo}</span>
      <span className={estilos.etiquetaMac}>{mac}</span>
    </div>
  );
}

function FormularioRegistro({ clientes, alCancelar, alRegistrar }) {
  const [mac, setMac] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function registrar(evento) {
    evento.preventDefault();
    const limpia = normalizarMac(mac);
    if (!limpia || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim())) {
      setError('Escribe la MAC con el formato AA:BB:CC:DD:EE:FF.');
      return;
    }
    setEnviando(true);
    try {
      const monitor = await api.post('/api/admin/dispositivos', {
        mac: limpia,
        clienteId: clienteId ? Number(clienteId) : null,
      });
      alRegistrar(monitor);
    } catch (e) {
      setError(
        e.estado === 409
          ? 'Esa MAC ya está registrada.'
          : e.message || 'No se pudo registrar el monitor.',
      );
      setEnviando(false);
    }
  }

  return (
    <form className={estilos.formulario} onSubmit={registrar} noValidate>
      <div>
        <h2 className={estilos.subtitulo}>Registrar monitor</h2>
        <p className={estilos.texto}>
          Primero carga el firmware. Luego registra su MAC y, si ya sabes para quién es, resérvalo.
        </p>
      </div>
      <div className={estilos.campos}>
        <Campo
          etiqueta="MAC del monitor"
          className={estilos.campo}
          mono
          placeholder="AA:BB:CC:DD:EE:FF"
          autoComplete="off"
          value={mac}
          error={error}
          onChange={(e) => {
            setMac(e.target.value);
            setError('');
          }}
        />
        <Campo
          etiqueta="Reservar para"
          className={estilos.campo}
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          opciones={[
            { valor: '', texto: 'No reservar todavía' },
            ...(clientes ?? [])
              .filter((c) => c.estado !== 'suspendida')
              .map((c) => ({ valor: String(c.id), texto: c.organizacion })),
          ]}
        />
      </div>
      <div className={estilos.botones}>
        <Boton onClick={alCancelar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" deshabilitado={enviando}>
          Registrar y generar código
        </Boton>
      </div>
    </form>
  );
}

function Registrado({ monitor, alCerrar }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section role="status" className={estilos.registrado}>
      <div className={estilos.registradoTextos}>
        <h2 className={estilos.registradoTitulo}>Monitor registrado</h2>
        <p className={estilos.texto2}>
          {monitor.cliente
            ? `Reservado para ${monitor.cliente}. Lo verá en «Gestionar nodos» como monitor listo para activar.`
            : 'Queda como Disponible. Resérvalo para un cliente desde su ficha.'}
        </p>
        <p className={estilos.texto2}>
          Imprime la etiqueta y pégala en el monitor antes de entregarlo.
        </p>
        <div className={estilos.botonesIzq}>
          <Boton
            onClick={() => {
              navigator.clipboard?.writeText(monitor.codigo).catch(() => {});
              setCopiado(true);
            }}
          >
            {copiado ? 'Código copiado' : 'Copiar código'}
          </Boton>
          <Boton variante="primario" onClick={alCerrar}>
            Listo
          </Boton>
        </div>
      </div>
      <Etiqueta codigo={monitor.codigo} mac={monitor.mac} />
    </section>
  );
}

export default function Inventario() {
  const { datos: monitores, cargando, error, reemplazar } = useApi('/api/admin/dispositivos');
  const { datos: clientes } = useApi('/api/admin/clientes');
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [registrado, setRegistrado] = useState(null);

  const todos = monitores ?? [];
  const termino = busqueda.trim().toLowerCase();
  const filas = todos
    .filter((m) => filtro === 'todos' || m.estado === filtro)
    .filter(
      (m) => !termino || `${m.mac} ${m.codigo} ${m.cliente ?? ''}`.toLowerCase().includes(termino),
    );

  async function alRegistrar(monitor) {
    setRegistrado(monitor);
    reemplazar(await api.get('/api/admin/dispositivos'));
  }

  return (
    <>
      <BarraRuta migas={[{ texto: 'Inventario' }]} />

      <EncabezadoPagina
        titulo="Inventario de monitores"
        subtitulo="Cada monitor se registra con su MAC y recibe un código para la etiqueta."
      >
        <Boton
          variante="primario"
          icono="mas"
          aria-expanded={registrando}
          className={estilos.registrar}
          onClick={() => {
            setRegistrando((r) => !r);
            setRegistrado(null);
          }}
        >
          Registrar monitor
        </Boton>
      </EncabezadoPagina>

      {registrando && !registrado && (
        <FormularioRegistro
          clientes={clientes}
          alCancelar={() => setRegistrando(false)}
          alRegistrar={alRegistrar}
        />
      )}
      {registrado && (
        <Registrado
          monitor={registrado}
          alCerrar={() => {
            setRegistrado(null);
            setRegistrando(false);
          }}
        />
      )}

      <div className={estilos.herramientas}>
        <Segmentado
          etiqueta="Filtrar por estado"
          valor={filtro}
          alCambiar={setFiltro}
          opciones={FILTROS.map(([valor, texto]) => ({
            valor,
            texto,
            extra:
              valor === 'todos' ? todos.length : todos.filter((m) => m.estado === valor).length,
          }))}
        />
        <label className={estilos.buscador}>
          <span className="solo-lector">Buscar monitor</span>
          <Icono nombre="buscar" tamano={18} grosor={2} className={estilos.lupa} />
          <input
            type="search"
            className={estilos.busqueda}
            placeholder="Buscar MAC, código o cliente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      </div>

      {error && <Aviso tipo="error">No se pudo cargar el inventario. Recarga la página.</Aviso>}

      <section className={estilos.tarjeta}>
        <div className={tabla.desplazable}>
          <table className={`${tabla.tabla} ${estilos.tabla}`}>
            <thead>
              <tr>
                <th scope="col">Monitor (MAC)</th>
                <th scope="col">Código</th>
                <th scope="col">Estado</th>
                <th scope="col">Cliente</th>
                <th scope="col">Conexión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => {
                const estado = ESTADOS_MONITOR[m.estado];
                const conexion = conexionMonitor(m);
                return (
                  <tr key={m.id}>
                    <th scope="row" className={estilos.celdaMac}>
                      <Link to={`/admin/inventario/${m.id}`} className={estilos.mac}>
                        {m.mac}
                      </Link>
                    </th>
                    <td className="mono">{m.codigo}</td>
                    <td>
                      <Estado tipo={estado.tipo}>{estado.texto}</Estado>
                    </td>
                    <td>
                      <div className={estilos.cliente}>{m.cliente ?? '—'}</div>
                      <div className={estilos.lugar}>{m.ubicacion ?? '—'}</div>
                    </td>
                    <td>
                      <span className={estilos.conexion}>
                        <Estado tipo={conexion.tipo}>{conexion.texto}</Estado>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cargando && !monitores && <p className={estilos.vacio}>Cargando monitores…</p>}
        {monitores && !filas.length && (
          <p className={estilos.vacio}>Ningún monitor coincide con ese filtro.</p>
        )}
      </section>

      <p className={estilos.nota}>
        {MODO_DEMO ? 'Datos de ejemplo. ' : ''}Cada MAC abre la ficha técnica del monitor.
      </p>
    </>
  );
}
