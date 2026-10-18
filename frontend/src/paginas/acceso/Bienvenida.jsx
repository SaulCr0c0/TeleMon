import Boton from '../../componentes/ui/Boton';
import { useSesion } from '../../sesion/useSesion';
import estilos from './Bienvenida.module.css';

const PASOS = [
  ['Contratar el servicio', 'Dale a tu proveedor el correo con el que te registraste.'],
  ['Recibir tus monitores', 'Cada uno llega con una etiqueta que lleva su código.'],
  ['Crear una ubicación', 'El lugar donde vas a instalarlos.'],
  ['Añadir cada monitor con su código', 'Escribe el código de la etiqueta y ponle un nombre.'],
];

export default function Bienvenida() {
  const { usuario } = useSesion();
  const reservados = usuario?.monitoresReservados ?? 0;

  return (
    <>
      <div>
        <h1 className={estilos.titulo}>Bienvenido a TeleMon</h1>
        <p className={estilos.bajada}>
          {reservados
            ? 'Tu proveedor ya reservó monitores para tu cuenta.'
            : 'Tu cuenta está creada. Aún no puedes ver datos: primero necesitas tus monitores.'}
        </p>
      </div>

      {reservados ? (
        <div className={estilos.listos}>
          <div className={estilos.listosTextos}>
            <span className={estilos.listosTitulo}>
              {reservados === 1
                ? 'Tienes 1 monitor listo para activar'
                : `Tienes ${reservados} monitores listos para activar`}
            </span>
            <span className={estilos.listosDetalle}>
              Empieza creando la ubicación donde los vas a instalar.
            </span>
          </div>
          <Boton a="/ubicaciones" variante="primario" tamano="grande" className={estilos.cta}>
            Crear mi primera ubicación
          </Boton>
        </div>
      ) : (
        <div className={estilos.vacio}>Todavía no tienes monitores.</div>
      )}

      <ol className={estilos.pasos}>
        {PASOS.map(([titulo, detalle], i) => (
          <li key={titulo} className={estilos.paso}>
            <span className={estilos.numero}>{i + 1}</span>
            <div className={estilos.pasoTextos}>
              <span className={estilos.pasoTitulo}>{titulo}</span>
              <span className={estilos.pasoDetalle}>{detalle}</span>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
