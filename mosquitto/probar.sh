#!/bin/bash
# Prueba el broker Mosquitto: publicación, suscripción, credenciales y permisos por tema.
# Uso: ./mosquitto/probar.sh   (con el broker levantado mediante docker compose up -d)
set -u
cd "$(dirname "$0")/.."
set -a; source .env; set +a

pasa=0; falla=0
resultado() { if [ "$1" = ok ]; then echo "  [OK]    $2"; pasa=$((pasa+1)); else echo "  [FALLA] $2"; falla=$((falla+1)); fi; }
sub() { docker exec broker mosquitto_sub -u "$1" -P "$2" -t "$3" -C 1 -W 3 2>&1; }
pub() { docker exec broker mosquitto_pub -u "$1" -P "$2" -t "$3" -m "$4" 2>&1; }

JSON='{"mac":"AA:BB:CC:DD:EE:FF","temperatura":22.4,"humedad":55.0,"presion":750.3,"calidad_aire":1.2}'

echo "1. Node-RED recibe lo que publica el ESP32"
sub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "telemetria/ambiente" "$JSON"; wait
grep -q '"temperatura":22.4' /tmp/telemon_sub.txt && resultado ok "mensaje JSON recibido" || resultado falla "no llegó el mensaje"

echo "2. Se rechaza una contraseña incorrecta"
pub "$MQTT_USER_ESP32" "clave-falsa" "telemetria/ambiente" "x" | grep -qi "not authorised\|bad user\|refused" \
  && resultado ok "conexión rechazada" || resultado falla "aceptó una contraseña incorrecta"

echo "3. Node-RED no puede publicar telemetría (solo lectura)"
sub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/ambiente" "intruso"; wait
grep -q "intruso" /tmp/telemon_sub.txt && resultado falla "Node-RED pudo publicar" || resultado ok "publicación de Node-RED bloqueada"

echo "4. El ESP32 no puede leer telemetría (solo escritura)"
sub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "telemetria/ambiente" "$JSON"; wait
grep -q "temperatura" /tmp/telemon_sub.txt && resultado falla "el ESP32 pudo leer" || resultado ok "lectura del ESP32 bloqueada"

echo; echo "Resultado: $pasa correctas, $falla fallidas"
[ "$falla" -eq 0 ]
