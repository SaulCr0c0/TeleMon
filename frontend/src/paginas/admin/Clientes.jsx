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
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import { esCorreo } from '../../utils/validacion';
import ClaveTemporal from './ClaveTemporal';
import { ESTADOS_CLIENTE, ORIGENES, fechaCorta } from './cliente';
import estilos from './Clientes.module.css';

const VACIO = { organizacion: '', nombre: '', email: '' };

function FormularioCuenta({ clientes, alCancelar, alCrear }) {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
    setErrores((er) => ({ ...er, [campo]: '' }));
  };

  async function crear(evento) {
    evento.preventDefault();
    const datos = {
      organizacion: form.organizacion.trim(),
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
    };
    const nuevos = {};
    if (!datos.organizacion) nuevos.organizacion = 'Escribe el nombre de la organización.';
    if (!datos.nombre) nuevos.nombre = 'Escribe el nombre del contacto.';
    if (!esCorreo(datos.email)) nuevos.email = 'Escribe un correo válido.';
    else if (clientes.some((c) => c.email.toLowerCase() === datos.email))
      nuevos.email = 'Ese correo ya está registrado.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setEnviando(true);
    try {
      alCrear(await api.post('/api/admin/clientes', datos));
    } catch (e) {
      setErrores(
        e.estado === 409 ? { email: 'Ese correo ya está registrado.' } : { general: e.message },
      );
      setEnviando(false);
    }
  }

  return (
    <form className={estilos.formulario} onSubmit={crear} noValidate>
      <div>
        <h2 className={estilos.subtitulo}>Crear cuenta manual</h2>
        <p className={estilos.texto}>
          Para quien no se registra solo. Se genera una contraseña temporal y el cliente elige la
          suya al ingresar.
        </p>
      </div>
      <div className={estilos.campos}>
        <Campo
          etiqueta="Organización"
          className={estilos.campo}
          value={form.organizacion}
          error={errores.organizacion}
          onChange={cambiar('organizacion')}
        />
        <Campo
          etiqueta="Nombre del contacto"
          className={estilos.campo}
          value={form.nombre}
          error={errores.nombre}
          onChange={cambiar('nombre')}
        />
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          className={estilos.campo}
          value={form.email}
          error={errores.email}
          onChange={cambiar('email')}
        />
      </div>
      {errores.general && <Aviso tipo="error">{errores.general}</Aviso>}
      <div className={estilos.botones}>
        <Boton onClick={alCancelar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" deshabilitado={enviando}>
          Crear cuenta
        </Boton>
      </div>
    </form>
  );
}

export default function Clientes() {
  const { datos, cargando, error, reemplazar } = useApi('/api/admin/clientes');
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState(null);

  const clientes = datos ?? [];
  const termino = busqueda.trim().toLowerCase();
  const filas = termino
    ? clientes.filter((c) => `${c.organizacion} ${c.email}`.toLowerCase().includes(termino))
    : clientes;

  async function alCrear(respuesta) {
    setCreada(respuesta);
    reemplazar(await api.get('/api/admin/clientes'));
  }

  return (
    <>
      <BarraRuta migas={[{ texto: 'Clientes' }]} />

      <EncabezadoPagina titulo="Clientes" subtitulo="Las cuentas del servicio y cómo llegaron.">
        <Boton
          variante="primario"
          icono="mas"
          aria-expanded={creando}
          className={estilos.crear}
          onClick={() => {
            setCreando((c) => !c);
            setCreada(null);
          }}
        >
          Crear cuenta manual
        </Boton>
      </EncabezadoPagina>

      {creando && !creada && (
        <FormularioCuenta
          clientes={clientes}
          alCancelar={() => setCreando(false)}
          alCrear={alCrear}
        />
      )}

      {creada && (
        <section role="status" className={estilos.creada}>
          <div>
            <h2 className={estilos.creadaTitulo}>
              Cuenta creada para {creada.cliente.organizacion}
            </h2>
            <p className={estilos.texto2}>
              Envíale esta contraseña temporal por un canal seguro. Después de cerrar este aviso no
              se vuelve a mostrar.
            </p>
          </div>
          <ClaveTemporal clave={creada.claveTemporal} />
          <div>
            <Boton
              variante="primario"
              onClick={() => {
                setCreada(null);
                setCreando(false);
              }}
            >
              Listo
            </Boton>
          </div>
        </section>
      )}

      <div className={estilos.herramientas}>
        <label className={estilos.buscador}>
          <span className="solo-lector">Buscar cliente</span>
          <Icono nombre="buscar" tamano={18} grosor={2} className={estilos.lupa} />
          <input
            type="search"
            className={estilos.busqueda}
            placeholder="Buscar por organización o correo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        {datos && (
          <span className={estilos.cuenta}>
            {filas.length === 1 ? '1 cliente' : `${filas.length} clientes`}
          </span>
        )}
      </div>

      {error && <Aviso tipo="error">No se pudieron cargar los clientes. Recarga la página.</Aviso>}

      <section className={estilos.tarjeta}>
        <div className={tabla.desplazable}>
          <table className={`${tabla.tabla} ${estilos.tabla}`}>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Origen</th>
                <th scope="col">Estado</th>
                <th scope="col" className={tabla.derecha}>
                  Ubicaciones
                </th>
                <th scope="col" className={tabla.derecha}>
                  Monitores
                </th>
                <th scope="col">Alta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const estado = ESTADOS_CLIENTE[c.estado];
                return (
                  <tr key={c.id}>
                    <th scope="row" className={estilos.celdaCliente}>
                      <Link to={`/admin/clientes/${c.id}`} className={estilos.organizacion}>
                        {c.organizacion}
                      </Link>
                      <div className={estilos.correo}>{c.email}</div>
                    </th>
                    <td>
                      <span
                        className={
                          c.origen === 'registro' ? estilos.origenPropio : estilos.origenAdmin
                        }
                      >
                        {ORIGENES[c.origen]}
                      </span>
                    </td>
                    <td>
                      <Estado tipo={estado.tipo}>{estado.texto}</Estado>
                    </td>
                    <td className={`${tabla.derecha} mono`}>{c.ubicaciones}</td>
                    <td className={`${tabla.derecha} mono`}>{c.monitores}</td>
                    <td className={tabla.mono}>{fechaCorta(c.desde)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cargando && !datos && <p className={estilos.vacio}>Cargando clientes…</p>}
        {datos && !filas.length && (
          <p className={estilos.vacio}>Ningún cliente coincide con «{busqueda}».</p>
        )}
      </section>

      <p className={estilos.nota}>
        {MODO_DEMO ? 'Datos de ejemplo. ' : ''}Cada nombre abre la ficha del cliente.
      </p>
    </>
  );
}
