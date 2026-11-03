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
| `src/diagnostico.cpp` | Herramienta de diagnóstico de sensores (entorno `diagnostico`) | Sí |

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
   y completar `WIFI_SSID`, `WIFI_PASS` (red de 2.4 GHz), `MQTT_URI` y `MQTT_PASS` (pedirla a Adrian). `MQTT_URI` elige el camino:
   - `mqtt://192.168.1.130:1883`: el ESP32 está en la misma red que el server (MQTT directo).
   - `wss://mqtt.telemon.site:443/`: el ESP32 está en cualquier otra red con internet. Va por MQTT sobre WebSocket cifrado (TLS) a través del túnel de Cloudflare; el certificado se valida con las raíces de `include/raices.h` (ISRG Root X1/X2 de Let's Encrypt y GTS Root R1/R4 de Google).
3. Compilar, cargar y abrir el monitor serie (desde la carpeta `firmware/`):
   ```bash
   pio run                 # compilar
   pio run -t upload       # cargar al ESP32
   pio device monitor      # ver la salida (115200 baudios)
   ```

## Bibliotecas

`esp-mqtt` de Espressif (incluido en el framework; MQTT 3.1.1 por TCP o por WebSocket con TLS), `OneWire`, `DallasTemperature`, `ArduinoJson` 7. PlatformIO las descarga solo según `platformio.ini`. El BMP280 y el DHT11 se leen con código propio (ver «Correcciones de sensores»), sin las bibliotecas de Adafruit.

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
- **BMP280:** busca el sensor en 0x76 y 0x77 (chip ID 0x58, o 0x60 si es un BME280) y mide en **modo forzado**: una medición por ciclo. Si la medición sale omitida (valor crudo `0x80000`), envía `null` y lo vuelve a configurar en el ciclo siguiente.
- **DHT11:** lectura propia con tiempos límite por pulso; nunca espera más de unos milisegundos. Descarta la primera lectura después de encender y las tramas en cero.

## Correcciones de sensores (#33)

Pruebas del 03/11 con la herramienta de diagnóstico:

| Síntoma | Causa | Corrección |
|---|---|---|
| Presión fija en **644,57 hPa** | El BMP280 se **reiniciaba al empezar a medir** por mal contacto en VCC/GND (soldadura). Al reiniciarse vuelve a modo dormido y sus registros quedan en `0x80000`; compensado con su calibración da exactamente 644,57 hPa. El firmware anterior solo revisaba que respondiera en I²C y nunca lo reconfiguraba | Soldar bien VCC y GND. En el firmware: modo forzado en cada ciclo y `null` si el crudo es `0x80000`. Con buen contacto mide ~746,9 hPa |
| Humedad **~9–15 %** | No es falla de comunicación: 100 % de lecturas válidas, y con papel húmedo sube a 83 % y vuelve. El BMP280 confirma ~30 °C en el ambiente, así que el aire está caliente y seco; además el DHT11 no garantiza precisión debajo de 20 % | Mantener el DHT11 y ajustar `OFFSET_HUM` contra un higrómetro de referencia (#37). Alternativa: BME280 |
| Humedad **0 %** al encender | La primera trama del DHT11 sale en cero con checksum válido y pasaba como dato real | Se descarta la primera lectura y toda trama en cero |
| El ESP32 se **reinicia** (`Interrupt wdt timeout`) | La biblioteca del DHT espera con las interrupciones desactivadas; si el DHT11 no responde (cable flojo), se pasa del tiempo y el ESP32 se reinicia. Cada reinicio vuelve a dar 3 min de MQ-135 en `null` | Lectura propia con tiempo límite por pulso |
| MQ-135 **sin dato** a ratos | Reinicios (el anterior, o un bajón de corriente con Wi-Fi + calentador de ~150 mA) que vuelven a los 3 min de precalentamiento, o falso contacto en AOUT/VIN/GND. Solo, sin Wi-Fi, dio 0 caídas en más de 200 lecturas, con AOUT estable en ~0,42 V y ruido de ±2 a 14 mV | Cableado firme; si hay reinicios con Wi-Fi, cargador USB de 2 A o capacitor de 470–1000 µF entre 5 V y GND |

## Diagnóstico de sensores

`src/diagnostico.cpp` es un programa aparte para probar cada sensor y cambiar de pin sin volver a cargar:

```bash
pio run -e diagnostico -t upload
pio device monitor -e diagnostico
```

| Comando | Qué hace |
|---|---|
| `todo` / `ds` / `dht` / `bmp` / `mq` / `i2c` | Prueba los 4 sensores, uno solo, o escanea el bus I²C |
| `seguir [ds] [dht] [bmp] [mq] [s]` | Una línea cada `s` segundos con los sensores elegidos (ej.: `seguir mq bmp 20`); `x` y Enter detiene |
| `pin ds <n>` · `pin dht <n>` · `pin mq <n>` · `pin i2c <sda> <scl>` | Cambia el pin; avisa si no sirve (el MQ-135 solo en ADC1: 32–39) |
| `tipo dht 11\|22` | Cambia el modelo del DHT |

Qué revisa: nivel de reposo de la línea (pull-up) del DS18B20 y del DHT; chip ID, calibración, valor crudo y si el BMP280 se reinicia al medir; media, ruido, mínimo y máximo del MQ-135.

## Modo calibración

Con `#define MODO_CALIBRACION 1` en `config.h`, el ESP32 no se conecta a la red e imprime una línea CSV cada 5 s con valores crudos (sin offsets):

```
tiempo_s,temp,hum,presion,voltaje_mq
```

Con esos datos se completan `OFFSET_TEMP`, `OFFSET_HUM`, `OFFSET_PRES` y `MQ135_R0` en `config.h`.

## Problemas comunes

| Problema | Solución |
|---|---|
| `[MQTT] error: tipo 1` (transporte) | No llega al broker: con `mqtt://`, revisar la IP, que esté en la misma red y el puerto 1883; con `wss://`, que haya internet y que `mqtt.telemon.site` esté en el túnel. Un `tls` distinto de 0 indica un problema de certificado |
| `[MQTT] error: tipo 2`, respuesta 4 o 5 | Usuario o contraseña incorrectos, o el client id no coincide con la MAC |
| `[MQTT] falló, estado 4` o `5` | Usuario o contraseña incorrectos en `secrets.h` |
| Conecta pero no llega nada a `mosquitto_sub` | El tema no coincide con el client id (la ACL descarta la publicación) |
| `ts` siempre `null` | Sin salida a Internet o con el puerto 123/UDP (NTP) bloqueado |
| Presión cerca de 1013 hPa | En Cochabamba debe rondar 750 hPa; revisar el sensor |
| `[BMP280] medición omitida (se reinició)` | Mal contacto en VCC/GND del BMP280: revisar la soldadura y los cables |
| Humedad siempre `null` | DHT11 sin alimentación o DATA suelto; revisar con `dht` en el diagnóstico |
| `[BMP280] no encontrado` | Revisar SDA/SCL y que el módulo esté a 3.3 V |
| Temperatura siempre `null` | DS18B20 desconectado o sin pull-up en DQ |
| No aparece `/dev/ttyUSB0` | Agregar el usuario al grupo `dialout` y volver a iniciar sesión |
