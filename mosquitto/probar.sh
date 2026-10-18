#!/bin/bash
# Prueba el broker Mosquitto: publicación, suscripción, credenciales y permisos por tema.
# Uso: ./mosquitto/probar.sh   (con el broker levantado mediante docker compose up -d)
set -u
cd "$(dirname "$0")/.."
set -a; source .env; set +a

pasa=0; falla=0
resultado() { if [ "$1" = ok ]; then echo "  [OK]    $2"; pasa=$((pasa+1)); else echo "  [FALLA] $2"; falla=$((falla+1)); fi; }
sub() { docker exec broker mosquitto_sub -u "$1" -P "$2" -t "$3" -C 1 -W 3 2>&1; }
pub() { docker exec broker mosquitto_pub -u "$1" -P "$2" -i "$3" -t "$4" -m "$5" 2>&1; }

ID=AABBCCDDEEFF
OTRO=112233445566
TEMA="telemetria/$ID/lecturas"
JSON='{"mac":"AA:BB:CC:DD:EE:FF","ts":1760736000123,"uptime":3600,"temperatura":22.4,"humedad":55.0,"presion":750.3,"mq135_v":1.234,"rssi":-61,"fw":"1.1.0"}'

echo "1. Node-RED recibe lo que publica el ESP32"
sub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "$ID" "$TEMA" "$JSON"; wait
grep -q '"temperatura":22.4' /tmp/telemon_sub.txt && resultado ok "mensaje JSON recibido" || resultado falla "no llegó el mensaje"

echo "2. Se rechaza una contraseña incorrecta"
pub "$MQTT_USER_ESP32" "clave-falsa" "$ID" "$TEMA" "x" | grep -qi "not authorised\|bad user\|refused" \
  && resultado ok "conexión rechazada" || resultado falla "aceptó una contraseña incorrecta"

echo "3. Node-RED no puede publicar telemetría (solo lectura)"
sub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "nodered-prueba" "$TEMA" "intruso"; wait
grep -q "intruso" /tmp/telemon_sub.txt && resultado falla "Node-RED pudo publicar" || resultado ok "publicación de Node-RED bloqueada"

echo "4. El ESP32 no puede leer telemetría (solo escritura)"
sub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "$ID" "$TEMA" "$JSON"; wait
grep -q "temperatura" /tmp/telemon_sub.txt && resultado falla "el ESP32 pudo leer" || resultado ok "lectura del ESP32 bloqueada"

echo "5. Un monitor no puede publicar en el tema de otro"
sub "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED" "telemetria/#" > /tmp/telemon_sub.txt & sleep 1
pub "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32" "$ID" "telemetria/$OTRO/lecturas" "suplantado"; wait
grep -q "suplantado" /tmp/telemon_sub.txt && resultado falla "publicó en el tema de otro monitor" || resultado ok "publicación en tema ajeno bloqueada"

echo "6. El broker sobrevive a un reinicio"
docker restart broker > /dev/null; sleep 3
[ "$(docker inspect -f '{{.State.Status}}' broker)" = running ] && [ "$(docker inspect -f '{{.RestartCount}}' broker)" = 0 ] \
  && resultado ok "sigue en ejecución tras reiniciar" || resultado falla "quedó reiniciándose"

echo; echo "Resultado: $pasa correctas, $falla fallidas"
[ "$falla" -eq 0 ]
