import re
import unittest

from test_ubicaciones import EntornoHTTP, token


HASH = "$2b$10$.Kg7qfDpz6YNjP8VRCX5YeYaFJYuxyNMoJchn.VKTgxxoKBxIjgDC"
ADMIN = token(None, "admin", usuario=3)
CLAVE = re.compile(r"^[A-HJKMNP-Za-hjkmnp-z2-9]{4}(-[A-HJKMNP-Za-hjkmnp-z2-9]{4}){2}$")


class ClientesHTTP(EntornoHTTP):
    PREFIJO = "telemon-s68"
    TABS = {"5e5104a1c0de0001", "64ab1cac10de0001", "1a7e0d15c0de0001", "c11e7e5ac0de0001"}
    NUEVO = {"organizacion": " Granja Tunari ", "nombre": " Jorge Quispe ", "email": " Jorge@Tunari.BO "}

    def setUp(self):
        super().setUp()
        self.sql(f"""
INSERT INTO usuarios (id, rol_id, cliente_id, nombre, email, password_hash, ultimo_login) VALUES
 (1, 2, 1, 'Ana Rojas', 'direccion@redvallealto.edu.bo', '{HASH}', '2026-10-17 14:02-04'),
 (2, 2, 2, 'Carla Mendoza', 'contacto@viveroandes.com', '{HASH}', NULL),
 (3, 1, NULL, 'Equipo TeleMon', 'admin@telemon.bo', '{HASH}', NULL);
SELECT setval('usuarios_id_seq', 3);
""")

    def admin(self, metodo, ruta, cuerpo=None):
        return self.pedir(metodo, ruta, cuerpo, ADMIN)

    def entrar(self, email, clave="telemon123"):
        return self.pedir("POST", "/api/login", {"email": email, "clave": clave}, autorizacion=None)

    def test_rutas_solo_para_el_admin(self):
        for metodo, ruta, cuerpo in (
            ("GET", "/api/admin/clientes", None), ("POST", "/api/admin/clientes", self.NUEVO),
            ("GET", "/api/admin/clientes/1", None), ("PATCH", "/api/admin/clientes/1", {"estado": "suspendida"}),
            ("POST", "/api/admin/clientes/1/restablecer-clave", None),
        ):
            with self.subTest(metodo=metodo, ruta=ruta):
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, None)[0], 401)
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, token(1))[0], 403)
        self.assertIsNone(self.sql("SELECT suspendido_en FROM clientes WHERE id = 1;") or None)
        self.assertEqual(self.sql("SELECT count(*) FROM clientes;"), "2")

    def test_lista_con_origen_estado_y_conteos(self):
        self.sql("UPDATE clientes SET suspendido_en = now() WHERE id = 2;")
        estado, lista, cabeceras = self.admin("GET", "/api/admin/clientes")
        self.assertEqual(estado, 200)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(lista, [
            {"id": 1, "organizacion": "Red Escolar Valle Alto", "nombre": "Ana Rojas",
             "email": "direccion@redvallealto.edu.bo", "origen": "registro", "estado": "activa",
             "ubicaciones": 2, "monitores": 1, "desde": "2026-10-12", "ultimoIngreso": "2026-10-17T18:02:00.000Z"},
            {"id": 2, "organizacion": "Vivero Los Andes", "nombre": "Carla Mendoza",
             "email": "contacto@viveroandes.com", "origen": "admin", "estado": "suspendida",
             "ubicaciones": 1, "monitores": 0, "desde": "2026-10-03", "ultimoIngreso": None},
        ])
        self.sql("UPDATE clientes SET suspendido_en = NULL WHERE id = 2;")
        self.assertEqual(self.admin("GET", "/api/admin/clientes")[1][1]["estado"], "sin_monitores")

    def test_crear_cuenta_manual_con_clave_temporal(self):
        estado, datos, cabeceras = self.admin("POST", "/api/admin/clientes", self.NUEVO)
        self.assertEqual(estado, 201)
        self.assertRegex(datos["claveTemporal"], CLAVE)
        cliente = datos["cliente"]
        self.assertEqual(cabeceras["Location"], f"/api/admin/clientes/{cliente['id']}")
        self.assertEqual({k: cliente[k] for k in ("organizacion", "nombre", "email", "origen", "estado",
                                                  "ubicaciones", "monitores", "ultimoIngreso")},
                         {"organizacion": "Granja Tunari", "nombre": "Jorge Quispe", "email": "jorge@tunari.bo",
                          "origen": "admin", "estado": "sin_monitores", "ubicaciones": 0, "monitores": 0,
                          "ultimoIngreso": None})
        self.assertEqual(self.sql("SELECT debe_cambiar_clave, password_hash <> '' FROM usuarios "
                                  "WHERE email = 'jorge@tunari.bo';"), "t|t")
        estado, sesion, _ = self.entrar("jorge@tunari.bo", datos["claveTemporal"])
        self.assertEqual(estado, 200)
        self.assertTrue(sesion["usuario"]["debeCambiarClave"])
        self.assertNotIn(datos["claveTemporal"], str(self.admin("GET", "/api/admin/clientes")[1]))
        self.assertNotIn("claveTemporal", self.admin("GET", f"/api/admin/clientes/{cliente['id']}")[1])
        self.assertNotEqual(self.admin("POST", "/api/admin/clientes", {**self.NUEVO, "email": "otro@t.bo"})[1]
                            ["claveTemporal"], datos["claveTemporal"])

    def test_crear_con_datos_invalidos_o_correo_repetido(self):
        for cambios, estado in (
            ({"email": "DIRECCION@redvallealto.edu.bo"}, 409), ({"email": "sin-arroba"}, 400),
            ({"organizacion": "  "}, 400), ({"nombre": None}, 400), ({"nombre": "x" * 121}, 400),
        ):
            with self.subTest(cambios=cambios):
                respuesta = self.admin("POST", "/api/admin/clientes", {**self.NUEVO, **cambios})
                self.assertEqual(respuesta[0], estado)
                self.assertNotIn("claveTemporal", respuesta[1])
        self.assertEqual(self.sql("SELECT count(*) FROM clientes;"), "2")

    def test_ficha_con_ubicaciones_y_monitores_del_cliente(self):
        self.sql("UPDATE ubicaciones SET archivada = true WHERE id = 2;")
        estado, ficha, _ = self.admin("GET", "/api/admin/clientes/1")
        self.assertEqual(estado, 200)
        self.assertEqual(ficha["organizacion"], "Red Escolar Valle Alto")
        self.assertEqual(ficha["ubicaciones"], 1)
        self.assertEqual(ficha["listaUbicaciones"], [
            {"id": 1, "localidad": "Punata", "nombre": "Escuela Adela Zamudio", "archivada": False, "nodos": 1},
            {"id": 2, "localidad": "Vinto", "nombre": "Salón de maestros, Escuela Avaroa", "archivada": True,
             "nodos": 0},
        ])
        self.assertEqual(sorted((m["id"], m["estado"], m["clienteId"]) for m in ficha["listaMonitores"]),
                         [(1, "en_uso", 1), (2, "reservado", 1)])
        self.assertEqual(self.admin("GET", "/api/admin/clientes/2")[1]["listaMonitores"], [])
        for ruta in ("/api/admin/clientes/99", "/api/admin/clientes/abc", "/api/admin/clientes/9999999999"):
            self.assertEqual(self.admin("GET", ruta)[:2], (404, {"mensaje": "Cliente no encontrado."}))

    def test_editar_datos_y_correo_de_ingreso(self):
        estado, cliente, _ = self.admin("PATCH", "/api/admin/clientes/2",
                                        {"organizacion": " Vivero Andino ", "nombre": "Carla M.",
                                         "email": "Carla@ViveroAndes.com"})
        self.assertEqual(estado, 200)
        self.assertEqual((cliente["organizacion"], cliente["nombre"], cliente["email"]),
                         ("Vivero Andino", "Carla M.", "carla@viveroandes.com"))
        self.assertEqual(self.sql("SELECT email_contacto FROM clientes WHERE id = 2;"), "carla@viveroandes.com")
        self.assertEqual(self.entrar("carla@viveroandes.com")[0], 200)
        self.assertEqual(self.entrar("contacto@viveroandes.com")[0], 401)
        for ruta, cuerpo, esperado in (
            ("/api/admin/clientes/2", {"email": "direccion@redvallealto.edu.bo"}, 409),
            ("/api/admin/clientes/2", {"email": "mal"}, 400),
            ("/api/admin/clientes/2", {"organizacion": ""}, 400),
            ("/api/admin/clientes/2", {"estado": "borrada"}, 400),
            ("/api/admin/clientes/2", {}, 400),
            ("/api/admin/clientes/99", {"nombre": "Nadie"}, 404),
        ):
            with self.subTest(cuerpo=cuerpo, ruta=ruta):
                self.assertEqual(self.admin("PATCH", ruta, cuerpo)[0], esperado)
        self.assertEqual(self.sql("SELECT nombre, email FROM usuarios WHERE id = 2;"),
                         "Carla M.|carla@viveroandes.com")

    def test_suspender_y_reactivar_conserva_los_datos(self):
        antes = self.sql("SELECT count(*) FROM ubicaciones WHERE cliente_id = 1;")
        estado, cliente, _ = self.admin("PATCH", "/api/admin/clientes/1", {"estado": "suspendida"})
        self.assertEqual((estado, cliente["estado"]), (200, "suspendida"))
        self.assertEqual(self.entrar("direccion@redvallealto.edu.bo")[0], 403)
        primera = self.sql("SELECT suspendido_en FROM clientes WHERE id = 1;")
        self.admin("PATCH", "/api/admin/clientes/1", {"estado": "suspendida"})
        self.assertEqual(self.sql("SELECT suspendido_en FROM clientes WHERE id = 1;"), primera)
        estado, cliente, _ = self.admin("PATCH", "/api/admin/clientes/1", {"estado": "sin_monitores"})
        self.assertEqual((estado, cliente["estado"], cliente["monitores"]), (200, "activa", 1))
        estado, sesion, _ = self.entrar("direccion@redvallealto.edu.bo")
        self.assertEqual((estado, sesion["usuario"]["monitores"]), (200, 1))
        self.assertEqual(self.sql("SELECT count(*) FROM ubicaciones WHERE cliente_id = 1;"), antes)
        self.assertEqual(self.sql("SELECT ubicacion_id, estado FROM dispositivos WHERE id = 1;"), "1|en_uso")

    def test_restablecer_clave(self):
        estado, datos, _ = self.admin("POST", "/api/admin/clientes/1/restablecer-clave")
        self.assertEqual(estado, 200)
        self.assertEqual(list(datos), ["claveTemporal"])
        self.assertRegex(datos["claveTemporal"], CLAVE)
        self.assertEqual(self.entrar("direccion@redvallealto.edu.bo")[0], 401)
        estado, sesion, _ = self.entrar("direccion@redvallealto.edu.bo", datos["claveTemporal"])
        self.assertEqual(estado, 200)
        self.assertTrue(sesion["usuario"]["debeCambiarClave"])
        self.assertEqual(self.admin("POST", "/api/admin/clientes/99/restablecer-clave")[0], 404)
        self.assertEqual(self.sql("SELECT password_hash FROM usuarios WHERE id = 2;"), HASH)


if __name__ == "__main__":
    unittest.main()
