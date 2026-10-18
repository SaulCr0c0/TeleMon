import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/cliente';
import BarraRuta from '../../componentes/layout/BarraRuta';
import Aviso from '../../componentes/ui/Aviso';
import Boton from '../../componentes/ui/Boton';
import Campo from '../../componentes/ui/Campo';
import { rutaInicio } from '../../sesion/rutas';
import { useSesion } from '../../sesion/useSesion';
import { claveValida, reglasClave } from '../../utils/validacion';
import estilos from './CrearClave.module.css';

export default function CrearClave() {
  const { usuario, actualizar, cerrar } = useSesion();
  const navegar = useNavigate();
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const lista = claveValida(clave, repetida);

  async function guardar(evento) {
    evento.preventDefault();
    if (!lista) return;
    setError('');
    setEnviando(true);
    try {
      await api.post('/api/clave', { nueva: clave });
      actualizar({ debeCambiarClave: false });
      navegar(rutaInicio({ ...usuario, debeCambiarClave: false }), { replace: true });
    } catch (e) {
      setError(e.message || 'No se pudo guardar la contraseña.');
      setEnviando(false);
    }
  }

  return (
    <>
      <BarraRuta
        volver={{ a: '/login', texto: 'Volver a iniciar sesión', alHacerClic: cerrar }}
        migas={[
          { a: '/login', texto: 'Iniciar sesión', alHacerClic: cerrar },
          { texto: 'Crear contraseña' },
        ]}
      />

      <form className={estilos.tarjeta} onSubmit={guardar} noValidate>
        <div>
          <h1 className={estilos.titulo}>Crea tu contraseña</h1>
          <p className={estilos.subtitulo}>
            Entraste con una contraseña temporal. Elige una propia para continuar.
          </p>
        </div>

        <Campo
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        <Campo
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />

        <ul className={estilos.reglas} aria-label="Reglas de la contraseña">
          {reglasClave(clave, repetida).map((r) => (
            <li key={r.texto} className={r.cumple ? estilos.cumple : estilos.pendiente}>
              <span className={estilos.marca} aria-hidden="true">
                {r.cumple ? '✓' : ''}
              </span>
              {r.texto}
              <span className="solo-lector"> {r.cumple ? '(cumplida)' : '(pendiente)'}</span>
            </li>
          ))}
        </ul>

        {error && <Aviso tipo="error">{error}</Aviso>}

        <Boton
          type="submit"
          variante="primario"
          tamano="grande"
          bloque
          deshabilitado={!lista || enviando}
        >
          Continuar
        </Boton>
      </form>
    </>
  );
}
