import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { MODO_DEMO } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Estado from '../../componentes/ui/Estado';
import Segmentado from '../../componentes/ui/Segmentado';
import Tarjeta from '../../componentes/ui/Tarjeta';
import tabla from '../../componentes/ui/Tabla.module.css';
import useApi from '../../hooks/useApi';
import { duracion, hora } from '../../utils/formato';
import estilos from './Alertas.module.css';

const TIPOS = {
  UMBRAL: { tipo: 'aviso', texto: 'Umbral' },
  SENSOR: { tipo: 'aviso', texto: 'Sensor' },
  SIN_CONEXION: { tipo: 'apagado', texto: 'Sin conexión' },
};

function AlertasUbicacion({ ubicacionId, nombreUbicacion }) {
  const [estado, setEstado] = useState('abiertas');
  const [ahora, setAhora] = useState(() => new Date());
  const abiertas = useApi(`/api/ubicaciones/${ubicacionId}/alertas?estado=abiertas`);
  const cerradas = useApi(`/api/ubicaciones/${ubicacionId}/alertas?estado=cerradas`);
  const base = `/ubicaciones/${ubicacionId}`;

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(temporizador);
  }, []);

  const resueltasHoy = (cerradas.datos ?? []).filter(
    (alerta) =>
      alerta.cerradaEn && new Date(alerta.cerradaEn).toDateString() === ahora.toDateString(),
  );
  const consulta = estado === 'abiertas' ? abiertas : cerradas;
  const filas = estado === 'abiertas' ? (abiertas.datos ?? []) : resueltasHoy;
  const contador = (consulta, cantidad) =>
    consulta.cargando ? '…' : consulta.error ? '—' : cantidad;

  return (
    <>
      <BarraRuta
        volver={{ a: `${base}/panel`, texto: 'Volver al Panel' }}
        migas={[
          { a: '/ubicaciones', texto: 'Ubicaciones' },
          { a: `${base}/panel`, texto: nombreUbicacion },
          { texto: 'Alertas' },
        ]}
      />
      <EncabezadoPagina
        titulo="Alertas"
        subtitulo="Lo que está pasando ahora y lo que ya se resolvió hoy."
      />
      <div className={estilos.selector}>
        <Segmentado
          etiqueta="Estado de las alertas"
          valor={estado}
          alCambiar={setEstado}
          opciones={[
            {
              valor: 'abiertas',
              texto: 'Activas',
              extra: contador(abiertas, abiertas.datos?.length ?? 0),
            },
            {
              valor: 'cerradas',
              texto: 'Resueltas hoy',
              extra: contador(cerradas, resueltasHoy.length),
            },
          ]}
        />
      </div>
      {consulta.cargando ? (
        <p role="status" className={estilos.nota}>
          Cargando alertas…
        </p>
      ) : consulta.error ? (
        <div className={estilos.error}>
          <Aviso tipo="error">No se pudieron cargar las alertas. {consulta.error.message}</Aviso>
          <Boton onClick={consulta.recargar}>Reintentar</Boton>
        </div>
      ) : (
        <Tarjeta sinRelleno>
          <div className={tabla.desplazable}>
            <table
              className={`${tabla.tabla} ${estilos.tabla}`}
              aria-label={estado === 'abiertas' ? 'Alertas activas' : 'Alertas resueltas hoy'}
            >
              <thead>
                <tr>
                  <th scope="col">Nodo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Inicio</th>
                  <th scope="col">Duración</th>
                  <th scope="col" className={tabla.derecha}>
                    Peor valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((alerta) => {
                  const tipo = TIPOS[alerta.tipo] ?? { tipo: 'aviso', texto: alerta.tipo };
                  return (
                    <tr key={alerta.id}>
                      <th scope="row">{alerta.nodo}</th>
                      <td>
                        <Estado tipo={tipo.tipo}>{tipo.texto}</Estado>
                      </td>
                      <td>{alerta.mensaje}</td>
                      <td className={tabla.mono}>{hora(alerta.abiertaEn)}</td>
                      <td className={tabla.mono}>
                        {duracion(alerta.abiertaEn, alerta.cerradaEn ?? ahora)}
                      </td>
                      <td className={`${tabla.derecha} ${tabla.mono}`}>
                        {alerta.peorValor ?? '—'}
                      </td>
                    </tr>
                  );
                })}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className={tabla.vacia}>
                      {estado === 'abiertas' ? 'No hay alertas activas.' : 'Nada resuelto hoy.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
      {MODO_DEMO && <p className={estilos.nota}>Datos de ejemplo.</p>}
    </>
  );
}

export default function Alertas() {
  const { ubicacionId } = useParams();
  const nombreUbicacion = useOutletContext()?.ubicacion?.nombre ?? 'Ubicación';

  return (
    <AlertasUbicacion
      key={ubicacionId}
      ubicacionId={ubicacionId}
      nombreUbicacion={nombreUbicacion}
    />
  );
}
