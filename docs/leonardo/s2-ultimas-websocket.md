# #54 — Últimas lecturas por nodo y WebSocket

PR #104. Flujo «API y tiempo real» de `nodered/data/flows.json` y hook `frontend/src/hooks/useTiempoReal.js`.

## P1. `GET /api/ubicaciones/:id/ultimas`

| Petición | Respuesta |
|---|---|
| `/api/ubicaciones/1/ultimas` | `200` `[{"dispositivoId":1,"nombre":"Aula 3","conectado":true,"fecha":"2026-10-18T19:59:55.806Z","temperatura":22.81,"humedad":46,"presion":748.4,"rsR0":null,"nivelAire":"sin_calibrar"}]` |
| `/api/ubicaciones/2/ultimas` (sin nodos) | `200` `[]` |
| `/api/ubicaciones/999/ultimas` (no existe) | `404` `{"mensaje":"Ubicación no encontrada."}` |
| `/api/ubicaciones/abc/ultimas` | `400` `{"mensaje":"Ubicación no válida."}` |
| `/api/ubicaciones/0/ultimas` | `400` `{"mensaje":"Ubicación no válida."}` |
| `/api/ubicaciones/1.5/ultimas` | `400` `{"mensaje":"Ubicación no válida."}` |
| `/api/ubicaciones/99999999999/ultimas` | `400` `{"mensaje":"Ubicación no válida."}` |

Los valores `NUMERIC` llegan como números JSON, los nulos se conservan y las fechas van en ISO 8601. La forma es la misma de `frontend/src/api/demo/panel.js`.

### Nodo en uso sin lecturas

Se activó temporalmente el monitor 2 en la ubicación 1 y se restauró al terminar:

```json
{"dispositivoId":2,"nombre":"Prueba","conectado":false,"fecha":null,"temperatura":null,"humedad":null,"presion":null,"rsR0":null,"nivelAire":null}
```

### Nodo trasladado

Se movió temporalmente «Aula 3» de la ubicación 1 a la 2 y se restauró al terminar:

| Consulta | Respuesta |
|---|---|
| Ubicación 1 (origen) | `[]` |
| Ubicación 2 (destino) | «Aula 3» con `fecha: null`: sus lecturas anteriores siguen en el origen |

### Falla de la base

Con la tabla `lecturas` no disponible un momento, la API respondió `500` `{"mensaje":"No se pudieron consultar los datos. Intenta de nuevo."}`, sin mostrar el SQL. El error quedó en el log:

```text
[function:Responder error] Últimas por nodo: error: relation "lecturas" does not exist
```

### Calidad del aire en la respuesta

| Caso | `rsR0` | `nivelAire` | El Panel muestra |
|---|---|---|---|
| MQ-135 sin respuesta (`mq135_v` nulo) | nulo | nulo | «sin respuesta» |
| Con R0 | 1.002 | `"bueno"` | «Bueno · 1.00» |
| Sin R0 | nulo | `"sin_calibrar"` | «sin calibrar» |

## W1. WebSocket `/ws/lecturas`

Con un cliente escuchando, cada lectura publicada por MQTT llegó al instante con la misma `fecha` que guardó la base:

```text
[ws] conectado
[ws] {"tipo":"lectura","ubicacionId":1,"dispositivoId":1,"fecha":"2026-10-18T19:59:19.785Z","temperatura":22.81,"humedad":46,"presion":748.4,"rsR0":null,"nivelAire":"sin_calibrar"}
```

Antes de unir #104 también se probó a través del proxy de Vite (`ws://localhost:5173/ws/lecturas`), que es el camino del navegador en desarrollo.

## W2. Hook del frontend

Pruebas de `useTiempoReal.test.js`, todas pasan:

- se conecta a `/ws/lecturas`;
- solo entrega los mensajes válidos de su ubicación;
- indica la conexión y se reconecta cuando se cae el canal;
- cierra el canal y no se reconecta al desmontar.

## Pendiente

El canal envía las lecturas de todos los clientes. Autenticar la conexión y filtrar por cliente en el servidor queda para #63.
