# broker-mqtt

Broker MQTT propio en Python 3.12 + asyncio sobre sockets TCP (MQTT 3.1.1, QoS 0). Reemplaza a Mosquitto cambiando solo el servicio `broker` en `docker-compose.yml`, y se compara con él en latencia y consumo de recursos.

**Responsable:** Siles Espicho, A.

## Alcance

| Paquete | Qué hace |
|---|---|
| CONNECT / CONNACK | Verifica usuario y contraseña (`BROKER_USERS` del `.env`) |
| SUBSCRIBE / SUBACK, UNSUBSCRIBE / UNSUBACK | Filtros con los comodines `+` y `#` |
| PUBLISH | Reenvía a cada suscriptor cuyo filtro coincide |
| PINGREQ / PINGRESP, DISCONNECT | Keepalive y cierre; desconecta a quien excede 1,5 × keepalive |

Los monitores publican en `telemetria/<ID>/lecturas` y Node-RED se suscribe a `telemetria/+/lecturas`. El broker no interpreta el JSON: solo reenvía los bytes.

## Tareas

- [#38](https://github.com/SaulCr0c0/TeleMon/issues/38) CONNECT/CONNACK con usuario y contraseña
- [#51](https://github.com/SaulCr0c0/TeleMon/issues/51) SUBSCRIBE con comodines y enrutamiento de PUBLISH
- [#52](https://github.com/SaulCr0c0/TeleMon/issues/52) Keepalive, PINGREQ, DISCONNECT y logs
- [#57](https://github.com/SaulCr0c0/TeleMon/issues/57) Dockerfile, servicio en compose y conmutación
