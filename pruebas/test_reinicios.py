import time
import unittest

from test_ubicaciones import EntornoHTTP, esperar


RECEPCION = "7f3b2c1a9d4e5f01"


class ReiniciosHTTP(EntornoHTTP):
    PREFIJO = "telemon-s76"
    TABS = {"64ab1cac10de0001", RECEPCION}

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        for nodo in prueba:
            if nodo["id"] == "a1e7a5c0de000005":
                nodo["wires"] = [[]]
        prueba.extend([
            {"id": "76e5700000000001", "type": "http in", "z": RECEPCION, "url": "/__prueba/lecturas",
             "method": "post", "upload": False, "wires": [["76e5700000000002"]]},
            {"id": "76e5700000000002", "type": "function", "z": RECEPCION, "outputs": 2,
             "func": "const trama = { topic: msg.payload.tema, payload: JSON.stringify(msg.payload.lectura) };\n"
                     "msg.statusCode = 202; msg.payload = { recibida: true }; return [trama, msg];",
             "wires": [["1b7d9e3c5a2f8b05"], ["76e5700000000003"]]},
            {"id": "76e5700000000003", "type": "http response", "z": RECEPCION, "statusCode": "",
             "headers": {}, "wires": []},
        ])
        return prueba

    def leer(self, uptime):
        total = int(self.sql("SELECT count(*) FROM lecturas;"))
        lectura = {"mac": "F8:B3:B7:2B:FC:24", "ts": int(time.time() * 1000), "uptime": uptime,
                   "temperatura": 22, "humedad": 45, "presion": 750, "mq135_v": 0.421, "rssi": -58, "fw": "1.1.0"}
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", {"tema": "telemetria/F8B3B72BFC24/lecturas",
                                                                  "lectura": lectura})[0], 202)
        esperar(lambda: int(self.sql("SELECT count(*) FROM lecturas;")) == total + 1, "lectura guardada", 10)

    def reinicios(self):
        return int(self.sql("SELECT count(*) FROM eventos_dispositivo WHERE dispositivo_id = 1 "
                            "AND texto = 'Reinicio del monitor';"))

    def test_anota_un_evento_cuando_el_uptime_vuelve_a_empezar(self):
        self.leer(100)
        self.assertEqual(self.reinicios(), 0)
        self.leer(105)
        self.assertEqual(self.reinicios(), 0)
        self.leer(3)
        self.assertEqual(self.reinicios(), 1)
        self.assertEqual(self.sql("SELECT usuario_id IS NULL FROM eventos_dispositivo WHERE texto = "
                                  "'Reinicio del monitor';"), "t")
        self.leer(8)
        self.leer(13)
        self.assertEqual(self.reinicios(), 1)
        self.assertEqual(self.sql("SELECT ultimo_uptime_s FROM dispositivos WHERE id = 1;"), "13")
        self.assertEqual(self.sql("SELECT count(*) FROM alertas;"), "0")

    def test_sin_uptime_o_primera_lectura_no_cuenta(self):
        self.leer(50)
        self.assertEqual(self.reinicios(), 0)
        self.leer(None)
        self.assertEqual(self.reinicios(), 0)
        self.assertEqual(self.sql("SELECT ultimo_uptime_s FROM dispositivos WHERE id = 1;"), "50")
        self.leer(2)
        self.assertEqual(self.reinicios(), 1)


if __name__ == "__main__":
    unittest.main()
