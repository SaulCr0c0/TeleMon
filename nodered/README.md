# nodered

Flujos de Node-RED exportados en JSON: recepción de lecturas, cálculo de Rs/R0, alertas, API JSON y WebSocket.

**Responsables:** Garnica Salazar, L. (recepción, panel, ubicaciones y nodos) y Bermudez Torrico, V. (autenticación, administración, alertas e historial).

## Recepción de lecturas

1. Se suscribe una sola vez a `telemetria/+/lecturas` con el usuario `nodered`.
2. Toma el `<ID>` del tema y descarta la trama si no coincide con la `mac` del JSON.
3. Busca el monitor: si no está registrado o no está «En uso», descarta la lectura.
4. Calcula `Rs = RL_ef·(5−V)/V` y, si el monitor tiene R0, `Rs/R0` y el nivel (Bueno ≥ 0,80, Moderado ≥ 0,50, Malo < 0,50).
5. Guarda la lectura con su ubicación, la hora de llegada, el `ts` del dispositivo y la latencia.
6. Evalúa las alertas y envía la lectura por el WebSocket de su ubicación.

## Alertas

| Tipo | Se abre | Se cierra |
|---|---|---|
| UMBRAL | 2 lecturas seguidas fuera de rango | 2 lecturas seguidas dentro |
| SENSOR | Un campo nulo 3 veces seguidas (MQ-135 en precalentamiento no cuenta) | Llega un valor válido |
| SIN_CONEXION | El nodo no envía en 1, 2 o 5 min (según la ubicación) | Llega una lectura |

## API

Toda ruta responde **401** sin sesión y **403** si el recurso es de otro cliente o falta el rol.

| Ruta | Rol |
|---|---|
| `POST /api/login`, `POST /api/registro`, `POST /api/clave` | Todos |
| `GET/POST/PATCH /api/ubicaciones` | Cliente |
| `GET /api/ubicaciones/{id}/ultimas` | Cliente |
| `GET /api/ubicaciones/{id}/lecturas?desde&hasta&nodo&agrupar` | Cliente |
| `GET /api/dispositivos/{id}/serie?periodo=1h\|24h\|7d` | Cliente |
| `GET /api/ubicaciones/{id}/alertas`, `GET/PUT /api/ubicaciones/{id}/umbrales` | Cliente |
| `POST /api/ubicaciones/{id}/dispositivos`, `PATCH /api/dispositivos/{id}` | Cliente |
| `/api/admin/clientes…`, `/api/admin/dispositivos…` | Proveedor |
| WebSocket `/ws/ubicaciones/{id}` | Cliente |

Las tareas de esta carpeta tienen la etiqueta [`backend`](https://github.com/SaulCr0c0/TeleMon/issues?q=is%3Aissue+label%3Abackend).
