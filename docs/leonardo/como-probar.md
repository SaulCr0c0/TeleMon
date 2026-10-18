# Cómo repetir las pruebas

Los comandos de publicar están pensados para **Git Bash** (o Linux). En Windows PowerShell 5.1 las comillas del JSON se pierden al pasarlas a `docker exec`.

## 1. Levantar los servicios

```bash
cp -n .env.example .env
docker compose up -d --build broker postgres nodered
docker compose ps
```

Los tres deben estar `Up`, y `postgres` y `nodered` en `healthy`. Si `broker` se reinicia con `set: illegal option -`, el archivo `mosquitto/config/entrypoint.sh` tiene CRLF: conviértelo a LF.

## 2. Publicar como el monitor de prueba

El client ID tiene que ser el ID del tema (ACL de Mosquitto). Las contraseñas se toman del contenedor:

```bash
docker exec broker sh -c 'mosquitto_pub -u "$MQTT_USER_ESP32" -P "$MQTT_PASS_ESP32" -i F8B3B72BFC24 -t telemetria/F8B3B72BFC24/lecturas -m "$0"' \
  "{\"mac\":\"F8:B3:B7:2B:FC:24\",\"ts\":$(date +%s%3N),\"uptime\":3605,\"temperatura\":22.81,\"humedad\":46,\"presion\":748.4,\"mq135_v\":0.421,\"rssi\":-58,\"fw\":\"1.1.0\"}"
```

## 3. Revisar la base

```bash
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, latencia_ms, temperatura, presion, mq135_v, rs_r0, nivel_aire FROM lecturas ORDER BY id DESC LIMIT 5;"'
docker exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT ultima_lectura_en, ultimo_rssi, ultimo_uptime_s, fw FROM dispositivos WHERE id = 1;"'
docker compose logs nodered | grep -E "warn|error"
```

## 4. Revisar la API y el WebSocket

```bash
curl -s localhost:1880/api/ubicaciones/1/ultimas
curl -s -w " [%{http_code}]\n" localhost:1880/api/ubicaciones/abc/ultimas
node -e "const ws = new WebSocket('ws://localhost:1880/ws/lecturas'); ws.onmessage = (e) => console.log(e.data);"
```

Con el último comando abierto, cada lectura publicada aparece como `{"tipo":"lectura",...}`.

## 5. Ver el Panel con el backend real

```bash
cd frontend
npm install
echo "VITE_MODO_DEMO=false" > .env.local
npm run dev
```

Entra a http://localhost:5173/login con `direccion@redvallealto.edu.bo` / `telemon123`, abre **Escuela Adela Zamudio → Panel** y publica lecturas como en el paso 2: la fila de «Aula 3» cambia sola. Al terminar, borra `.env.local` para volver al modo demo.

## 6. Casos de la evidencia

| Caso | Qué cambiar en la trama o en la base | Esperado |
|---|---|---|
| Sensor nulo | `"presion":null` | Fila guardada con presión nula |
| MAC distinta al tema | `"mac":"AA:BB:CC:DD:EE:FF"` publicando en `F8B3B72BFC24` | Nada guardado; aviso en el log |
| Monitor no activo | Publicar con `-i 246F28B1075A` en `telemetria/246F28B1075A/lecturas` y su MAC | Nada guardado; «en estado reservado» |
| Rs/R0 | `UPDATE dispositivos SET mq135_r0_kohm = 10.5 WHERE id = 1;` y `mq135_v` 0.421, 0.62 y 1.2 | bueno 1.002, moderado 0.651, malo 0.292 |
| Hora | `"ts":null` | Latencia nula, lectura guardada |
| Nodo sin conexión | No publicar durante más de 2 minutos | El Panel muestra «Sin conexión · hace N min» |

Al terminar las pruebas de Rs/R0, deja el R0 como estaba: `UPDATE dispositivos SET mq135_r0_kohm = NULL WHERE id = 1;`.

## 7. Pruebas del frontend

```bash
cd frontend
npm run lint
npm test
npm run build
```
