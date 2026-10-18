# firmware

Código C++ del nodo ESP32 (PlatformIO): lectura de DS18B20, DHT11, HW-611 (BMP280) y MQ-135, validación y publicación MQTT en `telemetria/<ID>/lecturas` cada 5 s con la hora NTP (HU-01 a HU-05 y HU-29). Versión `1.1.0`.

**Responsable:** Mantilla Villaca, J.

## Archivos

| Archivo | Qué contiene | ¿Se sube? |
|---|---|---|
| `platformio.ini` | Placa, velocidad del monitor y bibliotecas | Sí |
| `include/config.h` | Pines, intervalo, MQTT, servidores NTP, versión, rangos válidos, offsets de calibración | Sí |
| `include/secrets.h.example` | Plantilla de credenciales Wi-Fi y MQTT | Sí |
| `include/secrets.h` | Credenciales reales | **No** (`.gitignore`) |
| `src/main.cpp` | Programa principal | Sí |

## Conexiones (ESP32 WROOM-32 DevKit)

| Módulo | Mide | Pin ESP32 | Alimentación |
|---|---|---|---|
| DS18B20 | Temperatura (°C) | DQ → GPIO 4 | 3.3 V |
| DHT11 | Humedad (%) | DATA → GPIO 5 | 3.3 V |
| HW-611 (BMP280) | Presión (hPa) | SDA → GPIO 21, SCL → GPIO 22 | 3.3 V (nunca 5 V) |
| MQ-135 | Calidad del aire (indicador relativo) | AOUT → 10 kΩ → GPIO 34 → 20 kΩ → GND | 5 V (VIN) |

## Cómo compilar y cargar

1. Instalar la extensión **PlatformIO IDE** en VS Code (o `pipx install platformio`).
2. Crear las credenciales a partir de la plantilla:
   ```bash
   cp firmware/include/secrets.h.example firmware/include/secrets.h
   ```
   y completar `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST` (IP de la PC del broker) y `MQTT_PASS` (pedirla a Adrian).
3. Compilar, cargar y abrir el monitor serie (desde la carpeta `firmware/`):
   ```bash
   pio run                 # compilar
   pio run -t upload       # cargar al ESP32
   pio device monitor      # ver la salida (115200 baudios)
   ```

## Bibliotecas

`PubSubClient` (MQTT 3.1.1), `OneWire`, `DallasTemperature`, `DHT sensor library`, `Adafruit Unified Sensor`, `Adafruit BMP280 Library`, `ArduinoJson` 7. PlatformIO las descarga solo según `platformio.ini`.

## Funcionamiento

- Tema: `telemetria/<ID>/lecturas`, donde `<ID>` es la MAC sin ":" (ej. `F8B3B72BFC24`). El client id MQTT es el mismo `<ID>`: la ACL de Mosquitto (`pattern write telemetria/%c/lecturas`) solo deja publicar a cada monitor en su propio tema.
- Cada 5 s lee los 4 sensores y publica con QoS 0 y sin retención:
  ```json
  {"mac":"F8:B3:B7:2B:FC:24","ts":1760736000123,"uptime":3600,"temperatura":22.4,"humedad":55.0,"presion":750.3,"mq135_v":1.234,"rssi":-61,"fw":"1.1.0"}
  ```

  | Campo | Qué es |
  |---|---|
  | `ts` | Hora en ms UTC (NTP), tomada justo antes de publicar; `null` si aún no hay hora |
  | `uptime` | Segundos desde el arranque |
  | `mq135_v` | Voltaje del MQ-135 con 3 decimales; `null` durante los 3 min de precalentamiento |
  | `rssi` | Señal Wi-Fi en dBm |
  | `fw` | Versión del firmware |

- **Hora (HU-29):** al conectarse al Wi-Fi sincroniza por NTP con `pool.ntp.org` y `time.google.com`, y se resincroniza solo cada hora. El backend calcula la latencia como hora de llegada menos `ts`.
- **Validación (HU-04):** si un sensor falla (NaN, −127 °C del DS18B20, BMP280 ausente) o el valor está fuera de los rangos de `config.h`, ese campo se envía como `null` y los demás se envían igual.
- **MQ-135:** promedia 16 lecturas de `analogReadMilliVolts(34)` y multiplica por 1.5 (divisor). Durante los primeros 3 min (precalentamiento) se envía `null`. El backend calcula Rs/R0 y el nivel (HU-03) con el R0 de cada monitor; el firmware ya no envía `calidad_aire`. El Rs/R0 que aparece por Serial es solo una referencia para diagnóstico, con el `MQ135_R0` provisional de `config.h`.
- **Reconexión:** si se cae el Wi-Fi o el broker, reintenta cada 10 s y 5 s respectivamente sin detener las lecturas.
- **BMP280:** busca el sensor en 0x76 y 0x77; si no responde, reintenta en cada ciclo.

## Modo calibración

Con `#define MODO_CALIBRACION 1` en `config.h`, el ESP32 no se conecta a la red e imprime una línea CSV cada 5 s con valores crudos (sin offsets):

```
tiempo_s,temp,hum,presion,voltaje_mq
```

Con esos datos se completan `OFFSET_TEMP`, `OFFSET_HUM`, `OFFSET_PRES` y `MQ135_R0` en `config.h`.

## Problemas comunes

| Problema | Solución |
|---|---|
| `[MQTT] falló, estado -2` | No hay conexión TCP: revisar `MQTT_HOST`, que el broker esté arriba y que el firewall permita el puerto 1883 |
| `[MQTT] falló, estado 4` o `5` | Usuario o contraseña incorrectos en `secrets.h` |
| Conecta pero no llega nada a `mosquitto_sub` | El tema no coincide con el client id (la ACL descarta la publicación) |
| `ts` siempre `null` | Sin salida a Internet o con el puerto 123/UDP (NTP) bloqueado |
| Presión cerca de 1013 hPa | En Cochabamba debe rondar 750 hPa; revisar el sensor |
| `[BMP280] no encontrado` | Revisar SDA/SCL y que el módulo esté a 3.3 V |
| Temperatura siempre `null` | DS18B20 desconectado o sin pull-up en DQ |
| No aparece `/dev/ttyUSB0` | Agregar el usuario al grupo `dialout` y volver a iniciar sesión |
