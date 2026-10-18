import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { MODO_DEMO } from '../../api/cliente';
import GraficaSerie from '../../componentes/graficas/GraficaSerie';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Segmentado from '../../componentes/ui/Segmentado';
import Tarjeta from '../../componentes/ui/Tarjeta';
import useApi from '../../hooks/useApi';
import { fechaHora, hora, numero } from '../../utils/formato';
import estilos from './Graficas.module.css';

const VARIABLES = [
  { valor: 'temperatura', texto: 'Temperatura', campo: 'temperatura', unidad: '°C', decimales: 1 },
  { valor: 'humedad', texto: 'Humedad', campo: 'humedad', unidad: '%', decimales: 0 },
  { valor: 'presion', texto: 'Presión', campo: 'presion', unidad: 'hPa', decimales: 1 },
  {
    valor: 'calidad_aire',
    texto: 'Calidad del aire',
    campo: 'rsR0',
    unidad: 'Rs/R0',
    decimales: 2,
  },
];

function Serie({ nodo, variable, periodo }) {
  const consulta = useApi(
    `/api/dispositivos/${nodo.dispositivoId}/serie?periodo=${periodo}&variable=${variable.valor}`,
  );
  if (consulta.cargando) return <p role="status">Cargando gráfica…</p>;
  if (consulta.error)
    return (
      <>
        <Aviso tipo="error">No se pudo cargar la gráfica.</Aviso>
        <Boton onClick={consulta.recargar}>Reintentar gráfica</Boton>
      </>
    );
  const puntos = (consulta.datos?.puntos ?? []).filter((punto) => Number.isFinite(punto.valor));
  if (!puntos.length) return <Tarjeta>No hay lecturas para este periodo.</Tarjeta>;
  const rango = variable.valor === 'calidad_aire' ? { min: 0.8, max: null } : consulta.datos.rango;
  const valores = puntos.map((punto) => punto.valor);
  const resumen = [
    ['Mínimo', Math.min(...valores)],
    ['Máximo', Math.max(...valores)],
    ['Promedio', valores.reduce((suma, valor) => suma + valor, 0) / valores.length],
  ];
  return (
    <>
      <Tarjeta>
        <div className={estilos.cabeceraGrafica}>
          <p className={estilos.valor}>
            {numero(nodo[variable.campo], variable.decimales)} <small>{variable.unidad}</small>
          </p>
          <p className={estilos.leyenda}>
            <span />
            {variable.valor === 'calidad_aire'
              ? 'Nivel bueno: 0.80 o más'
              : `Rango permitido ${numero(rango?.min)} – ${numero(rango?.max)} ${variable.unidad}`}
          </p>
        </div>
        <GraficaSerie
          puntos={puntos}
          rango={rango}
          etiquetaX={periodo === '1h' ? hora : fechaHora}
          decimales={variable.decimales}
          descripcion={`Gráfica de ${variable.texto} de ${nodo.nombre}`}
        />
      </Tarjeta>
      <div className={estilos.resumen}>
        {resumen.map(([titulo, valor]) => (
          <Tarjeta key={titulo}>
            <h2>{titulo}</h2>
            <p>
              {numero(valor, variable.decimales)} <small>{variable.unidad}</small>
            </p>
          </Tarjeta>
        ))}
      </div>
    </>
  );
}

function SelectorGrafica({ nodos }) {
  const [nodoId, setNodoId] = useState(String(nodos[0]?.dispositivoId ?? ''));
  const [variableId, setVariableId] = useState('temperatura');
  const [periodo, setPeriodo] = useState('1h');
  const nodo = nodos.find((item) => String(item.dispositivoId) === nodoId);
  const variable = VARIABLES.find((item) => item.valor === variableId);
  if (!nodo) return <Tarjeta>No hay nodos en esta ubicación.</Tarjeta>;
  const bloqueo = !nodo.conectado
    ? [
        'Sin conexión',
        'Este nodo no está enviando datos. La gráfica estará disponible cuando vuelva a conectarse.',
      ]
    : nodo[variable.campo] == null
      ? variableId === 'calidad_aire'
        ? ['Sin calibrar', 'El monitor necesita un valor R0 para mostrar la calidad del aire.']
        : ['Sensor sin respuesta', 'El sensor no está enviando lecturas de esta variable.']
      : null;
  return (
    <>
      <div className={estilos.controles}>
        <Campo
          etiqueta="Nodo"
          value={nodoId}
          onChange={(evento) => setNodoId(evento.target.value)}
          opciones={nodos.map((item) => ({
            valor: String(item.dispositivoId),
            texto: item.nombre,
          }))}
        />
        <Segmentado
          etiqueta="Variable"
          valor={variableId}
          alCambiar={setVariableId}
          opciones={VARIABLES}
        />
        <Segmentado
          etiqueta="Periodo"
          valor={periodo}
          alCambiar={setPeriodo}
          opciones={[
            { valor: '1h', texto: '1 hora' },
            { valor: '24h', texto: '24 horas' },
            { valor: '7d', texto: '7 días' },
          ]}
        />
      </div>
      {bloqueo ? (
        <Tarjeta className={estilos.bloqueo}>
          <h2>{bloqueo[0]}</h2>
          <p>{bloqueo[1]}</p>
        </Tarjeta>
      ) : (
        <Serie
          key={`${nodoId}-${variableId}-${periodo}`}
          nodo={nodo}
          variable={variable}
          periodo={periodo}
        />
      )}
    </>
  );
}

function GraficasUbicacion({ id, nombre }) {
  const consulta = useApi(`/api/ubicaciones/${id}/ultimas`);
  return (
    <>
      <BarraRuta
        volver={{ a: `/ubicaciones/${id}/panel`, texto: 'Volver al Panel' }}
        migas={[
          { a: '/ubicaciones', texto: 'Ubicaciones' },
          { a: `/ubicaciones/${id}/panel`, texto: nombre },
          { texto: 'Gráficas' },
        ]}
      />
      <EncabezadoPagina
        titulo="Gráficas por nodo"
        subtitulo="Elige un nodo, una variable y un periodo."
      />
      {consulta.cargando ? (
        <p role="status">Cargando nodos…</p>
      ) : consulta.error ? (
        <>
          <Aviso tipo="error">No se pudieron cargar los nodos.</Aviso>
          <Boton onClick={consulta.recargar}>Reintentar</Boton>
        </>
      ) : (
        <SelectorGrafica nodos={consulta.datos ?? []} />
      )}
      {MODO_DEMO && <p className={estilos.nota}>Datos de ejemplo.</p>}
    </>
  );
}

export default function Graficas() {
  const { ubicacionId } = useParams();
  const nombre = useOutletContext()?.ubicacion?.nombre ?? 'Ubicación';
  return <GraficasUbicacion key={ubicacionId} id={ubicacionId} nombre={nombre} />;
}
