# Pruebas de carga MQTT — #36

## API de ubicaciones (#64)

`test_ubicaciones.py` prueba las rutas HTTP reales de Node-RED contra PostgreSQL 17. Crea una red y dos contenedores temporales con nombres únicos; no conecta con el PostgreSQL de desarrollo ni modifica sus datos. Los recursos de prueba se eliminan al terminar, incluso si falla una prueba.

Desde la raíz, con Docker funcionando y la imagen del backend construida:

```bash
docker compose build nodered
python -B -m unittest discover -s pruebas -p test_ubicaciones.py -v
```

El módulo `jsonwebtoken` de #63 debe estar instalado en `nodered/data/node_modules` (Node-RED lo instala al arrancar normalmente). Las pruebas reutilizan ese módulo en modo de solo lectura; no descargan dependencias de Python. Si la imagen del backend tiene otro nombre, define `TELEMON_NODERED_IMAGE` con su etiqueta.

Se comprueban las cuatro rutas de ubicaciones, aislamiento entre clientes, tokens ausentes/falsos/vencidos, conteos de nodos y alertas, monitores trasladados o sin lecturas, creación de umbrales, entradas inválidas, archivado sin pérdida de datos y reversión completa ante un fallo al crear umbrales.

## Activación de monitores (#67)

`test_activacion.py` prueba las rutas reales de inventario (#66), activación y consulta de nodos (#67), junto con la recepción existente (#49), contra PostgreSQL 17. Reutiliza el entorno aislado de `test_ubicaciones.py`. La inyección de tramas para verificar la recepción existe solo en el flujo temporal de las pruebas y no se agrega al backend del proyecto.

```bash
python -B -m unittest discover -s pruebas -p test_activacion.py -v
```

Requiere Docker, la imagen del backend construida y los módulos del login ya instalados, igual que las pruebas de ubicaciones. Verifica la activación de un monitor reservado, la normalización del código, el nombre obligatorio, los errores 400/401/403/404/409, el aislamiento de clientes, el listado real de nodos y las activaciones simultáneas. También comprueba el registro de usuario/fecha/evento y la reversión completa si falla el evento, así como el paso de descartar lecturas de un monitor reservado a guardarlas tras activarlo.

Los contenedores y sus volúmenes se eliminan explícitamente con `docker rm --force --volumes`, y después se elimina la red. Los archivos de configuración temporal también se borran. Ejecutar con `-B` evita dejar `__pycache__`.

## Registro propio de clientes (#65)

`test_registro.py` prueba `POST /api/registro` y el login real de Node-RED contra PostgreSQL 17, con el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_registro.py -v
```

Verifica que se cree el cliente sin monitores con su usuario y que pueda iniciar sesión, el 409 por correo repetido (también con mayúsculas y espacios), los 400 por contraseña corta o larga, correo inválido, datos vacíos y términos no aceptados, sin dejar filas creadas, y que de seis registros simultáneos con el mismo correo solo uno se cree.

## Clientes del admin (#68)

`test_clientes.py` prueba las rutas `/api/admin/clientes` junto con el login y el inventario reales, con el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_clientes.py -v
```

Verifica que solo el admin entre (401 y 403), la lista con origen, estado y conteos, la cuenta manual con contraseña temporal que solo aparece al crearla o restablecerla y que obliga a cambiarla, los 400, 404 y 409, la ficha con ubicaciones y monitores del cliente, la edición del correo de ingreso, que un cliente suspendido no pueda entrar y que al reactivarlo conserve sus datos.

## Ficha del monitor (#70)

`test_ficha_monitor.py` prueba la ficha, el R0, las notas, liberar y retirar con el inventario, la activación y el login reales, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_ficha_monitor.py -v
```

Verifica que solo el admin entre, los datos técnicos y el estado de cada sensor con el monitor en línea, sin conexión o sin lecturas, el 400 por un R0 que no es número o no es mayor que 0, que liberar genere un código nuevo y conserve las lecturas, que un monitor retirado no se pueda reservar, liberar ni activar, y que cada cambio quede en el historial.

## Nodos sin conexión (#74)

`test_sin_conexion.py` prueba la revisión periódica y el cierre con la recepción real, contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`. En el flujo temporal de la prueba la revisión corre cada 1 s en lugar de cada 30 s, y los avisos del WebSocket se guardan para revisarlos.

```bash
python -B -m unittest discover -s pruebas -p test_sin_conexion.py -v
```

Verifica que la alerta se abra una sola vez pasada la espera de su ubicación y avise por el WebSocket, que no se abra antes de la espera, para monitores sin lecturas ni para los que no están en uso, que se cierre con la primera lectura, y que se cierre si el monitor deja de estar en uso.

## Agregación por minuto y limpieza (#45)

`test_agregacion.py` prueba las funciones de `database/03_agregacion.sql` contra PostgreSQL 17 y que el flujo «Base de datos» de Node-RED las llame solo. En el flujo temporal de la prueba los dos inject corren cada 1 s.

```bash
python -B -m unittest discover -s pruebas -p test_agregacion.py -v
```

Verifica una fila por nodo y minuto cerrado con promedio, mínimo, máximo y cantidad, que el minuto en curso no se agregue, que repetir no duplique y que una lectura tardía corrija su minuto, que la limpieza borre solo las crudas de más de 30 días y conserve las agregadas, y que Node-RED haga ambas cosas sin intervención.

## Historial (#71)

`test_historial.py` prueba `GET /api/ubicaciones/:id/lecturas` contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_historial.py -v
```

Verifica la sesión y el 403 con la ubicación de otro cliente, el orden y la forma de las filas, los filtros de fechas y nodo, la paginación, los 400, los promedios por minuto, hora y día, y que 7 días agrupados por hora (6 nodos, 60 480 minutos) respondan en menos de 1 s.

## Serie de las gráficas (#73)

`test_serie.py` prueba `GET /api/dispositivos/:id/serie` contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_serie.py -v
```

Verifica la sesión y el 403 con un nodo de otro cliente o sin ubicación, que cada periodo use su fuente (crudas en 1 h, por minuto en 24 h, promedio ponderado por hora en 7 días), que solo cuenten las lecturas de la ubicación actual del nodo, el rango del umbral activo y los 400.

## Alertas y umbrales (#72)

`test_alertas_umbrales.py` prueba `GET /api/ubicaciones/:id/alertas` y `GET/PUT /api/ubicaciones/:id/umbrales` con la recepción real, contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_alertas_umbrales.py -v
```

Verifica la sesión y el 403 con la ubicación de otro cliente, las alertas abiertas y cerradas con su forma y orden, leer y guardar los umbrales (rangos, calidad del aire y espera), los 400 por valores inválidos y que un umbral guardado abra la alerta desde las lecturas siguientes.

## Gestionar nodos (#75)

`test_nodos.py` prueba `PATCH /api/dispositivos/:id` con la recepción real, contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_nodos.py -v
```

Verifica la sesión y el 403 con un nodo o un destino de otro cliente, renombrar, que tras mover las lecturas nuevas vayan al destino y las anteriores queden en el origen, que un nodo desactivado deje de guardar lecturas y vuelva al reactivarlo, el cierre de sus alertas, los eventos anotados y los 400 y 409.

## Reinicios del ESP32 (#76)

`test_reinicios.py` manda lecturas por la recepción real, contra PostgreSQL 17, en el mismo entorno aislado de `test_ubicaciones.py`.

```bash
python -B -m unittest discover -s pruebas -p test_reinicios.py -v
```

Verifica que se anote un solo «Reinicio del monitor» cuando el `uptime` vuelve a empezar, que la primera lectura y un `uptime` nulo no cuenten, y que no se abran alertas.

## Persistencia al recrear el stack (#56, CP-03)

`persistencia.sh` toma una foto del estado, ejecuta `docker compose down` y `docker compose up -d`, espera a que PostgreSQL y Node-RED estén sanos y compara. El servicio queda fuera por unos segundos, por eso pide `--si`.

```bash
./pruebas/persistencia.sh --si
```

Compara antes y después: el hash de `flows.json` (en el host y dentro del contenedor) y de `flows_cred.json`, los módulos instalados de Node-RED, las filas de `usuarios`, `clientes`, `ubicaciones`, `dispositivos`, `umbrales`, `alertas` y `eventos_dispositivo`, las lecturas previas, los usuarios MQTT de Mosquitto y los volúmenes del proyecto. Si un monitor está publicando, también confirma que llegan lecturas nuevas después de recrear. Termina con `RESULTADO: PASA` o `RESULTADO: FALLA`.

Dónde vive cada dato:

| Servicio | Datos | Cómo persisten |
|---|---|---|
| PostgreSQL | Tablas y lecturas | Volumen `postgres_datos` |
| Node-RED | Flujos, credenciales, módulos y `settings.js` | Carpeta `nodered/data` del host montada en `/data` |
| Mosquitto | Configuración | Carpeta `mosquitto/config` (solo lectura) |
| Mosquitto | Usuarios y ACL | Se regeneran desde `.env` en cada arranque (`entrypoint.sh`) |
| Mosquitto | `/mosquitto/data` y `/mosquitto/log` | Volúmenes `mosquitto_datos` y `mosquitto_log` (`persistence false` y log por stdout: hoy quedan vacíos) |

Resultado en el servidor (03/11/2026, antes de los volúmenes con nombre): **PASA**. Stack recreado en 40 s; se conservaron `flows.json` y `flows_cred.json` (mismo hash en host y contenedor), 16 módulos de Node-RED, 2 usuarios, 2 clientes, 3 ubicaciones, 3 dispositivos, 12 umbrales, 10 alertas, 8 eventos, las 3525 lecturas y los usuarios MQTT `esp32` y `nodered`; llegaron 7 lecturas nuevas del ESP32 sin tocarlo y `https://telemon.site` siguió respondiendo. Quedaron 2 volúmenes anónimos huérfanos de Mosquitto, que es lo que corrigen los volúmenes con nombre.

Antes de #56, `/mosquitto/data` y `/mosquitto/log` usaban volúmenes anónimos de la imagen: cada `down` + `up` creaba dos nuevos y dejaba los anteriores huérfanos. `docker compose down -v` sí borra los volúmenes con nombre y con ellos las lecturas: no usarlo en el servidor.
## Medición del R0 del MQ-135 (#37)

`medir_r0.sh` calcula el R0 de un monitor con las lecturas que ya están en la base. Solo lee; no cambia nada.

```bash
./pruebas/medir_r0.sh F8:B3:B7:2B:FC:24 10
```

Para cada lectura de los últimos N minutos (10 por defecto) calcula Rs = RL_ef · (5 − V) / V, con RL_ef = 1 kΩ ∥ 30 kΩ (igual que Node-RED), y muestra el promedio de Rs (el R0), la variación (desviación / promedio), la deriva (segunda mitad del periodo contra la primera), las horas encendido según el `uptime` y el R0 cargado hoy. El procedimiento y la tabla de resultados están en [`docs/medicion-r0.md`](../docs/medicion-r0.md).

## Carga MQTT

`carga.py` simula monitores publicando en `telemetria/<ID>/lecturas` con MQTT 3.1.1 y QoS 0. Usa un cliente oyente adicional para medir el recorrido publicador → broker → oyente. No mide persistencia en PostgreSQL ni actualización del navegador.

Las pruebas finales de 10, 50, 100 y 500 clientes están documentadas en [RESULTADOS.md](RESULTADOS.md).

## Preparar

Desde la raíz del repositorio, comprueba que Docker esté funcionando:

```bash
docker info
docker compose up -d broker
docker compose ps broker
docker compose logs --tail=30 broker
```

El `.env` de la raíz debe contener `MQTT_USER_ESP32`, `MQTT_PASS_ESP32`, `MQTT_USER_NODERED` y `MQTT_PASS_NODERED`. El script usa las mismas credenciales que el broker. No escribas contraseñas en el código ni subas `.env`.

Instala la dependencia en un entorno virtual (una sola vez):

```bash
cd pruebas
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

En cada terminal nueva, desde `pruebas/`, activa el entorno y carga las variables:

```bash
source .venv/bin/activate
set -a
source ../.env
set +a
```

La regla `.venv/` del `.gitignore` existente ya excluye este entorno.

## Prueba corta y cargas

```bash
python carga.py --host localhost --puerto "${MQTT_PORT:-1883}" --clientes 10 --duracion 10 --intervalo 1
```

Comprueba que haya mensajes enviados y recibidos, `Perdidos: 0` y latencias p50/p95. El total depende de las rondas que alcancen a ejecutarse. Un resultado con pérdidas requiere investigación; no demuestra por sí solo un fallo del broker.

Después ejecuta los escenarios por separado, conservando duración e intervalo:

```bash
python carga.py --puerto "${MQTT_PORT:-1883}" --clientes 10 --duracion 60 --intervalo 5
python carga.py --puerto "${MQTT_PORT:-1883}" --clientes 50 --duracion 60 --intervalo 5
python carga.py --puerto "${MQTT_PORT:-1883}" --clientes 100 --duracion 60 --intervalo 5
python carga.py --puerto "${MQTT_PORT:-1883}" --clientes 500 --duracion 60 --intervalo 5
```

Guarda la salida, fecha, broker, equipo, número de clientes e intervalo como evidencia. Cada escenario agrega un oyente: 500 publicadores implican 501 conexiones. El script atiende las conexiones mediante el bucle externo de Paho y `selectors.DefaultSelector` (epoll en Linux/WSL), sin crear un hilo por cliente. No ejecutes dos cargas simultáneas con los mismos IDs.

La implementación anterior con `loop_start()` alcanzaba el límite de descriptores de `select()` de Paho: la reproducción detectó `filedescriptor out of range in select()` con el descriptor 1025. Eso impedía confirmar una conexión y aparecía como un timeout del broker. El bucle externo evita ese límite en Linux/WSL. La prueba unitaria de regresión comprueba una lectura con un descriptor igual o superior a 1100.

Los mensajes incluyen `carga_id` y `carga_seq` para excluir tráfico ajeno y duplicados. La latencia usa el reloj monotónico del proceso. p50 es la mediana y p95 usa el rango más cercano: posición `ceil(0.95 × N)` en las muestras ordenadas. Al terminar se esperan hasta cinco segundos por mensajes pendientes. Se cuentan como enviados los mensajes aceptados por la biblioteca; los que no llegan al oyente dentro de ese plazo se reportan como perdidos. Salida 0: recepción completa; 1: pérdidas o error; 130: interrupción.

## Plan B del ESP32

Desde la raíz:

```bash
docker compose up -d broker postgres nodered
```

Desde `pruebas/`, con el entorno y las variables cargados:

```bash
python carga.py --puerto "${MQTT_PORT:-1883}" --clientes 1 --ids F8B3B72BFC24 --duracion 600 --intervalo 5
```

Desconecta el ESP32 que use ese mismo ID antes de simularlo. La MAC `F8:B3:B7:2B:FC:24` figura en los datos iniciales; confirma que exista en la base activa, en estado `en_uso`, con cliente y ubicación correspondientes. Node-RED descarta monitores no registrados: los IDs automáticos sirven para medir el broker, pero no se guardan automáticamente en la base.

Para comprobar la integración, consulta `http://localhost:1880/api/ubicaciones/1/ultimas` mientras publica. Deben cambiar la fecha y las lecturas del monitor. Verlas en el navegador requiere el Panel implementado e integrado con el backend; `VITE_MODO_DEMO=true` utiliza datos de ejemplo independientes del script.

## Problemas frecuentes

- No se conecta: comprueba Docker, el estado de `broker`, host y puerto. Usa `--host` si el broker está en otra máquina.
- Conexión rechazada: revisa las credenciales y que el broker haya cargado el mismo `.env`.
- Desconexión durante la carga: comprueba que no haya otro simulador o ESP32 con el mismo ID.
- Faltan credenciales: vuelve a cargar `../.env` en la terminal que ejecuta Python.
- No hay lecturas en la API: revisa el registro del monitor y `docker compose logs --tail=50 nodered` desde la raíz.

Pruebas unitarias sin broker ni dependencia MQTT, desde `pruebas/`:

```bash
python3 -m unittest -v test_carga.py
```

**Responsable:** Garcia Nogales, B.

## Comparativa Mosquitto vs. broker propio (#80)

`comparativa_brokers.py` arma una red Docker aislada con un Mosquitto y el broker propio (log `INFO` y `WARNING`), con claves de prueba y la misma ACL, y corre `carga.py` contra cada uno con 1, 10 y 50 clientes y un escenario de estrés. Mide latencia, pérdidas, CPU y RAM del contenedor (cgroup v2), y captura un ciclo CONNECT/PUBLISH de cada broker con `tcpdump`. Con `--anterior <carpeta broker-mqtt>` y `--brokers ... propio-anterior ...` mide también otra versión del broker en la misma corrida.

```bash
python3 -B pruebas/comparativa_brokers.py --nodelay
```

Tarda unos 40 minutos. Requiere Docker en Linux con cgroup v2 y no usa el `.env`. `--nodelay` hace que los clientes desactiven el algoritmo de Nagle, para que la latencia medida sea la del broker. Los resultados del 09/11/2026 y su análisis están en [`docs/comparativa-brokers.md`](../docs/comparativa-brokers.md). `carga.py --salida archivo.json` guarda el resumen y las latencias de una corrida.
