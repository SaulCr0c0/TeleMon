import re
import unittest

from test_ubicaciones import EntornoHTTP, token


ADMIN = token(None, "admin", usuario=3)
RUTA = "/api/admin/dispositivos"


class FichaMonitorHTTP(EntornoHTTP):
    PREFIJO = "telemon-s70"
    TABS = {"5e5104a1c0de0001", "64ab1cac10de0001", "1a7e0d15c0de0001", "67ac71bac10de001"}

    def setUp(self):
        super().setUp()
        self.sql("""
INSERT INTO usuarios (id, rol_id, cliente_id, nombre, email, password_hash) VALUES
 (1, 2, 1, 'Ana Rojas', 'uno@test.local', 'sin-login'),
 (3, 1, NULL, 'Equipo TeleMon', 'admin@test.local', 'sin-login');
UPDATE dispositivos SET ultima_lectura_en = now(), ultimo_rssi = -58, fw = '1.1.0' WHERE id = 1;
INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora, ts_dispositivo, latencia_ms,
                      temperatura, humedad, presion, mq135_v) VALUES
 (1, 1, now() - interval '1 minute', NULL, 300, 20, 40, 750, 0.5),
 (1, 1, now(), now(), 84, 22.8, NULL, 748.4, 0.62);
""")

    def admin(self, metodo, ruta, cuerpo=None):
        return self.pedir(metodo, ruta, cuerpo, ADMIN)

    def eventos(self, dispositivo):
        return self.sql(f"SELECT texto, usuario_id FROM eventos_dispositivo WHERE dispositivo_id = {dispositivo} "
                        "ORDER BY id DESC LIMIT 1;")

    def test_rutas_solo_para_el_admin(self):
        for metodo, ruta, cuerpo in (
            ("GET", f"{RUTA}/1", None), ("PATCH", f"{RUTA}/1", {"r0": 10}),
            ("POST", f"{RUTA}/1/liberar", None), ("POST", f"{RUTA}/1/retirar", None),
        ):
            with self.subTest(metodo=metodo, ruta=ruta):
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, None)[0], 401)
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, token(1))[0], 403)
        self.assertEqual(self.sql("SELECT estado, mq135_r0_kohm IS NULL FROM dispositivos WHERE id = 1;"),
                         "en_uso|t")

    def test_ficha_de_un_monitor_en_linea(self):
        estado, m, cabeceras = self.admin("GET", f"{RUTA}/1")
        self.assertEqual(estado, 200)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual((m["id"], m["mac"], m["estado"], m["cliente"], m["ubicacion"], m["nodo"], m["conexion"]),
                         (1, "F8:B3:B7:2B:FC:24", "en_uso", "Red Escolar Valle Alto", "Escuela Adela Zamudio",
                          "Aula 3", "en_linea"))
        self.assertEqual(m["tecnico"], {"latenciaMs": 84, "ntp": True, "rssi": -58, "fw": "1.1.0"})
        self.assertEqual([(s["nombre"], s["estado"]) for s in m["sensores"]],
                         [("DS18B20", "responde"), ("DHT11", "sin_datos"), ("BMP280", "responde"),
                          ("MQ-135", "sin_calibrar")])
        self.assertEqual([e["texto"] for e in m["eventos"]],
                         ["Activado por el cliente como «Aula 3»", "Reservado para Red Escolar Valle Alto",
                          "Registrado con el código H7QD-4MXA"])
        self.assertRegex(m["eventos"][0]["fecha"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")

    def test_ficha_sin_conexion_o_inexistente(self):
        estado, m, _ = self.admin("GET", f"{RUTA}/3")
        self.assertEqual((estado, m["conexion"]), (200, "nunca"))
        self.assertEqual(m["tecnico"], {"latenciaMs": None, "ntp": False, "rssi": None, "fw": None})
        self.assertEqual({s["estado"] for s in m["sensores"]}, {"sin_datos"})
        self.sql("UPDATE dispositivos SET ultima_lectura_en = now() - interval '1 hour' WHERE id = 1;")
        m = self.admin("GET", f"{RUTA}/1")[1]
        self.assertEqual((m["conexion"], m["tecnico"]["latenciaMs"], m["tecnico"]["fw"]), ("sin_conexion", None, "1.1.0"))
        self.assertEqual(self.admin("GET", f"{RUTA}/99")[:2], (404, {"mensaje": "Monitor no encontrado."}))
        self.assertEqual(self.admin("GET", f"{RUTA}/abc")[0], 400)

    def test_r0_y_notas(self):
        for valor in (0, -1, "41.2", None, "abc", True, 100000):
            with self.subTest(r0=valor):
                self.assertEqual(self.admin("PATCH", f"{RUTA}/1", {"r0": valor})[:2],
                                 (400, {"mensaje": "R0 debe ser un número mayor que 0."}))
        self.assertEqual(self.sql("SELECT count(*) FROM eventos_dispositivo WHERE dispositivo_id = 1;"), "3")
        estado, m, _ = self.admin("PATCH", f"{RUTA}/1", {"r0": 41.25})
        self.assertEqual((estado, m["r0"]), (200, 41.25))
        self.assertEqual(self.eventos(1), "R0 del MQ-135 cargado: 41.25 kΩ|3")
        self.assertEqual(self.admin("GET", f"{RUTA}/1")[1]["sensores"][3]["estado"], "responde")
        estado, m, _ = self.admin("PATCH", f"{RUTA}/1", {"notas": "  Cambiar el cable del DHT11  "})
        self.assertEqual((estado, m["notas"], m["r0"]), (200, "Cambiar el cable del DHT11", 41.25))
        self.assertEqual(self.eventos(1), "Notas actualizadas|3")
        self.assertEqual(self.admin("PATCH", f"{RUTA}/1", {"notas": 5})[0], 400)
        self.assertEqual(self.admin("PATCH", f"{RUTA}/1", {"r0": 10, "clienteId": 1})[0], 400)
        self.assertEqual(self.admin("PATCH", f"{RUTA}/99", {"r0": 10})[0], 404)
        self.assertEqual(self.admin("PATCH", f"{RUTA}/2", {"clienteId": None})[1]["estado"], "disponible")

    def test_liberar_solo_un_monitor_desactivado(self):
        for dispositivo in (1, 2, 3):
            self.assertEqual(self.admin("POST", f"{RUTA}/{dispositivo}/liberar")[:2],
                             (409, {"mensaje": "Solo se puede liberar un monitor desactivado."}))
        self.assertEqual(self.admin("POST", f"{RUTA}/99/liberar")[0], 404)
        self.sql("UPDATE dispositivos SET estado = 'desactivado' WHERE id = 1;")
        estado, m, _ = self.admin("POST", f"{RUTA}/1/liberar")
        self.assertEqual(estado, 200)
        self.assertEqual((m["estado"], m["clienteId"], m["ubicacion"], m["nodo"]), ("disponible", None, None, None))
        self.assertNotEqual(m["codigo"], "H7QD-4MXA")
        self.assertRegex(m["codigo"], r"^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$")
        self.assertEqual(self.eventos(1), f"Liberado. Código nuevo {m['codigo']}|3")
        self.assertEqual(self.sql("SELECT ubicacion_id, asignado_en, asignado_por FROM dispositivos WHERE id = 1;"), "||")
        self.assertEqual(self.sql("SELECT count(*) FROM lecturas WHERE dispositivo_id = 1;"), "2")
        self.assertEqual(self.admin("PATCH", f"{RUTA}/1", {"clienteId": 2})[1]["estado"], "reservado")

    def test_retirar_es_definitivo(self):
        self.assertEqual(self.admin("POST", f"{RUTA}/1/retirar")[0], 409)
        estado, m, _ = self.admin("POST", f"{RUTA}/2/retirar")
        self.assertEqual((estado, m["estado"], m["clienteId"]), (200, "retirado", None))
        self.assertEqual(self.eventos(2), "Retirado. Código anulado|3")
        self.assertEqual(self.admin("POST", f"{RUTA}/2/retirar")[0], 409)
        self.assertEqual(self.admin("POST", f"{RUTA}/2/liberar")[0], 409)
        self.assertEqual(self.admin("PATCH", f"{RUTA}/2", {"clienteId": 1})[0], 409)
        self.assertEqual(self.pedir("POST", "/api/ubicaciones/1/dispositivos",
                                    {"codigo": "W3FJ-7KTA", "nombre": "Laboratorio"})[:2],
                         (403, {"mensaje": "Este código no está disponible para tu cuenta."}))
        self.assertEqual(self.sql("SELECT estado FROM dispositivos WHERE id = 2;"), "retirado")
        self.sql("UPDATE dispositivos SET estado = 'desactivado' WHERE id = 1;")
        self.assertEqual(self.admin("POST", f"{RUTA}/1/retirar")[1]["estado"], "retirado")
        self.assertEqual(self.admin("POST", f"{RUTA}/3/retirar")[1]["estado"], "retirado")


if __name__ == "__main__":
    unittest.main()
