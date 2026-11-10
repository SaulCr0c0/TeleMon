# Comparativa: Mosquitto vs. broker propio (#80)

> HU-17 · Medido el 09/11/2026 en `telemon-server` · Script: [`pruebas/comparativa_brokers.py`](../pruebas/comparativa_brokers.py) · Datos: [`pruebas/comparativa/2026-11-09/`](../pruebas/comparativa/2026-11-09/)

## Resumen

- **Ningún broker perdió mensajes:** 0 de 1 332 986 en 36 corridas.
- **Con la carga de TeleMon, los dos sobran.** Hasta 50 monitores publicando una vez por segundo (cinco veces la frecuencia real del ESP32, que publica cada 5 s), la latencia p50 es de 0,5 a 0,6 ms en Mosquitto y de 0,8 a 2,7 ms en el broker propio. Es menos del 1 % de lo que agregan el Wi-Fi y el túnel (de 220 ms a 1 s).
- **Con alta carga (unos 5 000 mensajes/s), Mosquitto gana con claridad:** usa el 20 % de un núcleo frente al 69–78 % del propio. Python interpreta cada paquete y Mosquitto, que está escrito en C, no.
- **El log de cada PUBLISH es el principal cuello de botella del broker propio.** Con `BROKER_LOG=INFO`, la p50 de alta carga sube a 29 ms y frena a los publicadores. Con `WARNING`, baja a 0,44 ms, cerca de Mosquitto.
- **RAM:** Mosquitto ocupa de 2,3 a 3,1 MiB y el propio de 17,1 a 17,6 MiB, casi todo del intérprete de Python. Con la carga, ninguno crece más de 0,8 MiB.
- **En el cable son idénticos:** la misma cantidad de bytes en cada paquete del ciclo CONNECT/PUBLISH/DISCONNECT.

## Condiciones

| | |
|---|---|
| Equipo | `telemon-server`: Intel Pentium G2030 a 3,0 GHz (2 núcleos), 7,5 GiB de RAM, Ubuntu 24.04 (kernel 6.8), Docker 29.9.2 |
| Brokers | Eclipse Mosquitto 2.1.2 con la configuración del repo (`mosquitto/config`). Broker propio del commit `9ddd9e8`, Python 3.12.16 |
| Variantes del propio | `propio`: tal como está en producción (`BROKER_LOG=INFO`, una línea por PUBLISH). `propio-sin-log`: `BROKER_LOG=WARNING` |
| Seguridad | Los dos con usuario y contraseña y la misma ACL (`esp32` escribe en `telemetria/%c/lecturas`, `nodered` lee `telemetria/#`) |
| Aislamiento | Red Docker propia (`telemon-comparativa`), contenedores nuevos y claves de prueba al azar. Sin Node-RED: el único suscriptor es el cliente que mide. El stack de producción siguió corriendo, sin ESP32 conectados |
| Cliente | `pruebas/carga.py` (paho-mqtt 2.1.0, QoS 0) en un contenedor de la misma red. N publicadores, cada uno en su propio `telemetria/<ID>/lecturas`, más un oyente en `telemetria/+/lecturas`. Mensaje JSON de unos 230 bytes, como el del ESP32 |
| Latencia | Del publicador al broker y del broker al oyente, en el mismo equipo. Mide solo el broker: no incluye Wi-Fi, túnel ni Node-RED |
| CPU y RAM | Leídas del cgroup v2 del contenedor cada 0,5 s. La CPU se expresa en % de un núcleo; la RAM es `memory.current − inactive_file`, como en `docker stats` |
| Repeticiones | 3 por escenario y broker, alternando el orden. Antes de cada corrida, el broker se reinicia y se mide 5 s en reposo |

| Escenario | Publicadores | Intervalo | Duración | Mensajes por corrida |
|---|---|---|---|---|
| `1-cliente` | 1 | 1 s | 60 s | 60 |
| `10-clientes` | 10 | 1 s | 60 s | 600 |
| `50-clientes` | 50 | 1 s | 60 s | 3 000 |
| `estres-50` | 50 | 0,01 s | 30 s | ~150 000 (hasta 5 000/s) |

## Resultados

Las latencias combinan las 3 repeticiones. La CPU es el promedio durante la carga y la RAM va del valor en reposo al máximo.

| Escenario | Broker | Enviados | Perdidos | p50 (ms) | p95 (ms) | p99 (ms) | CPU (%) | RAM (MiB) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 cliente | Mosquitto | 180 | 0 | 0,60 | 0,68 | 37,82 ¹ | 0,05 | 2,3 → 2,5 |
| | Propio | 180 | 0 | 0,81 | 0,86 | 1,07 | 0,06 | 17,1 → 17,1 |
| | Propio (log WARNING) | 180 | 0 | 0,81 | 0,87 | 1,22 | 0,05 | 17,1 → 17,1 |
| 10 clientes | Mosquitto | 1 800 | 0 | 0,54 | 1,61 | 4,18 | 0,16 | 2,3 → 2,6 |
| | Propio | 1 800 | 0 | 1,03 | 2,07 | 3,05 | 0,37 | 17,1 → 17,1 |
| | Propio (log WARNING) | 1 800 | 0 | 0,85 | 1,03 | 2,46 | 0,29 | 17,1 → 17,1 |
| 50 clientes | Mosquitto | 9 000 | 0 | 0,54 | 2,08 | 3,12 | 0,55 | 2,3 → 2,9 |
| | Propio | 9 000 | 0 | 2,71 | 6,38 | 8,11 | 1,65 | 17,1 → 17,2 |
| | Propio (log WARNING) | 9 000 | 0 | 0,86 | 1,75 | 3,60 | 1,42 | 17,1 → 17,2 |
| Estrés (50) | Mosquitto | 445 940 | 0 | 0,28 | 1,89 | 3,58 | 19,8 | 2,3 → 3,1 |
| | Propio | 411 589 | 0 | 29,02 | 58,73 | 78,11 | 77,8 | 17,1 → 17,6 |
| | Propio (log WARNING) | 442 517 | 0 | 0,44 | 2,80 | 11,32 | 69,4 | 17,1 → 17,5 |

¹ Es siempre el primer mensaje de cada corrida (37,4 a 38,8 ms en las tres repeticiones). Los otros 177 están por debajo de 1 ms. El valor coincide con el ACK retardado de TCP en Linux (40 ms) en el primer envío al oyente, no con el procesamiento del broker.

**Tasa alcanzada en estrés:** el cliente intenta 5 000 mensajes/s. Mosquitto aceptó 4 954/s y el propio con log WARNING 4 916/s. El propio con log INFO aceptó solo 4 527/s: al no dar abasto, TCP frena a los publicadores. Por eso envió menos mensajes en el mismo tiempo, y aun así no perdió ninguno.

### Distribución de la latencia en estrés

| Percentil | Mosquitto (ms) | Propio (ms) | Propio, log WARNING (ms) |
|---:|---:|---:|---:|
| 10 | 0,27 | 12,24 | 0,38 |
| 50 | 0,28 | 29,02 | 0,44 |
| 90 | 0,36 | 51,01 | 0,74 |
| 95 | 1,89 | 58,73 | 2,80 |
| 99 | 3,58 | 78,11 | 11,32 |
| 99,9 | 22,94 | 127,40 | 37,91 |

La tabla completa (16 percentiles) está en `percentiles_estres.csv`.

## Captura del ciclo CONNECT/PUBLISH

`mosquitto-ciclo.pcap` y `propio-ciclo.pcap` se abren en Wireshark (el puerto 1883 se decodifica como MQTT). Cada uno es un cliente que se conecta, publica una lectura y se desconecta. `*-ciclo.csv` tiene el mismo detalle en texto.

| Paquete | Bytes MQTT | Mosquitto (s) | Propio (s) |
|---|---:|---:|---:|
| SYN / SYN-ACK / ACK | — | 0 / 0,000017 / 0,000038 | 0 / 0,000019 / 0,000041 |
| CONNECT | 59 | 0,000155 | 0,000156 |
| CONNACK | 4 | 0,001727 | 0,000532 |
| PUBLISH (`telemetria/A1B2C3D4E5F6/lecturas`) | 187 | 0,501018 | 0,501288 |
| DISCONNECT | 2 | 1,001486 | 1,002099 |
| FIN / FIN / ACK | — | 1,001580 – 1,001634 | 1,002208 – 1,002587 |

- Los dos brokers mandan exactamente los mismos bytes y los mismos paquetes TCP. El propio implementa el formato de MQTT 3.1.1 igual que Mosquitto.
- **Respuesta al CONNECT:** Mosquitto tarda 1,57 ms y el propio 0,38 ms. Mosquitto guarda la contraseña como hash PBKDF2-SHA512 (`mosquitto_passwd`) y recalcularlo en cada conexión cuesta tiempo. El propio compara la clave en texto plano que recibe de `BROKER_USERS` (con `hmac.compare_digest`). El propio es más rápido acá porque protege menos la contraseña guardada, no porque sea más eficiente.

## Conclusiones

1. **Los dos brokers cumplen para TeleMon.** Un monitor publica cada 5 s: incluso 50 monitores son 10 mensajes/s, y ahí los dos responden en milisegundos, sin pérdidas y con menos del 2 % de un núcleo.
2. **Mosquitto escala mejor:** con 5 000 mensajes/s usa unas 3,5 veces menos CPU que el propio sin log y entre 5 y 7 veces menos RAM. Para producción se mantiene Mosquitto (`MQTT_BROKER=broker`), que además ofrece QoS 1 y 2, mensajes retenidos y contraseñas guardadas con hash.
3. **Si se usa el broker propio con muchos nodos, conviene `BROKER_LOG=WARNING`.** Con un log por PUBLISH, el registro le cuesta más que el protocolo mismo. Ese log sirve para depurar y para la defensa, no para carga alta.
4. **El broker propio cumple su objetivo académico:** implementa MQTT 3.1.1 byte a byte, con la misma captura en el cable que Mosquitto, ACL y WebSocket, y con un comportamiento predecible bajo carga.

## Repetir la medición

En un equipo con Docker, desde la raíz del repo. No hace falta el `.env`: el script crea claves de prueba.

```bash
python3 -B pruebas/comparativa_brokers.py
python3 -B pruebas/comparativa_brokers.py --repeticiones 1 --duracion 10 --escenarios 1-cliente estres-50
```

El primero tarda unos 40 minutos y el segundo, de prueba rápida, unos 3. Los resultados quedan en `pruebas/comparativa/<fecha>/`: `resumen.csv`, `corridas.csv`, `entorno.json`, las capturas y los crudos (que no se suben a git). Al terminar, el script borra la red y los contenedores de prueba.
