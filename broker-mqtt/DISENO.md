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
| QoS 1 y 2, retain, testamento, sesiones persistentes, ACL | ❌ Fuera de la v1 |

## 3. Cómo funciona

### 3.1 Archivos

| Archivo | Responsabilidad |
|---|---|
| `paquetes.py` | Leer un paquete del socket, decodificar CONNECT, PUBLISH, SUBSCRIBE y UNSUBSCRIBE, y armar las respuestas |
| `temas.py` | Validar filtros y temas, y decidir si un filtro coincide con un tema |
| `usuarios.py` | Leer `BROKER_USERS` y comparar contraseñas en tiempo constante |
| `broker.py` | El servidor: una corrutina por conexión, la sesión de cada cliente y el enrutamiento |
| `pruebas/` | 32 pruebas unitarias y de integración |
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

## 4. Cómo usarlo

| Variable (`.env`) | Para qué | Por defecto |
|---|---|---|
| `BROKER_USERS` | `usuario:clave,usuario:clave` (los mismos de Mosquitto) | — |
| `BROKER_PROPIO_PORT` | Puerto en tu compu | `1884` |
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
BROKER_USERS=esp32:clave,nodered:clave BROKER_PUERTO=1884 python3 broker.py
```

## 5. Qué sigue

1. QoS 1 (PUBACK) en la entrada.
2. Límite de búfer por cliente lento y resumen de estado periódico.
3. Testamento (Last Will) para avisar de un monitor caído.
4. ACL por client id, como Mosquitto.
5. Retain, para que el panel tenga la última lectura al suscribirse.
6. Comparativa formal con Mosquitto (#80).
