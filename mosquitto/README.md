# mosquitto

Eclipse Mosquitto, broker MQTT base del Sprint 1 (HU-05).

**Responsable:** Siles Espicho, A.

## Archivos

| Archivo | Qué hace |
|---|---|
| `config/mosquitto.conf` | Puerto 1883, sin acceso anónimo, contraseñas y permisos por tema |
| `config/entrypoint.sh` | Al iniciar el contenedor, genera las contraseñas y la lista de permisos a partir del `.env` |
| `probar.sh` | Prueba automática del broker (4 casos) |

Las contraseñas nunca se guardan en el repositorio: se leen del archivo `.env`.

## Usuarios y permisos

| Usuario (`.env`) | Puede | Tema |
|---|---|---|
| `MQTT_USER_ESP32` | Solo publicar, y solo en su propio tema | `telemetria/<client id>/lecturas` |
| `MQTT_USER_NODERED` | Solo leer | `telemetria/#` |

Cada monitor se conecta con su MAC sin ":" como client id (ej. `F8B3B72BFC24`) y solo puede publicar en `telemetria/F8B3B72BFC24/lecturas`. La regla es `pattern write telemetria/%c/lecturas`; no se agrega `topic write telemetria/+/lecturas`, porque Mosquitto suma los permisos y esa regla dejaría a cualquier monitor publicar en el tema de otro.

Ningún cliente puede conectarse sin usuario y contraseña.

## Cómo levantarlo

```bash
cp .env.example .env          # completar MQTT_PASS_ESP32 y MQTT_PASS_NODERED
docker compose up -d broker
docker compose logs -f broker # ver conexiones en vivo (Ctrl+C para salir)
```

## Cómo probarlo

```bash
./mosquitto/probar.sh
```

Resultado esperado:

```
1. Node-RED recibe lo que publica el ESP32           [OK]
2. Se rechaza una contraseña incorrecta               [OK]
3. Node-RED no puede publicar telemetría              [OK]
4. El ESP32 no puede leer telemetría                  [OK]
5. Un monitor no puede publicar en el tema de otro    [OK]
6. El broker sobrevive a un reinicio                  [OK]
Resultado: 6 correctas, 0 fallidas
```

Para ver en vivo lo que llega (útil al probar con el ESP32):

```bash
docker exec broker mosquitto_sub -u nodered -P <clave> -t 'telemetria/#' -v
```

## Datos de conexión para el firmware (ESP32)

| Parámetro | Valor |
|---|---|
| Servidor | IP de la computadora que corre el broker, en la misma red Wi-Fi (ej. `192.168.1.181`) |
| Puerto | `1883` |
| Usuario / contraseña | `MQTT_USER_ESP32` / `MQTT_PASS_ESP32` del `.env` |
| Client id | MAC sin ":" (ej. `F8B3B72BFC24`) |
| Tema | `telemetria/<client id>/lecturas` |
| Protocolo | MQTT 3.1.1 (`PubSubClient`), QoS 0 |

Formato del mensaje:

```json
{"mac":"F8:B3:B7:2B:FC:24","ts":1760736000123,"uptime":3600,"temperatura":22.4,"humedad":55.0,"presion":750.3,"mq135_v":1.234,"rssi":-61,"fw":"1.1.0"}
```

Si un sensor falla, su campo se envía como `null`.

## Problemas comunes

| Problema | Causa | Solución |
|---|---|---|
| El ESP32 no conecta | Firewall o IP incorrecta | Verificar que ambos estén en la misma red y que el puerto 1883 esté abierto (`sudo firewall-cmd --add-port=1883/tcp` en Fedora) |
| `not authorised` en los logs | Usuario o contraseña distintos a los del `.env` | Revisar `.env` y reiniciar con `docker compose restart broker` |
| Conecta pero no llega nada | El tema no coincide con el client id | Publicar en `telemetria/<client id>/lecturas`, con el client id igual a la MAC sin ":" |
| El contenedor queda en `Restarting` | Versión anterior del `entrypoint.sh` | Actualizar a la versión que borra `passwd` y `acl` antes de crearlos |
