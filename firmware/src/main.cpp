// TeleMon — Firmware del nodo ESP32 (HU-01 a HU-05)
// Lee DS18B20, DHT11, BMP280 (HW-611) y MQ-135, valida cada lectura y publica
// un JSON por MQTT 3.1.1 en "telemetria/<ID>/lecturas" cada 5 s.

#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <Adafruit_BMP280.h>
#include <ArduinoJson.h>
#include <math.h>
#include <time.h>
#include <sys/time.h>

#include "config.h"
#include "secrets.h"

// ---------- Sensores ----------
OneWire oneWire(PIN_DS18B20);
DHT dht(PIN_DHT11, DHT11);
Adafruit_BMP280 bmp;
uint8_t bmpDireccion = 0;   // 0 = no encontrado
DallasTemperature ds18b20(&oneWire);

// ---------- Red ----------
WiFiClient wifiCliente;
PubSubClient mqtt(wifiCliente);
String mac;
String clienteId;
String tema;

unsigned long ultimoCiclo = 0;
unsigned long ultimoIntentoWifi = 0;
unsigned long ultimoIntentoMqtt = 0;

// Lectura de un ciclo. NAN significa "inválida" y se envía como null.
struct Lectura {
  float temperatura;
  float humedad;
  float presion;
  float voltajeMq;   // V en AOUT
  float razonMq;     // Rs/R0
};

// ======================================================================
// Sensores
// ======================================================================

bool enRango(float v, float min, float max) {
  return !isnan(v) && v >= min && v <= max;
}

// El BMP280 puede estar en 0x76 o 0x77. Se reintenta en cada ciclo si falta.
bool iniciarBmp() {
  const uint8_t direcciones[] = {0x76, 0x77};
  for (uint8_t dir : direcciones) {
    if (bmp.begin(dir)) {
      bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                      Adafruit_BMP280::SAMPLING_X2,     // temperatura
                      Adafruit_BMP280::SAMPLING_X16,    // presión
                      Adafruit_BMP280::FILTER_X16,
                      Adafruit_BMP280::STANDBY_MS_500);
      bmpDireccion = dir;
      Serial.printf("[BMP280] encontrado en 0x%02X\n", dir);
      return true;
    }
  }
  bmpDireccion = 0;
  return false;
}

bool bmpResponde() {
  if (bmpDireccion == 0) return false;
  Wire.beginTransmission(bmpDireccion);
  return Wire.endTransmission() == 0;
}

float leerTemperatura() {
  if (ds18b20.getDeviceCount() == 0) ds18b20.begin();   // por si se conectó después
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  // -127 = desconectado; 85 = valor de reinicio (lectura no completada)
  if (t == DEVICE_DISCONNECTED_C || t == 85.0f) return NAN;
  return t;
}

float leerHumedad() {
  return dht.readHumidity();   // NAN si falla el checksum o no responde
}

float leerPresion() {
  if (!bmpResponde() && !iniciarBmp()) return NAN;
  return bmp.readPressure() / 100.0f;   // Pa -> hPa
}

float leerVoltajeMq() {
  uint32_t suma = 0;
  for (int i = 0; i < MQ135_MUESTRAS; i++) {
    suma += analogReadMilliVolts(PIN_MQ135);
    delay(2);
  }
  float vGpio = (suma / (float)MQ135_MUESTRAS) / 1000.0f;
  return vGpio * MQ135_FACTOR_DIV;
}

// Rs = RL·(Vc − Vout)/Vout, con RL en paralelo con el divisor de 30 kΩ.
float calcularRazonMq(float vAout) {
  if (vAout <= 0.0f) return NAN;
  float rl = (MQ135_RL_KOHM * MQ135_DIV_KOHM) / (MQ135_RL_KOHM + MQ135_DIV_KOHM);
  float rs = rl * (MQ135_VC - vAout) / vAout;
  return rs / MQ135_R0;
}

const char* nivelCalidadAire(float razon) {
  if (isnan(razon)) return "sin dato";
  if (razon >= MQ135_CORTE_BUENO) return "Bueno";
  if (razon >= MQ135_CORTE_MODERADO) return "Moderado";
  return "Malo";
}

bool mqPrecalentando() {
  return millis() < MQ135_PRECALENT_MS;
}

// Lee los 4 sensores y deja en NAN los que fallen o estén fuera de rango (HU-04).
Lectura leerSensores() {
  Lectura l;

  float t = leerTemperatura();
  l.temperatura = enRango(t, TEMP_MIN, TEMP_MAX) ? t + OFFSET_TEMP : NAN;

  float h = leerHumedad();
  l.humedad = enRango(h, HUM_MIN, HUM_MAX) ? constrain(h + OFFSET_HUM, 0.0f, 100.0f) : NAN;

  float p = leerPresion();
  l.presion = enRango(p, PRES_MIN, PRES_MAX) ? p + OFFSET_PRES : NAN;

  float v = leerVoltajeMq();
  bool mqValido = enRango(v, MQ_V_MIN, MQ_V_MAX) && !mqPrecalentando();
  l.voltajeMq = mqValido ? v : NAN;
  l.razonMq = mqValido ? calcularRazonMq(v) : NAN;

  return l;
}

// ======================================================================
// Red: Wi-Fi y MQTT con reconexión sin bloquear
// ======================================================================

void iniciarNtp() {
  static bool iniciado = false;
  if (iniciado) return;
  iniciado = true;
  configTime(0, 0, NTP_SERVIDOR_1, NTP_SERVIDOR_2);
  Serial.println("[NTP] sincronizando hora...");
}

uint64_t horaMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

void iniciarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  ultimoIntentoWifi = millis();
  Serial.printf("[WiFi] conectando a \"%s\"...\n", WIFI_SSID);
}

void mantenerWifi() {
  static bool conectado = false;

  if (WiFi.status() == WL_CONNECTED) {
    if (!conectado) {
      conectado = true;
      Serial.printf("[WiFi] conectado, IP %s, RSSI %d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      iniciarNtp();
    }
    return;
  }

  if (conectado) {
    conectado = false;
    Serial.println("[WiFi] conexión perdida");
  }
  if (millis() - ultimoIntentoWifi >= REINTENTO_WIFI_MS) {
    ultimoIntentoWifi = millis();
    Serial.println("[WiFi] reintentando...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

void mantenerMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (ultimoIntentoMqtt != 0 && millis() - ultimoIntentoMqtt < REINTENTO_MQTT_MS) return;
  ultimoIntentoMqtt = millis();

  Serial.printf("[MQTT] conectando a %s:%d como %s...\n", MQTT_HOST, MQTT_PORT, clienteId.c_str());
  if (mqtt.connect(clienteId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.println("[MQTT] conectado");
  } else {
    // -2 sin conexión TCP, 4 usuario/clave incorrectos, 5 no autorizado
    Serial.printf("[MQTT] falló, estado %d; reintento en %d s\n",
                  mqtt.state(), REINTENTO_MQTT_MS / 1000);
  }
}

// ======================================================================
// Publicación
// ======================================================================

// Redondea a los decimales indicados y escribe null si el valor es inválido.
void agregarCampo(JsonDocument& doc, const char* nombre, float valor, int decimales = 2) {
  if (isnan(valor)) {
    doc[nombre] = nullptr;
    return;
  }
  double factor = pow(10.0, decimales);
  doc[nombre] = round((double)valor * factor) / factor;
}

void imprimirLectura(const Lectura& l) {
  Serial.printf("[Sensores] T=%.2f °C  H=%.2f %%  P=%.2f hPa  MQ=%.3f V  Rs/R0=%.2f (%s)%s\n",
                l.temperatura, l.humedad, l.presion, l.voltajeMq, l.razonMq,
                nivelCalidadAire(l.razonMq),
                mqPrecalentando() ? "  [MQ-135 precalentando]" : "");
}

void publicar(const Lectura& l) {
  uint64_t ts = horaMs();
  JsonDocument doc;
  doc["mac"] = mac;
  if (ts) {
    doc["ts"] = ts;
  } else {
    doc["ts"] = nullptr;
  }
  doc["uptime"] = millis() / 1000;
  agregarCampo(doc, "temperatura", l.temperatura);
  agregarCampo(doc, "humedad", l.humedad);
  agregarCampo(doc, "presion", l.presion);
  agregarCampo(doc, "mq135_v", l.voltajeMq, 3);
  doc["rssi"] = WiFi.RSSI();
  doc["fw"] = FW_VERSION;

  char payload[320];
  size_t n = serializeJson(doc, payload, sizeof(payload));

  if (!mqtt.connected()) {
    Serial.printf("[MQTT] sin conexión, no se publica: %s\n", payload);
    return;
  }
  bool ok = mqtt.publish(tema.c_str(), (const uint8_t*)payload, n, false);
  Serial.printf("[MQTT] %s %s -> %s\n", ok ? "publicado" : "ERROR al publicar", tema.c_str(), payload);
}

// Línea CSV para la calibración de Brenda (valores crudos, sin offsets).
void imprimirCsv() {
  float t = leerTemperatura();
  float h = leerHumedad();
  float p = leerPresion();
  float v = leerVoltajeMq();
  Serial.printf("%lu,%.2f,%.2f,%.2f,%.3f\n", millis() / 1000, t, h, p, v);
}

// ======================================================================

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== TeleMon · nodo ESP32 ===");

  Wire.begin(PIN_SDA, PIN_SCL);
  analogSetPinAttenuation(PIN_MQ135, ADC_11db);   // rango completo 0-3.3 V
  ds18b20.begin();
  dht.begin();
  if (!iniciarBmp()) Serial.println("[BMP280] no encontrado en 0x76 ni 0x77");
  Serial.printf("[DS18B20] %d sensor(es) en el bus\n", ds18b20.getDeviceCount());

#if MODO_CALIBRACION
  Serial.println("MODO CALIBRACION: sin red, una línea CSV cada ciclo");
  Serial.println("tiempo_s,temp,hum,presion,voltaje_mq");
#else
  iniciarWifi();
  mac = WiFi.macAddress();
  clienteId = mac;
  clienteId.replace(":", "");
  tema = "telemetria/" + clienteId + "/lecturas";
  Serial.printf("[Nodo] MAC %s  tema %s\n", mac.c_str(), tema.c_str());

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(MQTT_KEEPALIVE);
  mqtt.setSocketTimeout(MQTT_TIMEOUT);
#endif
}

void loop() {
#if MODO_CALIBRACION
  if (millis() - ultimoCiclo >= INTERVALO_MS) {
    ultimoCiclo = millis();
    imprimirCsv();
  }
#else
  mantenerWifi();
  mantenerMqtt();
  mqtt.loop();

  if (millis() - ultimoCiclo >= INTERVALO_MS) {
    ultimoCiclo = millis();
    Lectura l = leerSensores();
    imprimirLectura(l);
    publicar(l);
  }
#endif
}
