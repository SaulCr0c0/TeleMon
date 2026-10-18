# TeleMon — Monitoreo telemático ambiental con IoT y Docker

Proyecto del **Grupo 11** de la materia **Servicios Telemáticos** (UMSS, Gestión II/2026),
docente Dr. Américo Fiorilo Lozada Ph.D.

**Título:** Diseño e implementación de un servicio web dockerizado para el monitoreo
telemático y ambiental en tiempo real mediante sensores IoT y protocolos telemáticos.

## Qué hace

TeleMon es un **servicio de monitoreo ambiental** que varias organizaciones pueden contratar.
Cada **cliente** tiene una cuenta, una o varias **ubicaciones** (por ejemplo, las aulas o
laboratorios de una escuela) y uno o más **monitores** (nodos ESP32) en cada ubicación.

Cada monitor mide temperatura, humedad, presión y calidad del aire, y publica sus lecturas
por **MQTT** en su propio tema, `telemetria/<ID>/lecturas` (`<ID>` = MAC sin ":"). Un backend
en **Node-RED** las valida, calcula la razón Rs/R0 del MQ-135, las guarda en **PostgreSQL**,
abre y cierra alertas, y las envía en tiempo real a la **web** servida por **Nginx** en
`telematicos2026.online`. Todo el backend corre en contenedores **Docker**.

```
Monitores ─► Broker MQTT ─► Node-RED ─┬─► PostgreSQL (lecturas, alertas, cuentas)
 (ESP32)     (Mosquitto o             └─► Nginx + WebSocket ─► Navegador
              broker propio)
```

Hay dos roles:

| Rol | Qué hace |
|---|---|
| **Cliente** | Crea su cuenta, sus ubicaciones y activa sus monitores con el código de la etiqueta. Ve el panel en vivo (una fila por nodo), gráficas, historial con CSV, alertas y umbrales |
| **Proveedor** (administrador de la plataforma) | Registra los monitores en el inventario, genera su código de activación, los reserva para un cliente, administra las cuentas y carga el R0 de cada MQ-135 |

El aporte diferencial es un **broker MQTT propio** (Python + asyncio sobre sockets TCP)
que se compara experimentalmente con **Eclipse Mosquitto**.

## Estructura del repositorio

| Carpeta | Contenido | Responsable |
|---|---|---|
| `firmware/` | Código C++ (PlatformIO) del ESP32 | Mantilla Villaca, J. |
| `mosquitto/` | Configuración del broker base Eclipse Mosquitto | Siles Espicho, A. |
| `broker-mqtt/` | Broker MQTT propio (Python + asyncio) | Siles Espicho, A. |
| `nodered/` | Flujos de Node-RED: recepción, alertas, API y WebSocket | Garnica Salazar, L. y Bermudez Torrico, V. |
| `database/` | Scripts SQL de creación de tablas y datos iniciales | Serna Mesa, J. |
| `frontend/` | Portal del cliente y panel del proveedor (HTML, CSS, JavaScript) | Cordova, Garnica, Serna, Garcia y Mantilla (una pantalla cada uno, ver `frontend/README.md`) |
| `nginx/` | Configuración del proxy inverso y HTTPS | Cordova Villarroel, S. |
| `docs/` | Capturas, diagramas y evidencias para el informe | Todo el equipo |

## Integrantes

| Integrante | Rol |
|---|---|
| Cordova Villarroel Saul | Scrum Master / Cloud / Frontend |
| Bermudez Torrico Viviana Laura | Backend / Autenticación / Alertas |
| Garcia Nogales Brenda | Frontend / Calibración / Pruebas |
| Garnica Salazar Leonardo Jorge | Backend / Integración |
| Mantilla Villaca Joel Matias | Hardware / Firmware / Frontend |
| Serna Mesa José Luis | Base de Datos / Panel del proveedor |
| Siles Espicho Adrian Eloy | Red / Comunicaciones / Broker propio |

## Cronograma

| Sprint | Fechas | Meta | Responsables |
|---|---|---|---|
| 1 | 06/10 – 13/10/2026 | ESP32 con sensores publicando a Mosquitto (HU-01 a HU-05) | Mantilla, Garcia, Siles |
| 2 | 14/10 – 27/10/2026 | Broker propio, base de datos multicliente, Rs/R0, hora NTP, login por roles, ubicaciones, inventario y activación con código, panel por nodo en vivo y todas las pantallas maquetadas (HU-03, HU-06, HU-08 a HU-11, HU-18, HU-21 a HU-23, HU-29) | Siles, Serna, Garnica, Bermudez, Mantilla, Cordova, Garcia |
| 3 | 28/10 – 10/11/2026 | Nube y dominio, gráficas, historial con CSV, alertas, registro de clientes, gestión de nodos, panel del proveedor, pruebas comparativas y documentación (HU-07, HU-12 a HU-17, HU-19, HU-20, HU-24 a HU-28) | Cordova, Bermudez, Garnica, Garcia, Siles, todos |
| — | 11/11 – 15/11/2026 | Revisión final y entrega (15/11, 23:59) | Todos |

Tareas de preparación en el Sprint 2: Cordova deja lista la máquina virtual en Oracle Cloud
con Docker, y Garcia prepara el script de pruebas de carga con clientes MQTT simulados.

Las historias y sus tareas están en [Issues](https://github.com/SaulCr0c0/TeleMon/issues),
con los milestones **Sprint 2 (27/10)** y **Sprint 3 (10/11)**.

## Forma de trabajo

### Issues: historias y tareas

- Cada **historia de usuario** es un issue con la etiqueta `historia`, por ejemplo
  `HU-22 (Registrar monitores en el inventario)`. Tiene sus criterios de aceptación
  (CA1, CA2…) como checklist y sus tareas como **sub-issues**. La historia se cierra cuando
  QA (Garcia) marca todos sus criterios en el entorno Docker.
- Cada **tarea** es un issue asignado a una persona. Su título empieza con el área:

  | Prefijo | Etiqueta | Parte del sistema |
  |---|---|---|
  | `Backend:` | `backend` | Node-RED: recepción, API, WebSocket, alertas |
  | `Frontend:` | `frontend` | Pantallas web |
  | `BD:` | `base-de-datos` | PostgreSQL |
  | `Firmware:` | `firmware` | ESP32 |
  | `Broker:` | `broker` | Mosquitto y broker propio |
  | `DevOps:` | `devops` | Docker, Nginx, VM, dominio |
  | `Pruebas:` | `pruebas` | Calibración, carga, comparativas |
  | `Docs:` | `docs` | README y manuales |

- Para ver solo lo tuyo: [issues asignados a mí](https://github.com/SaulCr0c0/TeleMon/issues/assigned/@me).
  La etiqueta `avance-20-10` marca lo que debe verse en el avance del 20/10.

### Ramas, commits y Pull Requests

1. No se sube nada directo a `main`: cada integrante trabaja en su propia rama, una por tarea.
   ```bash
   git checkout main && git pull
   git checkout -b feature/<tarea>        # ej. feature/panel-en-vivo
   ```
2. Los commits se escriben en español, en modo imperativo, con el área y el número de la
   tarea al final:
   ```
   feat(panel): actualizar la fila del nodo por WebSocket (#55)
   fix(firmware): corregir la lectura del BMP280 (#33)
   docs(readme): describir el JSON nuevo (#31)
   ```
3. Al terminar, se sube la rama y se abre un **Pull Request** hacia `main`. En la descripción
   se escribe `Closes #<tarea>` para que la tarea se cierre sola al unirlo.
4. Otro integrante revisa el Pull Request antes de unirlo.
5. Las contraseñas nunca se suben: van en `.env` (ignorado por Git). Para crear el tuyo,
   copia `.env.example` y completa los valores.

## Cómo levantar el sistema

```bash
cp .env.example .env      # completar las contraseñas
docker compose up -d
docker compose ps
```

> Los servicios se irán agregando a `docker-compose.yml` a medida que avancen los sprints.
