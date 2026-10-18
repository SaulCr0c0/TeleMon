import estilos from './Tarjeta.module.css';

export default function Tarjeta({
  como: Etiqueta = 'section',
  sinRelleno = false,
  className = '',
  children,
  ...resto
}) {
  return (
    <Etiqueta
      className={[estilos.tarjeta, sinRelleno ? estilos.sinRelleno : '', className]
        .filter(Boolean)
        .join(' ')}
      {...resto}
    >
      {children}
    </Etiqueta>
  );
}
