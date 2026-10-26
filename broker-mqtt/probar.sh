#!/bin/bash
set -u
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RED=$(docker inspect broker_propio -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
HOST=broker_propio
pasa=0; falla=0
resultado() { if [ "$1" = ok ]; then echo "  [OK]    $2"; pasa=$((pasa+1)); else echo "  [FALLA] $2"; falla=$((falla+1)); fi; }
mq() { docker run --rm --network "$RED" eclipse-mosquitto:2 "$@" 2>&1; }

ESP32_USER=$(echo "$BROKER_USERS" | tr ',' '\n' | grep '^esp32:' | cut -d: -f1)
ESP32_PASS=$(echo "$BROKER_USERS" | tr ',' '\n' | grep '^esp32:' | cut -d: -f2-)
NR_USER=$(echo "$BROKER_USERS" | tr ',' '\n' | grep '^nodered:' | cut -d: -f1)
NR_PASS=$(echo "$BROKER_USERS" | tr ',' '\n' | grep '^nodered:' | cut -d: -f2-)
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
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/$ID/estado" -m reinicio > /dev/null; wait
grep -q "telemetria/$ID/estado reinicio" /tmp/telemon_propio.txt && resultado ok "llegó por telemetria/#" || resultado falla "no llegó por telemetria/#"

echo "5. Un filtro que no coincide no recibe nada"
mq mosquitto_sub -h $HOST -u "$NR_USER" -P "$NR_PASS" -t 'otro/+/lecturas' -C 1 -W 3 > /tmp/telemon_propio.txt & sleep 2
mq mosquitto_pub -h $HOST -u "$ESP32_USER" -P "$ESP32_PASS" -i $ID -t "telemetria/$ID/lecturas" -m "$JSON" > /dev/null; wait
grep -q temperatura /tmp/telemon_propio.txt && resultado falla "entregó a un filtro que no coincide" || resultado ok "no se entregó"

echo "6. El broker sobrevive a un reinicio"
docker restart broker_propio > /dev/null; sleep 3
[ "$(docker inspect -f '{{.State.Status}}' broker_propio)" = running ] && resultado ok "sigue en ejecución" || resultado falla "no volvió a levantar"

echo; echo "Resultado: $pasa correctas, $falla fallidas"
[ "$falla" -eq 0 ]
