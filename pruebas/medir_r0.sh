#!/usr/bin/env bash
set -euo pipefail

RAIZ="${TELEMON_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$RAIZ"

if [ $# -lt 1 ]; then
  echo "Uso: $0 <MAC> [minutos=10]"
  echo "Ej.: $0 F8:B3:B7:2B:FC:24 10"
  exit 2
fi

MAC=$(echo "$1" | tr 'a-f' 'A-F')
MINUTOS="${2:-10}"
if ! [[ "$MAC" =~ ^([0-9A-F]{2}:){5}[0-9A-F]{2}$ ]] || ! [[ "$MINUTOS" =~ ^[0-9]+$ ]] || [ "$MINUTOS" -lt 1 ]; then
  echo "MAC o minutos no válidos" >&2
  exit 2
fi

set -a
. ./.env
set +a

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q <<SQL
\pset footer off
WITH d AS (
  SELECT id, nombre, mq135_r0_kohm FROM dispositivos WHERE mac_address = '${MAC}'
), l AS (
  SELECT l.fecha_hora, l.mq135_v, l.uptime_s,
         (30.0 / 31.0) * (5 - l.mq135_v) / l.mq135_v AS rs
  FROM lecturas l JOIN d ON d.id = l.dispositivo_id
  WHERE l.mq135_v IS NOT NULL AND l.mq135_v < 5
    AND l.fecha_hora > now() - interval '${MINUTOS} minutes'
), mitad AS (
  SELECT min(fecha_hora) + (max(fecha_hora) - min(fecha_hora)) / 2 AS t FROM l
)
SELECT
  (SELECT nombre FROM d) AS monitor,
  count(*) AS lecturas,
  to_char(min(fecha_hora), 'DD/MM HH24:MI') AS desde,
  to_char(max(fecha_hora), 'DD/MM HH24:MI') AS hasta,
  round(min(uptime_s) / 3600.0, 1) AS encendido_h,
  round(avg(mq135_v)::numeric, 3) AS mq135_v,
  round(avg(rs)::numeric, 2) AS r0_kohm,
  round((100 * stddev_samp(rs) / nullif(avg(rs), 0))::numeric, 1) AS variacion_pct,
  round((100 * (avg(rs) FILTER (WHERE fecha_hora > (SELECT t FROM mitad))
       - avg(rs) FILTER (WHERE fecha_hora <= (SELECT t FROM mitad)))
       / nullif(avg(rs), 0))::numeric, 1) AS deriva_pct,
  (SELECT mq135_r0_kohm FROM d) AS r0_cargado
FROM l;
SQL

cat <<TXT

Criterios: al menos 24 h encendido (quemado), lecturas durante todo el periodo,
variación menor a 5 % y deriva menor a 2 %. Si se cumplen, r0_kohm es el R0 del monitor
y se carga en su ficha (Inventario > monitor > R0).
TXT
