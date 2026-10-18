# frontend

Portal del cliente y panel del proveedor de TeleMon, hecho con **React 18 + Vite 5**. El resultado es HTML, CSS y JavaScript estáticos (`dist/`), que Nginx sirve; Nginx también reenvía `/api` y `/ws` a Node-RED.

Diseño de referencia (hay que copiarlo en estructura, colores, tamaños y estados): https://claude.ai/artifact/4JexUFf4wDWZvpQduDRHeJ

## Cómo correrlo

```bash
cd frontend
npm install          # solo la primera vez o cuando cambie package-lock.json
cp .env.example .env.local
npm run dev          # http://localhost:5173
```

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run build` | Compila a `dist/` (lo que se despliega) |
| `npm run lint` | Revisa errores de código |
| `npm run formato` | Da formato a todo el código (Prettier) |
| `npm test` | Pruebas unitarias y de componentes (Vitest) |

`VITE_MODO_DEMO=true` en `.env.local` hace que todas las pantallas usen los datos de ejemplo de `src/api/demo/`, sin backend. Con `false` se llama a Node-RED (`VITE_BACKEND`, por defecto `http://localhost:1880`).

## Estructura

```
frontend/
├── index.html                 fuentes Geist y Geist Mono
├── vite.config.js             proxy de /api y /ws, configuración de Vitest
├── eslint.config.js · .prettierrc
├── e2e/                       pruebas de punta a punta (Playwright)
└── src/
    ├── main.jsx               arranque de React y del router
    ├── App.jsx                TODAS las rutas de la app (ya definidas)
    ├── estilos/
    │   ├── tokens.css         colores y medidas del mockup (variables CSS)
    │   └── base.css           estilos globales
    ├── componentes/
    │   ├── ui/                piezas reutilizables: Boton, Campo, Tarjeta, Segmentado,
    │   │                      Estado, Aviso, Icono, Tabla.module.css
    │   ├── layout/            Logo, BarraLateral, BarraRuta (Volver + migas),
    │   │                      EncabezadoPagina, LayoutAcceso, LayoutCliente, LayoutAdmin
    │   └── graficas/          MiniGrafica (panel), GraficaSerie (pantalla Gráficas)
    ├── paginas/
    │   ├── acceso/            Login, CrearCuenta, Bienvenida, CrearClave
    │   ├── cliente/           Ubicaciones, Panel, Graficas, Alertas, Nodos,
    │   │                      Historial, Umbrales, MiCuenta
    │   ├── admin/             Clientes, ClienteFicha, Inventario, MonitorFicha
    │   └── NoEncontrada.jsx
    ├── api/
    │   ├── cliente.js         api.get/post/put/patch/delete contra /api
    │   ├── errores.js         ErrorApi (estado HTTP y mensaje)
    │   └── demo/              datos de ejemplo: datos.js (compartidos) y un archivo por pantalla
    ├── hooks/                 useApi (pedir datos), useTiempoReal (WebSocket)
    ├── sesion/                SesionProvider, useSesion, rutaInicio, RutaProtegida (rol)
    ├── utils/                 formato (números, horas, nivel de aire), validacion
    └── test/setup.js          configuración de las pruebas
```

Cada pantalla tiene su `.jsx` y su `.module.css` al lado. Los estilos de un `.module.css` solo afectan a ese componente, así que dos pantallas nunca se pisan.

## Piezas de la base

| Pieza | Uso |
|---|---|
| `useSesion()` | `{ usuario, iniciar(email, clave), registrar(datos), actualizar(cambios), cerrar() }` |
| `useApi(ruta)` | `{ datos, cargando, error, recargar, reemplazar }`. Con `ruta = null` no pide nada |
| `api.post(ruta, cuerpo)` | Devuelve el JSON o lanza `ErrorApi` con `estado` (400, 401, 403, 404, 409) y `message` |
| `useTiempoReal(ubicacionId, alMensaje)` | Abre el WebSocket de la ubicación y reconecta solo; en modo demo avisa cada 5 s |
| `useOutletContext()` | Dentro de una pantalla de ubicación devuelve `{ ubicacion }` (nombre, alertas activas) |
| `<BarraRuta volver={{ a, texto }} migas={[{ a, texto }, { texto }]} />` | Botón «Volver a…» y migas, como en el mockup |
| `<EncabezadoPagina titulo subtitulo>acciones</EncabezadoPagina>` | Título de 32 px, subtítulo y botones a la derecha |
| `<Boton variante="primario|secundario|peligro" tamano="grande" icono a>` | Con `a` es un enlace |
| `<Campo etiqueta ayuda error opciones mono />` | Input o select con etiqueta, ayuda y error |
| `<Tarjeta sinRelleno>` | Superficie blanca con borde y sombra |
| `<Segmentado opciones valor alCambiar etiqueta />` | Pestañas y selectores de periodo |
| `<Estado tipo="ok|apagado|aviso|avisoPunto">` | Punto o rombo con texto de estado |
| `<Aviso tipo="exito|aviso|error">` | Banda de mensaje |
| `Tabla.module.css` | Clases `tabla`, `desplazable`, `mono`, `seleccionada`, `fueraDeRango`, `derecha` |
| `<GraficaSerie puntos rango etiquetaX decimales descripcion />` | Línea con la franja del rango permitido (Chart.js) |
| `<MiniGrafica valores />` | Línea pequeña de las tarjetas del panel |
| `utils/formato`, `utils/validacion` | `conUnidad`, `hora`, `duracion`, `haceCuanto`, `nivelAire`, `esCorreo`, `reglasClave`, `normalizarMac`, `normalizarCodigo`, `rangoValido`, `r0Valido` |

Cuentas del modo demo:

| Correo | Contraseña | Entra a |
|---|---|---|
| `direccion@redvallealto.edu.bo` | `telemon123` | Cliente con monitores |
| `nuevo@coopsanpedro.bo` | `telemon123` | Cliente sin monitores (Bienvenida) |
| `temporal@viveroandes.com` | `temporal1` | Contraseña temporal (Crear contraseña) |
| `admin@telemon.bo` | `admin1234` | Proveedor |

## Rutas y tareas

| Ruta | Archivo | Pantalla del mockup | Tarea |
|---|---|---|---|
| `/login` | `paginas/acceso/Login.jsx` | 1 · Inicio de sesión | #40 |
| `/crear-cuenta` | `paginas/acceso/CrearCuenta.jsx` | 1a · Crear cuenta | #40 |
| `/bienvenida` | `paginas/acceso/Bienvenida.jsx` | 1b · Bienvenida | #40 |
| `/crear-clave` | `paginas/acceso/CrearClave.jsx` | 1c · Crear contraseña | #40 |
| `/ubicaciones` | `paginas/cliente/Ubicaciones.jsx` | 2 · Ubicaciones | #42 |
| `/ubicaciones/:id/panel` | `paginas/cliente/Panel.jsx` | 3 · Panel | #55 |
| `/ubicaciones/:id/graficas` | `paginas/cliente/Graficas.jsx` | 4 · Gráficas | #58 |
| `/ubicaciones/:id/alertas` | `paginas/cliente/Alertas.jsx` | 5 · Alertas | #60 |
| `/ubicaciones/:id/nodos` | `paginas/cliente/Nodos.jsx` | 6 · Gestionar nodos | #62 |
| `/ubicaciones/:id/historial` | `paginas/cliente/Historial.jsx` | 7 · Historial | #59 |
| `/ubicaciones/:id/umbrales` | `paginas/cliente/Umbrales.jsx` | 8 · Umbrales | #61 |
| `/cuenta` | `paginas/cliente/MiCuenta.jsx` | 9 · Mi cuenta | #41 |
| `/admin/clientes` | `paginas/admin/Clientes.jsx` | A1 · Clientes | #46 |
| `/admin/clientes/:id` | `paginas/admin/ClienteFicha.jsx` | A1b · Ficha del cliente | #46 |
| `/admin/inventario` | `paginas/admin/Inventario.jsx` | A2 · Inventario | #47 |
| `/admin/inventario/:id` | `paginas/admin/MonitorFicha.jsx` | A2b · Ficha del monitor | #48 |

La base compartida (`estilos/`, `componentes/`, `api/cliente.js`, `hooks/`, `sesion/`, `utils/`) es la tarea #29 y se termina **antes** que las pantallas.

## Reglas para no chocar (conflictos de Git)

1. **Cada uno toca solo su pantalla**: su `.jsx`, su `.module.css` y su archivo en `api/demo/`. Ejemplo: quien hace Alertas edita `paginas/cliente/Alertas.jsx`, `Alertas.module.css` y `api/demo/alertas.js`.
2. **`App.jsx` no se toca**: todas las rutas ya existen. Si falta una, se pide en el PR de la base.
3. **Los componentes compartidos** (`componentes/`, `estilos/`, `hooks/`, `utils/`) solo los cambia quien tiene la tarea #29. Si a tu pantalla le falta algo de ahí, abre un issue o avisa; no lo copies dentro de tu pantalla.
4. **Colores solo con variables** de `tokens.css` (`var(--primario)`), nunca un `#0B7A66` suelto.
5. **Dependencias nuevas** (`npm install algo`) solo con acuerdo del equipo, en un PR aparte. Así `package-lock.json` no choca.
6. Antes de abrir el PR: `git pull origin main`, luego `npm run lint`, `npm test` y `npm run build`, y revisar la pantalla contra el mockup.
