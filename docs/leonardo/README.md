# Evidencias de Leonardo Garnica — Sprint 2

Cadena **MQTT → Node-RED → PostgreSQL → API/WebSocket → Panel** del avance del 20/10.

**Responsable:** Garnica Salazar, L. (`Leo-garnica`)

## Entregas

| Issue | Qué hace | PR | Evidencia |
|---|---|---|---|
| #49 | Node-RED en Docker: recibe, valida y guarda cada lectura | #101 | [s2-recepcion-rs-r0.md](s2-recepcion-rs-r0.md) |
| #53 | Calcula Rs/R0 y el nivel de aire con el R0 de cada monitor | #101 | [s2-recepcion-rs-r0.md](s2-recepcion-rs-r0.md) |
| #54 | API `GET /api/ubicaciones/:id/ultimas` y WebSocket `/ws/lecturas` | #104 | [s2-ultimas-websocket.md](s2-ultimas-websocket.md) |
| #55 | Pantalla Panel con una fila por nodo, actualizada en vivo | #105 | [s2-panel.md](s2-panel.md) |

Cómo repetir las pruebas: [como-probar.md](como-probar.md).

## Condiciones de las pruebas

- Fecha: 18/10/2026. Código: `main` en `04a4c42` (después de unir #105).
- Servicios en Docker: `broker` (Mosquitto), `postgres` (PostgreSQL 17) y `nodered` (Node-RED 4.0.9), en una PC con Windows 11.
- **Las lecturas se simularon con `mosquitto_pub`** como el monitor de prueba `F8:B3:B7:2B:FC:24`, con la misma forma del JSON del firmware 1.1.0. No se probó con el ESP32 físico.
- Cuando una prueba cambió datos (R0, estado o ubicación de un monitor, restricciones temporales), se dejaron como estaban al terminar.

## Resumen de resultados

| Criterio | Resultado |
|---|---|
| Una trama válida inserta una fila y actualiza el monitor | Cumple |
| Un sensor nulo no impide guardar las otras variables | Cumple |
| MAC distinta al tema, monitor no activo o desconocido, JSON inválido: no se inserta nada y queda el motivo en el log | Cumple |
| Rs/R0 da bueno, moderado y malo con los cortes 0.80 y 0.50, incluidos los bordes | Cumple |
| R0 nulo deja `rs_r0` y `nivel_aire` nulos («sin calibrar») | Cumple |
| `ts` nulo o reloj desfasado ±60 s: latencia nula sin perder la lectura | Cumple |
| Si falla la base, no se emite una lectura falsa ni se actualiza el monitor | Cumple |
| `/ultimas` responde con la forma del frontend; 400, 404 y 500 con mensaje legible | Cumple |
| Cada lectura guardada llega por el WebSocket | Cumple |
| El Panel cambia la fila correcta sin recargar (CP-04) | Cumple con el backend real |
| Pruebas del frontend (`npm test`) | 118 de 118 pasan |

## Qué es real y qué sigue en demo

| Parte | Estado |
|---|---|
| Recepción, cálculo de Rs/R0, guardado, `/ultimas`, WebSocket y tabla del Panel | **Real** |
| Banda de alertas, umbrales y mini gráficas del Panel | **Demo** hasta que existan #72 (alertas y umbrales) y #73 (series). `frontend/src/api/cliente.js` reemplaza los 404 por datos de ejemplo |
| Inicio de sesión | **Demo** hasta #63 |

## Límites conocidos

- **El WebSocket no tiene autenticación.** Cualquiera que abra `/ws/lecturas` recibe las lecturas de todos los clientes. El filtro por ubicación del navegador no es una medida de seguridad. Queda para el login (#63, Viviana).
- **La latencia medida no es la del broker.** Las latencias de estas pruebas (≈250–360 ms) incluyen arrancar `docker exec` y `mosquitto_pub` desde Windows. No sirven para comparar brokers; eso se mide con el script de carga y el ESP32.
- **Problema en Windows.** Con `core.autocrlf=true`, `mosquitto/config/entrypoint.sh` se descarga con CRLF y el broker se reinicia en bucle (`set: illegal option -`). Para probar se convirtió la copia local a LF. La solución propuesta es un `.gitattributes` con `*.sh text eol=lf`.
