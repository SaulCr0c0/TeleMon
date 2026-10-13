#!/bin/sh
# Genera el archivo de contraseñas y la lista de control de acceso a partir de las
# variables de entorno (.env), y luego inicia Mosquitto. Así las contraseñas nunca
# quedan guardadas en el repositorio.
set -e

PASSWD=/mosquitto/passwd
ACL=/mosquitto/acl

mosquitto_passwd -b -c "$PASSWD" "$MQTT_USER_ESP32" "$MQTT_PASS_ESP32"
mosquitto_passwd -b "$PASSWD" "$MQTT_USER_NODERED" "$MQTT_PASS_NODERED"

# El ESP32 solo publica telemetría; Node-RED solo la lee
cat > "$ACL" <<ACL
user $MQTT_USER_ESP32
topic write telemetria/#

user $MQTT_USER_NODERED
topic read telemetria/#
ACL

chown mosquitto:mosquitto "$PASSWD" "$ACL"
chmod 0700 "$PASSWD" "$ACL"

exec mosquitto -c /mosquitto/config/mosquitto.conf
