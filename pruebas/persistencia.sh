#!/usr/bin/env bash
set -euo pipefail

RAIZ="${TELEMON_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$RAIZ"

if [ "${1:-}" != "--si" ]; then
  echo "Recrea todo el stack (docker compose down + up -d): el servicio queda fuera por unos segundos."
  echo "Uso: $0 --si"
  exit 2
fi

set -a
. ./.env
set +a

sql() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"
}

foto() {
  echo "flows_host=$(sha256sum nodered/data/flows.json | cut -c1-16)"
  echo "flows_contenedor=$(docker compose exec -T nodered sha256sum /data/flows.json | cut -c1-16)"
  echo "flows_cred=$(sha256sum nodered/data/flows_cred.json | cut -c1-16)"
  echo "modulos_nodered=$(ls nodered/data/node_modules | wc -l)"
  for tabla in usuarios clientes ubicaciones dispositivos umbrales alertas eventos_dispositivo; do
    echo "filas_${tabla}=$(sql "SELECT count(*) FROM ${tabla}")"
  done
  echo "usuarios_mqtt=$(docker compose exec -T broker cut -d: -f1 /mosquitto/passwd | sort | paste -sd, -)"
}

esperar_stack() {
  for _ in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' postgres 2>/dev/null)" = "healthy" ] &&
       [ "$(docker inspect -f '{{.State.Health.Status}}' nodered 2>/dev/null)" = "healthy" ] &&
       docker compose exec -T broker test -s /mosquitto/passwd 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "El stack no quedó listo en 120 s" >&2
  docker compose ps
  exit 1
}

esperar_stack
antes=$(foto)
lecturas_antes=$(sql "SELECT count(*) FROM lecturas")
max_antes=$(sql "SELECT coalesce(max(id), 0) FROM lecturas")
volumenes_antes=$(docker volume ls -q --filter "label=com.docker.compose.project=telemon" | sort | paste -sd, -)

echo "== Antes"
echo "$antes"
echo "lecturas=${lecturas_antes} (id máximo ${max_antes})"
echo "volumenes=${volumenes_antes}"

inicio=$(date +%s)
docker compose down
docker compose up -d
esperar_stack
echo "== Stack recreado en $(( $(date +%s) - inicio )) s"

despues=$(foto)
lecturas_despues=$(sql "SELECT count(*) FROM lecturas WHERE id <= ${max_antes}")
volumenes_despues=$(docker volume ls -q --filter "label=com.docker.compose.project=telemon" | sort | paste -sd, -)

echo "== Después"
echo "$despues"
echo "lecturas previas conservadas=${lecturas_despues}"
echo "volumenes=${volumenes_despues}"

fallos=0
if [ "$antes" != "$despues" ]; then
  echo "FALLA: cambió algo de lo anterior"
  diff <(echo "$antes") <(echo "$despues") || true
  fallos=1
fi
if [ "$lecturas_antes" != "$lecturas_despues" ]; then
  echo "FALLA: se perdieron lecturas (${lecturas_antes} -> ${lecturas_despues})"
  fallos=1
fi
if [ "$volumenes_antes" != "$volumenes_despues" ]; then
  echo "FALLA: cambiaron los volúmenes"
  fallos=1
fi

nuevas=0
for _ in $(seq 1 12); do
  nuevas=$(sql "SELECT count(*) FROM lecturas WHERE id > ${max_antes}")
  [ "$nuevas" -gt 0 ] && break
  sleep 5
done
if [ "$nuevas" -gt 0 ]; then
  echo "Recepción: ${nuevas} lectura(s) nuevas después de recrear (MQTT y Node-RED funcionando)"
else
  echo "Recepción: sin lecturas nuevas en 60 s (¿hay algún monitor publicando?)"
fi

if [ "$fallos" -eq 0 ]; then
  echo "RESULTADO: PASA. Flujos, credenciales, módulos, datos, usuarios MQTT y volúmenes se conservan."
else
  echo "RESULTADO: FALLA"
  exit 1
fi
