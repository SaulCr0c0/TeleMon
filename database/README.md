# database

Scripts SQL de inicialización de PostgreSQL 17. Se montan en `/docker-entrypoint-initdb.d`, así que solo corren la primera vez que el volumen `postgres_datos` está vacío.

**Responsable:** Serna Mesa, J.

## Tablas

| Tabla | Guarda |
|---|---|
| `roles` | `admin_plataforma` y `cliente` |
| `clientes` | Organizaciones que contratan el servicio |
| `usuarios` | Cuentas (bcrypt), con `debe_cambiar_clave` para las contraseñas temporales |
| `ubicaciones` | Lugares de cada cliente; se archivan, no se borran. Incluye la espera de «sin conexión» |
| `dispositivos` | Inventario de monitores: MAC, código de activación, estado (`disponible`, `reservado`, `en_uso`, `desactivado`, `retirado`), cliente, ubicación y R0 del MQ-135 |
| `eventos_dispositivo` | Historial de cada monitor (registro, reserva, activación, reinicios…) |
| `lecturas` | Lecturas crudas con dispositivo, ubicación, hora de llegada, `ts` del dispositivo, latencia y Rs/R0. Se conservan 30 días |
| `lecturas_minuto` | Promedio, mínimo y máximo por minuto y nodo. Se conserva siempre |
| `umbrales` | Rangos por ubicación y variable |
| `alertas` | Alertas UMBRAL, SENSOR y SIN_CONEXION con su apertura, cierre y peor valor |

Índices: `idx_lecturas_disp_fecha`, `idx_lecturas_ubic_fecha` y `uq_alerta_abierta` (una sola alerta abierta por nodo, tipo y variable).

El modelo completo está en la sección 8.8 del informe.

## Tareas

- [#30](https://github.com/SaulCr0c0/TeleMon/issues/30) Script de las 10 tablas
- [#43](https://github.com/SaulCr0c0/TeleMon/issues/43) Datos iniciales para la demo
- [#44](https://github.com/SaulCr0c0/TeleMon/issues/44) Volumen y scripts de inicio
- [#45](https://github.com/SaulCr0c0/TeleMon/issues/45) Agregación por minuto y limpieza
