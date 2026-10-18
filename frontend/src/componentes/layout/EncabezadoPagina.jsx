import estilos from './EncabezadoPagina.module.css';

export default function EncabezadoPagina({ titulo, subtitulo, children, mono = false }) {
  return (
    <div className={estilos.encabezado}>
      <div className={estilos.textos}>
        <h1 className={mono ? estilos.tituloMono : estilos.titulo}>{titulo}</h1>
        {subtitulo && <p className={estilos.subtitulo}>{subtitulo}</p>}
      </div>
      {children && <div className={estilos.acciones}>{children}</div>}
    </div>
  );
}
