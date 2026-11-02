# nginx

Configuración de Nginx como servidor del dashboard y proxy inverso HTTP/WebSocket hacia Node-RED, con HTTPS para `telematicos2026.online`.

## Servicio `proxy_web` (#39)

`nginx/Dockerfile` construye la web en dos etapas:

1. **`node:22-alpine`**: `npm ci` y `npm run build` del frontend con `VITE_MODO_DEMO=false`, así la web usa el backend real.
2. **`nginx:1.27-alpine`**: copia `frontend/dist` a `/usr/share/nginx/html` y `nginx/default.conf`.

El server no necesita Node.js: todo se compila dentro de la imagen. `nginx/Dockerfile.dockerignore` deja entrar al build solo lo necesario del frontend (sin `node_modules`, pruebas ni `.env`).

| Ruta | Qué hace |
|---|---|
| `/api/` | Proxy a `nodered:1880` con `X-Real-IP` y `X-Forwarded-*` |
| `/ws/` | Proxy WebSocket a Node-RED (`Upgrade` y `Connection`), con 1 h de espera |
| `/assets/` | Archivos de Vite con caché de 1 año (llevan hash en el nombre); si no existe, 404 |
| `/index.html` | Sin caché, para que cada despliegue se vea al recargar |
| `/` y el resto | `try_files` → `index.html`, para que las rutas de React (`/ubicaciones/1/panel`) funcionen al recargar |

- El editor de Node-RED **no** se publica: solo pasan `/api/` y `/ws/`. Node-RED sigue en `127.0.0.1:1880` del server.
- Nginx resuelve `nodered` con el DNS de Docker (`127.0.0.11`) en cada pedido, así arranca aunque Node-RED todavía no esté listo.
- Respuestas comprimidas con gzip, `server_tokens off` y las cabeceras `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`.
- El puerto publicado es `WEB_PORT` del `.env` (por defecto 80). HTTPS y el dominio llegan con la HU-07 (#78).

## Levantar y probar

```bash
docker compose up -d --build proxy_web
curl -I http://localhost/
curl -s -X POST http://localhost/api/login -H "Content-Type: application/json" \
  -d '{"email":"admin@telemon.bo","clave":"admin1234"}'
curl -s -i -N -m 3 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://localhost/ws/lecturas | head -1
```

El último debe responder `HTTP/1.1 101 Switching Protocols`. Después de cambiar el frontend: `docker compose up -d --build proxy_web`.

**Responsable:** Cordova Villarroel, S.
