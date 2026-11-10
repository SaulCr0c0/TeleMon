# broker-mqtt

Broker MQTT 3.1.1 propio, en Python 3.12 + `asyncio` y sin librerías MQTT. Versión 1: solo QoS 0, autenticación con usuario y contraseña, ACL por monitor, comodines `+` y `#`, keepalive, MQTT sobre WebSocket y registro de cada conexión y publicación. Se compara con Eclipse Mosquitto en latencia, pérdidas y recursos.

**Responsable:** Cordova Villarroel, S.

Cómo funciona por dentro y qué sigue: **[DISENO.md](DISENO.md)**.

## Levantar

```bash
docker compose up -d --build broker_propio
docker compose logs -f broker_propio
```

Escucha en el puerto `1884` de tu compu (Mosquitto sigue en el `1883`) y por WebSocket en el `9001` de la red interna, que el túnel publica como `wss://mqtt2.telemon.site`. Usa los mismos usuarios y la misma ACL que Mosquitto, armados a partir de `MQTT_USER_*` y `MQTT_PASS_*` del `.env`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `MQTT_BROKER` | `broker` | Broker que usa Node-RED: `broker` (Mosquitto) o `broker_propio` |
| `BROKER_USERS` | Los de `MQTT_USER_*` | `usuario:clave,usuario:clave` |
| `BROKER_ACL` | Las reglas de Mosquitto | `usuario:accion:patron,…` |
| `BROKER_PROPIO_PORT` | `1884` | Puerto publicado |
| `BROKER_LOG` | `INFO` | `DEBUG`, `INFO` o `WARNING` |

## Cambiar de broker

En el `.env` se pone `MQTT_BROKER=broker_propio` y se recrea Node-RED:

```bash
docker compose up -d nodered
```
 Para volver a Mosquitto, `MQTT_BROKER=broker`. Los ESP32 eligen el broker con `MQTT_URI`: `mqtt://<IP>:1884` en la red local o `wss://mqtt2.telemon.site:443/` desde otra red. Detalle en [DISENO.md](DISENO.md#41-cambiar-de-broker).

## Probar

```bash
cd broker-mqtt
python3 -m unittest discover -s pruebas -t . -v
cd ..
./broker-mqtt/probar.sh
```

La primera corre 63 pruebas unitarias y de integración; la segunda, 10 pruebas con los clientes oficiales de Mosquitto contra el contenedor.

## Archivos

| Archivo | Qué hace |
|---|---|
| `broker.py` | Servidor `asyncio`: conexión, sesión, enrutamiento, keepalive y registro |
| `paquetes.py` | Lectura y escritura de los paquetes MQTT |
| `temas.py` | Validación de temas y coincidencia de filtros con `+` y `#` |
| `usuarios.py` | Usuarios de `BROKER_USERS` y comparación de claves en tiempo constante |
| `acl.py` | Reglas de `BROKER_ACL`: qué puede publicar y leer cada cliente |
| `websocket.py` | Saludo y tramas de WebSocket para el puerto 9001 |
| `pruebas/` | Pruebas con `unittest` |
| `probar.sh` | Pruebas con `mosquitto_pub` y `mosquitto_sub` |
| `Dockerfile` | Imagen `python:3.12-slim` con usuario sin privilegios |
