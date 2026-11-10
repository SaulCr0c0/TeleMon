#!/bin/bash
set -u
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RED=$(docker inspect broker_propio -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
HOST=broker_propio
pasa=0; falla=0
resultado() { if [ "$1" = ok ]; then echo "  [OK]    $2"; pasa=$((pasa+1)); else echo "  [FALLA] $2"; falla=$((falla+1)); fi; }
mq() { docker run --rm --network "$RED" eclipse-mosquitto:2 "$@" 2>&1; }

ESP32_USER=$MQTT_USER_ESP32
ESP32_PASS=$MQTT_PASS_ESP32
NR_USER=$MQTT_USER_NODERED
NR_PASS=$MQTT_PASS_NODERED
ID=AABBCCDDEEFF
JSON='{"mac":"AA:BB:CC:DD:EE:FF","ts":1760736000123,"uptime":3600,"temperatura":22.4,"humedad":55.0,"presion":750.3,"mq135_v":1.234,"rssi":-61,"fw":"1.1.0"}'

echo "1. Node-RED recibe con telemetria/+/lecturas lo que publica un monitor"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -t 'telemetria/+/lecturas' -C 1 -W 5 > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/$ID/lecturas" -m "$JSON" > /dev/null; wait
grep -q '"temperatura":22.4' /tmp/telemon_propio.txt && resultado ok "mensaje JSON recibido" || resultado falla "no llegó el mensaje"

echo "2. Se rechaza una contraseña incorrecta"
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P clave-falsa -i $ID -t "telemetria/$ID/lecturas" -m x | grep -qi "not authorised\|bad user\|refused" \
  && resultado ok "conexión rechazada" || resultado falla "aceptó una contraseña incorrecta"

echo "3. Se rechaza una conexión sin usuario"
mq mosquitto_pub -h $HOST -i $ID -t "telemetria/$ID/lecturas" -m x | grep -qi "not authorised\|refused" \
  && resultado ok "conexión sin usuario rechazada" || resultado falla "aceptó una conexión sin usuario"

echo "4. El comodín # recibe todo lo que cuelga de telemetria/"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -t 'telemetria/#' -C 1 -W 5 -v > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/$ID/lecturas" -m reinicio > /dev/null; wait
grep -q "telemetria/$ID/lecturas reinicio" /tmp/telemon_propio.txt && resultado ok "llegó por telemetria/#" || resultado falla "no llegó por telemetria/#"

echo "5. Un filtro que no coincide no recibe nada"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -t 'otro/+/lecturas' -C 1 -W 3 > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/$ID/lecturas" -m "$JSON" > /dev/null; wait
grep -q temperatura /tmp/telemon_propio.txt && resultado falla "entregó a un filtro que no coincide" || resultado ok "no se entregó"

echo "6. ACL: un monitor no puede publicar en el tema de otro"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -t 'telemetria/#' -C 1 -W 3 > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/OTROMONITOR1/lecturas" -m suplantado > /dev/null; wait
grep -q suplantado /tmp/telemon_propio.txt && resultado falla "entregó una publicación ajena" || resultado ok "publicación ajena descartada"

echo "7. ACL: un monitor no puede suscribirse"
mq mosquitto_sub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t 'telemetria/#' -C 1 -W 3 | grep -qi "denied\|refused\|failed" \
  && resultado ok "suscripción rechazada" || resultado falla "aceptó la suscripción de un monitor"

echo "8. ACL: Node-RED no puede publicar"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -i oyente -t 'telemetria/#' -C 1 -W 3 > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$NR_USER" -P "$NR_PASS" -i intruso -t "telemetria/$ID/lecturas" -m falso > /dev/null; wait
grep -q falso /tmp/telemon_propio.txt && resultado falla "Node-RED pudo publicar" || resultado ok "publicación de Node-RED descartada"

echo "9. WebSocket: el saludo responde 101 con el subprotocolo mqtt"
docker run --rm --network "$RED" curlimages/curl:8.11.1 -s -i --http1.1 -m 3 -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Protocol: mqtt" \
  http://$HOST:9001/ 2>&1 | grep -q "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" && resultado ok "saludo WebSocket correcto" || resultado falla "sin saludo WebSocket"

echo "10. El broker sobrevive a un reinicio"
docker restart broker_propio > /dev/null; sleep 3
[ "$(docker inspect -f '{{.State.Status}}' broker_propio)" = running ] && resultado ok "sigue en ejecución" || resultado falla "no volvió a levantar"

echo; echo "Resultado: $pasa correctas, $falla fallidas"
[ "$falla" -eq 0 ]
