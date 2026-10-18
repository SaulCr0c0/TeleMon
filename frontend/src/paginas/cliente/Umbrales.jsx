import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api, MODO_DEMO } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import EncabezadoPagina from '../../componentes/layout/EncabezadoPagina';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import Tarjeta from '../../componentes/ui/Tarjeta';
import useApi from '../../hooks/useApi';
import { fecha, hora } from '../../utils/formato';
import { rangoValido } from '../../utils/validacion';
import estilos from './Umbrales.module.css';

const RANGOS = [
  {
    clave: 'temperatura',
    titulo: 'Temperatura',
    ayuda: 'Rango permitido de la temperatura ambiente',
    unidad: '°C',
    paso: 0.1,
  },
  {
    clave: 'humedad',
    titulo: 'Humedad',
    ayuda: 'Rango permitido de la humedad relativa',
    unidad: '%',
    paso: 1,
  },
  {
    clave: 'presion',
    titulo: 'Presión',
    ayuda: 'Cambia con la altura: ajústala a tu ubicación',
    unidad: 'hPa',
    paso: 0.1,
  },
];

function errorRango(rango) {
  if (
    [rango.min, rango.max].some(
      (valor) => String(valor).trim() === '' || !Number.isFinite(Number(valor)),
    )
  ) {
    return 'Completa el mínimo y el máximo con números válidos.';
  }
  return rangoValido(rango.min, rango.max) ? '' : 'El mínimo debe ser menor que el máximo.';
}

function FormularioUmbrales({ datos, ruta }) {
  const [guardados, setGuardados] = useState(datos);
  const [valores, setValores] = useState(datos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);
  const valido = RANGOS.every(({ clave }) => !errorRango(valores[clave]));

  function cambiar(clave, valor) {
    setValores((actuales) => ({ ...actuales, [clave]: valor }));
    setExito(false);
    setError('');
  }

  function descartar() {
    setValores(guardados);
    setExito(false);
    setError('');
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    setExito(false);
    setError('');
    const cuerpo = Object.fromEntries(
      RANGOS.map(({ clave }) => [
        clave,
        {
          min: Number(valores[clave].min),
          max: Number(valores[clave].max),
        },
      ]),
    );
    try {
      const respuesta = await api.put(ruta, {
        ...cuerpo,
        calidadAire: valores.calidadAire,
        esperaSinConexionS: Number(valores.esperaSinConexionS),
      });
      setGuardados(respuesta);
      setValores(respuesta);
      setExito(true);
    } catch (fallo) {
      setError(`No se pudieron guardar los umbrales. ${fallo.message}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta
      como="form"
      sinRelleno
      onSubmit={guardar}
      noValidate
      aria-label="Configuración de umbrales"
      aria-busy={guardando}
    >
      {RANGOS.map(({ clave, titulo, ayuda, unidad, paso }) => {
        const error = errorRango(valores[clave]);
        return (
          <section key={clave} className={estilos.fila} aria-labelledby={`titulo-${clave}`}>
            <div className={estilos.descripcion}>
              <h2 id={`titulo-${clave}`}>{titulo}</h2>
              <p>{ayuda}</p>
            </div>
            <div className={estilos.rango}>
              <div className={estilos.campos}>
                {['min', 'max'].map((limite) => (
                  <Campo
                    key={limite}
                    etiqueta={`${limite === 'min' ? 'Mínimo' : 'Máximo'} (${unidad})`}
                    aria-label={`${titulo}: ${limite === 'min' ? 'mínimo' : 'máximo'} (${unidad})`}
                    type="number"
                    step={paso}
                    mono
                    value={valores[clave][limite]}
                    disabled={guardando}
                    invalido={Boolean(error)}
                    aria-describedby={error ? `error-${clave}` : undefined}
                    onChange={(evento) =>
                      cambiar(clave, { ...valores[clave], [limite]: evento.target.value })
                    }
                  />
                ))}
              </div>
              {error && (
                <p id={`error-${clave}`} className={estilos.errorRango}>
                  {error}
                </p>
              )}
            </div>
          </section>
        );
      })}
      <section className={estilos.fila} aria-labelledby="titulo-aire">
        <div className={estilos.descripcion}>
          <h2 id="titulo-aire">Calidad del aire</h2>
          <p>Se mide por nivel: bueno, moderado o malo.</p>
        </div>
        <Campo
          className={estilos.selector}
          etiqueta="Alertar cuando el nivel sea"
          value={valores.calidadAire}
          disabled={guardando}
          onChange={(evento) => cambiar('calidadAire', evento.target.value)}
          opciones={[
            { valor: 'malo', texto: 'Malo' },
            { valor: 'moderado', texto: 'Moderado o malo' },
            { valor: 'nunca', texto: 'Nunca' },
          ]}
        />
      </section>
      <section className={estilos.fila} aria-labelledby="titulo-conexion">
        <div className={estilos.descripcion}>
          <h2 id="titulo-conexion">Sin conexión</h2>
          <p>Tiempo sin datos antes de avisar que un nodo se cayó.</p>
        </div>
        <Campo
          className={estilos.selector}
          etiqueta="Esperar"
          value={valores.esperaSinConexionS}
          disabled={guardando}
          onChange={(evento) => cambiar('esperaSinConexionS', evento.target.value)}
          opciones={[
            { valor: 60, texto: '1 minuto' },
            { valor: 120, texto: '2 minutos' },
            { valor: 300, texto: '5 minutos' },
          ]}
        />
      </section>
      <footer className={estilos.pie}>
        <div className={estilos.informacion}>
          <p className={estilos.nota}>
            Última modificación: {guardados.actualizadoPor ?? '—'} ·{' '}
            {fecha(guardados.actualizadoEn)} {hora(guardados.actualizadoEn)}
          </p>
          {exito && (
            <p role="status" className={estilos.exito}>
              Umbrales guardados
            </p>
          )}
        </div>
        <div className={estilos.acciones}>
          <Boton onClick={descartar} deshabilitado={guardando}>
            Descartar cambios
          </Boton>
          <Boton type="submit" variante="primario" deshabilitado={!valido || guardando}>
            {guardando ? 'Guardando…' : 'Guardar umbrales'}
          </Boton>
        </div>
        {error && (
          <div className={estilos.errorGuardado}>
            <Aviso tipo="error">{error}</Aviso>
          </div>
        )}
      </footer>
    </Tarjeta>
  );
}

function UmbralesUbicacion({ ubicacionId, nombreUbicacion }) {
  const ruta = `/api/ubicaciones/${ubicacionId}/umbrales`;
  const consulta = useApi(ruta);
  const base = `/ubicaciones/${ubicacionId}`;
  return (
    <>
      <BarraRuta
        volver={{ a: `${base}/panel`, texto: 'Volver al Panel' }}
        migas={[
          { a: '/ubicaciones', texto: 'Ubicaciones' },
          { a: `${base}/panel`, texto: nombreUbicacion },
          { texto: 'Umbrales' },
        ]}
      />
      <EncabezadoPagina
        titulo="Umbrales"
        subtitulo="Define cuándo se genera una alerta en esta ubicación."
      />
      {consulta.cargando ? (
        <p role="status" className={estilos.nota}>
          Cargando umbrales…
        </p>
      ) : consulta.error || !consulta.datos ? (
        <div className={estilos.cargaError}>
          <Aviso tipo="error">No se pudieron cargar los umbrales.</Aviso>
          <Boton onClick={consulta.recargar}>Reintentar</Boton>
        </div>
      ) : (
        <FormularioUmbrales datos={consulta.datos} ruta={ruta} />
      )}
      {MODO_DEMO && <p className={estilos.nota}>Valores de ejemplo.</p>}
    </>
  );
}

export default function Umbrales() {
  const { ubicacionId } = useParams();
  const nombreUbicacion = useOutletContext()?.ubicacion?.nombre ?? 'Ubicación';
  return (
    <UmbralesUbicacion
      key={ubicacionId}
      ubicacionId={ubicacionId}
      nombreUbicacion={nombreUbicacion}
    />
  );
}
