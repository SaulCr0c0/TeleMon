from concurrent.futures import ThreadPoolExecutor
import unittest

from test_ubicaciones import EntornoHTTP


class RegistroHTTP(EntornoHTTP):
    PREFIJO = "telemon-s65"
    TABS = {"5e5104a1c0de0001", "64ab1cac10de0001"}
    CUERPO = {"organizacion": "  Escuela Sucre  ", "nombre": " Marta Paz ",
              "email": " Marta@EscuelaSucre.BO ", "clave": "secreta12", "terminos": True}

    def setUp(self):
        super().setUp()
        self.sql("INSERT INTO usuarios (rol_id, cliente_id, nombre, email, password_hash) "
                 "VALUES (2, 1, 'Ana Rojas', 'direccion@redvallealto.edu.bo', 'sin-login');")
        self.clientes = int(self.sql("SELECT count(*) FROM clientes;"))

    def registrar(self, **cambios):
        return self.pedir("POST", "/api/registro", {**self.CUERPO, **cambios}, autorizacion=None)

    def contar(self):
        return (int(self.sql("SELECT count(*) FROM clientes;")) - self.clientes,
                int(self.sql("SELECT count(*) FROM usuarios;")) - 1)

    def test_crea_cliente_sin_monitores_y_abre_sesion(self):
        estado, datos, _ = self.registrar()
        self.assertEqual(estado, 201)
        usuario = datos["usuario"]
        self.assertEqual(usuario["nombre"], "Marta Paz")
        self.assertEqual(usuario["organizacion"], "Escuela Sucre")
        self.assertEqual(usuario["rol"], "cliente")
        self.assertFalse(usuario["debeCambiarClave"])
        self.assertEqual((usuario["monitores"], usuario["monitoresReservados"]), (0, 0))
        self.assertEqual(self.contar(), (1, 1))
        self.assertEqual(
            self.sql("SELECT c.nombre, c.email_contacto, c.origen, c.suspendido_en IS NULL, r.nombre, "
                     "u.nombre, u.debe_cambiar_clave, u.password_hash LIKE '$2%' "
                     "FROM usuarios u JOIN clientes c ON c.id = u.cliente_id JOIN roles r ON r.id = u.rol_id "
                     f"WHERE u.id = {usuario['id']};"),
            "Escuela Sucre|marta@escuelasucre.bo|registro|t|cliente|Marta Paz|f|t")
        self.assertEqual(self.pedir("GET", autorizacion=datos["token"])[:2], (200, []))
        estado, sesion, _ = self.pedir("POST", "/api/login",
                                       {"email": "marta@escuelasucre.bo", "clave": "secreta12"},
                                       autorizacion=None)
        self.assertEqual(estado, 200)
        self.assertEqual(sesion["usuario"], usuario)

    def test_correo_registrado_responde_409(self):
        for email in ("direccion@redvallealto.edu.bo", " DIRECCION@RedValleAlto.edu.bo "):
            with self.subTest(email=email):
                estado, datos, _ = self.registrar(email=email)
                self.assertEqual(estado, 409)
                self.assertEqual(datos["mensaje"], "Ya existe una cuenta con ese correo. Inicia sesión.")
        self.assertEqual(self.registrar()[0], 201)
        self.assertEqual(self.registrar(organizacion="Otra")[0], 409)
        self.assertEqual(self.contar(), (1, 1))

    def test_datos_invalidos_responden_400_sin_crear_nada(self):
        casos = (
            ({"clave": "corta12"}, "La contraseña debe tener al menos 8 caracteres."),
            ({"clave": 12345678}, "La contraseña debe tener al menos 8 caracteres."),
            ({"clave": "ñ" * 37}, "La contraseña puede tener hasta 72 caracteres."),
            ({"email": "sin-arroba.bo"}, "El correo no es válido."),
            ({"email": ""}, "El correo no es válido."),
            ({"organizacion": "   "}, "Completa la organización y tu nombre."),
            ({"nombre": None}, "Completa la organización y tu nombre."),
            ({"nombre": "x" * 121}, "La organización y el nombre pueden tener hasta 120 caracteres."),
            ({"terminos": False}, "Debes aceptar los términos para continuar."),
            ({"terminos": "true"}, "Debes aceptar los términos para continuar."),
        )
        for cambios, mensaje in casos:
            with self.subTest(cambios=cambios):
                self.assertEqual(self.registrar(**cambios)[:2], (400, {"mensaje": mensaje}))
        cuerpo = dict(self.CUERPO)
        del cuerpo["terminos"]
        self.assertEqual(self.pedir("POST", "/api/registro", cuerpo, autorizacion=None)[0], 400)
        self.assertEqual(self.contar(), (0, 0))

    def test_registros_simultaneos_con_el_mismo_correo(self):
        with ThreadPoolExecutor(max_workers=6) as grupo:
            estados = sorted(grupo.map(lambda _: self.registrar()[0], range(6)))
        self.assertEqual(estados, [201, 409, 409, 409, 409, 409])
        self.assertEqual(self.contar(), (1, 1))


if __name__ == "__main__":
    unittest.main()
