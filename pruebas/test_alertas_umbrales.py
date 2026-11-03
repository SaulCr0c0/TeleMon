import time
import unittest

from test_ubicaciones import EntornoHTTP, esperar, token


RECEPCION = "7f3b2c1a9d4e5f01"
UMBRALES = {"temperatura": {"min": 18, "max": 28}, "humedad": {"min": 30, "max": 60},
            "presion": {"min": 740, "max": 760}, "calidadAire": "malo", "esperaSinConexionS": 120}


class AlertasUmbralesHTTP(EntornoHTTP):
    PREFIJO = "telemon-s72"
    TABS = {"64ab1cac10de0001", "a7e2b1a5c0de0001", RECEPCION}

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        for nodo in prueba:
            if nodo["id"] == "a1e7a5c0de000005":
                nodo["wires"] = [[]]
        prueba.extend([
            {"id": "72e5700000000001", "type": "http in", "z": RECEPCION, "url": "/__prueba/lecturas",
             "method": "post", "upload": False, "wires": [["72e5700000000002"]]},
            {"id": "72e5700000000002", "type": "function", "z": RECEPCION, "outputs": 2,
             "func": "const trama = { topic: msg.payload.tema, payload: JSON.stringify(msg.payload.lectura) };\n"
                     "msg.statusCode = 202; msg.payload = { recibida: true }; return [trama, msg];",
             "wires": [["1b7d9e3c5a2f8b05"], ["72e5700000000003"]]},
            {"id": "72e5700000000003", "type": "http response", "z": RECEPCION, "statusCode": "",
             "headers": {}, "wires": []},
        ])
        return prueba

    def setUp(self):
        super().setUp()
        self.sql("""
INSERT INTO usuarios (id, rol_id, cliente_id, nombre, email, password_hash) VALUES
 (1, 2, 1, 'Ana Rojas', 'uno@test.local', 'sin-login'),
 (2, 2, 2, 'Carla Mendoza', 'dos@test.local', 'sin-login');
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 2, ubicacion_id = 3, nombre = 'Vivero' WHERE id = 3;
INSERT INTO alertas (dispositivo_id, ubicacion_id, tipo, variable, mensaje, peor_valor, abierta_en, cerrada_en,
                     motivo_cierre) VALUES
 (1, 1, 'UMBRAL', 'temperatura', 'Temperatura sobre el máximo (28 °C)', 31.5, now() - interval '10 minutes', NULL, NULL),
 (1, 1, 'SIN_CONEXION', NULL, 'No envía datos', NULL, now() - interval '2 hours', now() - interval '1 hour', 'volvió a conectarse'),
 (1, 1, 'SENSOR', 'presion', 'Presión sin respuesta', NULL, now() - interval '3 hours', now() - interval '30 minutes', 'el sensor volvió a responder'),
 (3, 3, 'UMBRAL', 'humedad', 'Humedad bajo el mínimo (40 %)', 35, now() - interval '5 minutes', NULL, NULL);
""")

    def leer(self, **valores):
        lectura = {"mac": "F8:B3:B7:2B:FC:24", "ts": int(time.time() * 1000), "uptime": 3605,
                   "temperatura": 22, "humedad": 45, "presion": 750, "mq135_v": 0.421, "rssi": -58,
                   "fw": "1.1.0", **valores}
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", {"tema": "telemetria/F8B3B72BFC24/lecturas",
                                                                  "lectura": lectura})[0], 202)

    def test_sesion_y_aislamiento(self):
        for metodo, ruta, cuerpo in (("GET", "/api/ubicaciones/1/alertas", None),
                                     ("GET", "/api/ubicaciones/1/umbrales", None),
                                     ("PUT", "/api/ubicaciones/1/umbrales", UMBRALES)):
            with self.subTest(metodo=metodo, ruta=ruta):
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, None)[0], 401)
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, token(2))[:2], (403, {"mensaje": "No tienes permiso."}))
                self.assertEqual(self.pedir(metodo, ruta, cuerpo, token(None, "admin"))[0], 403)
                self.assertEqual(self.pedir(metodo, ruta.replace("/1/", "/99/"), cuerpo)[0], 403)
        self.assertEqual(self.sql("SELECT espera_sin_conexion_s FROM ubicaciones WHERE id = 1;"), "120")

    def test_alertas_abiertas_y_cerradas(self):
        estado, abiertas, cabeceras = self.pedir("GET", "/api/ubicaciones/1/alertas?estado=abiertas")
        self.assertEqual(estado, 200)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(len(abiertas), 1)
        a = abiertas[0]
        self.assertEqual({k: a[k] for k in ("ubicacionId", "dispositivoId", "nodo", "tipo", "variable", "mensaje",
                                            "cerradaEn", "peorValor")},
                         {"ubicacionId": 1, "dispositivoId": 1, "nodo": "Aula 3", "tipo": "UMBRAL",
                          "variable": "temperatura", "mensaje": "Temperatura sobre el máximo (28 °C)",
                          "cerradaEn": None, "peorValor": "31.5 °C"})
        self.assertRegex(a["abiertaEn"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
        cerradas = self.pedir("GET", "/api/ubicaciones/1/alertas?estado=cerradas")[1]
        self.assertEqual([(c["tipo"], c["peorValor"]) for c in cerradas], [("SENSOR", None), ("SIN_CONEXION", None)])
        self.assertTrue(all(c["cerradaEn"] for c in cerradas))
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/1/alertas")[1], abiertas)
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/2/alertas")[:2], (200, []))
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/1/alertas?estado=todas")[:2],
                         (400, {"mensaje": "Estado no válido."}))
        self.assertEqual([x["nodo"] for x in self.pedir("GET", "/api/ubicaciones/3/alertas",
                                                         autorizacion=token(2))[1]], ["Vivero"])

    def test_leer_umbrales(self):
        estado, datos, _ = self.pedir("GET", "/api/ubicaciones/1/umbrales")
        self.assertEqual(estado, 200)
        self.assertEqual({k: datos[k] for k in UMBRALES}, UMBRALES)
        self.assertIsNone(datos["actualizadoPor"])
        self.assertRegex(datos["actualizadoEn"], r"^\d{4}-")

    def test_guardar_umbrales(self):
        nuevos = {**UMBRALES, "temperatura": {"min": 15.5, "max": 25}, "calidadAire": "moderado",
                  "esperaSinConexionS": 60}
        estado, datos, _ = self.pedir("PUT", "/api/ubicaciones/1/umbrales", nuevos)
        self.assertEqual(estado, 200)
        self.assertEqual({k: datos[k] for k in UMBRALES}, nuevos)
        self.assertEqual(datos["actualizadoPor"], "Ana Rojas")
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/1/umbrales")[1], datos)
        self.assertEqual(self.sql("SELECT variable, valor_min, valor_max, activo, actualizado_por FROM umbrales "
                                  "WHERE ubicacion_id = 1 ORDER BY variable;").splitlines(), [
            "calidad_aire|0.80||t|1", "humedad|30.00|60.00|t|1", "presion|740.00|760.00|t|1",
            "temperatura|15.50|25.00|t|1"])
        self.assertEqual(self.sql("SELECT espera_sin_conexion_s FROM ubicaciones WHERE id = 1;"), "60")
        self.assertEqual(self.pedir("PUT", "/api/ubicaciones/1/umbrales", {**nuevos, "calidadAire": "nunca"})[1]
                         ["calidadAire"], "nunca")
        self.assertEqual(self.sql("SELECT valor_min, activo FROM umbrales WHERE ubicacion_id = 1 "
                                  "AND variable = 'calidad_aire';"), "0.80|f")
        self.assertEqual(self.sql("SELECT count(*) FROM umbrales WHERE ubicacion_id = 2 AND actualizado_por = 1;"), "0")

    def test_valores_invalidos(self):
        for cambios, mensaje in (
            ({"temperatura": {"min": 30, "max": 20}}, "El mínimo de la temperatura debe ser menor que el máximo."),
            ({"humedad": {"min": 50, "max": 50}}, "El mínimo de la humedad debe ser menor que el máximo."),
            ({"presion": {"min": "740", "max": 760}}, "Completa el mínimo y el máximo de la presión con números."),
            ({"temperatura": None}, "Completa el mínimo y el máximo de la temperatura con números."),
            ({"calidadAire": "bueno"}, "Elige cuándo alertar por la calidad del aire."),
            ({"esperaSinConexionS": 90}, "La espera debe ser de 30 segundos, 1, 2 o 5 minutos."),
            ({"esperaSinConexionS": "120"}, "La espera debe ser de 30 segundos, 1, 2 o 5 minutos."),
        ):
            with self.subTest(cambios=cambios):
                self.assertEqual(self.pedir("PUT", "/api/ubicaciones/1/umbrales", {**UMBRALES, **cambios})[:2],
                                 (400, {"mensaje": mensaje}))
        self.assertEqual(self.sql("SELECT count(*) FROM umbrales WHERE actualizado_por IS NOT NULL;"), "0")

    def test_los_umbrales_nuevos_valen_desde_la_siguiente_lectura(self):
        self.sql("DELETE FROM alertas;")
        self.leer(temperatura=26)
        self.leer(temperatura=26)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas;") == "2", "dos lecturas guardadas", 10)
        self.assertEqual(self.sql("SELECT count(*) FROM alertas;"), "0")
        self.pedir("PUT", "/api/ubicaciones/1/umbrales", {**UMBRALES, "temperatura": {"min": 18, "max": 25}})
        self.leer(temperatura=26)
        self.leer(temperatura=26.5)
        esperar(lambda: self.sql("SELECT count(*) FROM alertas WHERE cerrada_en IS NULL;") == "1",
                "alerta con el umbral nuevo", 10)
        abiertas = self.pedir("GET", "/api/ubicaciones/1/alertas")[1]
        self.assertEqual([(a["tipo"], a["mensaje"]) for a in abiertas],
                         [("UMBRAL", "Temperatura sobre el máximo (25 °C)")])


if __name__ == "__main__":
    unittest.main()
