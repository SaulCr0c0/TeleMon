# nodered

Backend de TeleMon en Node-RED 4.0.9 con `node-red-contrib-postgresql`. Contiene la **recepción de lecturas** (#49), el **cálculo de Rs/R0** (#53), la **API de últimas lecturas** y el **WebSocket** `/ws/lecturas` (#54), la **sesión** con login, token y permisos (#63), la **API de ubicaciones** (#64), el **inventario** de monitores (#66) y el **motor de alertas** UMBRAL y SENSOR (#69).

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
3. **Calcular aire y tiempos.** Solo sigue si el monitor está `en_uso`, tiene ubicación y esa ubicación es de su mismo cliente. Calcula la latencia y Rs/R0.
4. **Guardar lectura.** Una sola sentencia actualiza el monitor (última lectura, RSSI, uptime y firmware) e inserta la lectura, y solo si el monitor sigue `en_uso` en esa ubicación. Si algo falla no se guarda nada y no sale ningún evento. Un mensaje más viejo no hace retroceder los datos del monitor, y un RSSI, uptime o firmware nulo no borra el último conocido.
5. **Preparar evento.** Deja en `msg.payload` el aviso de la lectura guardada (`tipo`, `ubicacionId`, `dispositivoId`, `fecha`, las tres variables, `rsR0`, `nivelAire`) y lo pasa a «Lectura guardada». De ahí sale al WebSocket. El mismo mensaje entra también a las alertas (#69); la alerta sin conexión (#74) y los reinicios (#76) se conectan en el mismo punto.

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
python -m unittest discover -s pruebas -p test_ubicaciones.py -v
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
- El subflujo «consultar monitores» recibe `msg.filtro` (`{}`, `{ estado }` o `{ id }`) y devuelve la lista con esa forma. Lo pueden reusar la ficha (#70) y la activación (#67).

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
