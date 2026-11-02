# database

Scripts de PostgreSQL 17. Se montan en `/docker-entrypoint-initdb.d`, así que **solo corren la primera vez**, con el volumen `postgres_datos` vacío.

| Archivo | Qué hace |
|---|---|
| `01_esquema.sql` | Las 10 tablas, índices y el índice único de alertas abiertas |
| `02_datos.sql` | Datos iniciales: roles, 2 clientes, 3 ubicaciones, 3 monitores (el real es `F8:B3:B7:2B:FC:24`) y umbrales |
| `03_agregacion.sql` | Funciones `agregar_lecturas_minuto()` y `limpiar_lecturas(dias)` (#45) y el índice `(ubicacion_id, minuto)` de `lecturas_minuto` para el historial (#71). Node-RED las llama solas (pestaña «Base de datos»). Si la base ya existe, cargarlo a mano: `docker exec -i postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/03_agregacion.sql` (se puede repetir: reemplaza las funciones) |
| `04_usuarios.sql` | Usuarios iniciales con la clave en bcrypt: `admin@telemon.bo` / `admin1234` (admin) y `direccion@redvallealto.edu.bo` / `telemon123` (cliente 1). Si la base ya existe, cargarlo a mano: `docker exec -i postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/04_usuarios.sql` (se puede repetir: no duplica) |

### Agregación por minuto y limpieza (#45)

- `agregar_lecturas_minuto()` guarda en `lecturas_minuto` una fila por nodo y por **minuto cerrado** (el minuto en curso espera al siguiente): promedio, mínimo y máximo de temperatura, humedad y presión, promedio y mínimo de Rs/R0, y `n_lecturas`. Los valores nulos no cuentan. La ubicación es la de la última lectura del minuto. Revisa desde 2 minutos antes del último minuto agregado (la primera vez, todo), y con `ON CONFLICT` vuelve a calcular un minuto solo si le llegaron lecturas nuevas, así que repetirla no duplica. Devuelve cuántos minutos guardó o corrigió.
- `limpiar_lecturas(30)` primero agrega lo pendiente y después borra las lecturas crudas de más de 30 días que ya están en `lecturas_minuto`. Las filas por minuto se conservan. Devuelve cuántas lecturas borró.

Probar a mano: `SELECT agregar_lecturas_minuto();`, `SELECT * FROM lecturas_minuto ORDER BY minuto DESC LIMIT 5;` y `SELECT limpiar_lecturas(30);`.

Entrar a la base: `docker exec -it postgres psql -U telemon -d telemon`

Volver a crear todo desde cero (borra los datos): `docker compose down -v` y `docker compose up -d`

**Responsable:** Serna Mesa, J.
