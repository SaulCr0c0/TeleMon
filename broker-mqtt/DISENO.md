# Broker MQTT propio de TeleMon — versión 1 (QoS 0)

> Responsable: Cordova Villarroel, S. · Issues: #38, #51, #52 (y parte de #57) · HU-06
> Python 3.12 + `asyncio`, sin librerías MQTT: cada byte del protocolo se lee y se escribe a mano.

## 1. Qué es y para qué sirve

TeleMon usa MQTT para que los monitores (ESP32) envíen sus lecturas. La línea base es **Eclipse Mosquitto**, escrito en C. El aporte del proyecto es un **broker propio** que implementa MQTT 3.1.1 sobre sockets TCP, para entender el protocolo a bajo nivel y **compararlo con Mosquitto** en latencia, pérdidas y recursos.

Esta primera versión es deliberadamente simple: cubre solo lo que TeleMon necesita para arrancar, es decir, monitores que publican con **QoS 0** y Node-RED suscrito con comodines.

## 2. Qué hace esta versión

| Paquete MQTT | Soporte en la v1 |
|---|---|
| CONNECT / CONNACK | ✅ Valida `MQTT` nivel 4, usuario y contraseña. Códigos 0 (aceptada), 1 (versión), 4 (usuario o clave), 5 (sin usuario) |
| PUBLISH | ✅ Solo QoS 0. Un PUBLISH con QoS 1 o 2 cierra la conexión |
| SUBSCRIBE / SUBACK | ✅ Filtros con `+` y `#`. Se concede QoS 0; un filtro inválido recibe `0x80` |
| UNSUBSCRIBE / UNSUBACK | ✅ |
| PINGREQ / PINGRESP | ✅ |
| DISCONNECT | ✅ |
| Keepalive | ✅ Desconecta a quien pase 1,5 × keepalive sin enviar nada |
| Client id repetido | ✅ La conexión nueva reemplaza a la anterior |
| Client id vacío | ✅ Recibe uno generado (`auto-xxxxxxxxxxxx`) |
| ACL por usuario y client id | ✅ Mismas reglas que Mosquitto (`%c` y `%u`). Un PUBLISH sin permiso se descarta; un SUBSCRIBE sin permiso recibe `0x80` |
| MQTT sobre WebSocket | ✅ Puerto 9001, subprotocolo `mqtt`, para los ESP32 que entran por `wss://mqtt2.telemon.site` |
| QoS 1 y 2, retain, testamento, sesiones persistentes | ❌ Fuera de la v1 |

## 3. Cómo funciona

### 3.1 Archivos

| Archivo | Responsabilidad |
|---|---|
| `paquetes.py` | Leer un paquete del socket, decodificar CONNECT, PUBLISH, SUBSCRIBE y UNSUBSCRIBE, y armar las respuestas |
| `temas.py` | Validar filtros y temas, y decidir si un filtro coincide con un tema |
| `usuarios.py` | Leer `BROKER_USERS` y comparar contraseñas en tiempo constante |
| `acl.py` | Leer `BROKER_ACL` y decidir qué puede publicar y leer cada cliente |
| `websocket.py` | Saludo HTTP de WebSocket y tramas, para que una conexión WebSocket se vea igual que una TCP |
| `broker.py` | El servidor: una corrutina por conexión, la sesión de cada cliente y el enrutamiento |
| `pruebas/` | 63 pruebas unitarias y de integración |
| `probar.sh` | 6 pruebas con `mosquitto_pub` y `mosquitto_sub` contra el contenedor |

### 3.2 Un solo hilo, muchas conexiones

`asyncio.start_server` ejecuta `Broker.atender` por cada conexión TCP. Todas comparten un hilo y un bucle de eventos: mientras una conexión espera datos, el bucle atiende a las demás. No hay hilos ni candados.

### 3.3 Cómo se lee un paquete

```
byte 1:        TTTT FFFF      T = tipo (1 CONNECT, 3 PUBLISH, 8 SUBSCRIBE…), F = banderas
bytes 2 a 5:   longitud restante, 7 bits por byte; el bit alto indica que sigue otro byte
```

Ejemplo: 321 se escribe `0xC1 0x02` (65 + 2 × 128). Las cadenas van con su largo en 2 bytes. Un paquete de más de 256 KB o mal formado cierra la conexión.

### 3.4 Vida de una conexión

```
TCP aceptado
   │  ≤ 10 s
   ▼
CONNECT ──► ¿MQTT nivel 4? ──no──► CONNACK 1 y cierre
                 │ sí
                 ▼
          ¿usuario y clave? ──no──► CONNACK 4 o 5 y cierre
                 │ sí
                 ▼
             CONNACK 0
                 │
Sesión (máximo 1,5 × keepalive entre paquetes)
   ├─ PUBLISH QoS 0 → enrutar
   ├─ SUBSCRIBE     → guardar filtros → SUBACK
   ├─ UNSUBSCRIBE   → quitar filtros → UNSUBACK
   ├─ PINGREQ       → PINGRESP
   ├─ DISCONNECT    → cierre
   └─ otro / QoS>0  → cierre con el motivo en el registro
```

### 3.5 Enrutamiento y temas

Cada PUBLISH se codifica una vez y se envía, una sola vez, a cada cliente con algún filtro que coincida.

- `+` reemplaza un nivel: `telemetria/+/lecturas` coincide con `telemetria/F8B3B72BFC24/lecturas`.
- `#` reemplaza el resto: `telemetria/#` coincide con `telemetria` y con `telemetria/x/y`.
- Los temas que empiezan con `$` no coinciden con filtros que empiezan con `+` o `#`.

### 3.6 Seguridad

- Sin usuario → CONNACK 5; usuario o clave incorrectos → CONNACK 4. Las claves se comparan con `hmac.compare_digest`.
- 10 s para enviar el CONNECT y 256 KB por paquete.
- El contenedor corre con un usuario sin privilegios.

### 3.7 Registro

```
INFO    Broker TeleMon escuchando en el puerto 1883 (MQTT 3.1.1, QoS 0)
INFO    Conectado nodered desde 172.19.0.4:35894 como nodered
INFO    SUBSCRIBE nodered → telemetria/+/lecturas
INFO    PUBLISH F8B3B72BFC24 → telemetria/F8B3B72BFC24/lecturas (150 bytes, 1 entregas)
WARNING CONNECT rechazado desde 172.19.0.4:35904 (código 4): AABBCCDDEEFF: usuario o clave incorrectos
INFO    Desconectado F8B3B72BFC24 (172.19.0.5:50462): keepalive vencido
```

### 3.8 ACL por monitor

Son las mismas reglas que `mosquitto/config/entrypoint.sh` le da a Mosquitto:

```
esp32   write  telemetria/%c/lecturas    cada monitor solo publica en su propio tema
nodered read   telemetria/#              Node-RED solo lee la telemetría
```

- `BROKER_ACL` lleva las reglas como `usuario:accion:patron`, separadas por comas. La acción es `read`, `write` o `readwrite`. En el compose se arman solas a partir de `MQTT_USER_ESP32` y `MQTT_USER_NODERED`.
- Al conectarse, `%c` se reemplaza por el client id y `%u` por el usuario. Si el client id trae `/`, `+` o `#`, la regla no se aplica: así nadie puede elegir un client id que le abra temas ajenos.
- **PUBLISH sin permiso:** se descarta y se anota `PUBLISH denegado por la ACL`, sin cortar la conexión (igual que Mosquitto con QoS 0).
- **SUBSCRIBE sin permiso:** el filtro recibe `0x80` en el SUBACK. Un filtro se permite solo si todo lo que abarca está dentro de un patrón de lectura (`cubre` en `acl.py`): `telemetria/+/lecturas` entra en `telemetria/#`, pero `#` no.
- Si `BROKER_ACL` queda vacío, no hay restricciones y el broker lo advierte al arrancar.

### 3.9 MQTT sobre WebSocket

Los ESP32 que están fuera de la red del server publican por `wss://`, que entra por Cloudflare. Cloudflare pone el TLS, así que el broker solo necesita WebSocket simple (RFC 6455) en el puerto 9001:

```
ESP32 ──wss://mqtt2.telemon.site──► Cloudflare ──túnel──► cloudflared ──ws://broker_propio:9001──► broker
```

1. **Saludo:** el cliente manda un `GET` con `Upgrade: websocket` y `Sec-WebSocket-Key`. El broker responde `101 Switching Protocols` con `Sec-WebSocket-Accept` = base64(SHA-1(clave + GUID del RFC)) y el subprotocolo `mqtt`. Cualquier otro pedido recibe `400`.
2. **Tramas:** las del cliente llegan enmascaradas y el broker les quita la máscara; las del broker van sin máscara. Un `ping` se responde con `pong`, un `close` con `close`, y una trama de texto cierra la conexión (MQTT va en tramas binarias).
3. **Mismo código de sesión:** `LectorWS` junta los datos de las tramas binarias y entrega bytes con `readexactly`, igual que un socket TCP. Por eso `conectar`, `sesion` y la ACL son los mismos para los dos puertos, y no importa si un paquete MQTT llega partido en varias tramas o si varios paquetes vienen en una.
4. **IP real:** detrás del túnel todas las conexiones vienen de `cloudflared`, así que el log usa la cabecera `Cf-Connecting-Ip`.

## 4. Cómo usarlo

| Variable (`.env`) | Para qué | Por defecto |
|---|---|---|
| `MQTT_BROKER` | Broker que usa Node-RED: `broker` (Mosquitto) o `broker_propio` | `broker` |
| `BROKER_USERS` | `usuario:clave,usuario:clave` | Los de `MQTT_USER_*` y `MQTT_PASS_*` |
| `BROKER_ACL` | `usuario:accion:patron,…` | Las mismas reglas que Mosquitto |
| `BROKER_PROPIO_PORT` | Puerto MQTT en tu compu | `1884` |
| `BROKER_LOG` | `DEBUG`, `INFO`, `WARNING` | `INFO` |

```bash
docker compose up -d --build broker_propio
docker compose logs -f broker_propio
./broker-mqtt/probar.sh
```

Sin Docker:

```bash
cd broker-mqtt
python3 -m unittest discover -s pruebas -t . -v
BROKER_USERS=esp32:clave,nodered:clave BROKER_PUERTO=1884 BROKER_PUERTO_WS=9002 python3 broker.py
```

### 4.1 Cambiar de broker

Los dos brokers corren a la vez. Para que Node-RED use el propio, en el `.env`:

```bash
MQTT_BROKER=broker_propio
```

```bash
docker compose up -d nodered
docker compose logs nodered | grep "Connected to broker"
```

Debe decir `nodered@mqtt://broker_propio:1883`. Para volver a Mosquitto: `MQTT_BROKER=broker` y otra vez `docker compose up -d nodered`.

Los ESP32 eligen el broker con `MQTT_URI` en `firmware/include/secrets.h`:

| Broker | En la red del server | Desde otra red |
|---|---|---|
| Mosquitto | `mqtt://<IP del server>:1883` | `wss://mqtt.telemon.site:443/` |
| Propio | `mqtt://<IP del server>:1884` | `wss://mqtt2.telemon.site:443/` |

Un ESP32 conectado a un broker solo llega a Node-RED si Node-RED usa ese mismo broker.

## 5. Qué sigue

1. QoS 1 (PUBACK) en la entrada.
2. Límite de búfer por cliente lento y resumen de estado periódico.
3. Testamento (Last Will) para avisar de un monitor caído.
4. Retain, para que el panel tenga la última lectura al suscribirse.
5. Comparativa formal con Mosquitto (#80).
