import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { MODO_DEMO } from '../../api/cliente';
import MiniGrafica from '../../componentes/graficas/MiniGrafica';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Estado from '../../componentes/ui/Estado';
import Tarjeta from '../../componentes/ui/Tarjeta';
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import useTiempoReal from '../../hooks/useTiempoReal';
import { NIVELES_AIRE, haceCuanto, numero } from '../../utils/formato';
import estilos from './Panel.module.css';

const VARIABLES = [
  { clave: 'temperatura', texto: 'Temperatura', unidad: '°C', decimales: 1 },
  { clave: 'humedad', texto: 'Humedad', unidad: '%', decimales: 0 },
  { clave: 'presion', texto: 'Presión', unidad: 'hPa', decimales: 1 },
];

const NOMBRES = {
  temperatura: 'Temperatura',
  humedad: 'Humedad',
  presion: 'Presión',
  calidad_aire: 'Calidad del aire',
};

const NIVELES_EN_ALERTA = { malo: ['malo'], moderado: ['moderado', 'malo'], nunca: [] };
const ESPERA_POR_DEFECTO_S = 120;
const LECTURAS_POR_HORA = 720;

const instante = (iso) => (iso ? Date.parse(iso) : NaN);

function conexion(fila, ahora, esperaS) {
  if (!fila.fecha) return 'esperando';
  return ahora - instante(fila.fecha) < esperaS * 1000 ? 'enLinea' : 'sinConexion';
}

function revisar(valor, rango) {
  if (valor == null) return 'sinRespuesta';
  if (rango?.min != null && valor < rango.min) return 'bajo';
  if (rango?.max != null && valor > rango.max) return 'alto';
  return 'normal';
}

function revisarAire(fila, calidadAire) {
  if (fila.nivelAire === 'sin_calibrar') return 'sinCalibrar';
  if (!NIVELES_AIRE[fila.nivelAire]) return 'sinRespuesta';
  const enAlerta = NIVELES_EN_ALERTA[calidadAire] ?? NIVELES_EN_ALERTA.malo;
  return enAlerta.includes(fila.nivelAire) ? 'fuera' : 'normal';
}

function resumirAlerta(alerta) {
  const variable = NOMBRES[alerta.variable] ?? 'Un valor';
  if (alerta.tipo === 'SIN_CONEXION') return `${alerta.nodo} sin conexión`;
  if (alerta.tipo === 'SENSOR') return `${variable} sin respuesta en ${alerta.nodo}`;
  if (alerta.variable === 'calidad_aire') return `Calidad del aire baja en ${alerta.nodo}`;
  const sentido = /bajo/i.test(alerta.mensaje)
    ? 'baja'
    : /sobre/i.test(alerta.mensaje)
      ? 'alta'
      : 'fuera de rango';
  return `${variable} ${sentido} en ${alerta.nodo}`;
}

function celdaVariable(fila, variable, estado, rango) {
  if (estado !== 'enLinea') return { texto: '—' };
  const revision = revisar(fila[variable.clave], rango);
  if (revision === 'sinRespuesta') return { texto: 'sin respuesta', aviso: true };
  const texto = `${numero(fila[variable.clave], variable.decimales)} ${variable.unidad}`;
  return revision === 'normal' ? { texto } : { texto: `${texto} · ${revision}`, aviso: true };
}

function celdaAire(fila, estado, calidadAire) {
  if (estado !== 'enLinea') return { texto: '—' };
  const revision = revisarAire(fila, calidadAire);
  if (revision === 'sinCalibrar') return { texto: 'sin calibrar', aviso: true };
  if (revision === 'sinRespuesta') return { texto: 'sin respuesta', aviso: true };
  return {
    texto: `${NIVELES_AIRE[fila.nivelAire]} · ${numero(fila.rsR0, 2)}`,
    aviso: revision === 'fuera',
  };
}

function indicadores(fila, estado, umbrales) {
  const apagado = {
    valor: '—',
    tono: 'apagado',
    texto: estado === 'esperando' ? 'Sin datos todavía' : 'Sin conexión',
  };
  const sinRespuesta = { valor: '—', tono: 'aviso', texto: 'Sensor sin respuesta' };
  const variables = VARIABLES.map((variable) => {
    const comun = { serie: variable.clave, campo: variable.clave, titulo: variable.texto };
    if (estado !== 'enLinea') return { ...comun, ...apagado };
    const rango = umbrales?.[variable.clave];
    const revision = revisar(fila[variable.clave], rango);
    if (revision === 'sinRespuesta') return { ...comun, ...sinRespuesta };
    const limite =
      revision === 'bajo'
        ? `Bajo el mínimo (${rango.min} ${variable.unidad})`
        : `Sobre el máximo (${rango?.max} ${variable.unidad})`;
    return {
      ...comun,
      valor: numero(fila[variable.clave], variable.decimales),
      unidad: variable.unidad,
      tono: revision === 'normal' ? 'ok' : 'aviso',
      texto: revision === 'normal' ? 'Normal' : limite,
      grafica: true,
      resaltar: revision !== 'normal',
    };
  });
  const comunAire = { serie: 'calidad_aire', campo: 'rsR0', titulo: 'Calidad del aire' };
  if (estado !== 'enLinea') return [...variables, { ...comunAire, ...apagado }];
  const revision = revisarAire(fila, umbrales?.calidadAire);
  if (revision === 'sinCalibrar')
    return [...variables, { ...comunAire, valor: '—', tono: 'aviso', texto: 'Sin calibrar' }];
  if (revision === 'sinRespuesta') return [...variables, { ...comunAire, ...sinRespuesta }];
  return [
    ...variables,
    {
      ...comunAire,
      valor: NIVELES_AIRE[fila.nivelAire],
      razon: numero(fila.rsR0, 2),
      tono: fila.nivelAire === 'bueno' ? 'ok' : 'aviso',
      texto: `Nivel ${fila.nivelAire}`,
      grafica: true,
      resaltar: revision === 'fuera',
    },
  ];
}

function EstadoNodo({ fila, estado, ahora }) {
  if (estado === 'esperando') return <Estado tipo="apagado">Esperando la primera lectura</Estado>;
  if (estado === 'sinConexion')
    return <Estado tipo="apagado">Sin conexión · {haceCuanto(fila.fecha, ahora)}</Estado>;
  return <Estado tipo="ok">En línea</Estado>;
}

function Indicador({ dispositivoId, indicador, recientes }) {
  const serie = useApi(
    indicador.grafica
      ? `/api/dispositivos/${dispositivoId}/serie?periodo=1h&variable=${indicador.serie}`
      : null,
  );
  const desde = recientes.length ? instante(recientes[0].fecha) : Infinity;
  const valores = [
    ...(serie.datos?.puntos ?? [])
      .filter((punto) => Number.isFinite(punto.valor) && instante(punto.fecha) < desde)
      .map((punto) => punto.valor),
    ...recientes.map((lectura) => lectura[indicador.campo]),
  ];
  const clases = [estilos.indicador, indicador.tono === 'aviso' ? estilos.indicadorAviso : '']
    .filter(Boolean)
    .join(' ');
  return (
    <Tarjeta className={clases}>
      <h3 className={estilos.indicadorTitulo}>{indicador.titulo}</h3>
      <p className={estilos.valor}>
        {indicador.valor}
        {indicador.unidad && <small>{indicador.unidad}</small>}
        {indicador.razon && (
          <small className={estilos.razon}>
            <span>Rs/R0</span>
            <span>{indicador.razon}</span>
          </small>
        )}
      </p>
      {indicador.grafica && (
        <MiniGrafica
          valores={valores}
          color={indicador.resaltar ? 'var(--aviso-marca)' : undefined}
        />
      )}
      <p className={`${estilos.indicadorEstado} ${estilos[indicador.tono]}`}>{indicador.texto}</p>
    </Tarjeta>
  );
}

function Detalle({ fila, estado, umbrales, recientes, ahora }) {
  return (
    <section className={estilos.seccion} aria-labelledby="detalle-nodo">
      <div className={estilos.cabecera}>
        <h2 id="detalle-nodo" className={estilos.subtitulo}>
          {fila.nombre}
        </h2>
        <p className={estilos.nota}>
          {fila.fecha ? `Última lectura ${haceCuanto(fila.fecha, ahora)}` : 'Sin lecturas todavía'}
        </p>
      </div>
      <div className={estilos.indicadores}>
        {indicadores(fila, estado, umbrales).map((indicador) => (
          <Indicador
            key={indicador.serie}
            dispositivoId={fila.dispositivoId}
            indicador={indicador}
            recientes={recientes}
          />
        ))}
      </div>
    </section>
  );
}

function PanelUbicacion({ ubicacionId, nombreUbicacion }) {
  const ultimas = useApi(`/api/ubicaciones/${ubicacionId}/ultimas`);
  const alertas = useApi(`/api/ubicaciones/${ubicacionId}/alertas?estado=abiertas`);
  const { datos: umbrales } = useApi(`/api/ubicaciones/${ubicacionId}/umbrales`);
  const [filas, setFilas] = useState(null);
  const [recientes, setRecientes] = useState({});
  const [seleccion, setSeleccion] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const filasActuales = useRef(null);
  const huboConexion = useRef(false);
  filasActuales.current = filas;
  const { datos: iniciales, recargar: recargarUltimas } = ultimas;
  const { recargar: recargarAlertas } = alertas;
  const esperaS = umbrales?.esperaSinConexionS ?? ESPERA_POR_DEFECTO_S;

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(temporizador);
  }, []);

  useEffect(() => {
    if (!Array.isArray(iniciales)) return;
    setFilas((actuales) =>
      iniciales.map((nueva) => {
        const previa = actuales?.find((fila) => fila.dispositivoId === nueva.dispositivoId);
        return previa && instante(previa.fecha) > instante(nueva.fecha)
          ? { ...previa, nombre: nueva.nombre }
          : nueva;
      }),
    );
  }, [iniciales]);

  const aplicarLectura = (mensaje) => {
    const lectura = {
      fecha: mensaje.fecha,
      temperatura: mensaje.temperatura ?? null,
      humedad: mensaje.humedad ?? null,
      presion: mensaje.presion ?? null,
      rsR0: mensaje.rsR0 ?? null,
      nivelAire: mensaje.nivelAire ?? null,
    };
    const id = mensaje.dispositivoId;
    setFilas((actuales) =>
      actuales?.map((fila) =>
        fila.dispositivoId === id && !(instante(fila.fecha) > instante(lectura.fecha))
          ? { ...fila, ...lectura, conectado: true }
          : fila,
      ),
    );
    setRecientes((todas) => {
      const lista = todas[id] ?? [];
      if (lista.length && instante(lista[lista.length - 1].fecha) >= instante(lectura.fecha))
        return todas;
      return { ...todas, [id]: [...lista, lectura].slice(-LECTURAS_POR_HORA) };
    });
  };

  const moverDemo = (fecha) => {
    const t = instante(fecha) / 20000;
    (iniciales ?? [])
      .filter((base) => base.conectado)
      .forEach((base) => {
        const ola = (valor, amplitud, decimales) =>
          valor == null
            ? null
            : Number((valor + amplitud * Math.sin(t + base.dispositivoId)).toFixed(decimales));
        aplicarLectura({
          dispositivoId: base.dispositivoId,
          fecha,
          temperatura: ola(base.temperatura, 0.3, 1),
          humedad: ola(base.humedad, 1, 0),
          presion: ola(base.presion, 0.2, 1),
          rsR0: ola(base.rsR0, 0.02, 2),
          nivelAire: base.nivelAire,
        });
      });
  };

  const { conectado } = useTiempoReal(ubicacionId, (mensaje) => {
    if (mensaje.ubicacionId != null && String(mensaje.ubicacionId) !== String(ubicacionId)) return;
    if (mensaje.tipo === 'alerta') {
      recargarAlertas();
      return;
    }
    if (mensaje.tipo !== 'lectura') return;
    if (mensaje.demo) {
      if (MODO_DEMO) moverDemo(mensaje.fecha);
      return;
    }
    if (!Number.isInteger(mensaje.dispositivoId) || Number.isNaN(instante(mensaje.fecha))) return;
    const conocidas = filasActuales.current;
    if (!conocidas) return;
    if (!conocidas.some((fila) => fila.dispositivoId === mensaje.dispositivoId)) {
      recargarUltimas();
      return;
    }
    aplicarLectura(mensaje);
  });

  useEffect(() => {
    if (!conectado) return;
    if (huboConexion.current) {
      recargarUltimas();
      recargarAlertas();
    }
    huboConexion.current = true;
  }, [conectado, recargarUltimas, recargarAlertas]);

  const elegida = filas?.find((fila) => fila.dispositivoId === seleccion) ?? filas?.[0];
  const ultimaLectura = Math.max(
    ...(filas ?? []).map((fila) => instante(fila.fecha)).filter(Number.isFinite),
  );
  const abiertas = Array.isArray(alertas.datos) ? alertas.datos : [];

  return (
    <>
      <BarraRuta
        volver={{ a: '/ubicaciones', texto: 'Volver a Ubicaciones' }}
        migas={[{ a: '/ubicaciones', texto: 'Ubicaciones' }, { texto: nombreUbicacion }]}
      />
      <EncabezadoPagina
        titulo="Panel"
        subtitulo="Una fila por nodo, con lo último que midió cada uno."
      >
        {conectado ? (
          <span className={estilos.enVivo}>
            <span className={estilos.punto} aria-hidden="true" />
            En vivo
            {Number.isFinite(ultimaLectura) && ` · ${haceCuanto(ultimaLectura, ahora)}`}
          </span>
        ) : (
          <span className={estilos.sinVivo}>
            <span className={estilos.punto} aria-hidden="true" />
            Sin conexión en vivo
          </span>
        )}
      </EncabezadoPagina>

      {abiertas.length > 0 && (
        <Aviso tipo="aviso">
          <strong>
            {abiertas.length === 1 ? '1 alerta activa.' : `${abiertas.length} alertas activas.`}
          </strong>{' '}
          {abiertas.map(resumirAlerta).join(' · ')}.
        </Aviso>
      )}

      <section className={estilos.seccion} aria-labelledby="nodos-ubicacion">
        <h2 id="nodos-ubicacion" className={estilos.subtitulo}>
          Nodos de la ubicación
        </h2>
        {ultimas.error && (
          <div className={estilos.error}>
            <Aviso tipo="error">No se pudieron cargar los nodos. {ultimas.error.message}</Aviso>
            <Boton onClick={recargarUltimas}>Reintentar</Boton>
          </div>
        )}
        {!filas && !ultimas.error && (
          <p role="status" className={estilos.nota}>
            Cargando nodos…
          </p>
        )}
        {filas?.length === 0 && (
          <Tarjeta className={estilos.vacia}>
            <p>Esta ubicación todavía no tiene nodos.</p>
            <Boton a={`/ubicaciones/${ubicacionId}/nodos`}>Añadir un nodo</Boton>
          </Tarjeta>
        )}
        {filas?.length > 0 && (
          <>
            <Tarjeta sinRelleno>
              <div className={tabla.desplazable}>
                <table
                  className={`${tabla.tabla} ${estilos.tabla}`}
                  aria-label="Última lectura de cada nodo"
                >
                  <thead>
                    <tr>
                      <th scope="col">Nodo</th>
                      <th scope="col">Temperatura</th>
                      <th scope="col">Humedad</th>
                      <th scope="col">Presión</th>
                      <th scope="col">Calidad del aire</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => {
                      const estado = conexion(fila, ahora, esperaS);
                      const celdas = [
                        ...VARIABLES.map((variable) => [
                          variable.clave,
                          celdaVariable(fila, variable, estado, umbrales?.[variable.clave]),
                        ]),
                        ['aire', celdaAire(fila, estado, umbrales?.calidadAire)],
                      ];
                      const elegido = fila.dispositivoId === elegida?.dispositivoId;
                      return (
                        <tr
                          key={fila.dispositivoId}
                          className={elegido ? tabla.seleccionada : undefined}
                        >
                          <th scope="row">
                            <button
                              type="button"
                              className={estilos.nodo}
                              aria-pressed={elegido}
                              onClick={() => setSeleccion(fila.dispositivoId)}
                            >
                              {fila.nombre}
                            </button>
                          </th>
                          {celdas.map(([clave, celda]) => (
                            <td
                              key={clave}
                              className={
                                celda.aviso ? `${tabla.mono} ${tabla.fueraDeRango}` : tabla.mono
                              }
                            >
                              {celda.texto}
                            </td>
                          ))}
                          <td>
                            <EstadoNodo fila={fila} estado={estado} ahora={ahora} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
            <p className={estilos.nota}>
              Elige un nodo para ver sus cuatro indicadores. Los valores fuera de rango van en
              naranja.
            </p>
          </>
        )}
      </section>

      {elegida && (
        <Detalle
          key={elegida.dispositivoId}
          fila={elegida}
          estado={conexion(elegida, ahora, esperaS)}
          umbrales={umbrales}
          recientes={recientes[elegida.dispositivoId] ?? []}
          ahora={ahora}
        />
      )}

      {MODO_DEMO && <p className={estilos.nota}>Datos de ejemplo.</p>}
    </>
  );
}

export default function Panel() {
  const { ubicacionId } = useParams();
  const nombreUbicacion = useOutletContext()?.ubicacion?.nombre ?? 'Ubicación';
  return (
    <PanelUbicacion key={ubicacionId} ubicacionId={ubicacionId} nombreUbicacion={nombreUbicacion} />
  );
}
