# TeleMon — Monitoreo telemático ambiental con IoT y Docker

Proyecto del **Grupo 11** de la materia **Servicios Telemáticos** (UMSS, Gestión II/2026),
docente Dr. Américo Fiorilo Lozada Ph.D.

**Título:** Diseño e implementación de un servicio web dockerizado para el monitoreo
telemático y ambiental en tiempo real mediante sensores IoT y protocolos telemáticos.

## Qué hace

Un nodo **ESP32** mide temperatura, humedad, presión y calidad del aire, y publica las
lecturas por **MQTT**. Un backend en **Node-RED** las valida, las guarda en **PostgreSQL** y
las envía en tiempo real a un **dashboard web** servido por **Nginx**, accesible en
`telematicos2026.online`. Todo el backend corre en contenedores **Docker**.

```
Sensores ─► ESP32 ─► Broker MQTT ─► Node-RED ─┬─► PostgreSQL (historial)
                     (Mosquitto o              └─► Nginx + WebSocket ─► Navegador
                      broker propio)
```

El aporte diferencial es un **broker MQTT propio** (Python + asyncio sobre sockets TCP)
que se compara experimentalmente con **Eclipse Mosquitto**.

## Estructura del repositorio

| Carpeta | Contenido | Responsable |
|---|---|---|
| `firmware/` | Código C++ (PlatformIO) del ESP32 | Mantilla Villaca, J. |
| `mosquitto/` | Configuración del broker base Eclipse Mosquitto | Siles Espicho, A. |
| `broker-mqtt/` | Broker MQTT propio (Python + asyncio) | Siles Espicho, A. |
| `nodered/` | Flujos de Node-RED exportados | Garnica Salazar, L. |
| `database/` | Scripts SQL de creación de tablas | Serna Mesa, J. |
| `frontend/` | Dashboard web (HTML, CSS, JavaScript) | Bermudez Torrico, V. |
| `nginx/` | Configuración del proxy inverso y HTTPS | Cordova Villarroel, S. |
| `docs/` | Capturas, diagramas y evidencias para el informe | Todo el equipo |

## Integrantes

| Integrante | Rol |
|---|---|
| Cordova Villarroel Saul | Scrum Master / Cloud |
| Bermudez Torrico Viviana Laura | Dashboard / Frontend |
| Garcia Nogales Brenda | Calibración / Pruebas |
| Garnica Salazar Leonardo Jorge | Backend / Integración |
| Mantilla Villaca Joel Matias | Hardware / Firmware |
| Serna Mesa José Luis | Base de Datos |
| Siles Espicho Adrian Eloy | Red / Comunicaciones / Broker propio |

## Cronograma

| Sprint | Fechas | Meta |
|---|---|---|
| 1 | 06/10 – 13/10/2026 | ESP32 con sensores publicando a Mosquitto |
| 2 | 14/10 – 27/10/2026 | Broker propio, base de datos, API y login |
| 3 | 28/10 – 10/11/2026 | Nube, dominio, dashboard, pruebas y documentación |
| — | 11/11 – 15/11/2026 | Revisión final y entrega (15/11, 23:59) |

## Forma de trabajo

1. No se sube nada directo a `main`: cada integrante trabaja en su propia rama.
   ```bash
   git checkout main && git pull
   git checkout -b feature/<tarea>        # ej. feature/firmware-esp32
   ```
2. Al terminar, se sube la rama y se abre un **Pull Request** hacia `main`.
3. Otro integrante revisa el Pull Request antes de unirlo.
4. Las contraseñas nunca se suben: van en `.env` (ignorado por Git). Para crear el tuyo,
   copia `.env.example` y completa los valores.

## Cómo levantar el sistema

```bash
cp .env.example .env      # completar las contraseñas
docker compose up -d
docker compose ps
```

> Los servicios se irán agregando a `docker-compose.yml` a medida que avancen los sprints.
