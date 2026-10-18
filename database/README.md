# database

Scripts de PostgreSQL 17. Se montan en `/docker-entrypoint-initdb.d`, así que **solo corren la primera vez**, con el volumen `postgres_datos` vacío.

| Archivo | Qué hace |
|---|---|
| `01_esquema.sql` | Las 10 tablas, índices y el índice único de alertas abiertas |
| `02_datos.sql` | Datos iniciales: roles, 2 clientes, 3 ubicaciones, 3 monitores (el real es `F8:B3:B7:2B:FC:24`) y umbrales |

Entrar a la base: `docker exec -it postgres psql -U telemon -d telemon`

Volver a crear todo desde cero (borra los datos): `docker compose down -v` y `docker compose up -d`

**Responsable:** Serna Mesa, J.
