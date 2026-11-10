# cloudflared

Publica la web del server en **https://telemon.site** y **https://www.telemon.site**, y el MQTT sobre WebSocket en **wss://mqtt.telemon.site** (Mosquitto) y **wss://mqtt2.telemon.site** (broker propio), para ESP32 fuera de la red del server, con un **Cloudflare Tunnel** (#78). El server abre una conexión de salida hacia Cloudflare y Cloudflare le manda las visitas por ahí: no hace falta IP pública ni abrir puertos en el módem, y funciona igual en cualquier red (casa, universidad, hotspot). El HTTPS lo pone Cloudflare.

```text
Navegador ──HTTPS──► Cloudflare (DNS de telemon.site) ══túnel══► cloudflared ──► proxy_web:80 (Nginx) ──► web, /api y /ws
```

MQTT no pasa por el túnel: el ESP32 publica directo al broker por la red local.

## Cómo está armado

- **Dominio:** `telemon.site`, registrado en Namecheap (vence el 27/10/2027). Los nameservers apuntan a Cloudflare (`cloe.ns.cloudflare.com` y `cosmin.ns.cloudflare.com`), plan Free.
- **Túnel administrado desde el server** (no desde el panel de Zero Trust, que pide registrar una tarjeta aunque el plan sea gratis). Nombre `telemon`.
- **DNS:** `telemon.site` y `www.telemon.site` son registros `CNAME` hacia el túnel, creados con `cloudflared tunnel route dns`.
- **`config.yml`** (en el repo): las rutas. Todo va a `http://proxy_web:80`; cualquier otro nombre responde 404.
- **Servicio `cloudflared`** en `docker-compose.yml`, con el perfil `publico`: solo arranca donde `COMPOSE_PROFILES=publico` (el server). En las computadoras del equipo no corre.

## Archivos secretos (no se suben: están en `.gitignore`)

| Archivo | Qué es |
|---|---|
| `cloudflared/credenciales.json` | Credenciales del túnel `telemon`. Sin él, el túnel no conecta |
| `cloudflared/cert.pem` | Certificado del login de la cuenta de Cloudflare: permite crear túneles y registros DNS en `telemon.site` |

La carpeta queda con `chmod 700` y los archivos con `chmod 600`. Como el contenedor corre con el usuario del server (`CLOUDFLARED_UID`/`CLOUDFLARED_GID`, por defecto 1000), puede leerlos.

## Variables del `.env` del server

```bash
COMPOSE_PROFILES=publico
CLOUDFLARE_TUNNEL_ID=<id del túnel>
CLOUDFLARED_UID=1000
CLOUDFLARED_GID=1000
```

## Crear el túnel desde cero (por ejemplo, en un server nuevo)

En el server, dentro de `~/TeleMon`:

```bash
mkdir -p cloudflared && chmod 700 cloudflared
CF="docker run --rm -it --user 1000:1000 -e HOME=/datos -v $PWD/cloudflared:/datos/.cloudflared cloudflare/cloudflared:2026.10.7"
$CF tunnel login
$CF tunnel create telemon
$CF tunnel route dns telemon telemon.site
$CF tunnel route dns telemon mqtt.telemon.site
$CF tunnel route dns telemon mqtt2.telemon.site
$CF tunnel route dns telemon www.telemon.site
```

1. `tunnel login` muestra un enlace: el dueño de la cuenta de Cloudflare lo abre, elige `telemon.site` y autoriza. Se guarda `cert.pem`.
2. `tunnel create` crea el túnel y deja `<id>.json`: renombrarlo a `credenciales.json` y anotar el id en `CLOUDFLARE_TUNNEL_ID`.
3. `route dns` crea los `CNAME` de `telemon.site` y `www` hacia el túnel. Si ya existían para otro túnel, borrarlos antes en el panel de DNS de Cloudflare.

Después: `docker compose up -d cloudflared`.

## Revisar

```bash
docker compose logs --tail=20 cloudflared
curl -I https://telemon.site
```

Los logs deben mostrar 4 líneas `Registered tunnel connection` (en La Paz `lpb01` y Santiago `scl…`). El aviso inicial de que el puerto 7844 o `api.cloudflare.com` están bloqueados aparece aunque después conecte bien: lo que vale son las conexiones registradas.

**Responsable:** Cordova Villarroel, S.
