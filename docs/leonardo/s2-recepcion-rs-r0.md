# #49 y #53 — Recepción de lecturas y cálculo de Rs/R0

PR #101. Flujo «Recepción» de `nodered/data/flows.json`; el detalle está en `nodered/README.md`.

```text
[mqtt in telemetria/+/lecturas] → [Validar trama] → [Buscar monitor] → [Calcular aire y tiempos]
  → [Guardar lectura] → [Preparar evento] → [link out «Lectura guardada»]
```

Monitor de prueba: `F8:B3:B7:2B:FC:24` (dispositivo 1, «Aula 3», ubicación 1, R0 nulo).

## R1. Trama válida

```json
{"mac":"F8:B3:B7:2B:FC:24","ts":<ahora>,"uptime":3605,"temperatura":22.81,"humedad":46,"presion":748.4,"mq135_v":0.421,"rssi":-58,"fw":"1.1.0"}
```

Fila guardada:

```text
 id | ubic |         fecha_hora         |       ts_dispositivo       | lat | temp  |  hum  |  pres  | mq135_v | rs_r0 | nivel_aire | uptime_s
 30 |    1 | 2026-10-18 15:59:19.785-04 | 2026-10-18 15:59:19.497-04 | 288 | 22.81 | 46.00 | 748.40 |   0.421 |       |            |     3605
```

Monitor actualizado:

```text
 id |     ultima_lectura_en      | ultimo_rssi | ultimo_uptime_s |  fw
  1 | 2026-10-18 15:59:19.785-04 |         -58 |            3605 | 1.1.0
```

`fecha_hora` es la llegada al servidor y `ts_dispositivo` el `ts` del JSON. Los 288 ms de latencia incluyen arrancar `docker exec`.

## R2. Sensor nulo

Con `"presion": null` se guarda la fila con la presión vacía y las demás variables:

```text
 id | temp  |  hum  | pres | mq135_v | uptime_s
 31 | 22.81 | 46.00 |      |   0.421 |     3605
```

## R3. Campos con tipo o rango inválido

Con `"temperatura": "22.8"` (texto) y `"humedad": 140` (fuera de 0–100), esos dos campos se guardan nulos y el resto se conserva:

```text
 id | temp | hum |  pres  | mq135_v | uptime_s
 32 |      |     | 748.40 |   0.421 |     3700
```

Log: `[function:Validar trama] Campos no válidos de F8:B3:B7:2B:FC:24, se guardan como nulos: temperatura, humedad`

## R4. Tramas descartadas

Se publicaron cinco tramas inválidas. **Lecturas antes: 31, después: 31.** Motivos que quedaron en el log:

| Trama | Aviso en el log |
|---|---|
| MAC `AA:BB:CC:DD:EE:FF` en el tema de `F8B3B72BFC24` | `La MAC AA:BB:CC:DD:EE:FF no coincide con el tema telemetria/F8B3B72BFC24/lecturas` |
| Monitor 2 (estado `reservado`) | `Monitor 24:6F:28:B1:07:5A en estado reservado: no se guardan sus lecturas` |
| MAC que no está registrada | `Monitor no registrado: AA:BB:CC:DD:EE:FF` |
| `{"mac":"F8:B3:B7:2B:FC:24",` | `JSON mal formado en telemetria/F8B3B72BFC24/lecturas` |
| `[1,2]` | `La trama de telemetria/F8B3B72BFC24/lecturas no es un objeto JSON` |

## A1. Rs/R0 y nivel de aire (#53)

```text
RL_ef = 1 · 30 / (1 + 30) kΩ
Rs    = RL_ef · (5 − mq135_v) / mq135_v
Rs/R0 = Rs / R0        bueno ≥ 0.80 · moderado ≥ 0.50 · malo < 0.50
```

Con R0 **de prueba**, cargado a mano y restaurado a nulo al terminar (no es una calibración real):

| R0 (kΩ) | `mq135_v` (V) | `rs_r0` | `nivel_aire` | Caso |
|---|---|---|---|---|
| 10.5 | 0.421 | 1.002 | bueno | Tabla del plan |
| 10.5 | 0.620 | 0.651 | moderado | Tabla del plan |
| 10.5 | 1.200 | 0.292 | malo | Tabla del plan |
| 10.887 | 0.500 | 0.800 | bueno | Borde 0.80 |
| 10.9 | 0.500 | 0.799 | moderado | Justo bajo 0.80 |
| 17.419 | 0.500 | 0.500 | moderado | Borde 0.50 |
| 17.45 | 0.500 | 0.499 | malo | Justo bajo 0.50 |
| nulo | 0.421 | nulo | nulo | Sin calibrar |

Rs/R0 se redondea a 3 decimales (la precisión de la columna) y el nivel se calcula sobre ese valor. Así el nivel guardado siempre corresponde al Rs/R0 guardado.

## T1. Horas y latencia

| Caso | `ts_dispositivo` | `latencia_ms` |
|---|---|---|
| `ts: null` | nulo | nula |
| Reloj del monitor atrasado 60 s | 15:58:54.225 (llegada 15:59:54.482) | nula |
| Reloj del monitor adelantado 60 s | 16:00:55.563 (llegada 15:59:55.806) | nula |

En los tres casos la lectura ambiental se guardó. Una diferencia mayor a 10 s deja la latencia nula, como pide el plan.

## E1. Falla al guardar

Se agregó una restricción temporal para que el INSERT falle:

- **Lecturas antes: 42, después: 42.**
- `ultimo_uptime_s` del monitor siguió en 3605; la trama traía 9999. El INSERT y la actualización del monitor van en una sola sentencia, así que fallan juntos.
- No salió ningún evento hacia el WebSocket.
- Log: `[postgresql:Guardar lectura] error: new row for relation "lecturas" violates check constraint "prueba_falla"`

Antes de unir #101 también se probó con PostgreSQL detenido. El error quedó en el log (`getaddrinfo EAI_AGAIN postgres`), sin fila ni evento.

## Persistencia del flujo

Con `docker compose up -d --force-recreate nodered`, el flujo arranca, se conecta al broker y guarda lecturas sin configurar nada a mano. En el repositorio solo están `flows.json`, `flows_cred.json` y `settings.js`, y las credenciales del broker son referencias a variables (`${MQTT_USER}`, `${MQTT_PASS}`).
