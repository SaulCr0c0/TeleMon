# firmware

Código C++ del nodo ESP32 (PlatformIO): lectura de DS18B20, DHT11, HW-611 (BMP280) y MQ-135, validación y publicación MQTT en `telemetria/ambiente` cada 5 s (HU-01 a HU-05).

**Responsable:** Mantilla Villaca, J.

## Archivos

| Archivo | Qué contiene | ¿Se sube? |
|---|---|---|
| `platformio.ini` | Placa, velocidad del monitor y bibliotecas | Sí |
| `include/config.h` | Pines, intervalo, tema MQTT, rangos válidos, offsets de calibración | Sí |
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

- Cada 5 s lee los 4 sensores y publica en `telemetria/ambiente` con QoS 0:
  ```json
  {"mac":"AA:BB:CC:DD:EE:FF","temperatura":22.4,"humedad":55.0,"presion":750.3,"calidad_aire":1.2}
  ```
- **Validación (HU-04):** si un sensor falla (NaN, −127 °C del DS18B20, BMP280 ausente) o el valor está fuera de los rangos de `config.h`, ese campo se envía como `null` y los demás se envían igual.
- **MQ-135:** promedia 16 lecturas de `analogReadMilliVolts(34)` y multiplica por 1.5 (divisor). Durante los primeros 3 min (precalentamiento) se envía `null`. Calcula `Rs/R0` y lo clasifica en **Bueno / Moderado / Malo** (HU-03), que se muestra por Serial. `CALIDAD_AIRE_ES_RAZON` en `config.h` elige si `calidad_aire` lleva el voltaje (0) o `Rs/R0` (1).
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
| Presión cerca de 1013 hPa | En Cochabamba debe rondar 750 hPa; revisar el sensor |
| `[BMP280] no encontrado` | Revisar SDA/SCL y que el módulo esté a 3.3 V |
| Temperatura siempre `null` | DS18B20 desconectado o sin pull-up en DQ |
| No aparece `/dev/ttyUSB0` | Agregar el usuario al grupo `dialout` y volver a iniciar sesión |
