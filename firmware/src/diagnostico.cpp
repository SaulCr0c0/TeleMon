#include <Arduino.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <math.h>

#include "config.h"

uint8_t pinDs = PIN_DS18B20;
uint8_t pinDht = PIN_DHT11;
uint8_t tipoDht = DHT11;
uint8_t pinSda = PIN_SDA;
uint8_t pinScl = PIN_SCL;
uint8_t pinMq = PIN_MQ135;

OneWire* oneWire = nullptr;
DallasTemperature ds18b20;
DHT* dht = nullptr;

uint8_t bmpDir = 0;
uint16_t digT1, digP1;
int16_t digT2, digT3, digP2, digP3, digP4, digP5, digP6, digP7, digP8, digP9;
uint32_t ultimoCrudoP = 0;
uint8_t repeticionesCrudoP = 0;

bool continuo = false;
bool verDs = false, verDht = false, verBmp = false, verMq = false;
unsigned long periodoMs = INTERVALO_MS;
unsigned long ultimoContinuo = 0;
String linea;

bool pinExiste(int p) {
  if (p < 0 || p > 39) return false;
  if (p >= 6 && p <= 11) return false;
  if (p == 20 || p == 24 || (p >= 28 && p <= 31)) return false;
  return true;
}

bool soloEntrada(int p) { return p >= 34 && p <= 39; }

void avisosPin(int p) {
  if (p == 0 || p == 2 || p == 5 || p == 12 || p == 15)
    Serial.printf("  aviso: GPIO %d es pin de arranque (strapping); puede fallar al encender o impedir la carga\n", p);
  if (p == 1 || p == 3)
    Serial.printf("  aviso: GPIO %d es el puerto serie (TX/RX); no usar\n", p);
}

bool validarSalida(int p, const char* nombre) {
  if (!pinExiste(p)) {
    Serial.printf("  GPIO %d no existe o es de la flash interna (6-11)\n", p);
    return false;
  }
  if (soloEntrada(p)) {
    Serial.printf("  GPIO %d es solo entrada; %s necesita un pin bidireccional\n", p, nombre);
    return false;
  }
  avisosPin(p);
  return true;
}

void nivelReposo(uint8_t p, const char* nombre) {
  pinMode(p, INPUT);
  delay(5);
  int sinPull = digitalRead(p);
  if (sinPull == HIGH) {
    Serial.printf("  %s: la línea en reposo está en ALTO (pull-up presente)\n", nombre);
  } else {
    Serial.printf("  %s: la línea en reposo está en BAJO -> falta pull-up, cable suelto o sensor sin alimentación\n", nombre);
  }
}

void iniciarDs() {
  delete oneWire;
  oneWire = new OneWire(pinDs);
  ds18b20.setOneWire(oneWire);
  ds18b20.begin();
}

void iniciarDht() {
  delete dht;
  dht = new DHT(pinDht, tipoDht);
  dht->begin();
}

void iniciarI2c() {
  Wire.end();
  Wire.begin(pinSda, pinScl, 100000);
  bmpDir = 0;
}

void iniciarMq() {
  analogSetPinAttenuation(pinMq, ADC_11db);
}

void imprimirPines() {
  Serial.println("Pines actuales:");
  Serial.printf("  DS18B20 DQ   -> GPIO %d\n", pinDs);
  Serial.printf("  DHT%d DATA   -> GPIO %d\n", tipoDht, pinDht);
  Serial.printf("  BMP280 I2C   -> SDA %d, SCL %d\n", pinSda, pinScl);
  Serial.printf("  MQ-135 AOUT  -> GPIO %d (divisor x%.2f)\n", pinMq, MQ135_FACTOR_DIV);
}

void ayuda() {
  Serial.println();
  Serial.println("=== TeleMon · diagnóstico de sensores ===");
  Serial.println("  todo              prueba los 4 sensores una vez");
  Serial.println("  ds | dht | bmp | mq | i2c   prueba un sensor (i2c = escaneo del bus)");
  Serial.println("  seguir [ds] [dht] [bmp] [mq] [s]  una línea cada s segundos (por defecto todos, 5 s)");
  Serial.println("                    ej.: seguir mq bmp 20  · x y Enter detiene");
  Serial.println("  pines             muestra los pines en uso");
  Serial.println("  pin ds <n>        cambia el pin del DS18B20");
  Serial.println("  pin dht <n>       cambia el pin del DHT");
  Serial.println("  pin i2c <sda> <scl>  cambia los pines del BMP280");
  Serial.println("  pin mq <n>        cambia el pin del MQ-135 (solo ADC1: 32-39)");
  Serial.println("  tipo dht 11|22    cambia el modelo del DHT");
  Serial.println("  ayuda             muestra esta lista");
  Serial.println();
}

void probarDs() {
  Serial.printf("[DS18B20] GPIO %d\n", pinDs);
  nivelReposo(pinDs, "DQ");
  iniciarDs();
  int n = ds18b20.getDeviceCount();
  Serial.printf("  sensores en el bus: %d  · alimentación parásita: %s\n", n, ds18b20.isParasitePowerMode() ? "sí" : "no");
  if (n == 0) {
    Serial.println("  ningún DS18B20 responde: revisar DQ, VCC a 3.3 V y la resistencia de 4.7 kΩ entre DQ y VCC");
    return;
  }
  DeviceAddress dir;
  for (int i = 0; i < n; i++) {
    if (!ds18b20.getAddress(dir, i)) continue;
    Serial.print("  dirección: ");
    for (int b = 0; b < 8; b++) Serial.printf("%02X", dir[b]);
    bool crc = OneWire::crc8(dir, 7) == dir[7];
    Serial.printf("  CRC %s  resolución %d bits\n", crc ? "ok" : "MAL", ds18b20.getResolution(dir));
  }
  int fallos = 0;
  for (int i = 0; i < 5; i++) {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    bool malo = t == DEVICE_DISCONNECTED_C || t == 85.0f;
    if (malo) fallos++;
    Serial.printf("  lectura %d: %.2f °C%s\n", i + 1, t, malo ? "  <- inválida" : "");
  }
  Serial.printf("  resultado: %d/5 válidas\n", 5 - fallos);
}

void probarDht() {
  Serial.printf("[DHT%d] GPIO %d\n", tipoDht, pinDht);
  nivelReposo(pinDht, "DATA");
  iniciarDht();
  delay(2000);
  int ok = 0;
  float hMin = 1000, hMax = -1000, sumaH = 0;
  for (int i = 0; i < 8; i++) {
    unsigned long t0 = micros();
    bool leyo = dht->read(true);
    unsigned long dur = micros() - t0;
    float h = dht->readHumidity(false);
    float t = dht->readTemperature(false, false);
    if (leyo && !isnan(h)) {
      ok++;
      sumaH += h;
      hMin = min(hMin, h);
      hMax = max(hMax, h);
      Serial.printf("  lectura %d: H=%.1f %%  T=%.1f °C  (%lu us)\n", i + 1, h, t, dur);
    } else {
      Serial.printf("  lectura %d: FALLÓ (sin respuesta o checksum) (%lu us)\n", i + 1, dur);
    }
    delay(2200);
  }
  Serial.printf("  resultado: %d/8 válidas", ok);
  if (ok) Serial.printf("  · H media %.1f %% (min %.1f, max %.1f)", sumaH / ok, hMin, hMax);
  Serial.println();
  if (ok && sumaH / ok < 15)
    Serial.println("  humedad muy baja: probar 'tipo dht 22' por si el módulo es un DHT22/AM2302, o comparar con un higrómetro");
  if (ok == 0)
    Serial.println("  sin respuesta: revisar DATA, VCC (3.3 o 5 V) y pull-up de 10 kΩ; probar otro pin con 'pin dht <n>'");
}

uint8_t leer8(uint8_t reg) {
  Wire.beginTransmission(bmpDir);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return 0xFF;
  Wire.requestFrom(bmpDir, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}

bool leerN(uint8_t reg, uint8_t* buf, uint8_t n) {
  Wire.beginTransmission(bmpDir);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(bmpDir, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

bool escribir8(uint8_t reg, uint8_t valor) {
  Wire.beginTransmission(bmpDir);
  Wire.write(reg);
  Wire.write(valor);
  return Wire.endTransmission() == 0;
}

int escanearI2c(bool imprimir) {
  int n = 0;
  if (imprimir) Serial.printf("[I2C] SDA %d, SCL %d, 100 kHz\n", pinSda, pinScl);
  for (uint8_t d = 1; d < 127; d++) {
    Wire.beginTransmission(d);
    if (Wire.endTransmission() == 0) {
      n++;
      if (imprimir) Serial.printf("  dispositivo en 0x%02X%s\n", d, (d == 0x76 || d == 0x77) ? "  (BMP280/BME280)" : "");
    }
  }
  if (imprimir && n == 0)
    Serial.println("  nada en el bus: revisar SDA/SCL (¿invertidos?), VCC a 3.3 V y GND");
  return n;
}

bool cargarCalibracion() {
  uint8_t c[24];
  if (!leerN(0x88, c, 24)) return false;
  digT1 = c[0] | c[1] << 8;
  digT2 = c[2] | c[3] << 8;
  digT3 = c[4] | c[5] << 8;
  digP1 = c[6] | c[7] << 8;
  digP2 = c[8] | c[9] << 8;
  digP3 = c[10] | c[11] << 8;
  digP4 = c[12] | c[13] << 8;
  digP5 = c[14] | c[15] << 8;
  digP6 = c[16] | c[17] << 8;
  digP7 = c[18] | c[19] << 8;
  digP8 = c[20] | c[21] << 8;
  digP9 = c[22] | c[23] << 8;
  return digT1 != 0 && digP1 != 0;
}

bool buscarBmp(bool imprimir) {
  const uint8_t dirs[] = {0x76, 0x77};
  for (uint8_t d : dirs) {
    Wire.beginTransmission(d);
    if (Wire.endTransmission() != 0) continue;
    bmpDir = d;
    uint8_t id = leer8(0xD0);
    if (imprimir) {
      const char* chip = id == 0x58 ? "BMP280" : id == 0x60 ? "BME280 (también mide humedad)" : (id == 0x56 || id == 0x57) ? "BMP280 de muestra" : "DESCONOCIDO";
      Serial.printf("  0x%02X responde · chip ID 0x%02X = %s\n", d, id, chip);
    }
    escribir8(0xE0, 0xB6);
    delay(10);
    if (!cargarCalibracion()) {
      if (imprimir) Serial.println("  calibración ilegible (todo ceros o error I2C): módulo dañado o bus inestable");
      bmpDir = 0;
      return false;
    }
    escribir8(0xF5, 0x00);
    return true;
  }
  bmpDir = 0;
  return false;
}

float compensar(int32_t adcT, int32_t adcP, float* temp) {
  int32_t v1 = ((((adcT >> 3) - ((int32_t)digT1 << 1))) * ((int32_t)digT2)) >> 11;
  int32_t v2 = (((((adcT >> 4) - ((int32_t)digT1)) * ((adcT >> 4) - ((int32_t)digT1))) >> 12) * ((int32_t)digT3)) >> 14;
  int32_t tFine = v1 + v2;
  *temp = ((tFine * 5 + 128) >> 8) / 100.0f;
  int64_t a = ((int64_t)tFine) - 128000;
  int64_t b = a * a * (int64_t)digP6;
  b = b + ((a * (int64_t)digP5) << 17);
  b = b + (((int64_t)digP4) << 35);
  a = ((a * a * (int64_t)digP3) >> 8) + ((a * (int64_t)digP2) << 12);
  a = (((((int64_t)1) << 47) + a)) * ((int64_t)digP1) >> 33;
  if (a == 0) return NAN;
  int64_t p = 1048576 - adcP;
  p = (((p << 31) - b) * 3125) / a;
  a = (((int64_t)digP9) * (p >> 13) * (p >> 13)) >> 25;
  b = (((int64_t)digP8) * p) >> 19;
  p = ((p + a + b) >> 8) + (((int64_t)digP7) << 4);
  return (p / 256.0f) / 100.0f;
}

bool leerCrudoBmp(int32_t* adcT, int32_t* adcP) {
  uint8_t d[6];
  if (!leerN(0xF7, d, 6)) return false;
  *adcP = ((uint32_t)d[0] << 12) | ((uint32_t)d[1] << 4) | (d[2] >> 4);
  *adcT = ((uint32_t)d[3] << 12) | ((uint32_t)d[4] << 4) | (d[5] >> 4);
  return true;
}

bool medirForzado(int32_t* adcT, int32_t* adcP) {
  if (!escribir8(0xF4, 0x55)) return false;
  unsigned long t0 = millis();
  delay(5);
  while ((leer8(0xF3) & 0x08) && millis() - t0 < 100) delay(2);
  return leerCrudoBmp(adcT, adcP);
}

void imprimirBmp(const char* modo, int i, int32_t adcT, int32_t adcP) {
  float t;
  float p = compensar(adcT, adcP, &t);
  bool omitida = adcP == 0x80000 || adcT == 0x80000;
  Serial.printf("  %s %d: P=%.2f hPa  T=%.2f °C  crudo P=0x%05X T=0x%05X%s\n", modo, i, p, t, adcP, adcT,
                omitida ? "  <- medición omitida (0x80000): el sensor no está midiendo" : "");
}

void probarBmp() {
  Serial.printf("[BMP280] SDA %d, SCL %d\n", pinSda, pinScl);
  iniciarI2c();
  if (escanearI2c(true) == 0) return;
  if (!buscarBmp(true)) {
    Serial.println("  no hay BMP280 en 0x76 ni 0x77");
    return;
  }
  Serial.printf("  calibración: digT1=%u digT2=%d digT3=%d digP1=%u digP2=%d … digP9=%d\n", digT1, digT2, digT3, digP1, digP2, digP9);
  bool w1 = escribir8(0xF4, 0x24);
  uint8_t r1 = leer8(0xF4);
  Serial.printf("  escritura de prueba en ctrl_meas (0x24, sin medir): %s, se lee 0x%02X%s\n", w1 ? "ACK" : "SIN ACK", r1,
                r1 == 0x24 ? " -> las escrituras funcionan" : " -> NO guarda lo escrito");
  bool w2 = escribir8(0xF4, 0x25);
  uint8_t r2 = leer8(0xF4);
  delay(20);
  uint8_t r3 = leer8(0xF4);
  uint8_t id = leer8(0xD0);
  Serial.printf("  orden de medir (0x25): %s, justo después 0x%02X, a los 20 ms 0x%02X, chip ID 0x%02X\n", w2 ? "ACK" : "SIN ACK", r2, r3, id);
  if (r1 == 0x24 && r3 == 0x00)
    Serial.println("  -> guarda la configuración pero vuelve a 0x00 al medir: el sensor se REINICIA al medir (alimentación)");
  else if (r1 == 0x24 && r3 == 0x24)
    Serial.println("  -> midió y volvió a dormir: el sensor funciona");
  Serial.println("  modo forzado (una medición por pedido):");
  int32_t aT, aP, prevP = -1;
  int iguales = 0;
  for (int i = 1; i <= 5; i++) {
    if (!medirForzado(&aT, &aP)) {
      Serial.printf("  forzado %d: error I2C\n", i);
      continue;
    }
    imprimirBmp("forzado", i, aT, aP);
    if (aP == prevP) iguales++;
    prevP = aP;
    delay(300);
  }
  Serial.println("  modo normal (continuo, filtro x16, cada 500 ms):");
  escribir8(0xF5, 0x90);
  escribir8(0xF4, 0x57);
  delay(1000);
  for (int i = 1; i <= 5; i++) {
    if (leerCrudoBmp(&aT, &aP)) imprimirBmp("normal", i, aT, aP);
    else Serial.printf("  normal %d: error I2C\n", i);
    delay(600);
  }
  Serial.printf("  registro ctrl_meas 0xF4 = 0x%02X (modo %d: 0 dormido, 1/2 forzado, 3 normal)\n", leer8(0xF4), leer8(0xF4) & 0x03);
  escribir8(0xF5, 0x00);
  escribir8(0xF4, 0x00);
  if (iguales >= 3)
    Serial.println("  el valor crudo no cambia entre mediciones forzadas: sensor congelado, revisar alimentación de 3.3 V y el pin CSB/SDO");
  Serial.println("  esperado en Cochabamba: ~745-755 hPa y variación de décimas entre lecturas");
}

float leerMqMv(int muestras, float* desv, uint16_t* mn, uint16_t* mx) {
  double suma = 0, suma2 = 0;
  *mn = 65535;
  *mx = 0;
  for (int i = 0; i < muestras; i++) {
    uint16_t mv = analogReadMilliVolts(pinMq);
    suma += mv;
    suma2 += (double)mv * mv;
    if (mv < *mn) *mn = mv;
    if (mv > *mx) *mx = mv;
    delay(3);
  }
  double media = suma / muestras;
  *desv = sqrt(max(0.0, suma2 / muestras - media * media));
  return media;
}

void probarMq() {
  Serial.printf("[MQ-135] GPIO %d\n", pinMq);
  if (!(pinMq >= 32 && pinMq <= 39)) {
    Serial.println("  el pin no es ADC1 (32-39); con Wi-Fi activo el ADC2 no funciona");
  }
  iniciarMq();
  float desv;
  uint16_t mn, mx;
  float mv = leerMqMv(200, &desv, &mn, &mx);
  float aout = mv / 1000.0f * MQ135_FACTOR_DIV;
  Serial.printf("  200 muestras en el GPIO: media %.0f mV, desviación %.1f mV, min %u, max %u\n", mv, desv, mn, mx);
  Serial.printf("  AOUT estimado (x%.2f): %.3f V\n", MQ135_FACTOR_DIV, aout);
  if (aout > 0.05f) {
    float rl = (MQ135_RL_KOHM * MQ135_DIV_KOHM) / (MQ135_RL_KOHM + MQ135_DIV_KOHM);
    float rs = rl * (MQ135_VC - aout) / aout;
    Serial.printf("  Rs = %.2f kΩ  · Rs/R0 = %.2f (R0 provisional %.1f kΩ)\n", rs, rs / MQ135_R0, MQ135_R0);
  }
  unsigned long seg = millis() / 1000;
  if (seg < MQ135_PRECALENT_MS / 1000)
    Serial.printf("  precalentando: %lu s de %d s; el valor todavía baja\n", seg, MQ135_PRECALENT_MS / 1000);
  if (mv < 50) Serial.println("  casi 0 V: AOUT desconectado, divisor abierto o módulo sin 5 V en VIN");
  else if (mv > 3100) Serial.println("  saturado (>3.1 V en el GPIO): falta el divisor o está mal armado; riesgo para el ESP32");
  if (desv > 40) Serial.println("  mucho ruido: revisar GND común, cables largos o un capacitor de 100 nF en el GPIO");
}

void lineaContinua() {
  String out;
  unsigned long s = millis() / 1000;
  char buf[96];
  snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu", s / 3600, (s / 60) % 60, s % 60);
  out += buf;
  if (verDs) {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    if (t != DEVICE_DISCONNECTED_C && t != 85.0f) snprintf(buf, sizeof(buf), "  |  DS18B20 %.2f C", t);
    else snprintf(buf, sizeof(buf), "  |  DS18B20 sin dato");
    out += buf;
  }
  if (verDht) {
    if (dht->read(true)) snprintf(buf, sizeof(buf), "  |  DHT %.1f %% %.1f C", dht->readHumidity(false), dht->readTemperature(false, false));
    else snprintf(buf, sizeof(buf), "  |  DHT sin dato");
    out += buf;
  }
  if (verBmp) {
    if (!bmpDir) buscarBmp(false);
    int32_t aT, aP;
    if (bmpDir && medirForzado(&aT, &aP)) {
      float t;
      float p = compensar(aT, aP, &t);
      if (aP == (int32_t)ultimoCrudoP) repeticionesCrudoP++;
      else repeticionesCrudoP = 0;
      ultimoCrudoP = aP;
      snprintf(buf, sizeof(buf), "  |  BMP 0x%02X %.2f hPa %.2f C crudo 0x%05X%s%s", bmpDir, p, t, aP,
               aP == 0x80000 ? " OMITIDA" : "", repeticionesCrudoP >= 3 ? " CONGELADO" : "");
    } else {
      bmpDir = 0;
      snprintf(buf, sizeof(buf), "  |  BMP sin respuesta");
    }
    out += buf;
  }
  if (verMq) {
    float desv;
    uint16_t mn, mx;
    float mv = leerMqMv(64, &desv, &mn, &mx);
    float aout = mv / 1000.0f * MQ135_FACTOR_DIV;
    float rl = (MQ135_RL_KOHM * MQ135_DIV_KOHM) / (MQ135_RL_KOHM + MQ135_DIV_KOHM);
    float razon = aout > 0.05f ? rl * (MQ135_VC - aout) / aout / MQ135_R0 : NAN;
    snprintf(buf, sizeof(buf), "  |  MQ %4.0f mV AOUT %.3f V ±%.0f mV Rs/R0 %.2f", mv, aout, desv, razon);
    out += buf;
  }
  Serial.println(out);
}

void iniciarSeguir(String args) {
  verDs = verDht = verBmp = verMq = false;
  periodoMs = INTERVALO_MS;
  args.trim();
  while (args.length()) {
    int sp = args.indexOf(' ');
    String tok = sp < 0 ? args : args.substring(0, sp);
    args = sp < 0 ? "" : args.substring(sp + 1);
    args.trim();
    if (tok == "ds") verDs = true;
    else if (tok == "dht") verDht = true;
    else if (tok == "bmp") verBmp = true;
    else if (tok == "mq") verMq = true;
    else if (tok.toInt() > 0) periodoMs = (unsigned long)tok.toInt() * 1000UL;
    else {
      Serial.printf("  no entiendo '%s'; uso: seguir [ds] [dht] [bmp] [mq] [segundos]\n", tok.c_str());
      return;
    }
  }
  if (!verDs && !verDht && !verBmp && !verMq) verDs = verDht = verBmp = verMq = true;
  if (verDs) iniciarDs();
  if (verDht) iniciarDht();
  if (verBmp) {
    iniciarI2c();
    buscarBmp(false);
    repeticionesCrudoP = 0;
  }
  if (verMq) iniciarMq();
  continuo = true;
  ultimoContinuo = 0;
  Serial.printf("  continuo cada %lu s:%s%s%s%s  · escribe x y Enter para detener\n", periodoMs / 1000,
                verDs ? " DS18B20" : "", verDht ? " DHT" : "", verBmp ? " BMP280" : "", verMq ? " MQ-135" : "");
}

void cambiarPin(String resto) {
  resto.trim();
  int esp = resto.indexOf(' ');
  String sensor = esp < 0 ? resto : resto.substring(0, esp);
  String nums = esp < 0 ? "" : resto.substring(esp + 1);
  nums.trim();
  if (nums.length() == 0) {
    Serial.println("  falta el número de pin");
    return;
  }
  int a = nums.toInt();
  if (sensor == "ds") {
    if (!validarSalida(a, "el DS18B20")) return;
    pinDs = a;
    iniciarDs();
  } else if (sensor == "dht") {
    if (!validarSalida(a, "el DHT")) return;
    pinDht = a;
    iniciarDht();
  } else if (sensor == "mq") {
    if (!pinExiste(a) || a < 32) {
      Serial.println("  el MQ-135 va en ADC1: GPIO 32-39 (34-39 son solo entrada, ideales)");
      return;
    }
    pinMq = a;
    iniciarMq();
  } else if (sensor == "i2c") {
    int sp = nums.indexOf(' ');
    if (sp < 0) {
      Serial.println("  uso: pin i2c <sda> <scl>");
      return;
    }
    int b = nums.substring(sp + 1).toInt();
    if (!validarSalida(a, "SDA") || !validarSalida(b, "SCL") || a == b) return;
    pinSda = a;
    pinScl = b;
    iniciarI2c();
  } else {
    Serial.println("  sensor desconocido: ds, dht, i2c o mq");
    return;
  }
  imprimirPines();
}

void ejecutar(String cmd) {
  cmd.trim();
  cmd.toLowerCase();
  while (cmd.indexOf("  ") >= 0) cmd.replace("  ", " ");
  if (cmd.length() == 0) return;
  Serial.printf("> %s\n", cmd.c_str());
  if (cmd == "ayuda" || cmd == "?") ayuda();
  else if (cmd == "pines") imprimirPines();
  else if (cmd == "ds") probarDs();
  else if (cmd == "dht") probarDht();
  else if (cmd == "bmp") probarBmp();
  else if (cmd == "mq") probarMq();
  else if (cmd == "i2c") {
    iniciarI2c();
    escanearI2c(true);
  } else if (cmd == "todo") {
    probarDs();
    probarDht();
    probarBmp();
    probarMq();
  } else if (cmd == "seguir" || cmd.startsWith("seguir ")) {
    iniciarSeguir(cmd.substring(6));
  } else if (cmd.startsWith("pin ")) cambiarPin(cmd.substring(4));
  else if (cmd.startsWith("tipo dht")) {
    int t = cmd.substring(8).toInt();
    if (t != 11 && t != 22) {
      Serial.println("  uso: tipo dht 11 | tipo dht 22");
      return;
    }
    tipoDht = t == 11 ? DHT11 : DHT22;
    iniciarDht();
    imprimirPines();
  } else Serial.println("  comando desconocido; escribe 'ayuda'");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  iniciarDs();
  iniciarDht();
  iniciarI2c();
  iniciarMq();
  ayuda();
  imprimirPines();
  Serial.println();
  ejecutar("todo");
  Serial.println("\nlisto; escribe un comando");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (linea.length()) ejecutar(linea);
      linea = "";
      continue;
    }
    if (c < 32 || c > 126) continue;
    if (continuo) {
      continuo = false;
      linea = "";
      Serial.println("  continuo detenido");
      delay(20);
      while (Serial.available()) Serial.read();
      return;
    }
    linea += c;
  }
  if (continuo && (ultimoContinuo == 0 || millis() - ultimoContinuo >= periodoMs)) {
    ultimoContinuo = millis();
    lineaContinua();
  }
}
