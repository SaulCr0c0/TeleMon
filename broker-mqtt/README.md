# broker-mqtt

Broker MQTT 3.1.1 propio, en Python 3.12 + `asyncio` y sin librerías MQTT. Versión 1: solo QoS 0, autenticación con usuario y contraseña, comodines `+` y `#`, keepalive y registro de cada conexión y publicación. Se compara con Eclipse Mosquitto en latencia, pérdidas y recursos.

**Responsable:** Cordova Villarroel, S.

Cómo funciona por dentro y qué sigue: **[DISENO.md](DISENO.md)**.

## Levantar

```bash
docker compose up -d --build broker_propio
docker compose logs -f broker_propio
```

Escucha en el puerto `1884` de tu compu (Mosquitto sigue en el `1883`). Usa los mismos usuarios que Mosquitto, definidos en `BROKER_USERS` del `.env`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `BROKER_USERS` | — | `usuario:clave,usuario:clave` |
| `BROKER_PROPIO_PORT` | `1884` | Puerto publicado |
| `BROKER_LOG` | `INFO` | `DEBUG`, `INFO` o `WARNING` |

## Probar

```bash
cd broker-mqtt
python3 -m unittest discover -s pruebas -t . -v
cd ..
./broker-mqtt/probar.sh
```

La primera corre 32 pruebas unitarias y de integración; la segunda, 6 pruebas con los clientes oficiales de Mosquitto contra el contenedor.

## Archivos

| Archivo | Qué hace |
|---|---|
| `broker.py` | Servidor `asyncio`: conexión, sesión, enrutamiento, keepalive y registro |
| `paquetes.py` | Lectura y escritura de los paquetes MQTT |
| `temas.py` | Validación de temas y coincidencia de filtros con `+` y `#` |
| `usuarios.py` | Usuarios de `BROKER_USERS` y comparación de claves en tiempo constante |
| `pruebas/` | Pruebas con `unittest` |
| `probar.sh` | Pruebas con `mosquitto_pub` y `mosquitto_sub` |
| `Dockerfile` | Imagen `python:3.12-slim` con usuario sin privilegios |
