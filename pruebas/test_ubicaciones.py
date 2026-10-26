"""Integración HTTP de #64 con los flujos reales de Node-RED y PostgreSQL.

Requiere Docker y la imagen de `docker compose build nodered`. No utiliza los
contenedores ni los datos del entorno de desarrollo. Solo usa la biblioteca estándar.
"""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid


RAIZ = Path(__file__).resolve().parents[1]
SECRETO = "clave-exclusiva-de-las-pruebas-de-ubicaciones"
TAB = "64ab1cac10de0001"


def docker(*argumentos, entrada=None):
    resultado = subprocess.run(
        ["docker", *argumentos], input=entrada, text=True, encoding="utf-8",
        capture_output=True,
    )
    if resultado.returncode:
        raise subprocess.CalledProcessError(resultado.returncode, resultado.args,
                                            output=resultado.stdout, stderr=resultado.stderr)
    return (resultado.stdout + (resultado.stderr if argumentos[0] == "logs" else "")).strip()


def esperar(comprobar, descripcion, segundos=60):
    limite = time.monotonic() + segundos
    while time.monotonic() < limite:
        try:
            if comprobar():
                return
        except (OSError, subprocess.CalledProcessError, URLError):
            pass
        time.sleep(0.5)
    raise RuntimeError(f"No estuvo listo a tiempo: {descripcion}")


def token(cliente=1, rol="cliente", secreto=SECRETO, vencido=False):
    def codificar(valor):
        texto = json.dumps(valor, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(texto).rstrip(b"=").decode()

    cabecera = codificar({"alg": "HS256", "typ": "JWT"})
    datos = codificar({"sub": 1, "cliente": cliente, "rol": rol,
                       "exp": int(time.time()) + (-60 if vencido else 3600)})
    firma = hmac.new(secreto.encode(), f"{cabecera}.{datos}".encode(), hashlib.sha256).digest()
    return f"{cabecera}.{datos}." + base64.urlsafe_b64encode(firma).rstrip(b"=").decode()


class UbicacionesHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sufijo = uuid.uuid4().hex[:10]
        cls.red = f"telemon-s64-{sufijo}"
        cls.postgres = f"{cls.red}-pg"
        cls.nodered = f"{cls.red}-nr"
        cls.addClassCleanup(cls.limpiar)
        docker("network", "create", cls.red)
        docker("run", "--detach", "--rm", "--name", cls.postgres, "--network", cls.red,
               "-e", "POSTGRES_PASSWORD=solo-pruebas", "-e", "POSTGRES_DB=ubicaciones_test",
               "postgres:17-alpine")
        esperar(lambda: docker("exec", cls.postgres, "pg_isready", "-h", "127.0.0.1", "-U", "postgres",
                                "-d", "ubicaciones_test"), "PostgreSQL")
        cls.sql((RAIZ / "database/01_esquema.sql").read_text(encoding="utf-8"))

        flujos = json.loads((RAIZ / "nodered/data/flows.json").read_text(encoding="utf-8"))
        sesion = {"5e5104a1c0de0001", "5e5104a1c0de0008", "5e5104a1c0de0009",
                  "5e5104a1c0de000a", "5a9c3b7e1d2f4a03"}
        prueba = [n for n in flujos if n["id"] == TAB or n.get("z") == TAB or n["id"] in sesion]
        for nodo in prueba:
            if nodo["id"] == "5e5104a1c0de0009":
                # La lógica de sesión es la real. Solo se carga JWT desde los módulos
                # ya instalados, para no descargar dependencias durante la prueba.
                nodo["func"] = "const jwt = global.get('jwt');\n" + nodo["func"]
                nodo["libs"] = []

        imagen = os.environ.get("TELEMON_NODERED_IMAGE", "telemon-nodered:latest")
        modulos = RAIZ / "nodered/data/node_modules"
        if not (modulos / "jsonwebtoken/package.json").exists():
            raise RuntimeError("Arranca Node-RED una vez para instalar los módulos del login (#63).")
        docker("create", "--name", cls.nodered, "--network", cls.red,
               "-p", "127.0.0.1::1880", "-e", f"PGHOST={cls.postgres}",
               "-e", "PGDATABASE=ubicaciones_test", "-e", "PGUSER=postgres",
               "-e", "PGPASSWORD=solo-pruebas", "-e", f"JWT_SECRETO={SECRETO}",
               "--mount", f"type=bind,source={modulos},target=/opt/telemon/node_modules,readonly", imagen)
        with tempfile.TemporaryDirectory(prefix="telemon-s64-") as temporal:
            carpeta = Path(temporal)
            (carpeta / "flows.json").write_text(json.dumps(prueba, ensure_ascii=False), encoding="utf-8")
            (carpeta / "settings.js").write_text(
                "module.exports = { flowFile: 'flows.json', credentialSecret: false, "
                "uiPort: 1880, httpAdminRoot: false, "
                "functionGlobalContext: { jwt: require('/opt/telemon/node_modules/jsonwebtoken') } };\n",
                encoding="utf-8",
            )
            for archivo in ("flows.json", "settings.js"):
                docker("cp", str(carpeta / archivo), f"{cls.nodered}:/data/{archivo}")
        docker("start", cls.nodered)
        puerto = docker("port", cls.nodered, "1880/tcp").split(":")[-1]
        cls.base = f"http://127.0.0.1:{puerto}"
        try:
            esperar(lambda: cls.pedir("GET", autorizacion=None)[0] == 401, "API de ubicaciones", segundos=30)
        except RuntimeError as error:
            raise RuntimeError(f"{error}\n{docker('logs', cls.nodered)}") from error

    @classmethod
    def limpiar(cls):
        for nombre in (cls.nodered, cls.postgres):
            subprocess.run(["docker", "rm", "--force", "--volumes", nombre], capture_output=True)
        subprocess.run(["docker", "network", "rm", cls.red], capture_output=True)

    @classmethod
    def sql(cls, consulta):
        return docker("exec", "-i", cls.postgres, "psql", "-X", "-q", "-t", "-A",
                      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "ubicaciones_test", entrada=consulta)

    @classmethod
    def pedir(cls, metodo, ruta="/api/ubicaciones", cuerpo=None, autorizacion="cliente1"):
        headers = {"Content-Type": "application/json"}
        if autorizacion is not None:
            headers["Authorization"] = "Bearer " + (token() if autorizacion == "cliente1" else autorizacion)
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        solicitud = Request(cls.base + ruta, data=datos, headers=headers, method=metodo)
        try:
            respuesta = urlopen(solicitud, timeout=10)
        except HTTPError as error:
            respuesta = error
        with respuesta:
            texto = respuesta.read().decode()
            try:
                contenido = json.loads(texto)
            except json.JSONDecodeError:
                contenido = texto
            return respuesta.status, contenido, respuesta.headers

    def setUp(self):
        self.sql("DROP TRIGGER IF EXISTS fallo_s64 ON umbrales; "
                 "DROP FUNCTION IF EXISTS fallo_s64(); "
                 "TRUNCATE roles, clientes RESTART IDENTITY CASCADE;\n" +
                 (RAIZ / "database/02_datos.sql").read_text(encoding="utf-8"))

    def test_aislamiento_y_sesion_en_todas_las_rutas(self):
        for metodo, ruta, cuerpo in (
            ("GET", "/api/ubicaciones", None), ("GET", "/api/ubicaciones/1", None),
            ("POST", "/api/ubicaciones", {"nombre": "Prueba"}),
            ("PATCH", "/api/ubicaciones/1", {"nombre": "Prueba"}),
        ):
            for credencial in (None, "invalido", token(vencido=True), token(secreto="otro")):
                with self.subTest(metodo=metodo, ruta=ruta, credencial=credencial):
                    self.assertEqual(self.pedir(metodo, ruta, cuerpo, credencial)[0], 401)
            self.assertEqual(self.pedir(metodo, ruta, cuerpo, token(None, "admin"))[0], 403)
        self.assertEqual([u["id"] for u in self.pedir("GET")[1]], [1, 2])
        self.assertEqual([u["id"] for u in self.pedir("GET", autorizacion=token(2))[1]], [3])
        for ruta in ("/api/ubicaciones/3", "/api/ubicaciones/2147483647"):
            self.assertEqual(self.pedir("GET", ruta)[0], 403)
            self.assertEqual(self.pedir("PATCH", ruta, {"nombre": "Ajena"})[0], 403)
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/3", autorizacion=token(2))[1]["nombre"],
                         "Vivero San Agustín")

    def test_listado_vacio(self):
        self.sql("INSERT INTO clientes (id, nombre, email_contacto) VALUES (3, 'Sin ubicaciones', 't@t.test');")
        estado, datos, _ = self.pedir("GET", autorizacion=token(3))
        self.assertEqual((estado, datos), (200, []))

    def test_conteos_sin_duplicados_y_lectura_de_la_ubicacion_correcta(self):
        self.sql("""
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 1,
 ubicacion_id = CASE WHEN id = 3 THEN 2 ELSE 1 END, ultima_lectura_en = now();
INSERT INTO dispositivos (id, mac_address, codigo, cliente_id, ubicacion_id, estado)
 VALUES (4, 'AA:AA:AA:AA:AA:04', 'AAAA-AAA4', 1, 1, 'en_uso'),
        (5, 'AA:AA:AA:AA:AA:05', 'AAAA-AAA5', 1, 1, 'desactivado');
INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora) VALUES
 (1, 1, now()), (1, 1, now() - interval '1 minute'),
 (3, 1, now()), (4, 1, now() - interval '5 minutes'), (5, 1, now());
INSERT INTO alertas (dispositivo_id, ubicacion_id, tipo, variable, mensaje, cerrada_en) VALUES
 (1, 1, 'UMBRAL', 'temperatura', 'A', NULL),
 (1, 1, 'SENSOR', 'humedad', 'B', NULL),
 (1, 1, 'UMBRAL', 'presion', 'C', now()),
 (3, 2, 'SENSOR', 'presion', 'D', NULL);
""")
        estado, datos, _ = self.pedir("GET")
        self.assertEqual(estado, 200)
        self.assertEqual(datos[0]["nodos"], {"total": 3, "enLinea": 1})
        self.assertEqual(datos[0]["alertasActivas"], 2)
        self.assertEqual(datos[1]["nodos"], {"total": 1, "enLinea": 0})
        self.assertEqual(datos[1]["alertasActivas"], 1)
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/1")[1], datos[0])

    def test_crear_recorta_texto_y_crea_umbrales_del_cliente(self):
        nombre = "  Laboratorio d'Ávila; --  "
        estado, datos, cabeceras = self.pedir("POST", cuerpo={"nombre": nombre, "localidad": "  Punata  "})
        self.assertEqual(estado, 201)
        self.assertEqual(datos["nombre"], nombre.strip())
        self.assertEqual(datos["localidad"], "Punata")
        self.assertEqual(datos["nodos"], {"total": 0, "enLinea": 0})
        self.assertEqual(datos["alertasActivas"], 0)
        self.assertFalse(datos["archivada"])
        self.assertEqual(cabeceras["Location"], f"/api/ubicaciones/{datos['id']}")
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(self.sql(f"SELECT cliente_id FROM ubicaciones WHERE id = {datos['id']};"), "1")
        self.assertEqual(self.sql(f"SELECT count(*) FROM umbrales WHERE ubicacion_id = {datos['id']};"), "4")
        self.assertEqual(self.pedir("GET", cabeceras["Location"])[1], datos)
        estado, otra, _ = self.pedir("POST", cuerpo={"nombre": "Vivero"}, autorizacion=token(2))
        self.assertEqual(estado, 201)
        self.assertEqual(otra["localidad"], "")
        self.assertEqual(self.pedir("GET", f"/api/ubicaciones/{otra['id']}")[0], 403)

    def test_rechaza_nombres_y_campos_invalidos_sin_escrituras(self):
        invalidos = ({"nombre": ""}, {"nombre": " \t "}, {"nombre": None}, {"nombre": 123},
                     {"nombre": []}, {"nombre": "X", "localidad": None},
                     {"nombre": "X", "cliente_id": 2}, {"nombre": "X", "nodos": {}}, [])
        for metodo, ruta in (("POST", "/api/ubicaciones"), ("PATCH", "/api/ubicaciones/1")):
            for cuerpo in (*invalidos, {}):
                with self.subTest(metodo=metodo, cuerpo=cuerpo):
                    self.assertEqual(self.pedir(metodo, ruta, cuerpo)[0], 400)
        for valor in ("true", 1, None):
            self.assertEqual(self.pedir("PATCH", "/api/ubicaciones/1", {"archivada": valor})[0], 400)
        self.assertEqual(self.sql("SELECT count(*) FROM ubicaciones;"), "3")
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/1")[1]["nombre"], "Escuela Adela Zamudio")

    def test_ids_invalidos(self):
        for identificador in ("0", "-1", "1.5", "abc", "01", "2147483648", "99999999999"):
            for metodo in ("GET", "PATCH"):
                with self.subTest(id=identificador, metodo=metodo):
                    estado, _, _ = self.pedir(metodo, f"/api/ubicaciones/{identificador}",
                                              {"nombre": "X"} if metodo == "PATCH" else None)
                    self.assertEqual(estado, 400)

    def test_renombrar_y_archivar_conserva_el_historial(self):
        self.sql("INSERT INTO lecturas (dispositivo_id, ubicacion_id) VALUES (1, 1); "
                 "INSERT INTO alertas (dispositivo_id, ubicacion_id, tipo, mensaje) "
                 "VALUES (1, 1, 'SIN_CONEXION', 'Prueba');")
        estado, datos, _ = self.pedir("PATCH", "/api/ubicaciones/1", {"nombre": "  Nueva escuela  "})
        self.assertEqual(estado, 200)
        self.assertEqual((datos["nombre"], datos["localidad"]), ("Nueva escuela", "Punata"))
        estado, datos, _ = self.pedir("PATCH", "/api/ubicaciones/1", {"archivada": True})
        self.assertEqual(estado, 200)
        self.assertTrue(datos["archivada"])
        self.assertEqual([u["id"] for u in self.pedir("GET")[1]], [2])
        self.assertTrue(self.pedir("GET", "/api/ubicaciones/1")[1]["archivada"])
        self.assertEqual(self.sql("SELECT (SELECT count(*) FROM lecturas), "
                                 "(SELECT count(*) FROM dispositivos), (SELECT count(*) FROM alertas), "
                                 "(SELECT count(*) FROM umbrales);"), "1|3|1|12")
        self.assertEqual(self.sql("SELECT estado FROM dispositivos WHERE id = 1;"), "en_uso")
        self.assertEqual(self.pedir("PATCH", "/api/ubicaciones/1", {"archivada": False})[0], 200)
        self.assertEqual([u["id"] for u in self.pedir("GET")[1]], [1, 2])

    def test_fallo_de_umbrales_revierte_creacion_y_no_expone_sql(self):
        self.sql("""
CREATE FUNCTION fallo_s64() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'DETALLE_INTERNO_S64'; END $$;
CREATE TRIGGER fallo_s64 BEFORE INSERT ON umbrales FOR EACH ROW EXECUTE FUNCTION fallo_s64();
""")
        estado, datos, _ = self.pedir("POST", cuerpo={"nombre": "No debe crearse"})
        self.assertEqual(estado, 500)
        self.assertIn("mensaje", datos)
        self.assertNotIn("DETALLE_INTERNO_S64", json.dumps(datos))
        self.assertEqual(self.sql("SELECT count(*) FROM ubicaciones;"), "3")


if __name__ == "__main__":
    unittest.main(verbosity=2)
