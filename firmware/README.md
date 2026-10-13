# firmware

Código C++ del nodo ESP32 (PlatformIO): lectura de DS18B20, DHT11, HW-611 (BMP280) y MQ-135, validación y publicación MQTT en `telemetria/ambiente` cada 5 s.

- Biblioteca MQTT: `PubSubClient` (MQTT 3.1.1).
- El MQ-135 se lee en GPIO 34 a través del divisor 10 kΩ / 20 kΩ: multiplicar la tensión por 1.5.
- Las credenciales Wi-Fi y MQTT van en `include/secrets.h` (ignorado por Git).

**Responsable:** Mantilla Villaca, J.
