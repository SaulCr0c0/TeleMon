import { Link } from 'react-router-dom';
import Boton from '../ui/Boton';
import estilos from './BarraRuta.module.css';

export default function BarraRuta({ volver, migas }) {
  return (
    <div className={estilos.barra}>
      {volver && (
        <Boton a={volver.a} icono="atras" className={estilos.volver} onClick={volver.alHacerClic}>
          {volver.texto}
        </Boton>
      )}
      <nav aria-label="Ruta" className={estilos.migas}>
        {migas.map((m, i) => {
          const ultima = i === migas.length - 1;
          return (
            <span key={`${m.texto}-${i}`} className={estilos.paso}>
              {ultima ? (
                <span aria-current="page" className={`${estilos.actual} ${m.mono ? 'mono' : ''}`}>
                  {m.texto}
                </span>
              ) : (
                <>
                  <Link to={m.a} className={estilos.enlace} onClick={m.alHacerClic}>
                    {m.texto}
                  </Link>
                  <span aria-hidden="true">›</span>
                </>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
