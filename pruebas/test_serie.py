import unittest

from test_ubicaciones import RAIZ, EntornoHTTP, token


class SerieHTTP(EntornoHTTP):
    PREFIJO = "telemon-s73"
    TABS = {"64ab1cac10de0001", "9a7f1ca5c0de0001"}

    def setUp(self):
        super().setUp()
        self.sql((RAIZ / "database/03_agregacion.sql").read_text(encoding="utf-8"))
        self.sql("""
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 2, ubicacion_id = 3, nombre = 'Vivero' WHERE id = 3;
INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora, temperatura, humedad, presion, rs_r0) VALUES
 (1, 1, now() - interval '50 minutes', 20, 40, 750, 0.9),
 (1, 1, now() - interval '10 minutes', 22, NULL, 752, NULL),
 (1, 1, now() - interval '70 minutes', 99, 99, 799, 0.1),
 (1, 2, now() - interval '5 minutes', 55, 55, 755, 0.5),
 (3, 3, now() - interval '5 minutes', 26, 60, 745, 0.95);
INSERT INTO lecturas_minuto (dispositivo_id, ubicacion_id, minuto, temp_avg, hum_avg, pres_avg, rs_r0_avg, n_lecturas)
VALUES
 (1, 1, date_trunc('hour', now()) - interval '3 hours', 20, 40, 750, 0.9, 12),
 (1, 1, date_trunc('hour', now()) - interval '3 hours' + interval '1 minute', 23, 40, 750, NULL, 4),
 (1, 1, date_trunc('hour', now()) - interval '2 hours', 25, 40, 750, 0.7, 12),
 (1, 1, now() - interval '2 days', 18, 40, 750, 0.8, 12),
 (1, 1, now() - interval '8 days', 99, 99, 799, 0.1, 12),
 (1, 2, now() - interval '1 hour', 55, 55, 755, 0.5, 12);
""")

    def serie(self, dispositivo=1, autorizacion="cliente1", **filtros):
        consulta = "&".join(f"{k}={v}" for k, v in filtros.items())
        return self.pedir("GET", f"/api/dispositivos/{dispositivo}/serie?{consulta}", autorizacion=autorizacion)

    def valores(self, **filtros):
        return [p["valor"] for p in self.serie(**filtros)[1]["puntos"]]

    def test_sesion_y_aislamiento(self):
        self.assertEqual(self.serie(autorizacion=None)[0], 401)
        self.assertEqual(self.serie(autorizacion=token(2))[:2], (403, {"mensaje": "No tienes permiso."}))
        self.assertEqual(self.serie(3)[0], 403)
        self.assertEqual(self.serie(99)[0], 403)
        self.assertEqual(self.serie(autorizacion=token(None, "admin"))[0], 403)
        self.assertEqual(self.serie(3, autorizacion=token(2))[1]["puntos"][0]["valor"], 26)
        self.sql("UPDATE dispositivos SET cliente_id = NULL, ubicacion_id = NULL, estado = 'disponible' WHERE id = 1;")
        self.assertEqual(self.serie()[0], 403)

    def test_una_hora_con_lecturas_crudas_y_el_rango(self):
        estado, datos, cabeceras = self.serie(periodo="1h", variable="temperatura")
        self.assertEqual(estado, 200)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual((datos["variable"], datos["periodo"], datos["rango"]),
                         ("temperatura", "1h", {"min": 18, "max": 28}))
        self.assertEqual([p["valor"] for p in datos["puntos"]], [20, 22])
        self.assertRegex(datos["puntos"][0]["fecha"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
        self.assertEqual(self.valores(periodo="1h", variable="humedad"), [40])
        self.assertEqual(self.valores(periodo="1h", variable="calidad_aire"), [0.9])
        self.assertEqual(self.serie(periodo="1h", variable="calidad_aire")[1]["rango"], {"min": 0.5, "max": None})
        self.assertIsNone(self.serie(periodo="1h", variable="presion")[1]["rango"])

    def test_24_horas_por_minuto_y_7_dias_por_hora(self):
        self.assertEqual(self.valores(periodo="24h"), [20, 23, 25])
        self.assertEqual(self.valores(periodo="24h", variable="calidad_aire"), [0.9, 0.7])
        self.assertEqual(self.valores(periodo="7d"), [18, 20.75, 25])
        self.assertEqual(self.valores(periodo="7d", variable="calidad_aire"), [0.8, 0.9, 0.7])

    def test_valores_no_validos(self):
        for filtros, mensaje in (({"periodo": "30d"}, "Periodo no válido."),
                                 ({"variable": "co2"}, "Variable no válida."),):
            with self.subTest(filtros=filtros):
                self.assertEqual(self.serie(**filtros)[:2], (400, {"mensaje": mensaje}))
        self.assertEqual(self.serie("abc")[0], 400)
        estado, datos, _ = self.serie()
        self.assertEqual((estado, datos["periodo"], datos["variable"]), (200, "1h", "temperatura"))


if __name__ == "__main__":
    unittest.main()
