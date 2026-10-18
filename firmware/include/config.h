// Configuración del nodo: pines, tiempos, MQTT y calibración.
// Este archivo SÍ se sube al repositorio (no contiene claves).
#pragma once

// ---------- Modo de operación ----------
// 0 = normal (Wi-Fi + MQTT)
// 1 = calibración: sin red, imprime por Serial una línea CSV cada ciclo
//     tiempo_s,temp,hum,presion,voltaje_mq   (valores crudos, sin offsets)
#define MODO_CALIBRACION 0

// ---------- Pines ----------
#define PIN_DS18B20   4    // 1-Wire, DQ
#define PIN_DHT11     5    // DATA
#define PIN_SDA       21   // I2C del BMP280 (HW-611)
#define PIN_SCL       22
#define PIN_MQ135     34   // ADC1_CH6, a través del divisor 10k/20k

// ---------- Tiempos ----------
#define INTERVALO_MS          5000    // ciclo de lectura y publicación
#define REINTENTO_WIFI_MS     10000   // espera antes de forzar WiFi.reconnect()
#define REINTENTO_MQTT_MS     5000    // espera entre intentos de conexión al broker

// ---------- MQTT ----------
#define MQTT_KEEPALIVE  15      // segundos
#define MQTT_TIMEOUT    5       // segundos de espera del socket al conectar
#define NTP_SERVIDOR_1  "pool.ntp.org"
#define NTP_SERVIDOR_2  "time.google.com"
#define FW_VERSION      "1.1.0"

// ---------- Rangos válidos (HU-04) ----------
// Fuera de estos rangos el campo se envía como null.
#define TEMP_MIN     -40.0
#define TEMP_MAX      85.0
#define HUM_MIN        0.0
#define HUM_MAX      100.0
#define PRES_MIN     300.0     // hPa (Cochabamba ~750)
#define PRES_MAX    1100.0
#define MQ_V_MIN       0.05    // V en AOUT; por debajo, sensor desconectado
#define MQ_V_MAX       5.0

// ---------- Calibración (la completa Brenda) ----------
#define OFFSET_TEMP   0.0
#define OFFSET_HUM    0.0
#define OFFSET_PRES   0.0

// ---------- MQ-135 ----------
#define MQ135_MUESTRAS       16       // lecturas promediadas por ciclo
#define MQ135_FACTOR_DIV     1.5      // V_AOUT = V_GPIO34 × 1.5 (divisor 10k/20k)
#define MQ135_VC             5.0      // alimentación del módulo (VIN)
#define MQ135_RL_KOHM        1.0      // resistencia de carga del módulo (revisar: "102" = 1k, "103" = 10k)
#define MQ135_DIV_KOHM       30.0     // el divisor (10k + 20k) queda en paralelo con RL
#define MQ135_R0             10.0     // provisional (kΩ), se mide en aire limpio
#define MQ135_PRECALENT_MS   180000   // 3 min de precalentamiento: se envía null

// Niveles de calidad del aire según Rs/R0 (HU-03). Provisionales hasta calibrar.
// Rs/R0 baja cuando aumentan los gases.
#define MQ135_CORTE_BUENO     0.80    // Rs/R0 >= 0.80  -> Bueno
#define MQ135_CORTE_MODERADO  0.50    // Rs/R0 >= 0.50  -> Moderado, si no -> Malo
