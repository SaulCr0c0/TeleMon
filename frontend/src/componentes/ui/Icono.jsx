const TRAZOS = {
  logo: <path d="M2 12h4l2.5-7 4 14 3-7H22" />,
  ubicaciones: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </>
  ),
  graficas: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-5 3 3 5-7" />
    </>
  ),
  alertas: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  nodos: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  historial: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  umbrales: (
    <>
      <path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  clientes: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  inventario: (
    <>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  salir: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  atras: <path d="m15 6-6 6 6 6" />,
  adelante: <path d="m9 6 6 6-6 6" />,
  editar: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  mas: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  aviso: (
    <>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v5" />
      <path d="M12 18h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </>
  ),
};

export default function Icono({
  nombre,
  tamano = 20,
  grosor = 1.8,
  color = 'currentColor',
  ...resto
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
