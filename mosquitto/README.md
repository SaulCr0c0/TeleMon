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
| `MQTT_USER_ESP32` | Solo publicar | `telemetria/#` |
| `MQTT_USER_NODERED` | Solo leer | `telemetria/#` |

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
Resultado: 4 correctas, 0 fallidas
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
| Tema | `telemetria/ambiente` |
| Protocolo | MQTT 3.1.1 (`PubSubClient`), QoS 0 |

Formato del mensaje:

```json
{"mac":"AA:BB:CC:DD:EE:FF","temperatura":22.4,"humedad":55.0,"presion":750.3,"calidad_aire":1.2}
```

Si un sensor falla, su campo se envía como `null`.

## Problemas comunes

| Problema | Causa | Solución |
|---|---|---|
| El ESP32 no conecta | Firewall o IP incorrecta | Verificar que ambos estén en la misma red y que el puerto 1883 esté abierto (`sudo firewall-cmd --add-port=1883/tcp` en Fedora) |
| `not authorised` en los logs | Usuario o contraseña distintos a los del `.env` | Revisar `.env` y reiniciar con `docker compose restart broker` |
| Conecta pero no llega nada | Tema distinto o usuario sin permiso | Publicar en `telemetria/ambiente` con el usuario del ESP32 |

## Cambios del Sprint 2

| Cambio | Tarea |
|---|---|
| Corregir el bucle de reinicio del `entrypoint.sh` al recrear el contenedor | [#34](https://github.com/SaulCr0c0/TeleMon/issues/34) |
| Un tema por monitor: el usuario `esp32` solo publica en `telemetria/<su client id>/lecturas` (`pattern write telemetria/%c/lecturas`); `nodered` lee `telemetria/#`. Actualizar `probar.sh` | [#50](https://github.com/SaulCr0c0/TeleMon/issues/50) |
