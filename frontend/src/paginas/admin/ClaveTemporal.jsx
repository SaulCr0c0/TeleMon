import { useState } from 'react';
import Boton from '../../componentes/ui/Boton';
import estilos from './ClaveTemporal.module.css';

export default function ClaveTemporal({ clave, tamano = 'grande' }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div className={estilos.fila}>
      <span className={`${estilos.clave} ${estilos[tamano]}`}>{clave}</span>
      <Boton
        onClick={() => {
          navigator.clipboard?.writeText(clave).catch(() => {});
          setCopiada(true);
        }}
      >
        {copiada ? 'Copiada' : 'Copiar'}
      </Boton>
    </div>
  );
}
