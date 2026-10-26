# Pruebas de carga MQTT — #36

## API de ubicaciones (#64)

`test_ubicaciones.py` prueba las rutas HTTP reales de Node-RED contra PostgreSQL 17. Crea una red y dos contenedores temporales con nombres únicos; no conecta con el PostgreSQL de desarrollo ni modifica sus datos. Los recursos de prueba se eliminan al terminar, incluso si falla una prueba.

Desde la raíz, con Docker funcionando y la imagen del backend construida:

```bash
docker compose build nodered
python -m unittest discover -s pruebas -p test_ubicaciones.py -v
```

El módulo `jsonwebtoken` de #63 debe estar instalado en `nodered/data/node_modules` (Node-RED lo instala al arrancar normalmente). Las pruebas reutilizan ese módulo en modo de solo lectura; no descargan dependencias de Python. Si la imagen del backend tiene otro nombre, define `TELEMON_NODERED_IMAGE` con su etiqueta.

Se comprueban las cuatro rutas de ubicaciones, aislamiento entre clientes, tokens ausentes/falsos/vencidos, conteos de nodos y alertas, monitores trasladados o sin lecturas, creación de umbrales, entradas inválidas, archivado sin pérdida de datos y reversión completa ante un fallo al crear umbrales.

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
