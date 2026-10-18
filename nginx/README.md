# nginx

Nginx como servidor de la web (`frontend/`) y proxy inverso hacia Node-RED: `/api/` por HTTP y `/ws/` por WebSocket (cabeceras `Upgrade` y `Connection`). En la nube, HTTPS con Let's Encrypt para `telematicos2026.online` y redirección de 80 a 443.

**Responsable:** Cordova Villarroel, S.

## Tareas

- [#39](https://github.com/SaulCr0c0/TeleMon/issues/39) Contenedor Nginx que sirve la web y hace de proxy de `/api` y `/ws`
- [#35](https://github.com/SaulCr0c0/TeleMon/issues/35) Máquina virtual en Oracle Cloud con Docker
- [#78](https://github.com/SaulCr0c0/TeleMon/issues/78) Dominio, HTTPS y despliegue en la VM
