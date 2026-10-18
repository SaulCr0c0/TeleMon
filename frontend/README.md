# frontend

Portal del cliente y panel del proveedor en HTML5, CSS3 y JavaScript, sin framework. Nginx sirve esta carpeta y reenvía `/api` y `/ws` a Node-RED.

## Estructura

| Archivo | Contenido |
|---|---|
| `css/telemon.css` | Colores, tipografía y componentes del prototipo |
| `js/api.js` | `api.get/post/patch` contra `/api/...`. Con `MODO_DEMO = true`, o si la ruta todavía no existe, devuelve los datos de `js/demo-datos.js` |
| Un `.html` por pantalla | Comparten la barra lateral y la barra superior |

Gracias al modo demo, cada pantalla se puede maquetar y mostrar antes de que su API esté lista; al terminar el backend funciona sin cambios.

## Pantallas y responsables

| Pantalla | Responsable | Tarea |
|---|---|---|
| Base (estilos, navegación, `api.js`) | Cordova Villarroel, S. | [#29](https://github.com/SaulCr0c0/TeleMon/issues/29) |
| Login, Crear cuenta, Bienvenida, Crear contraseña | Cordova Villarroel, S. | [#40](https://github.com/SaulCr0c0/TeleMon/issues/40) |
| Mi cuenta | Cordova Villarroel, S. | [#41](https://github.com/SaulCr0c0/TeleMon/issues/41) |
| Ubicaciones | Cordova Villarroel, S. | [#42](https://github.com/SaulCr0c0/TeleMon/issues/42) |
| Panel en vivo | Garnica Salazar, L. | [#55](https://github.com/SaulCr0c0/TeleMon/issues/55) |
| Gráficas por nodo | Garcia Nogales, B. | [#58](https://github.com/SaulCr0c0/TeleMon/issues/58) |
| Historial con CSV | Garcia Nogales, B. | [#59](https://github.com/SaulCr0c0/TeleMon/issues/59) |
| Alertas | Garcia Nogales, B. | [#60](https://github.com/SaulCr0c0/TeleMon/issues/60) |
| Umbrales | Garcia Nogales, B. | [#61](https://github.com/SaulCr0c0/TeleMon/issues/61) |
| Gestionar nodos | Mantilla Villaca, J. | [#62](https://github.com/SaulCr0c0/TeleMon/issues/62) |
| Admin · Clientes | Serna Mesa, J. | [#46](https://github.com/SaulCr0c0/TeleMon/issues/46) |
| Admin · Inventario | Serna Mesa, J. | [#47](https://github.com/SaulCr0c0/TeleMon/issues/47) |
| Admin · Ficha del monitor | Serna Mesa, J. | [#48](https://github.com/SaulCr0c0/TeleMon/issues/48) |

Prototipo de referencia: https://claude.ai/artifact/3fmZGzeH5DnXdrssyFjDK2
