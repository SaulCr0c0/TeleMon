# nodered

Backend de TeleMon en Node-RED 4.0.9 con `node-red-contrib-postgresql`. Contiene la **recepción de lecturas** (#49), el **cálculo de Rs/R0** (#53), la **API de últimas lecturas** y el **WebSocket** `/ws/lecturas` (#54), la **sesión** con login, token y permisos (#63), la **API de ubicaciones** (#64), el **inventario** de monitores (#66), la **activación por código** (#67) y el **motor de alertas** UMBRAL y SENSOR (#69).

## Levantar

```bash
docker compose up -d --build broker postgres nodered
docker compose logs -f nodered
```

Editor: http://localhost:1880. El puerto se publica solo en `127.0.0.1`, así que el editor no queda abierto a la red.

Las variables salen del `.env` de la raíz:

| Variable en Node-RED | Valor |
|---|---|
| `MQTT_USER`, `MQTT_PASS` | `MQTT_USER_NODERED`, `MQTT_PASS_NODERED` |
| `PGHOST` | `postgres` |
| `PGDATABASE`, `PGUSER`, `PGPASSWORD` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `JWT_SECRETO` | `JWT_SECRETO` (texto largo al azar: `openssl rand -hex 32`) |

## Archivos

| Archivo | Qué es |
|---|---|
| `Dockerfile` | Imagen de Node-RED con el nodo de PostgreSQL |
| `data/flows.json` | Flujos |
| `data/flows_cred.json` | Usuario y contraseña del broker como `${MQTT_USER}` y `${MQTT_PASS}`: no hay contraseñas reales |
| `data/settings.js` | Credenciales sin cifrar (solo tienen referencias a variables) y `flows.json` legible |

El resto de `data/` lo genera Node-RED y no se sube. Si se cambia el flujo en el editor, **Deploy** reescribe `data/flows.json`, y ese es el archivo que se sube.

## Flujo «Recepción»

```text
[mqtt in telemetria/+/lecturas] → [Validar trama] → [Buscar monitor] → [Calcular aire y tiempos]
  → [Guardar lectura] → [Preparar evento] ─┬→ [link out «Lectura guardada»]
                                           └→ [Buscar umbrales y alertas] → … (ver «Alertas»)
```

1. **Validar trama.** Toma la hora de llegada antes de consultar la base. Exige el tema `telemetria/<ID>/lecturas` con un ID de 12 caracteres hexadecimales en mayúsculas, un objeto JSON y una MAC que, en mayúsculas y sin `:`, sea igual al ID del tema.
2. **Buscar monitor** por su MAC.
3. **Calcular aire y tiempos.** Solo sigue si el monitor está `en_uso`, tiene ubicación y esa ubicación es de su mismo cliente. Calcula la latencia y Rs/R0. Si el monitor no tiene R0 cargado usa `R0_POR_DEFECTO` (10.7 kΩ, medido el 03/11/2026 con el MQ-135 del primer monitor), así que la calidad del aire siempre tiene nivel.
4. **Guardar lectura.** Una sola sentencia actualiza el monitor (última lectura, RSSI, uptime y firmware) e inserta la lectura, y solo si el monitor sigue `en_uso` en esa ubicación. Si algo falla no se guarda nada y no sale ningún evento. Un mensaje más viejo no hace retroceder los datos del monitor, y un RSSI, uptime o firmware nulo no borra el último conocido.
   **Reinicios (#76):** en esa misma sentencia, si el `uptime` que llega es menor que el último guardado del monitor (y la lectura no es más vieja que la última), se anota «Reinicio del monitor» en `eventos_dispositivo`, sin usuario. Aparece en el historial de la ficha del monitor. No es una alerta. La primera lectura o un `uptime` nulo no cuentan. El `uptime` del firmware sale de `millis()`, que vuelve a cero cada ~49 días: eso también se anota como reinicio.
5. **Preparar evento.** Deja en `msg.payload` el aviso de la lectura guardada (`tipo`, `ubicacionId`, `dispositivoId`, `fecha`, las tres variables, `rsR0`, `nivelAire`) y lo pasa a «Lectura guardada». De ahí sale al WebSocket. El mismo mensaje entra también a las alertas (#69); la alerta sin conexión (#74) se conecta en el mismo punto.

Cada campo se acepta solo si es un número dentro del rango físico de `firmware/include/config.h`. Si no lo es, se guarda como `null` y el resto de la lectura no se pierde. El texto `"22.8"` no se toma como número y `null` no pasa a cero.

| Campo | Válido |
|---|---|
| `temperatura` | −40 a 85 °C |
| `humedad` | 0 a 100 % |
| `presion` | 300 a 1100 hPa |
| `mq135_v` | 0.05 a 5 V |
| `uptime` | Entero ≥ 0 |
| `rssi` | Entero de −127 a 0 dBm |
| `ts` | Entero en ms UTC (desde 2023) |
| `fw` | Texto de 1 a 32 caracteres |

Las tramas descartadas y los campos inválidos quedan como aviso en el log, con el motivo: `docker compose logs nodered | grep warn`.

## Flujo «API y tiempo real»

### `GET /api/ubicaciones/:id/ultimas`

Una fila por monitor `en_uso` de la ubicación, ordenada por id, con su última lectura **en esa ubicación** (si el nodo se trasladó, no muestra lo que midió en la anterior). Misma forma que `frontend/src/api/demo/panel.js`:

```json
[
  {
    "dispositivoId": 1,
    "nombre": "Aula 3",
    "conectado": true,
    "fecha": "2026-10-18T19:23:12.796Z",
    "temperatura": 22.81,
    "humedad": 46,
    "presion": 748.4,
    "rsR0": null,
    "nivelAire": "sin_calibrar"
  }
]
```

- `conectado`: la última lectura es más reciente que la espera «sin conexión» de la ubicación (`ubicaciones.espera_sin_conexion_s`).
- Nodo sin lecturas: aparece con `fecha`, variables y `nivelAire` en `null` y `conectado: false` («Esperando la primera lectura»).
- `nivelAire`: el nivel guardado; `"sin_calibrar"` si hubo voltaje del MQ-135 pero no Rs/R0 (falta R0); `null` si el MQ-135 no respondió, igual que una variable nula es «sin respuesta».

| Caso | Respuesta |
|---|---|
| Sin token, token vencido o falso | 401 `{ "mensaje": "Inicia sesión de nuevo." }` |
| ID que no es un entero positivo (`abc`, `0`, `1.5`) | 400 `{ "mensaje": "Ubicación no válida." }` |
| Ubicación de otro cliente, inexistente o pedida por el admin | 403 `{ "mensaje": "No tienes permiso." }` (no se distingue para no revelar qué ubicaciones existen) |
| Ubicación sin nodos en uso | 200 `[]` |
| Falla de la base | 500 `{ "mensaje": "No se pudieron consultar los datos. Intenta de nuevo." }`, y el error queda en el log |

### WebSocket `/ws/lecturas`

Los nodos WebSocket de Node-RED escuchan una ruta fija, así que hay un solo canal para todas las ubicaciones. Cada lectura guardada se envía como `{ tipo: "lectura", ubicacionId, dispositivoId, fecha, temperatura, humedad, presion, rsR0, nivelAire }`, con los mismos valores y la misma regla de `nivelAire` que `/ultimas`. El frontend (`useTiempoReal`) se queda solo con los mensajes de su ubicación.

Ese filtro del navegador **no es una medida de seguridad**: hoy cualquiera que abra el canal recibe las lecturas de todos los clientes. Autenticar la conexión y enviar a cada cliente solo lo suyo queda para el login (#63).

## Flujo «Ubicaciones» (#64)

Las cuatro rutas pasan por «verificar sesión» de #63. Requieren `Authorization: Bearer <token>` de un usuario con rol `cliente`. El cliente se obtiene del token y todas las consultas y modificaciones se restringen a él.

| Método y ruta | Cuerpo JSON | Resultado |
|---|---|---|
| `GET /api/ubicaciones` | — | 200, lista de ubicaciones propias sin archivar, ordenada por id; `[]` si no hay |
| `GET /api/ubicaciones/:id` | — | 200, detalle propio, incluso archivado, para el menú y el historial |
| `POST /api/ubicaciones` | `{ "nombre": "Laboratorio", "localidad": "Punata" }` | 201, ubicación creada; `localidad` es opcional |
| `PATCH /api/ubicaciones/:id` | Uno o más de `nombre`, `localidad`, `archivada` | 200, ubicación actualizada |

Las respuestas individuales tienen esta forma (el listado es un arreglo de estos objetos):

```json
{
  "id": 1,
  "localidad": "Punata",
  "nombre": "Escuela Adela Zamudio",
  "archivada": false,
  "nodos": { "total": 1, "enLinea": 1 },
  "alertasActivas": 0
}
```

- `nodos.total` cuenta solo monitores `en_uso` de esa ubicación y cliente. `enLinea` usa la última lectura del monitor **en esa ubicación**, dentro de `espera_sin_conexion_s`, igual que `/ultimas`. Un monitor trasladado no aparece en línea por una lectura de su ubicación anterior.
- `alertasActivas` cuenta alertas de la ubicación con `cerrada_en IS NULL`. Los conteos se calculan por separado para evitar duplicarlos al juntar lecturas, nodos y alertas.
- Crear una ubicación también crea sus cuatro umbrales iniciales, con los valores de `database/02_datos.sql`, en una única sentencia: si falla una parte, no se guarda ninguna.
- Archivar (`{ "archivada": true }`) solo cambia esa bandera. Conserva la ubicación, sus nodos, umbrales, alertas y lecturas. Sigue accesible por su id para consultar el historial; `{ "archivada": false }` permite volver a mostrarla en el listado.
- Se recortan los espacios de `nombre` y `localidad`. Un nombre vacío o no textual, una localidad no textual, `archivada` no booleana, un cambio vacío o un campo no permitido responden 400. No se acepta elegir el cliente desde el cuerpo.
- Un id inválido responde 400; sin token o con token inválido/vencido, 401; rol no autorizado, ubicación ajena o inexistente, 403, siguiendo la convención de #63. Un fallo interno responde 500 con un mensaje legible y deja el detalle solo en el log.

En la web, usa `VITE_MODO_DEMO=false` en `frontend/.env.local` y reinicia Vite para consultar esta API. La pantalla valida todos los nombres antes de enviar sus cambios.

La verificación HTTP con Node-RED y PostgreSQL temporales se ejecuta desde la raíz:

```bash
python -B -m unittest discover -s pruebas -p test_ubicaciones.py -v
```

Requisitos y alcance: [pruebas de ubicaciones](../pruebas/README.md#api-de-ubicaciones-64).

## Flujo «Sesión» (#63)

```text
[POST /api/login] → [Buscar usuario] → [Usuario] → [Verificar clave] ─┬→ respuesta
                                                                    └→ [Último ingreso]
[link in «verificar sesión»] → [Verificar token] → [link out «volver»]
[POST /api/clave] → [link call «verificar sesión»] → [Validar clave nueva] → [Usuario de la sesión]
  → [Comprobar clave actual] → [Guardar clave] → [Responder ok]
[POST /api/logout] → [Responder ok]
[POST /api/registro] → [Validar registro] → [Crear cliente y usuario] → [Abrir sesión]
```

Las funciones usan `bcryptjs` (`bcrypt`) y `jsonwebtoken` (`jwt`) desde **Setup → Modules**; Node-RED los instala solo al arrancar.

### `POST /api/login` con `{ email, clave }`

Devuelve `{ token, usuario }` con la forma de `frontend/src/api/demo/acceso.js`. El token es un JWT HS256 de 12 h con `{ sub, rol, cliente }`, firmado con `JWT_SECRETO`. El correo no distingue mayúsculas ni espacios. Guarda `usuarios.ultimo_login`.

| Caso | Respuesta |
|---|---|
| Correo o contraseña vacíos | 400 `Escribe tu correo y tu contraseña.` |
| Correo inexistente, clave incorrecta o usuario inactivo | 401 `Correo o contraseña incorrectos.` (el mismo mensaje y el mismo tiempo de bcrypt, para no revelar qué correos existen) |
| Cliente suspendido (con la clave correcta) | 403 `Tu cuenta está suspendida. Comunícate con tu proveedor.` |

### Proteger una ruta

Justo después del `http in`, un **link call** a «verificar sesión». Siempre vuelve:

- token válido → `msg.sesion = { sub, rol, cliente }`;
- sin token, vencido o falso → `msg.sesion = null`, `statusCode = 401` y `{ mensaje: "Inicia sesión de nuevo." }`.

La primera función de la ruta empieza con `if (!msg.sesion) return [null, msg];` (salida 2 al `http response`). Así nunca queda un mensaje esperando en el link call. Después:

- rutas `/api/admin/...`: si `msg.sesion.rol !== 'admin'` → 403 `No tienes permiso.`;
- rutas de una ubicación o un dispositivo: `AND cliente_id = $n` con `msg.sesion.cliente`; sin filas → 403 (no 404), así un cliente nunca ve datos de otro.

### `POST /api/clave` (protegida) con `{ actual?, nueva }`

- `nueva`: de 8 a 72 caracteres (72 es el límite de bcrypt), con letras y números.
- `actual` es obligatoria, salvo si el usuario tiene `debe_cambiar_clave` (primer ingreso con contraseña temporal, pantalla «Crear contraseña»). Así un token robado no basta para cambiar la contraseña.
- Guarda `bcrypt.hashSync(nueva, 10)` y `debe_cambiar_clave = false`. Responde `{ ok: true }`.
- Contraseña actual incorrecta → **400** `La contraseña actual no es correcta.` No es 401 porque el frontend cierra la sesión ante cualquier 401.

### `POST /api/registro` con `{ organizacion, nombre, email, clave, terminos }` (#65)

Crea en una sola sentencia (una transacción) el cliente con `origen = 'registro'` y su usuario con rol cliente y la clave en bcrypt. El cliente queda **sin monitores**. Responde **201** con `{ token, usuario }`, igual que el login, así el frontend entra directo.

| Caso | Respuesta |
|---|---|
| Organización o nombre vacíos | 400 `Completa la organización y tu nombre.` |
| Organización o nombre de más de 120 caracteres | 400 `La organización y el nombre pueden tener hasta 120 caracteres.` |
| Correo con formato inválido | 400 `El correo no es válido.` |
| Contraseña de menos de 8 caracteres | 400 `La contraseña debe tener al menos 8 caracteres.` |
| Contraseña de más de 72 bytes (límite de bcrypt) | 400 `La contraseña puede tener hasta 72 caracteres.` |
| `terminos` distinto de `true` | 400 `Debes aceptar los términos para continuar.` |
| Correo ya registrado (sin distinguir mayúsculas ni espacios) | 409 `Ya existe una cuenta con ese correo. Inicia sesión.` |

Si dos registros con el mismo correo llegan a la vez, el índice único de `usuarios.email` rechaza el segundo, se revierte también su cliente y el «Responder error» de la sesión lo convierte en 409.

### `GET /api/cuenta`

Con el token de la sesión devuelve el mismo objeto `usuario` del login, leído en ese momento (`monitores` en uso y `monitoresReservados`). La pantalla de Bienvenida lo consulta cada 15 s y al volver a la pestaña, para que el cliente vea un monitor recién reservado sin cerrar sesión. Sin token o con uno inválido: 401; cuenta suspendida: 403.

### `POST /api/logout`

Responde `{ ok: true }`. El token se borra en el navegador; no hay lista de tokens revocados, así que un token sigue valiendo hasta que vence (12 h).

## Flujo «Inventario» (#66)

```text
[link in «consultar monitores»] → [Armar consulta de monitores] → [Monitores] → [Dar forma de monitor] → [link out «volver»]
[GET /api/admin/dispositivos] → [verificar sesión] → [Validar filtro] → [consultar monitores] → respuesta
[POST /api/admin/dispositivos] → [verificar sesión] → [Validar monitor nuevo] → [MAC y cliente] → [Preparar registro]
  → [Registrar monitor] → [Comprobar registro] → [consultar monitores] → [Responder monitor]
[PATCH /api/admin/dispositivos/:id] → [verificar sesión] → [Validar reserva] → [Monitor y cliente] → [Preparar reserva]
  → [Guardar reserva] → [Comprobar reserva] → [consultar monitores] → [Responder monitor]
```

Las tres rutas son solo del admin: sin token 401 y con token de cliente 403 `No tienes permiso.`. Cada monitor tiene la forma de `frontend/src/api/demo/admin.js`:

```json
{
  "id": 4,
  "mac": "AA:BB:CC:DD:EE:01",
  "codigo": "F6C6-W7SX",
  "estado": "reservado",
  "clienteId": 1,
  "cliente": "Red Escolar Valle Alto",
  "ubicacion": null,
  "nodo": null,
  "conexion": "nunca",
  "ultimaLectura": null,
  "r0": null,
  "notas": ""
}
```

- `conexion`: `nunca` sin lecturas; `en_linea` si la última lectura es más reciente que la espera de su ubicación (120 s si no tiene ubicación); si no, `sin_conexion`.
- El subflujo «consultar monitores» recibe `msg.filtro` (`{}`, `{ estado }`, `{ id }` o `{ clienteId }`) y devuelve la lista con esa forma. Lo usa la ficha del cliente (#68) y lo pueden reusar la ficha del monitor (#70) y la activación (#67).

### `GET /api/admin/dispositivos?estado=`

La lista, del más nuevo al más viejo. `estado` es `todos` (por defecto), `disponible`, `reservado`, `en_uso`, `desactivado` o `retirado`; otro valor → 400 `Estado no válido.`.

### `POST /api/admin/dispositivos` con `{ mac, clienteId? }`

Registra el monitor con un código `XXXX-XXXX` al azar (`crypto.randomInt`, sin 0/O ni 1/I). Con `clienteId` queda `reservado` para ese cliente; sin él, `disponible`. Anota «Registrado con el código …» y, si corresponde, «Reservado para …» en `eventos_dispositivo` con el admin que lo hizo. Responde 201 con el monitor.

| Caso | Respuesta |
|---|---|
| MAC que no es `AA:BB:CC:DD:EE:FF` (se aceptan minúsculas y espacios alrededor) | 400 `La MAC debe tener el formato AA:BB:CC:DD:EE:FF.` |
| `clienteId` que no es un entero positivo | 400 `Cliente no válido.` |
| MAC ya registrada (también si dos registros llegan a la vez) | 409 `Esa MAC ya está registrada.` |
| Cliente inexistente | 404 `Cliente no encontrado.` |
| Cliente suspendido | 409 `No se puede reservar para un cliente suspendido.` |

### `PATCH /api/admin/dispositivos/:id` con `{ clienteId }`

Reserva el monitor para un cliente (`clienteId`) o quita la reserva (`null`, vuelve a `disponible`). Anota «Reservado para …» o «Reserva quitada». Responde el monitor actualizado; si no cambia nada, lo responde sin anotar.

| Caso | Respuesta |
|---|---|
| ID que no es un entero positivo | 400 `Monitor no válido.` |
| Sin `clienteId` en el cuerpo | 400 `No hay cambios que guardar.` (`r0` y `notas` son de la ficha, #70) |
| Monitor inexistente | 404 `Monitor no encontrado.` |
| Monitor `en_uso`, `desactivado` o `retirado` | 409 `Solo se puede reservar un monitor disponible o reservado.` |
| Cliente inexistente o suspendido | 404 o 409, como en el registro |

### Ficha del monitor (#70)

Mismas reglas de sesión que el resto del inventario (401 sin sesión, 403 si no es admin, 400 `Monitor no válido.` si el id no es un entero positivo, 404 `Monitor no encontrado.`). Todo cambio se anota en `eventos_dispositivo` con el admin que lo hizo.

```text
[GET /api/admin/dispositivos/:id] → [verificar sesión] → [Validar monitor] → [consultar monitores]
  → [Buscar datos técnicos] → [Datos técnicos] → [Responder ficha]
[PATCH …/:id] → [verificar sesión] → [Validar cambios] ─┬→ reserva (igual que antes)
                                                        └→ [Guardar R0 y notas] → [Comprobar R0 y notas] → [consultar monitores]
[POST …/:id/liberar] → [verificar sesión] → [Preparar liberación] → [Guardar liberación] → [Comprobar estado] → [consultar monitores]
[POST …/:id/retirar] → [verificar sesión] → [Preparar retiro] → [Guardar retiro] → [Comprobar estado] → [consultar monitores]
```

| Ruta | Qué hace |
|---|---|
| `GET /api/admin/dispositivos/:id` | El monitor (forma del inventario) con `tecnico` (`latenciaMs`, `ntp`, `rssi` de la última lectura si está en línea, y `fw`), `sensores` (DS18B20, DHT11, BMP280 y MQ-135: `responde`, `sin_datos` si no está en línea o el valor llegó nulo, y `eventos` (`{ fecha, texto }`, del más nuevo al más viejo) |
| `PATCH /api/admin/dispositivos/:id` con `{ r0?, notas? }` | `r0` en kΩ: número mayor que 0 y menor que 100000, redondeado a 3 decimales; si no, 400 `R0 debe ser un número mayor que 0.`. `notas`: texto de hasta 2000 caracteres. Anota «R0 del MQ-135 cargado: … kΩ» o «Notas actualizadas». No se mezcla con `clienteId` en el mismo pedido (400) |
| `POST /api/admin/dispositivos/:id/liberar` | Solo si está `desactivado`: vuelve a `disponible` sin cliente, ubicación ni nombre, con un código nuevo. Anota «Liberado. Código nuevo …». Las lecturas se conservan |
| `POST /api/admin/dispositivos/:id/retirar` | Desde `disponible`, `reservado` o `desactivado`: pasa a `retirado` sin cliente ni ubicación. Es definitivo: no se puede reservar, liberar ni activar. Anota «Retirado. Código anulado» |

Liberar un monitor que no está desactivado responde 409 `Solo se puede liberar un monitor desactivado.`; retirar uno en uso o ya retirado responde 409 `Solo se puede retirar un monitor que no esté en uso ni retirado.`.

## Flujo «Clientes» (#68)

Solo para el admin (`/api/admin/...`): sin sesión → 401, con sesión de cliente → 403. Las respuestas llevan `Cache-Control: no-store`.

```text
[link in «consultar clientes»] → [Armar consulta de clientes] → [Clientes] → [Dar forma de cliente] → [link out «volver»]
[GET /api/admin/clientes] → [link call «verificar sesión»] → [Solo admin] → [link call «consultar clientes»]
[POST /api/admin/clientes] → … → [Validar cliente nuevo] → [Crear cliente y usuario] → [Comprobar cliente nuevo]
  → [link call «consultar clientes»] → [Responder cuenta creada]
[GET /api/admin/clientes/:id] → … → [Validar cliente] → [link call «consultar clientes»] → [Buscar ubicaciones]
  → [Ubicaciones del cliente] → [Pedir monitores] → [link call «consultar monitores»] → [Responder ficha]
[PATCH /api/admin/clientes/:id] → … → [Validar cambios] → [Guardar cambios] → [Comprobar cambios]
  → [link call «consultar clientes»] → [Responder cliente]
[POST /api/admin/clientes/:id/restablecer-clave] → … → [Generar clave temporal] → [Guardar clave temporal]
  → [Responder clave temporal]
```

El subflujo «consultar clientes» devuelve la forma de `frontend/src/api/demo/admin.js`: `{ id, organizacion, nombre, email, origen, estado, ubicaciones, monitores, desde, ultimoIngreso }`. El estado se calcula: `suspendida` si `clientes.suspendido_en` tiene fecha, `activa` si tiene monitores en uso y `sin_monitores` si no. `ubicaciones` cuenta las no archivadas y `monitores` los que están en uso.

| Ruta | Qué hace |
|---|---|
| `GET /api/admin/clientes` | Lista de clientes, los más nuevos primero, con su origen (`registro` o `admin`) |
| `POST /api/admin/clientes` con `{ organizacion, nombre, email }` | Crea el cliente (`origen = 'admin'`) y su usuario con una contraseña temporal aleatoria y `debe_cambiar_clave = true`. Responde **201** con `{ cliente, claveTemporal }`. La contraseña temporal no se guarda en texto y solo aparece en esta respuesta |
| `GET /api/admin/clientes/:id` | El cliente con `listaUbicaciones` (`{ id, localidad, nombre, archivada, nodos }`) y `listaMonitores` (forma del inventario) |
| `PATCH /api/admin/clientes/:id` con `{ organizacion?, nombre?, email? }` | Edita los datos. El correo cambia también el de ingreso del usuario |
| `PATCH /api/admin/clientes/:id` con `{ estado }` | `suspendida` guarda la fecha en `suspendido_en` (el login responde 403); `activa` o `sin_monitores` la borra y el cliente vuelve a entrar con sus datos intactos |
| `POST /api/admin/clientes/:id/restablecer-clave` | Nueva contraseña temporal con `debe_cambiar_clave = true`. Responde `{ claveTemporal }` una sola vez |

La contraseña temporal tiene la forma `XXXX-XXXX-XXXX`, con letras y números sin los que se confunden (`I`, `L`, `O`, `0`, `1`), y se genera con `crypto.randomInt`.

| Caso | Respuesta |
|---|---|
| Organización o contacto vacíos, o de más de 120 caracteres | 400 |
| Correo inválido | 400 `El correo no es válido.` |
| `estado` distinto de `activa`, `sin_monitores` o `suspendida`, o `PATCH` sin cambios | 400 |
| Correo ya usado por otra cuenta (también si llegan dos a la vez) | 409 `Ya existe una cuenta con ese correo.` |
| Id inexistente o que no es un número | 404 `Cliente no encontrado.` |

Para la ficha, «consultar monitores» del inventario acepta además `msg.filtro.clienteId`.

## Flujo «Activación y nodos» (#67)

```text
[GET /api/ubicaciones/:id/dispositivos] ─┐
                                      ├→ [verificar sesión] → [Preparar nodos o activación]
[POST /api/ubicaciones/:id/dispositivos] ┘  → [Consultar o activar monitor] → [Responder nodos]
```

Ambas rutas requieren un token de **cliente** de #63. La ubicación debe pertenecer al cliente de la sesión. La pantalla Gestionar nodos utiliza las respuestas reales sin sustituir un 404 por una activación simulada.

### `GET /api/ubicaciones/:id/dispositivos`

Responde 200 con `{ "nodos": [...], "reservadosSinActivar": 1 }`. Lista los monitores `en_uso` y `desactivado` de esa ubicación y cliente, ordenados por id. El contador de reservas incluye todos los monitores `reservado` del cliente, aún sin activar.

Cada nodo tiene `id`, `ubicacionId`, `nombre`, `estado`, `conectado`, `esperando`, `fecha`, `temperatura`, `humedad`, `presion`, `rsR0` y `nivelAire`. Se usa la última lectura **en esa ubicación**, con la misma espera de conexión que `/ultimas`. Sin lecturas, las variables y la fecha son nulas y `esperando` es verdadero; un nodo desactivado no aparece en línea. Una ubicación propia sin nodos devuelve `nodos: []`.

### `POST /api/ubicaciones/:id/dispositivos`

```json
{ "codigo": "W3FJ-7KTA", "nombre": "Laboratorio" }
```

Normaliza el código a mayúsculas y acepta espacios o la ausencia del guion (`w3fj 7kta` → `W3FJ-7KTA`), sin aceptar otros caracteres. El nombre es obligatorio y se guarda sin espacios alrededor. Solo se permiten `codigo` y `nombre` en el cuerpo; el cliente y el usuario se toman de la sesión.

Si el monitor está reservado para ese cliente, responde **201 con el nodo**, conservando su id del inventario. Lo deja `en_uso`, asigna `ubicacion_id`, `nombre`, `asignado_en` y `asignado_por`, y agrega un evento «Activado por el cliente como «Laboratorio»» con el usuario que lo activó. La actualización y el evento son atómicos: si falla una parte, no se guarda ninguna.

La ubicación y el monitor se bloquean con `FOR NO KEY UPDATE` durante esa sentencia. Dos activaciones simultáneas no pueden consumir la misma reserva; un cambio de reserva o de archivado también se respeta. Estos bloqueos permiten las comprobaciones de claves foráneas de las lecturas.

| Caso | Respuesta |
|---|---|
| JSON/campos, código, nombre o id inválidos | 400 con mensaje para corregir la petición |
| Sin token o con token falso/vencido | 401 `Inicia sesión de nuevo.` |
| Rol no autorizado o ubicación ajena/inexistente | 403 `No tienes permiso.` |
| Ubicación propia archivada | 409 `No se puede activar un nodo en una ubicación archivada.` |
| Código con formato válido que no existe | 404 `Código no encontrado. Revisa la etiqueta del monitor.` |
| Monitor sin reserva para el cliente de la sesión | 403 `Este código no está disponible para tu cuenta.` |
| Monitor propio ya `en_uso`, `desactivado` o `retirado` | 409 `Este monitor ya está en uso, desactivado o retirado.` |
| La reserva cambió antes de poder activarla | 409 `El monitor cambió de estado. Vuelve a cargar la página.` |
| Falla interna | 500 con mensaje legible; el detalle queda solo en el log |

Tras activarse, el flujo de recepción existente (#49) empieza a guardar sus lecturas en la ubicación asignada. No hace falta llamar a la API de inventario desde este endpoint: #66 y #67 usan el mismo registro de PostgreSQL. El cambio posterior de nombre, ubicación o estado se implementa en #75.

Para verificar el recorrido registro → reserva → activación → primera lectura, desde la raíz:

```bash
python -B -m unittest discover -s pruebas -p test_activacion.py -v
```

Las pruebas usan contenedores aislados y eliminan contenedores, volúmenes y red al terminar. `-B` evita generar caché de Python. Más detalles en [pruebas de activación](../pruebas/README.md#activación-de-monitores-67).

### `PATCH /api/dispositivos/:id` (#75)

```text
[PATCH /api/dispositivos/:id] → [verificar sesión] → [Validar cambios del nodo] → [Nodo y destino]
  → [Preparar cambios del nodo] → [Guardar cambios del nodo] → [Responder nodo]
```

Lo usa «Guardar cambios» de Gestionar nodos. Solo el cliente dueño del nodo, con cualquiera de estos campos (uno o varios):

| Campo | Qué hace | Evento |
|---|---|---|
| `nombre` | Renombra (1 a 60 caracteres, sin espacios a los lados) | `Renombrado de «A» a «B»` |
| `ubicacionId` | Lo mueve a otra ubicación **del mismo cliente** y no archivada. Las lecturas nuevas van al destino; las anteriores se quedan en el origen | `Movido de «X» a «Y»` |
| `estado: "desactivado"` | Deja de guardar lecturas (la recepción solo acepta `en_uso`) y sale del Panel; sigue en Gestionar nodos | `Desactivado por el cliente` |
| `estado: "en_uso"` | Lo reactiva | `Reactivado por el cliente` |

- Al desactivar o mover se cierran sus alertas abiertas con `nodo desactivado` o `nodo movido`.
- Un cambio que no cambia nada no anota eventos. Todo va en una sola sentencia: si falla, no queda nada a medias.
- Responde 200 con `{ id, ubicacionId, nombre, estado }`.

| Caso | Respuesta |
|---|---|
| Nodo o ubicación de destino de otro cliente, o nodo inexistente | 403 `No tienes permiso.` |
| Nodo que no está `en_uso` ni `desactivado` (reservado, retirado…) | 409 `Este nodo no está activo en tu cuenta.` |
| Destino archivado | 409 `No se puede mover a una ubicación archivada.` |
| Sin campos, campos de más, nombre vacío o largo, estado o ubicación inválidos | 400 |

## Alertas UMBRAL y SENSOR (#69)

```text
[Preparar evento] → [Buscar umbrales y alertas] → [Umbrales y alertas abiertas] → [Evaluar alertas]
  → [Guardar alerta] → [Avisar alerta] → [link out «Alerta guardada»] → (API y tiempo real) WebSocket
```

Con cada lectura guardada se leen los umbrales **activos** de la ubicación y las alertas abiertas del monitor, así que un cambio de umbral vale desde la siguiente lectura. Las variables son `temperatura`, `humedad`, `presion` y `calidad_aire` (Rs/R0).

| Tipo | Se abre | Se cierra (`motivo_cierre`) |
|---|---|---|
| UMBRAL | 2 lecturas seguidas `< valor_min` o `> valor_max` | 2 lecturas seguidas dentro del rango (`volvió al rango`), o si el umbral se desactiva o se borra (`umbral desactivado`) |
| SENSOR | El valor llega nulo 3 lecturas seguidas. El MQ-135 con `uptime` < 180 s no cuenta (precalentamiento) | Llega un valor (`el sensor volvió a responder`) |

- Un valor nulo no cuenta ni como fuera ni como dentro del rango. La calidad del aire sin Rs/R0 (sin R0) no abre UMBRAL.
- Mientras una UMBRAL está abierta no se repite: si llega un valor más lejos del rango, se guarda como `peor_valor`.
- Mensajes: `Temperatura sobre el máximo (28 °C)`, `Humedad bajo el mínimo (30 %)`, `Calidad del aire en nivel malo` (o `moderado`), `Presión sin respuesta`.
- Los contadores de lecturas seguidas viven en el contexto del flujo (`contadoresAlertas`, clave `dispositivo:variable`). Si Node-RED se reinicia, vuelven a cero: una alerta abierta se cierra igual con las 2 lecturas siguientes dentro del rango.
- El índice `uq_alerta_abierta` impide dos alertas abiertas iguales; el `INSERT` usa `ON CONFLICT DO NOTHING` y en ese caso no se avisa.

Cada alerta abierta, actualizada o cerrada sale por `/ws/lecturas` con la forma de `frontend/src/api/demo/datos.js` (`ALERTAS`):

```json
{
  "tipo": "alerta",
  "accion": "abierta",
  "ubicacionId": 1,
  "alerta": {
    "id": 1,
    "ubicacionId": 1,
    "dispositivoId": 1,
    "nodo": "Aula 3",
    "tipo": "UMBRAL",
    "variable": "temperatura",
    "mensaje": "Temperatura sobre el máximo (28 °C)",
    "abiertaEn": "2026-10-26T19:59:47.434Z",
    "cerradaEn": null,
    "peorValor": "31 °C"
  }
}
```

`accion` es `abierta`, `actualizada` (peor valor) o `cerrada`. El Panel ya recarga sus alertas con cualquier mensaje `tipo: "alerta"` de su ubicación.

## Flujo «Alertas y umbrales» (#72)

```text
[GET /api/ubicaciones/:id/alertas] → [verificar sesión] → [Validar alertas] → [Alertas de la ubicación] → [Responder alertas]
[link in «consultar umbrales»] → [Armar consulta de umbrales] → [Umbrales] → [Dar forma de umbrales] → [link out «volver»]
[GET /api/ubicaciones/:id/umbrales] → [verificar sesión] → [Validar ubicación] → [consultar umbrales]
[PUT /api/ubicaciones/:id/umbrales] → [verificar sesión] → [Validar umbrales] → [Guardar umbrales] → [Comprobar ubicación] → [consultar umbrales]
```

Las tres rutas son del cliente dueño de la ubicación: sin sesión 401, ubicación de otro cliente o inexistente 403, id inválido 400 `Ubicación no válida.`.

**`GET /api/ubicaciones/:id/alertas?estado=abiertas|cerradas`** (por defecto `abiertas`; otro valor 400 `Estado no válido.`): lista con la forma de `ALERTAS` del modo demo, `{ id, ubicacionId, dispositivoId, nodo, tipo, variable, mensaje, abiertaEn, cerradaEn, peorValor }`. `peorValor` lleva la unidad (`31.5 °C`). Las abiertas, de la más nueva a la más vieja por apertura; las cerradas, por cierre. Hasta 500.

**`GET /api/ubicaciones/:id/umbrales`** responde la forma de `UMBRALES` del modo demo:

```json
{
  "temperatura": { "min": 18, "max": 28 },
  "humedad": { "min": 30, "max": 60 },
  "presion": { "min": 740, "max": 760 },
  "calidadAire": "malo",
  "esperaSinConexionS": 120,
  "actualizadoPor": "Ana Rojas",
  "actualizadoEn": "2026-11-02T22:40:00.000Z"
}
```

`calidadAire` sale del umbral `calidad_aire` (Rs/R0 mínimo): `malo` = 0,5 (alerta con nivel malo), `moderado` = 0,8 (alerta con moderado o malo) y `nunca` = desactivado. `esperaSinConexionS` es `ubicaciones.espera_sin_conexion_s`.

**`PUT /api/ubicaciones/:id/umbrales`** con esa misma forma (sin `actualizado…`) guarda todo en una sentencia: los tres rangos quedan activos, la calidad del aire según la opción y la espera en la ubicación; anota quién y cuándo. Como «Evaluar alertas» lee los umbrales activos con cada lectura, valen desde la siguiente.

| Caso | Respuesta |
|---|---|
| Mínimo o máximo que no es número | 400 `Completa el mínimo y el máximo de … con números.` |
| Mínimo mayor o igual al máximo | 400 `El mínimo de … debe ser menor que el máximo.` |
| `calidadAire` distinto de `malo`, `moderado` o `nunca` | 400 `Elige cuándo alertar por la calidad del aire.` |
| Espera distinta de 30, 60, 120 o 300 | 400 `La espera debe ser de 30 segundos, 1, 2 o 5 minutos.` |

## Nodos sin conexión (#74)

```text
[Cada 30 s] → [Revisar nodos sin conexión] → [Abrir y cerrar SIN_CONEXION] → [Un aviso por alerta] → [Avisar alerta]
```

Cada 30 s una sola sentencia hace tres cosas:

- **Abre** una alerta `SIN_CONEXION` (`No envía datos`, sin variable) para cada monitor `en_uso` cuya última lectura es más vieja que la espera de su ubicación (`ubicaciones.espera_sin_conexion_s`: 60, 120 o 300 s). Un monitor que todavía no envió ninguna lectura («esperando la primera lectura») no abre alerta. El índice `uq_alerta_abierta` evita repetirla.
- **Cierra** con `volvió a conectarse` la que quedó abierta aunque ya llegó una lectura reciente (por si la lectura llegó justo mientras se abría).
- **Cierra** con `monitor fuera de uso` la de un monitor que se desactivó, se liberó, se retiró o cambió de ubicación.

Así la alerta se abre, como mucho, en la espera + 30 s.

Al llegar una lectura, «Evaluar alertas» cierra la `SIN_CONEXION` abierta con `volvió a conectarse` y reinicia los contadores de ese monitor, para que las lecturas de antes del corte no se sumen a las nuevas. Mientras la alerta está abierta el monitor no envía lecturas, así que no se abren otras alertas para él.

Cada apertura o cierre sale por `/ws/lecturas` con la misma forma que las demás alertas (`tipo: "alerta"`, `accion: "abierta"` o `"cerrada"`).

## Flujo «Historial» (#71)

```text
[GET /api/ubicaciones/:id/lecturas] → [link call «verificar sesión»] → [Validar filtros] → [Lecturas de la ubicación] → [Responder historial]
```

`GET /api/ubicaciones/:id/lecturas?desde&hasta&nodo&agrupar&pagina&porPagina` responde `{ total, pagina, porPagina, filas }` con la forma de `frontend/src/api/demo/historial.js`. Cada fila es `{ fecha, dispositivoId, nodo, temperatura, humedad, presion, rsR0, nivelAire }`, de la más nueva a la más vieja (el orden que usa la pantalla Historial). Solo el cliente dueño de la ubicación la ve; si no es suya, 403.

| Parámetro | Valor |
|---|---|
| `desde`, `hasta` | Fechas ISO. Por defecto, las últimas 24 h |
| `nodo` | Id del dispositivo; vacío = todos |
| `agrupar` | `ninguno` y `minuto` usan `lecturas` (crudas o promedio por minuto); `hora` y `dia` usan `lecturas_minuto` con `date_trunc` en hora de Bolivia, promediando con el peso de `n_lecturas` |
| `pagina`, `porPagina` | Desde 1; `porPagina` por defecto 20 y como máximo 1000 |

- Las lecturas cuentan en la ubicación donde se tomaron, aunque el nodo se haya movido después.
- Con datos agrupados, `nivelAire` se calcula del promedio de Rs/R0 (bueno ≥ 0,8; moderado ≥ 0,5; malo). Sin Rs/R0 es `sin_calibrar`, salvo que el MQ-135 no haya enviado nada (`null`).
- Errores 400: `Ubicación no válida.`, `Fecha no válida.`, `La fecha inicial debe ser anterior a la final.`, `Nodo no válido.` y `Agrupación no válida.`.
- `database/03_agregacion.sql` agrega el índice `(ubicacion_id, minuto)` de `lecturas_minuto` para que 7 días por hora respondan en menos de 1 s.

## Flujo «Gráficas» (#73)

```text
[GET /api/dispositivos/:id/serie] → [link call «verificar sesión»] → [Validar serie] → [Puntos y rango] → [Responder serie]
```

`GET /api/dispositivos/:id/serie?periodo=1h|24h|7d&variable=temperatura|humedad|presion|calidad_aire` responde `{ variable, periodo, rango, puntos }` con la forma de `frontend/src/api/demo/graficas.js`. `puntos` es `[{ fecha, valor }]`, del más viejo al más nuevo y sin valores nulos.

| Periodo | Fuente |
|---|---|
| `1h` | Lecturas crudas de `lecturas` |
| `24h` | Un punto por minuto de `lecturas_minuto` |
| `7d` | Promedio por hora de `lecturas_minuto`, con el peso de `n_lecturas` |

- `rango` es `{ min, max }` del umbral **activo** de esa variable en la ubicación del nodo, para dibujar la franja (en `calidad_aire`, `min` es el Rs/R0 mínimo). Sin umbral activo es `null`.
- Solo se ven las lecturas tomadas en la ubicación actual del nodo. Así, si un monitor se libera y pasa a otro cliente, el nuevo dueño no ve los datos del anterior.
- Un nodo de otro cliente o sin ubicación → 403. Periodo, variable o id inválidos → 400 (`Periodo no válido.`, `Variable no válida.`, `Nodo no válido.`). Por defecto, `1h` y `temperatura`.

## Flujo «Base de datos» (#45)

```text
[Cada minuto] → [Agregar por minuto] → [Lecturas por minuto] → [Contar minutos]
[Cada día a las 03:30] → [Limpiar lecturas viejas] → [Borrar crudas de más de 30 días] → [Anotar limpieza]
```

Llama a las funciones de `database/03_agregacion.sql`: `agregar_lecturas_minuto()` cada minuto (y una vez 20 s después de arrancar) y `limpiar_lecturas(30)` cada día a las 03:30. El estado de cada nodo muestra cuántos minutos se agregaron o cuántas lecturas se borraron la última vez, y la limpieza queda también en el log.

## Calidad del aire (#53)

Con el R0 de cada monitor (`dispositivos.mq135_r0_kohm`):

```text
RL_ef = 1 · 30 / (1 + 30) kΩ
Rs    = RL_ef · (5 − mq135_v) / mq135_v
Rs/R0 = Rs / R0
bueno si Rs/R0 ≥ 0.80 · moderado si ≥ 0.50 · malo si < 0.50
```

- `mq135_v` ya es el voltaje de AOUT: no se vuelve a multiplicar por 1.5.
- Rs/R0 se redondea a 3 decimales, que es lo que guarda la columna, y el nivel se calcula sobre ese valor. Así el nivel guardado siempre corresponde al Rs/R0 guardado.
- Sin R0, sin voltaje (precalentamiento) o con 5 V: `rs_r0` y `nivel_aire` quedan en `null` y la web muestra «sin calibrar».

## Horas y latencia

- `fecha_hora`: llegada al servidor. Es la hora oficial para el panel y el historial.
- `ts_dispositivo`: el `ts` del JSON, o `null`.
- `latencia_ms = llegada − ts`. Queda en `null` si `ts` es nulo o si la diferencia pasa de 10 s (reloj sin sincronizar). Una latencia negativa no se cambia a cero: indica desfase de reloj y se excluye al analizar.

## Probar

Simular el monitor real. Las contraseñas se toman del propio contenedor del broker. El client ID tiene que ser el ID del tema por la ACL de Mosquitto:

```bash
docker exec broker sh -c 'mosquitto_pub -u "$MQTT_USER_ESP32" -P "$MQTT_PASS_ESP32" -i F8B3B72BFC24 -t telemetria/F8B3B72BFC24/lecturas -m "$0"' \
  "{\"mac\":\"F8:B3:B7:2B:FC:24\",\"ts\":$(date +%s%3N),\"uptime\":3605,\"temperatura\":22.81,\"humedad\":46,\"presion\":748.4,\"mq135_v\":0.421,\"rssi\":-58,\"fw\":\"1.1.0\"}"

docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, latencia_ms, temperatura, presion, mq135_v, rs_r0, nivel_aire FROM lecturas ORDER BY id DESC LIMIT 3;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT ultima_lectura_en, ultimo_rssi, ultimo_uptime_s, fw FROM dispositivos WHERE id = 1;"'
```

Ver la API y escuchar el WebSocket (Node.js 22 trae `WebSocket`):

```bash
TOKEN=$(curl -s -X POST localhost:1880/api/login -H "Content-Type: application/json" \
  -d '{"email":"direccion@redvallealto.edu.bo","clave":"telemon123"}' | node -p "JSON.parse(require('fs').readFileSync(0)).token")
curl -s localhost:1880/api/ubicaciones/1/ultimas -H "Authorization: Bearer $TOKEN"
node -e "const ws = new WebSocket('ws://localhost:1880/ws/lecturas'); ws.onmessage = (e) => console.log(e.data);"
```

Con el segundo comando abierto, cada lectura publicada aparece como `{"tipo":"lectura","ubicacionId":1,...}`.

Para probar Rs/R0 con un R0 de prueba: `UPDATE dispositivos SET mq135_r0_kohm = 10.5 WHERE id = 1;` y publicar con `mq135_v` 0.421, 0.62 y 1.2 (bueno 1.002, moderado 0.651, malo 0.292). Al terminar hay que volver a dejarlo como estaba: `UPDATE dispositivos SET mq135_r0_kohm = NULL WHERE id = 1;`.

**Responsables:** Garnica Salazar, L. (recepción, API y WebSocket) · Bermudez Torrico, V. (sesión).
