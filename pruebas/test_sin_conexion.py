import time
import unittest

from test_ubicaciones import EntornoHTTP, esperar


RECEPCION = "7f3b2c1a9d4e5f01"


class SinConexionHTTP(EntornoHTTP):
    PREFIJO = "telemon-s74"
    TABS = {"64ab1cac10de0001", RECEPCION}

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        for nodo in prueba:
            if nodo["id"] == "a1e7a5c0de000101":
                nodo["repeat"] = "1"
                nodo["onceDelay"] = "1"
            if nodo["id"] == "a1e7a5c0de000005":
                nodo["wires"] = [["74e5700000000005"]]
        prueba.extend([
            {"id": "74e5700000000001", "type": "http in", "z": RECEPCION, "url": "/__prueba/lecturas",
             "method": "post", "upload": False, "wires": [["74e5700000000002"]]},
            {"id": "74e5700000000002", "type": "function", "z": RECEPCION, "outputs": 2,
             "func": "const trama = { topic: msg.payload.tema, payload: JSON.stringify(msg.payload.lectura) };\n"
                     "msg.statusCode = 202; msg.payload = { recibida: true }; return [trama, msg];",
             "wires": [["1b7d9e3c5a2f8b05"], ["74e5700000000003"]]},
            {"id": "74e5700000000003", "type": "http response", "z": RECEPCION, "statusCode": "",
             "headers": {}, "wires": []},
            {"id": "74e5700000000004", "type": "http in", "z": RECEPCION, "url": "/__prueba/avisos",
             "method": "get", "upload": False, "wires": [["74e5700000000006"]]},
            {"id": "74e5700000000005", "type": "function", "z": RECEPCION, "outputs": 0,
             "func": "global.set('avisos', [...(global.get('avisos') ?? []), msg.payload]);\nreturn null;",
             "wires": []},
            {"id": "74e5700000000006", "type": "function", "z": RECEPCION, "outputs": 1,
             "func": "msg.payload = global.get('avisos') ?? [];\nglobal.set('avisos', []);\nreturn msg;",
             "wires": [["74e5700000000003"]]},
        ])
        return prueba

    def setUp(self):
        super().setUp()
        self.pedir("GET", "/__prueba/avisos")

    def abiertas(self):
        return self.sql("SELECT dispositivo_id, ubicacion_id, mensaje, variable IS NULL FROM alertas "
                        "WHERE tipo = 'SIN_CONEXION' AND cerrada_en IS NULL ORDER BY dispositivo_id;")

    def esperar_alerta(self, esperado, descripcion):
        esperar(lambda: self.abiertas() == esperado, descripcion, segundos=15)

    def avisos(self):
        return self.pedir("GET", "/__prueba/avisos")[1]

    def leer(self, **cambios):
        trama = {"tema": "telemetria/F8B3B72BFC24/lecturas", "lectura": {
            "mac": "F8:B3:B7:2B:FC:24", "ts": int(time.time() * 1000), "uptime": 3605,
            "temperatura": 22, "humedad": 45, "presion": 750, "mq135_v": 0.421, "rssi": -58, "fw": "1.1.0",
            **cambios,
        }}
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", trama)[0], 202)

    def test_abre_una_sola_alerta_pasada_la_espera_y_avisa(self):
        self.sql("UPDATE dispositivos SET ultima_lectura_en = now() - interval '3 minutes' WHERE id = 1;")
        self.esperar_alerta("1|1|No envía datos|t", "apertura de SIN_CONEXION")
        time.sleep(3)
        self.assertEqual(self.sql("SELECT count(*) FROM alertas;"), "1")
        avisos = self.avisos()
        self.assertEqual(len(avisos), 1)
        aviso = avisos[0]
        self.assertEqual((aviso["tipo"], aviso["accion"], aviso["ubicacionId"]), ("alerta", "abierta", 1))
        self.assertEqual({k: aviso["alerta"][k] for k in ("dispositivoId", "nodo", "tipo", "variable", "mensaje",
                                                          "cerradaEn", "peorValor")},
                         {"dispositivoId": 1, "nodo": "Aula 3", "tipo": "SIN_CONEXION", "variable": None,
                          "mensaje": "No envía datos", "cerradaEn": None, "peorValor": None})

    def test_respeta_la_espera_de_cada_ubicacion_y_solo_nodos_en_uso(self):
        self.sql("""
UPDATE ubicaciones SET espera_sin_conexion_s = 300 WHERE id = 1;
UPDATE dispositivos SET ultima_lectura_en = now() - interval '3 minutes' WHERE id = 1;
UPDATE dispositivos SET ultima_lectura_en = now() - interval '1 hour' WHERE id IN (2, 3);
INSERT INTO dispositivos (id, mac_address, codigo, cliente_id, ubicacion_id, nombre, estado)
 VALUES (4, 'AA:AA:AA:AA:AA:04', 'AAAA-AAA4', 1, 2, 'Sin lecturas', 'en_uso');
""")
        time.sleep(4)
        self.assertEqual(self.abiertas(), "")
        self.sql("UPDATE ubicaciones SET espera_sin_conexion_s = 60 WHERE id = 1;")
        self.esperar_alerta("1|1|No envía datos|t", "apertura con espera de 60 s")

    def test_se_cierra_con_la_primera_lectura(self):
        self.sql("UPDATE dispositivos SET ultima_lectura_en = now() - interval '3 minutes' WHERE id = 1;")
        self.esperar_alerta("1|1|No envía datos|t", "apertura de SIN_CONEXION")
        self.avisos()
        self.leer()
        esperar(lambda: self.abiertas() == "", "cierre con la lectura", segundos=10)
        self.assertEqual(self.sql("SELECT motivo_cierre FROM alertas WHERE tipo = 'SIN_CONEXION';"),
                         "volvió a conectarse")
        self.assertEqual(self.sql("SELECT count(*) FROM alertas;"), "1")
        time.sleep(3)
        self.assertEqual(self.abiertas(), "")
        avisos = self.avisos()
        self.assertEqual([(a["accion"], a["alerta"]["tipo"]) for a in avisos], [("cerrada", "SIN_CONEXION")])
        self.assertIsNotNone(avisos[0]["alerta"]["cerradaEn"])

    def test_se_cierra_si_el_monitor_deja_de_estar_en_uso(self):
        self.sql("UPDATE dispositivos SET ultima_lectura_en = now() - interval '3 minutes' WHERE id = 1;")
        self.esperar_alerta("1|1|No envía datos|t", "apertura de SIN_CONEXION")
        self.sql("UPDATE dispositivos SET estado = 'desactivado' WHERE id = 1;")
        self.esperar_alerta("", "cierre al desactivar")
        self.assertEqual(self.sql("SELECT motivo_cierre FROM alertas;"), "monitor fuera de uso")

    def test_cierra_una_alerta_si_la_lectura_llego_sin_cerrarla(self):
        self.sql("""
UPDATE dispositivos SET ultima_lectura_en = now() WHERE id = 1;
INSERT INTO alertas (dispositivo_id, ubicacion_id, tipo, mensaje) VALUES (1, 1, 'SIN_CONEXION', 'No envía datos');
""")
        self.esperar_alerta("", "cierre por la revisión periódica")
        self.assertEqual(self.sql("SELECT motivo_cierre FROM alertas;"), "volvió a conectarse")


if __name__ == "__main__":
    unittest.main()
