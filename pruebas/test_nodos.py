import time
import unittest

from test_ubicaciones import EntornoHTTP, docker, esperar, token


RECEPCION = "7f3b2c1a9d4e5f01"
RUTA = "/api/dispositivos/1"


class NodosHTTP(EntornoHTTP):
    PREFIJO = "telemon-s75"
    TABS = {"64ab1cac10de0001", "67ac71bac10de001", RECEPCION}

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        for nodo in prueba:
            if nodo["id"] == "a1e7a5c0de000005":
                nodo["wires"] = [[]]
        prueba.extend([
            {"id": "75e5700000000001", "type": "http in", "z": RECEPCION, "url": "/__prueba/lecturas",
             "method": "post", "upload": False, "wires": [["75e5700000000002"]]},
            {"id": "75e5700000000002", "type": "function", "z": RECEPCION, "outputs": 2,
             "func": "const trama = { topic: msg.payload.tema, payload: JSON.stringify(msg.payload.lectura) };\n"
                     "msg.statusCode = 202; msg.payload = { recibida: true }; return [trama, msg];",
             "wires": [["1b7d9e3c5a2f8b05"], ["75e5700000000003"]]},
            {"id": "75e5700000000003", "type": "http response", "z": RECEPCION, "statusCode": "",
             "headers": {}, "wires": []},
        ])
        return prueba

    def setUp(self):
        super().setUp()
        self.sql("""
INSERT INTO usuarios (id, rol_id, cliente_id, nombre, email, password_hash) VALUES
 (1, 2, 1, 'Ana Rojas', 'uno@test.local', 'sin-login'),
 (2, 2, 2, 'Carla Mendoza', 'dos@test.local', 'sin-login');
INSERT INTO ubicaciones (id, cliente_id, nombre, archivada) VALUES (4, 1, 'Depósito viejo', true);
INSERT INTO alertas (dispositivo_id, ubicacion_id, tipo, variable, mensaje) VALUES
 (1, 1, 'UMBRAL', 'temperatura', 'Temperatura sobre el máximo (28 °C)');
""")

    def cambiar(self, cuerpo, ruta=RUTA, autorizacion="cliente1"):
        return self.pedir("PATCH", ruta, cuerpo, autorizacion)

    def leer(self, temperatura):
        lectura = {"mac": "F8:B3:B7:2B:FC:24", "ts": int(time.time() * 1000), "uptime": 3605,
                   "temperatura": temperatura, "humedad": 45, "presion": 750, "mq135_v": 0.421, "rssi": -58,
                   "fw": "1.1.0"}
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", {"tema": "telemetria/F8B3B72BFC24/lecturas",
                                                                  "lectura": lectura})[0], 202)

    def ultimo_evento(self):
        return self.sql("SELECT texto, usuario_id FROM eventos_dispositivo WHERE dispositivo_id = 1 "
                        "ORDER BY id DESC LIMIT 1;")

    def test_sesion_y_aislamiento(self):
        self.assertEqual(self.cambiar({"nombre": "X"}, autorizacion=None)[0], 401)
        self.assertEqual(self.cambiar({"nombre": "X"}, autorizacion=token(2))[:2], (403, {"mensaje": "No tienes permiso."}))
        self.assertEqual(self.cambiar({"nombre": "X"}, autorizacion=token(None, "admin"))[0], 403)
        self.assertEqual(self.cambiar({"nombre": "X"}, "/api/dispositivos/99")[0], 403)
        self.assertEqual(self.cambiar({"ubicacionId": 3})[:2], (403, {"mensaje": "No tienes permiso."}))
        self.assertEqual(self.cambiar({"nombre": "X"}, "/api/dispositivos/2")[:2],
                         (409, {"mensaje": "Este nodo no está activo en tu cuenta."}))
        self.assertEqual(self.sql("SELECT nombre, ubicacion_id, estado FROM dispositivos WHERE id = 1;"),
                         "Aula 3|1|en_uso")

    def test_renombrar(self):
        estado, nodo, cabeceras = self.cambiar({"nombre": "  Laboratorio  "})
        self.assertEqual((estado, nodo), (200, {"id": 1, "ubicacionId": 1, "nombre": "Laboratorio", "estado": "en_uso"}))
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(self.ultimo_evento(), "Renombrado de «Aula 3» a «Laboratorio»|1")
        self.assertEqual(self.sql("SELECT count(*) FROM alertas WHERE cerrada_en IS NULL;"), "1")
        antes = self.sql("SELECT count(*) FROM eventos_dispositivo;")
        self.assertEqual(self.cambiar({"nombre": "Laboratorio"})[0], 200)
        self.assertEqual(self.sql("SELECT count(*) FROM eventos_dispositivo;"), antes)

    def test_mover_lleva_las_lecturas_nuevas_al_destino(self):
        self.leer(30)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas;") == "1", "lectura en el origen", 10)
        estado, nodo, _ = self.cambiar({"ubicacionId": 2})
        self.assertEqual((estado, nodo["ubicacionId"]), (200, 2))
        self.assertEqual(self.ultimo_evento(),
                         "Movido de «Escuela Adela Zamudio» a «Salón de maestros, Escuela Avaroa»|1")
        self.assertEqual(self.sql("SELECT motivo_cierre FROM alertas;"), "nodo movido")
        self.leer(23)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas;") == "2", "lectura en el destino", 10)
        self.assertEqual(self.sql("SELECT ubicacion_id, temperatura FROM lecturas ORDER BY id;").splitlines(),
                         ["1|30.00", "2|23.00"])
        self.assertEqual(self.cambiar({"ubicacionId": 4})[:2],
                         (409, {"mensaje": "No se puede mover a una ubicación archivada."}))

    def test_desactivar_deja_de_guardar_y_reactivar_vuelve(self):
        estado, nodo, _ = self.cambiar({"estado": "desactivado"})
        self.assertEqual((estado, nodo["estado"]), (200, "desactivado"))
        self.assertEqual(self.sql("SELECT motivo_cierre FROM alertas;"), "nodo desactivado")
        self.assertEqual(self.ultimo_evento(), "Desactivado por el cliente|1")
        self.leer(21)
        esperar(lambda: "en estado desactivado" in docker("logs", self.nodered), "descarte de la lectura", 10)
        self.assertEqual(self.sql("SELECT count(*) FROM lecturas;"), "0")
        listado = self.pedir("GET", "/api/ubicaciones/1/dispositivos")[1]["nodos"]
        self.assertEqual([(n["id"], n["estado"]) for n in listado], [(1, "desactivado")])
        self.assertEqual(self.cambiar({"estado": "en_uso"})[1]["estado"], "en_uso")
        self.assertEqual(self.ultimo_evento(), "Reactivado por el cliente|1")
        self.leer(22)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas;") == "1", "lectura tras reactivar", 10)

    def test_varios_cambios_juntos_y_valores_invalidos(self):
        estado, nodo, _ = self.cambiar({"nombre": "Patio", "ubicacionId": 2, "estado": "desactivado"})
        self.assertEqual((estado, nodo), (200, {"id": 1, "ubicacionId": 2, "nombre": "Patio", "estado": "desactivado"}))
        self.assertEqual(self.sql("SELECT texto FROM eventos_dispositivo WHERE dispositivo_id = 1 "
                                  "ORDER BY id DESC LIMIT 3;").splitlines(),
                         ["Desactivado por el cliente",
                          "Movido de «Escuela Adela Zamudio» a «Salón de maestros, Escuela Avaroa»",
                          "Renombrado de «Aula 3» a «Patio»"])
        for cuerpo, mensaje in (
            ({}, "No hay cambios que guardar."), ({"nombre": "  "}, "Escribe el nombre del nodo."),
            ({"nombre": "x" * 61}, "El nombre puede tener hasta 60 caracteres."),
            ({"estado": "retirado"}, "Estado no válido."), ({"ubicacionId": "2"}, "Ubicación no válida."),
            ({"mac": "AA"}, "La petición contiene campos no permitidos."),
        ):
            with self.subTest(cuerpo=cuerpo):
                self.assertEqual(self.cambiar(cuerpo)[:2], (400, {"mensaje": mensaje}))
        self.assertEqual(self.cambiar({"nombre": "X"}, "/api/dispositivos/abc")[0], 400)


if __name__ == "__main__":
    unittest.main()
