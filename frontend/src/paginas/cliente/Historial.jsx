import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api, MODO_DEMO } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Segmentado from '../../componentes/ui/Segmentado';
import Tarjeta from '../../componentes/ui/Tarjeta';
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import { fechaHora, numero, NIVELES_AIRE } from '../../utils/formato';
import estilos from './Historial.module.css';

const TAMANO = 20;
const TIPOS = { UMBRAL: 'Umbral', SENSOR: 'Sensor', SIN_CONEXION: 'Sin conexión' };

function periodoFechas(periodo) {
  const hasta = new Date();
  const desde = new Date(hasta);
  if (periodo === 'hoy') desde.setHours(0, 0, 0, 0);
  else desde.setTime(hasta.getTime() - (periodo === '1h' ? 3600000 : 7 * 86400000));
  return { desde: desde.toISOString(), hasta: hasta.toISOString(), nodo: '', agrupar: 'ninguno' };
}

function fechaLocal(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function rutaLecturas(id, filtros, pagina, porPagina = TAMANO) {
  return `/api/ubicaciones/${id}/lecturas?${new URLSearchParams({ ...filtros, pagina, porPagina })}`;
}

async function consultar(id, filtros, vista, pagina) {
  if (vista === 'lecturas') return api.get(rutaLecturas(id, filtros, pagina));
  const resultados = await Promise.all(
    ['abiertas', 'cerradas'].map((estado) =>
      api.get(`/api/ubicaciones/${id}/alertas?estado=${estado}`),
    ),
  );
  const filas = resultados
    .flat()
    .filter(
      (alerta) =>
        (!filtros.nodo || String(alerta.dispositivoId) === filtros.nodo) &&
        (!filtros.desde || new Date(alerta.abiertaEn) >= new Date(filtros.desde)) &&
        (!filtros.hasta || new Date(alerta.abiertaEn) <= new Date(filtros.hasta)),
    )
    .sort((a, b) => new Date(b.abiertaEn) - new Date(a.abiertaEn));
  return {
    total: filas.length,
    filas: filas.slice((pagina - 1) * TAMANO, pagina * TAMANO),
    todas: filas,
  };
}

function crearCsv(filas, vista) {
  const encabezado =
    vista === 'lecturas'
      ? [
          'Fecha y hora',
          'Nodo',
          'Temperatura (°C)',
          'Humedad (%)',
          'Presión (hPa)',
          'Rs/R0',
          'Nivel',
        ]
      : ['Inicio', 'Nodo', 'Tipo', 'Detalle', 'Estado'];
  const valores = filas.map((fila) =>
    vista === 'lecturas'
      ? [
          fila.fecha,
          fila.nodo,
          fila.temperatura,
          fila.humedad,
          fila.presion,
          fila.rsR0,
          NIVELES_AIRE[fila.nivelAire] ?? fila.nivelAire,
        ]
      : [
          fila.abiertaEn,
          fila.nodo,
          TIPOS[fila.tipo] ?? fila.tipo,
          fila.mensaje,
          fila.cerradaEn ? 'Resuelta' : 'Activa',
        ],
  );
  const celda = (valor) => {
    let texto = String(valor ?? '');
    if (typeof valor === 'string' && /^[\s]*[=+@-]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [encabezado, ...valores].map((fila) => fila.map(celda).join(';')).join('\r\n');
}

function Resultados({ id, filtros, vista, pagina, cambiarPagina, children }) {
  const [consulta, setConsulta] = useState({ cargando: true, datos: null, error: false });
  const [version, setVersion] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [errorCsv, setErrorCsv] = useState(false);
  useEffect(() => {
    let vigente = true;
    setConsulta({ cargando: true, datos: null, error: false });
    consultar(id, filtros, vista, pagina)
      .then((datos) => {
        if (vigente) setConsulta({ cargando: false, datos, error: false });
      })
      .catch(() => {
        if (vigente) setConsulta({ cargando: false, datos: null, error: true });
      });
    return () => {
      vigente = false;
    };
  }, [id, filtros, vista, pagina, version]);

  async function descargar() {
    if (exportando) return;
    setExportando(true);
    setErrorCsv(false);
    try {
      let filas = consulta.datos.todas;
      if (vista === 'lecturas') {
        filas = [];
        let siguiente = 1;
        let total;
        do {
          const lote = await api.get(rutaLecturas(id, filtros, siguiente, 200));
          total = lote.total;
          if (!lote.filas.length && filas.length < total) throw new Error('Exportación incompleta');
          filas.push(...lote.filas);
          siguiente += 1;
        } while (filas.length < total);
      }
      const enlace = document.createElement('a');
      const url = URL.createObjectURL(
        new Blob([crearCsv(filas, vista)], { type: 'text/csv;charset=utf-8' }),
      );
      enlace.href = url;
      enlace.download = `historial-${vista}.csv`;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      const revocar = URL.revokeObjectURL.bind(URL);
      setTimeout(() => revocar(url), 1000);
    } catch {
      setErrorCsv(true);
    } finally {
      setExportando(false);
    }
  }

  const encabezado = (
    <>
      <EncabezadoPagina titulo="Historial" subtitulo="Consulta lecturas y alertas pasadas.">
        <Boton
          onClick={descargar}
          deshabilitado={
            exportando || consulta.cargando || consulta.error || !consulta.datos?.total
          }
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
          </svg>
          {exportando ? 'Descargando…' : 'Descargar CSV'}
        </Boton>
      </EncabezadoPagina>
      {children}
    </>
  );
  if (consulta.cargando)
    return (
      <>
        {encabezado}
        <p role="status">Cargando historial…</p>
      </>
    );
  if (consulta.error)
    return (
      <>
        {encabezado}
        <Aviso tipo="error">No se pudo cargar el historial.</Aviso>
        <Boton onClick={() => setVersion((valor) => valor + 1)}>Reintentar historial</Boton>
      </>
    );
  const { filas, total } = consulta.datos;
  const paginas = Math.max(1, Math.ceil(total / TAMANO));
  const encabezados =
    vista === 'lecturas'
      ? [
          'Fecha y hora',
          'Nodo',
          'Temp. (°C)',
          'Humedad (%)',
          'Presión (hPa)',
          'Aire (Rs/R0 · nivel)',
        ]
      : ['Inicio', 'Nodo', 'Tipo', 'Detalle', 'Estado'];
  return (
    <>
      {encabezado}
      {errorCsv && <Aviso tipo="error">No se pudo descargar el CSV. Inténtalo nuevamente.</Aviso>}
      <Tarjeta sinRelleno>
        <div className={tabla.desplazable}>
          <table
            className={tabla.tabla}
            aria-label={vista === 'lecturas' ? 'Historial de lecturas' : 'Historial de alertas'}
          >
            <thead>
              <tr>
                {encabezados.map((titulo) => (
                  <th scope="col" key={titulo}>
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, indice) =>
                vista === 'lecturas' ? (
                  <tr key={`${fila.fecha}-${fila.dispositivoId}-${indice}`}>
                    <td className={tabla.mono}>{fechaHora(fila.fecha)}</td>
                    <td>{fila.nodo}</td>
                    <td className={tabla.mono}>{numero(fila.temperatura)}</td>
                    <td
                      className={`${tabla.mono} ${fila.humedad != null && fila.humedad < 30 ? tabla.fueraDeRango : ''}`}
                    >
                      {fila.humedad != null && fila.humedad < 30 ? '▼ ' : ''}
                      {numero(fila.humedad, 0)}
                    </td>
                    <td className={tabla.mono}>{numero(fila.presion)}</td>
                    <td className={tabla.mono}>
                      {fila.rsR0 == null
                        ? 'sin calibrar'
                        : `${numero(fila.rsR0, 2)} · ${NIVELES_AIRE[fila.nivelAire] ?? fila.nivelAire}`}
                    </td>
                  </tr>
                ) : (
                  <tr key={fila.id}>
                    <td className={tabla.mono}>{fechaHora(fila.abiertaEn)}</td>
                    <td>{fila.nodo}</td>
                    <td>{TIPOS[fila.tipo] ?? fila.tipo}</td>
                    <td>{fila.mensaje}</td>
                    <td>{fila.cerradaEn ? 'Resuelta' : 'Activa'}</td>
                  </tr>
                ),
              )}
              {!filas.length && (
                <tr>
                  <td colSpan={encabezados.length} className={tabla.vacia}>
                    No hay {vista === 'lecturas' ? 'lecturas' : 'alertas'} para estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={estilos.pie}>
          <p>
            Página {pagina} de {paginas}
            {vista === 'lecturas' ? ' · Humedad bajo 30 % en naranja.' : ''}
          </p>
          <div className={estilos.botones}>
            <Boton
              icono="atras"
              aria-label="Anterior"
              deshabilitado={pagina <= 1}
              onClick={() => cambiarPagina(pagina - 1)}
            />
            <Boton
              icono="adelante"
              aria-label="Siguiente"
              deshabilitado={pagina >= paginas}
              onClick={() => cambiarPagina(pagina + 1)}
            />
          </div>
        </footer>
      </Tarjeta>
    </>
  );
}

function HistorialUbicacion({ id, nombre }) {
  const nodos = useApi(`/api/ubicaciones/${id}/ultimas`);
  const [periodo, setPeriodo] = useState('hoy');
  const [filtros, setFiltros] = useState(() => periodoFechas('hoy'));
  const [borrador, setBorrador] = useState(() => ({
    ...filtros,
    desde: fechaLocal(filtros.desde),
    hasta: fechaLocal(filtros.hasta),
  }));
  const [masFiltros, setMasFiltros] = useState(false);
  const [vista, setVista] = useState('lecturas');
  const [pagina, setPagina] = useState(1);
  const fechasValidas =
    (!borrador.desde || Number.isFinite(Date.parse(borrador.desde))) &&
    (!borrador.hasta || Number.isFinite(Date.parse(borrador.hasta))) &&
    (!borrador.desde || !borrador.hasta || new Date(borrador.desde) <= new Date(borrador.hasta));

  function elegirPeriodo(valor) {
    const nuevos = { ...periodoFechas(valor), nodo: filtros.nodo, agrupar: filtros.agrupar };
    setPeriodo(valor);
    setFiltros(nuevos);
    setPagina(1);
    setBorrador({ ...nuevos, desde: fechaLocal(nuevos.desde), hasta: fechaLocal(nuevos.hasta) });
  }
  function aplicar(evento) {
    evento.preventDefault();
    if (!fechasValidas) return;
    setFiltros({
      ...borrador,
      desde: borrador.desde ? new Date(borrador.desde).toISOString() : '',
      hasta: borrador.hasta ? new Date(borrador.hasta).toISOString() : '',
    });
    setPeriodo('personalizado');
    setPagina(1);
  }
  function limpiar() {
    const nuevos = periodoFechas('hoy');
    setFiltros(nuevos);
    setBorrador({ ...nuevos, desde: fechaLocal(nuevos.desde), hasta: fechaLocal(nuevos.hasta) });
    setPeriodo('hoy');
    setPagina(1);
  }
  return (
    <>
      <BarraRuta
        volver={{ a: `/ubicaciones/${id}/panel`, texto: 'Volver al Panel' }}
        migas={[
          { a: '/ubicaciones', texto: 'Ubicaciones' },
          { a: `/ubicaciones/${id}/panel`, texto: nombre },
          { texto: 'Historial' },
        ]}
      />
      <Resultados
        key={JSON.stringify([filtros, vista, pagina])}
        id={id}
        filtros={filtros}
        vista={vista}
        pagina={pagina}
        cambiarPagina={setPagina}
      >
        <div className={estilos.controles}>
          <div className={estilos.botones}>
            <Segmentado
              etiqueta="Periodo del historial"
              valor={periodo}
              alCambiar={elegirPeriodo}
              opciones={[
                { valor: '1h', texto: 'Última hora' },
                { valor: 'hoy', texto: 'Hoy' },
                { valor: '7d', texto: '7 días' },
              ]}
            />
            <Boton
              aria-expanded={masFiltros}
              aria-controls="filtros-historial"
              onClick={() => setMasFiltros(!masFiltros)}
            >
              Más filtros
            </Boton>
          </div>
          <Segmentado
            etiqueta="Tipo de historial"
            valor={vista}
            alCambiar={(valor) => {
              setVista(valor);
              setPagina(1);
            }}
            opciones={[
              { valor: 'lecturas', texto: 'Lecturas' },
              { valor: 'alertas', texto: 'Alertas' },
            ]}
          />
        </div>
        {masFiltros && (
          <Tarjeta como="form" id="filtros-historial" onSubmit={aplicar}>
            <div className={estilos.filtros}>
              {['desde', 'hasta'].map((campo) => (
                <Campo
                  key={campo}
                  etiqueta={campo === 'desde' ? 'Desde' : 'Hasta'}
                  type="datetime-local"
                  value={borrador[campo]}
                  onChange={(evento) => setBorrador({ ...borrador, [campo]: evento.target.value })}
                />
              ))}
              <Campo
                etiqueta="Nodo"
                value={borrador.nodo}
                disabled={nodos.cargando || Boolean(nodos.error)}
                onChange={(evento) => setBorrador({ ...borrador, nodo: evento.target.value })}
                opciones={[
                  { valor: '', texto: 'Todos los nodos' },
                  ...(nodos.datos ?? []).map((nodo) => ({
                    valor: String(nodo.dispositivoId),
                    texto: nodo.nombre,
                  })),
                ]}
              />
              {vista === 'lecturas' && (
                <Campo
                  etiqueta="Agrupar"
                  value={borrador.agrupar}
                  onChange={(evento) => setBorrador({ ...borrador, agrupar: evento.target.value })}
                  opciones={[
                    { valor: 'ninguno', texto: 'Sin agrupar' },
                    { valor: 'minuto', texto: 'Por minuto' },
                    { valor: 'hora', texto: 'Por hora' },
                    { valor: 'dia', texto: 'Por día' },
                  ]}
                />
              )}
            </div>
            {!fechasValidas && (
              <p role="alert" className={estilos.error}>
                Desde debe ser anterior o igual a Hasta.
              </p>
            )}
            {nodos.error && (
              <Aviso tipo="error">
                No se pudieron cargar los nodos.{' '}
                <Boton onClick={nodos.recargar}>Reintentar nodos</Boton>
              </Aviso>
            )}
            <div className={estilos.acciones}>
              <Boton type="submit" variante="primario" deshabilitado={!fechasValidas}>
                Aplicar
              </Boton>
              <Boton onClick={limpiar}>Limpiar</Boton>
            </div>
          </Tarjeta>
        )}
      </Resultados>
      {MODO_DEMO && <p className={estilos.nota}>Datos de ejemplo.</p>}
    </>
  );
}

export default function Historial() {
  const { ubicacionId } = useParams();
  const nombre = useOutletContext()?.ubicacion?.nombre ?? 'Ubicación';
  return <HistorialUbicacion key={ubicacionId} id={ubicacionId} nombre={nombre} />;
}
