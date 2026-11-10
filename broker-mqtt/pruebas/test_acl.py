import unittest

from acl import Permisos, cubre, leer_acl, sustituir

REGLAS = "esp32:write:telemetria/%c/lecturas,nodered:read:telemetria/#"


class PruebasAcl(unittest.TestCase):
    def test_leer_reglas(self):
        reglas = leer_acl(REGLAS)
        self.assertEqual([(r.usuario, sorted(r.acciones), r.patron) for r in reglas], [
            ("esp32", ["write"], "telemetria/%c/lecturas"),
            ("nodered", ["read"], "telemetria/#"),
        ])

    def test_readwrite_da_las_dos_acciones(self):
        self.assertEqual(leer_acl("a:readwrite:x/#")[0].acciones, {"read", "write"})

    def test_reglas_mal_formadas(self):
        for texto in ("esp32:write", "esp32:borrar:a/b", "esp32:read:a/#/b", ":read:a"):
            with self.subTest(texto=texto), self.assertRaises(ValueError):
                leer_acl(texto)

    def test_vacio_no_tiene_reglas(self):
        self.assertEqual(leer_acl(""), [])

    def test_sustituir_client_id_y_usuario(self):
        self.assertEqual(sustituir("t/%c/%u", "esp32", "F8B3"), "t/F8B3/esp32")

    def test_client_id_con_comodines_o_barra_no_se_sustituye(self):
        for client_id in ("A/B", "+", "#", ""):
            with self.subTest(client_id=client_id):
                self.assertIsNone(sustituir("telemetria/%c/lecturas", "esp32", client_id))

    def test_cubre(self):
        self.assertTrue(cubre("telemetria/#", "telemetria/+/lecturas"))
        self.assertTrue(cubre("telemetria/#", "telemetria/#"))
        self.assertTrue(cubre("telemetria/+/lecturas", "telemetria/A/lecturas"))
        self.assertTrue(cubre("telemetria/+/lecturas", "telemetria/+/lecturas"))
        self.assertFalse(cubre("telemetria/#", "#"))
        self.assertFalse(cubre("telemetria/A/lecturas", "telemetria/+/lecturas"))
        self.assertFalse(cubre("telemetria/+/lecturas", "telemetria/#"))
        self.assertFalse(cubre("telemetria/+", "telemetria/A/lecturas"))

    def test_permisos_del_monitor(self):
        permisos = Permisos(leer_acl(REGLAS), "esp32", "F8B3B72BFC24")
        self.assertTrue(permisos.puede_publicar("telemetria/F8B3B72BFC24/lecturas"))
        self.assertFalse(permisos.puede_publicar("telemetria/OTRO/lecturas"))
        self.assertFalse(permisos.puede_publicar("telemetria/F8B3B72BFC24/estado"))
        self.assertFalse(permisos.puede_suscribirse("telemetria/#"))

    def test_permisos_de_nodered(self):
        permisos = Permisos(leer_acl(REGLAS), "nodered", "nodered")
        self.assertTrue(permisos.puede_suscribirse("telemetria/+/lecturas"))
        self.assertFalse(permisos.puede_suscribirse("#"))
        self.assertFalse(permisos.puede_publicar("telemetria/A/lecturas"))

    def test_usuario_sin_reglas_no_puede_nada(self):
        permisos = Permisos(leer_acl(REGLAS), "intruso", "X")
        self.assertFalse(permisos.puede_publicar("telemetria/X/lecturas"))
        self.assertFalse(permisos.puede_suscribirse("telemetria/#"))


if __name__ == "__main__":
    unittest.main()
