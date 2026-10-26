import unittest

from temas import coincide, filtro_valido, tema_valido


class PruebasTemas(unittest.TestCase):
    def test_coincidencia_exacta(self):
        self.assertTrue(coincide("telemetria/F8B3B72BFC24/lecturas", "telemetria/F8B3B72BFC24/lecturas"))
        self.assertFalse(coincide("telemetria/F8B3B72BFC24/lecturas", "telemetria/OTRO/lecturas"))

    def test_mas_reemplaza_un_nivel(self):
        self.assertTrue(coincide("telemetria/+/lecturas", "telemetria/F8B3B72BFC24/lecturas"))
        self.assertFalse(coincide("telemetria/+/lecturas", "telemetria/a/b/lecturas"))
        self.assertFalse(coincide("telemetria/+", "telemetria"))
        self.assertTrue(coincide("+/+", "/x"))

    def test_numeral_reemplaza_el_resto(self):
        self.assertTrue(coincide("telemetria/#", "telemetria/F8B3B72BFC24/lecturas"))
        self.assertTrue(coincide("telemetria/#", "telemetria"))
        self.assertTrue(coincide("#", "cualquier/cosa"))
        self.assertFalse(coincide("telemetria/#", "otra/cosa"))

    def test_temas_de_sistema_no_coinciden_con_comodines_iniciales(self):
        self.assertFalse(coincide("#", "$SYS/broker"))
        self.assertFalse(coincide("+/broker", "$SYS/broker"))
        self.assertTrue(coincide("$SYS/#", "$SYS/broker"))

    def test_filtros_validos(self):
        for filtro in ("telemetria/+/lecturas", "telemetria/#", "#", "+", "a/b/c"):
            self.assertTrue(filtro_valido(filtro), filtro)
        for filtro in ("", "telemetria/#/x", "tele#", "tele+/x", "a/b#"):
            self.assertFalse(filtro_valido(filtro), filtro)

    def test_temas_de_publicacion(self):
        self.assertTrue(tema_valido("telemetria/F8B3B72BFC24/lecturas"))
        for tema in ("", "telemetria/+/lecturas", "telemetria/#"):
            self.assertFalse(tema_valido(tema), tema)


if __name__ == "__main__":
    unittest.main()
