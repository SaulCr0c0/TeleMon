# Comparativa: Mosquitto vs. broker propio (#80)

> HU-17 · Medido el 09/11/2026 en `telemon-server` · Script: [`pruebas/comparativa_brokers.py`](../pruebas/comparativa_brokers.py) · Datos: [`pruebas/comparativa/2026-11-09_optimizado/`](../pruebas/comparativa/2026-11-09_optimizado/) (definitiva) y [`pruebas/comparativa/2026-11-09/`](../pruebas/comparativa/2026-11-09/) (preliminar)

## Resumen

- **Ningún broker perdió mensajes:** 0 de 1 786 519 en las 48 corridas de la medición definitiva (y 0 de 1 332 986 en la preliminar).
- **Con la carga de TeleMon, los dos sobran.** Hasta 50 monitores publicando una vez por segundo (cinco veces la frecuencia real del ESP32), la latencia p50 es de 0,53 a 0,60 ms en Mosquitto y de 0,75 a 0,87 ms en el broker propio optimizado. Es menos del 1 % de lo que agregan el Wi-Fi y el túnel (de 220 ms a 1 s).
- **La optimización del broker propio funcionó.** Con unos 5 000 mensajes/s, la p50 bajó de 22,4 ms a 0,29 ms (77 veces menos, casi igual a los 0,29 ms de Mosquitto) y la CPU de 75 % a 44 % de un núcleo. Ahora acepta la misma tasa que Mosquitto.
- **Mosquitto sigue usando menos recursos:** 16 % de un núcleo frente al 44 % del propio, y de 2,3 a 3,1 MiB de RAM frente a 17,4–17,7 MiB, casi todo del intérprete de Python.
- **En el cable son idénticos:** la misma cantidad de bytes en cada paquete del ciclo CONNECT/PUBLISH/DISCONNECT.

## Qué se optimizó

La medición preliminar mostró que el broker propio, con su configuración de producción, subía la p50 a 29 ms con carga alta. Se cambiaron cuatro cosas (commit `2be92e5`, detalle en [`broker-mqtt/DISENO.md`](../broker-mqtt/DISENO.md)):

| Cambio | Antes | Después |
|---|---|---|
| Log de cada PUBLISH | Una línea `INFO` por mensaje | Solo en `DEBUG`; en `INFO`, un resumen cada 60 s (`BROKER_RESUMEN_S`) |
| Lectura | Un `await` por el primer byte, otro por cada byte de la longitud y otro por el cuerpo | Bloques de hasta 64 KB a un búfer, del que `extraer` separa todos los paquetes completos |
| Salida | `await drain()` después de cada paquete | `drain()` solo si el búfer de salida pasa de 256 KB |
| Enrutamiento | Por cada PUBLISH, recorrer todos los clientes y filtros, revalidar el tema contra la ACL y recodificar el tema | Rutas por tema y permisos por cliente guardados; el PUBLISH se reenvía con el mismo cuerpo |

Las 63 pruebas anteriores siguen pasando, más 10 nuevas: paquetes byte a byte, varios paquetes en un mismo envío, rutas que se actualizan al suscribirse o desuscribirse y el resumen periódico.

## Condiciones

| | |
|---|---|
| Equipo | `telemon-server`: Intel Pentium G2030 a 3,0 GHz (2 núcleos), 7,5 GiB de RAM, Ubuntu 24.04 (kernel 6.8), Docker 29.9.2 |
| Brokers | Eclipse Mosquitto 2.1.2 con la configuración del repo (`mosquitto/config`). Broker propio en Python 3.12.16, en tres variantes |
| Variantes del propio | `propio-anterior`: versión de `main` antes de optimizar (`9ddd9e8`), log `INFO`. `propio`: versión optimizada (`2be92e5`), log `INFO` como en producción. `propio-sin-log`: optimizada con `BROKER_LOG=WARNING` |
| Seguridad | Los cuatro con usuario y contraseña y la misma ACL (`esp32` escribe en `telemetria/%c/lecturas`, `nodered` lee `telemetria/#`) |
| Aislamiento | Red Docker propia (`telemon-comparativa`), contenedores nuevos y claves de prueba al azar. Sin Node-RED: el único suscriptor es el cliente que mide. El stack de producción siguió corriendo, sin ESP32 conectados |
| Cliente | `pruebas/carga.py` (paho-mqtt 2.1.0, QoS 0, `--nodelay`) en un contenedor de la misma red. N publicadores, cada uno en su propio `telemetria/<ID>/lecturas`, más un oyente en `telemetria/+/lecturas`. Mensaje JSON de unos 230 bytes, como el del ESP32 |
| Latencia | Del publicador al broker y del broker al oyente, en el mismo equipo. Mide solo el broker: no incluye Wi-Fi, túnel ni Node-RED |
| CPU y RAM | Leídas del cgroup v2 del contenedor cada 0,5 s. La CPU se expresa en % de un núcleo; la RAM es `memory.current − inactive_file`, como en `docker stats` |
| Repeticiones | 3 por escenario y broker, alternando el orden. Antes de cada corrida, el broker se reinicia y se mide 5 s en reposo |

| Escenario | Publicadores | Intervalo | Duración | Mensajes por corrida |
|---|---|---|---|---|
| `1-cliente` | 1 | 1 s | 60 s | 60 |
| `10-clientes` | 10 | 1 s | 60 s | 600 |
| `50-clientes` | 50 | 1 s | 60 s | 3 000 |
| `estres-50` | 50 | 0,01 s | 30 s | ~148 000 (hasta 5 000/s) |

**Por qué `--nodelay`:** paho no desactiva el algoritmo de Nagle, y en las pruebas en la laptop algunos mensajes de los publicadores quedaban retenidos unos 40 ms hasta el ACK retardado de TCP, incluso con Mosquitto, sin que el broker hiciera nada. Con `TCP_NODELAY` en el cliente, la latencia medida es la del broker. La medición preliminar se hizo sin esta opción.

## Resultados

Las latencias combinan las 3 repeticiones. La CPU es el promedio durante la carga y la RAM va del valor en reposo al máximo.

| Escenario | Broker | Enviados | Perdidos | p50 (ms) | p95 (ms) | p99 (ms) | CPU (%) | RAM (MiB) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 cliente | Mosquitto | 180 | 0 | 0,60 | 0,64 | 38,57 ¹ | 0,05 | 2,3 → 2,5 |
| | Propio antes | 180 | 0 | 0,81 | 0,95 | 1,45 | 0,06 | 17,1 → 17,1 |
| | Propio optimizado | 180 | 0 | 0,76 | 0,79 | 0,88 | 0,04 | 17,4 → 17,4 |
| | Optimizado, log WARNING | 180 | 0 | 0,75 | 0,79 | 0,89 | 0,04 | 17,4 → 17,4 |
| 10 clientes | Mosquitto | 1 800 | 0 | 0,53 | 0,68 | 1,63 | 0,18 | 2,3 → 2,6 |
| | Propio antes | 1 800 | 0 | 1,02 | 2,03 | 2,73 | 0,38 | 17,1 → 17,1 |
| | Propio optimizado | 1 800 | 0 | 0,87 | 2,75 | 3,26 | 0,25 | 17,4 → 17,4 |
| | Optimizado, log WARNING | 1 800 | 0 | 0,86 | 1,04 | 2,03 | 0,27 | 17,4 → 17,4 |
| 50 clientes | Mosquitto | 9 000 | 0 | 0,55 | 2,19 | 3,19 | 0,55 | 2,3 → 3,1 |
| | Propio antes | 9 000 | 0 | 3,01 | 6,76 | 8,14 | 1,76 | 17,1 → 17,2 |
| | Propio optimizado | 9 000 | 0 | 0,85 | 1,45 | 3,57 | 1,14 | 17,4 → 17,5 |
| | Optimizado, log WARNING | 9 000 | 0 | 0,85 | 1,16 | 2,45 | 1,12 | 17,4 → 17,5 |
| Estrés (50) | Mosquitto | 443 958 | 0 | 0,29 | 1,11 | 2,97 | 16,0 | 2,3 → 3,1 |
| | Propio antes | 414 769 | 0 | 22,41 | 43,77 | 59,65 | 75,4 | 17,1 → 17,7 |
| | Propio optimizado | 442 499 | 0 | 0,29 | 1,64 | 4,04 | 43,7 | 17,4 → 17,7 |
| | Optimizado, log WARNING | 441 373 | 0 | 0,29 | 1,90 | 3,92 | 44,0 | 17,4 → 17,7 |

¹ Es siempre el primer mensaje de cada corrida (37,9 a 38,6 ms en las tres repeticiones); los otros 177 tardan menos de 1 ms. Aparece aunque el cliente use `TCP_NODELAY`, así que la espera está en el tramo de Mosquitto al oyente. Mosquitto deja activo el algoritmo de Nagle por defecto (`set_tcp_nodelay false`), y su primer envío espera el ACK retardado de TCP (40 ms en Linux). `asyncio` desactiva Nagle en cada conexión, por eso el broker propio no muestra ese salto.

**Tasa alcanzada en estrés:** el cliente intenta 5 000 mensajes/s. Mosquitto aceptó 4 932/s, el optimizado 4 916/s y el optimizado con log WARNING 4 903/s. El broker sin optimizar aceptó solo 4 579/s: al no dar abasto, TCP frena a los publicadores. Por eso envió menos mensajes en el mismo tiempo, y aun así no perdió ninguno.

**Con 10 clientes,** la p95 del optimizado con log `INFO` (2,75 ms) salió algo mayor que la del anterior (2,03 ms), aunque la p50 y la CPU bajaron. Son 90 mensajes por encima del percentil 95 en 1 800, a 1 mensaje/s: la diferencia está dentro del ruido de la medición y no se repite con 50 clientes ni en estrés.

### Distribución de la latencia en estrés

| Percentil | Mosquitto (ms) | Propio antes (ms) | Propio optimizado (ms) | Optimizado, log WARNING (ms) |
|---:|---:|---:|---:|---:|
| 10 | 0,28 | 9,97 | 0,28 | 0,28 |
| 50 | 0,29 | 22,41 | 0,29 | 0,29 |
| 90 | 0,32 | 36,64 | 0,46 | 0,48 |
| 95 | 1,11 | 43,77 | 1,64 | 1,90 |
| 99 | 2,97 | 59,65 | 4,04 | 3,92 |
| 99,9 | 4,41 | 86,56 | 6,05 | 5,63 |

La tabla completa (16 percentiles) está en `percentiles_estres.csv`.

### Medición preliminar (sin `--nodelay`, antes de optimizar)

En la primera corrida se midieron Mosquitto, el propio sin optimizar con log `INFO` y el mismo con log `WARNING`, con el cliente sin `TCP_NODELAY` ([`2026-11-09/`](../pruebas/comparativa/2026-11-09/)). En estrés, la p50 fue de 0,28 ms en Mosquitto, 29,02 ms en el propio con log `INFO` y 0,44 ms con log `WARNING`, con 19,8 %, 77,8 % y 69,4 % de CPU. Esa corrida mostró que el log por PUBLISH era el principal cuello de botella, y que aun sin él el propio usaba unas 3,5 veces la CPU de Mosquitto. Eso fue lo que guió la optimización.

## Captura del ciclo CONNECT/PUBLISH

`mosquitto-ciclo.pcap` y `propio-ciclo.pcap` se abren en Wireshark (el puerto 1883 se decodifica como MQTT). Cada uno es un cliente que se conecta, publica una lectura y se desconecta. `*-ciclo.csv` tiene el mismo detalle en texto. Esta tabla es de la medición preliminar; la captura del broker optimizado tiene los mismos paquetes y bytes.

| Paquete | Bytes MQTT | Mosquitto (s) | Propio (s) |
|---|---:|---:|---:|
| SYN / SYN-ACK / ACK | — | 0 / 0,000017 / 0,000038 | 0 / 0,000019 / 0,000041 |
| CONNECT | 59 | 0,000155 | 0,000156 |
| CONNACK | 4 | 0,001727 | 0,000532 |
| PUBLISH (`telemetria/A1B2C3D4E5F6/lecturas`) | 187 | 0,501018 | 0,501288 |
| DISCONNECT | 2 | 1,001486 | 1,002099 |
| FIN / FIN / ACK | — | 1,001580 – 1,001634 | 1,002208 – 1,002587 |

- Los dos brokers mandan exactamente los mismos bytes y los mismos paquetes TCP. El propio implementa el formato de MQTT 3.1.1 igual que Mosquitto.
- **Respuesta al CONNECT:** Mosquitto tarda 1,57 ms y el propio de 0,38 a 0,74 ms según la captura. Mosquitto guarda la contraseña como hash PBKDF2-SHA512 (`mosquitto_passwd`) y recalcularlo en cada conexión cuesta tiempo. El propio compara la clave en texto plano que recibe de `BROKER_USERS` (con `hmac.compare_digest`). El propio es más rápido acá porque protege menos la contraseña guardada, no porque sea más eficiente.

## Conclusiones

1. **Los dos brokers cumplen para TeleMon.** Un monitor publica cada 5 s: incluso 50 monitores son 10 mensajes/s, y ahí los dos responden en menos de 1 ms de mediana, sin pérdidas y con menos del 2 % de un núcleo.
2. **Optimizado, el broker propio iguala a Mosquitto en latencia:** 0,29 ms de mediana con 5 000 mensajes/s, la misma tasa aceptada y una cola (p99) de 4 ms frente a 3 ms. Antes de optimizar eran 22 ms.
3. **Mosquitto sigue siendo más eficiente:** con 5 000 mensajes/s usa unas 2,7 veces menos CPU y entre 5 y 7 veces menos RAM, porque está escrito en C. Por eso, y porque ofrece QoS 1 y 2, mensajes retenidos y contraseñas guardadas con hash, se mantiene como broker de producción (`MQTT_BROKER=broker`).
4. **El broker propio cumple su objetivo académico:** implementa MQTT 3.1.1 byte a byte, con la misma captura en el cable que Mosquitto, ACL y WebSocket. La comparación mostró dónde se iba el tiempo (el log y un `await` por byte), y corregirlo lo dejó a la par en latencia.

## Repetir la medición

En un equipo con Docker, desde la raíz del repo. No hace falta el `.env`: el script crea claves de prueba.

```bash
python3 -B pruebas/comparativa_brokers.py --nodelay
python3 -B pruebas/comparativa_brokers.py --nodelay --repeticiones 1 --duracion 10 --escenarios 1-cliente estres-50
```

El primero tarda unos 40 minutos y el segundo, de prueba rápida, unos 3. Para medir también otra versión del broker, se agrega `--brokers mosquitto propio-anterior propio propio-sin-log --anterior <carpeta broker-mqtt de esa versión>` (unos 55 minutos). Los resultados quedan en `pruebas/comparativa/<fecha>/`: `resumen.csv`, `corridas.csv`, `entorno.json`, las capturas y los crudos (que no se suben a git). Al terminar, el script borra la red y los contenedores de prueba.
