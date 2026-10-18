# nodered

Backend de TeleMon en Node-RED 4.0.9 con `node-red-contrib-postgresql`. Contiene la **recepción de lecturas** (#49), el **cálculo de Rs/R0** (#53), la **API de últimas lecturas** y el **WebSocket** `/ws/lecturas` (#54).

## Levantar

```bash
docker compose up -d --build broker postgres nodered
docker compose logs -f nodered
```

Editor: http://localhost:1880. El puerto se publica solo en `127.0.0.1`, así que el editor no queda abierto a la red.

Las variables salen del `.env` de la raíz:

| Variable en Node-RED | Valor |
|---|---|
| `MQTT_USER`, `MQTT_PASS` | `MQTT_USER_NODERED`, `MQTT_PASS_NODERED` |
| `PGHOST` | `postgres` |
| `PGDATABASE`, `PGUSER`, `PGPASSWORD` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |

## Archivos

| Archivo | Qué es |
|---|---|
| `Dockerfile` | Imagen de Node-RED con el nodo de PostgreSQL |
| `data/flows.json` | Flujos |
| `data/flows_cred.json` | Usuario y contraseña del broker como `${MQTT_USER}` y `${MQTT_PASS}`: no hay contraseñas reales |
| `data/settings.js` | Credenciales sin cifrar (solo tienen referencias a variables) y `flows.json` legible |

El resto de `data/` lo genera Node-RED y no se sube. Si se cambia el flujo en el editor, **Deploy** reescribe `data/flows.json`, y ese es el archivo que se sube.

## Flujo «Recepción»

```text
[mqtt in telemetria/+/lecturas] → [Validar trama] → [Buscar monitor] → [Calcular aire y tiempos]
  → [Guardar lectura] → [Preparar evento] → [link out «Lectura guardada»]
```

1. **Validar trama.** Toma la hora de llegada antes de consultar la base. Exige el tema `telemetria/<ID>/lecturas` con un ID de 12 caracteres hexadecimales en mayúsculas, un objeto JSON y una MAC que, en mayúsculas y sin `:`, sea igual al ID del tema.
2. **Buscar monitor** por su MAC.
3. **Calcular aire y tiempos.** Solo sigue si el monitor está `en_uso`, tiene ubicación y esa ubicación es de su mismo cliente. Calcula la latencia y Rs/R0.
4. **Guardar lectura.** Una sola sentencia actualiza el monitor (última lectura, RSSI, uptime y firmware) e inserta la lectura, y solo si el monitor sigue `en_uso` en esa ubicación. Si algo falla no se guarda nada y no sale ningún evento. Un mensaje más viejo no hace retroceder los datos del monitor, y un RSSI, uptime o firmware nulo no borra el último conocido.
5. **Preparar evento.** Deja en `msg.payload` el aviso de la lectura guardada (`tipo`, `ubicacionId`, `dispositivoId`, `fecha`, las tres variables, `rsR0`, `nivelAire`) y lo pasa a «Lectura guardada». De ahí sale al WebSocket; las alertas (#69, #74) y los reinicios (#76) se conectan en el mismo punto.

Cada campo se acepta solo si es un número dentro del rango físico de `firmware/include/config.h`. Si no lo es, se guarda como `null` y el resto de la lectura no se pierde. El texto `"22.8"` no se toma como número y `null` no pasa a cero.

| Campo | Válido |
|---|---|
| `temperatura` | −40 a 85 °C |
| `humedad` | 0 a 100 % |
| `presion` | 300 a 1100 hPa |
| `mq135_v` | 0.05 a 5 V |
| `uptime` | Entero ≥ 0 |
| `rssi` | Entero de −127 a 0 dBm |
| `ts` | Entero en ms UTC (desde 2023) |
| `fw` | Texto de 1 a 32 caracteres |

Las tramas descartadas y los campos inválidos quedan como aviso en el log, con el motivo: `docker compose logs nodered | grep warn`.

## Flujo «API y tiempo real»

### `GET /api/ubicaciones/:id/ultimas`

Una fila por monitor `en_uso` de la ubicación, ordenada por id, con su última lectura **en esa ubicación** (si el nodo se trasladó, no muestra lo que midió en la anterior). Misma forma que `frontend/src/api/demo/panel.js`:

```json
[
  {
    "dispositivoId": 1,
    "nombre": "Aula 3",
    "conectado": true,
    "fecha": "2026-10-18T19:23:12.796Z",
    "temperatura": 22.81,
    "humedad": 46,
    "presion": 748.4,
    "rsR0": null,
    "nivelAire": "sin_calibrar"
  }
]
```

- `conectado`: la última lectura es más reciente que la espera «sin conexión» de la ubicación (`ubicaciones.espera_sin_conexion_s`).
- Nodo sin lecturas: aparece con `fecha`, variables y `nivelAire` en `null` y `conectado: false` («Esperando la primera lectura»).
- `nivelAire`: el nivel guardado; `"sin_calibrar"` si hubo voltaje del MQ-135 pero no Rs/R0 (falta R0); `null` si el MQ-135 no respondió, igual que una variable nula es «sin respuesta».

| Caso | Respuesta |
|---|---|
| ID que no es un entero positivo (`abc`, `0`, `1.5`) | 400 `{ "mensaje": "Ubicación no válida." }` |
| Ubicación inexistente | 404 `{ "mensaje": "Ubicación no encontrada." }` |
| Ubicación sin nodos en uso | 200 `[]` |
| Falla de la base | 500 `{ "mensaje": "No se pudieron consultar los datos. Intenta de nuevo." }`, y el error queda en el log |

### WebSocket `/ws/lecturas`

Los nodos WebSocket de Node-RED escuchan una ruta fija, así que hay un solo canal para todas las ubicaciones. Cada lectura guardada se envía como `{ tipo: "lectura", ubicacionId, dispositivoId, fecha, temperatura, humedad, presion, rsR0, nivelAire }`, con los mismos valores y la misma regla de `nivelAire` que `/ultimas`. El frontend (`useTiempoReal`) se queda solo con los mensajes de su ubicación.

Ese filtro del navegador **no es una medida de seguridad**: hoy cualquiera que abra el canal recibe las lecturas de todos los clientes. Autenticar la conexión y enviar a cada cliente solo lo suyo queda para el login (#63).

## Calidad del aire (#53)

Con el R0 de cada monitor (`dispositivos.mq135_r0_kohm`):

```text
RL_ef = 1 · 30 / (1 + 30) kΩ
Rs    = RL_ef · (5 − mq135_v) / mq135_v
Rs/R0 = Rs / R0
bueno si Rs/R0 ≥ 0.80 · moderado si ≥ 0.50 · malo si < 0.50
```

- `mq135_v` ya es el voltaje de AOUT: no se vuelve a multiplicar por 1.5.
- Rs/R0 se redondea a 3 decimales, que es lo que guarda la columna, y el nivel se calcula sobre ese valor. Así el nivel guardado siempre corresponde al Rs/R0 guardado.
- Sin R0, sin voltaje (precalentamiento) o con 5 V: `rs_r0` y `nivel_aire` quedan en `null` y la web muestra «sin calibrar».

## Horas y latencia

- `fecha_hora`: llegada al servidor. Es la hora oficial para el panel y el historial.
- `ts_dispositivo`: el `ts` del JSON, o `null`.
- `latencia_ms = llegada − ts`. Queda en `null` si `ts` es nulo o si la diferencia pasa de 10 s (reloj sin sincronizar). Una latencia negativa no se cambia a cero: indica desfase de reloj y se excluye al analizar.

## Probar

Simular el monitor real. Las contraseñas se toman del propio contenedor del broker. El client ID tiene que ser el ID del tema por la ACL de Mosquitto:

```bash
docker exec broker sh -c 'mosquitto_pub -u "$MQTT_USER_ESP32" -P "$MQTT_PASS_ESP32" -i F8B3B72BFC24 -t telemetria/F8B3B72BFC24/lecturas -m "$0"' \
  "{\"mac\":\"F8:B3:B7:2B:FC:24\",\"ts\":$(date +%s%3N),\"uptime\":3605,\"temperatura\":22.81,\"humedad\":46,\"presion\":748.4,\"mq135_v\":0.421,\"rssi\":-58,\"fw\":\"1.1.0\"}"

docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, latencia_ms, temperatura, presion, mq135_v, rs_r0, nivel_aire FROM lecturas ORDER BY id DESC LIMIT 3;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT ultima_lectura_en, ultimo_rssi, ultimo_uptime_s, fw FROM dispositivos WHERE id = 1;"'
```

Ver la API y escuchar el WebSocket (Node.js 22 trae `WebSocket`):

```bash
curl -s localhost:1880/api/ubicaciones/1/ultimas
node -e "const ws = new WebSocket('ws://localhost:1880/ws/lecturas'); ws.onmessage = (e) => console.log(e.data);"
```

Con el segundo comando abierto, cada lectura publicada aparece como `{"tipo":"lectura","ubicacionId":1,...}`.

Para probar Rs/R0 con un R0 de prueba: `UPDATE dispositivos SET mq135_r0_kohm = 10.5 WHERE id = 1;` y publicar con `mq135_v` 0.421, 0.62 y 1.2 (bueno 1.002, moderado 0.651, malo 0.292). Al terminar hay que volver a dejarlo como estaba: `UPDATE dispositivos SET mq135_r0_kohm = NULL WHERE id = 1;`.

**Responsable:** Garnica Salazar, L.
