"""Integración de #67: inventario → reserva → activación → recepción real.

Ejecutar desde la raíz con `python -B -m unittest discover -s pruebas -p
test_activacion.py -v`. La entrada HTTP de tramas existe solo en estos contenedores
temporales; el flujo de recepción que procesa las tramas es el de producción.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import threading
import time
import unittest

from test_ubicaciones import EntornoHTTP, docker, esperar, token


class ActivacionHTTP(EntornoHTTP):
    PREFIJO = "telemon-s67"
    TABS = {"64ab1cac10de0001", "1a7e0d15c0de0001", "67ac71bac10de001"}
    RUTA = "/api/ubicaciones/1/dispositivos"
    CUERPO = {"codigo": "W3FJ-7KTA", "nombre": "Laboratorio"}

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        recepcion = {"7f3b2c1a9d4e5f01", "1b7d9e3c5a2f8b05", "9e2a4c6f8b1d3e06",
                     "6d3f8a1c2e9b7f07", "2f9b6d4a8c3e1a08", "8a4e2c9f1b6d5c09"}
        for nodo in originales:
            if nodo["id"] in recepcion:
                if nodo["id"] == "8a4e2c9f1b6d5c09":
                    nodo["wires"] = [[]]  # No inicia alertas/WebSocket en esta prueba.
                prueba.append(nodo)
        prueba.extend([
            {"id": "67e5700000000001", "type": "http in", "z": "7f3b2c1a9d4e5f01",
             "url": "/__prueba/lecturas", "method": "post", "upload": False,
             "wires": [["67e5700000000002"]]},
            {"id": "67e5700000000002", "type": "function", "z": "7f3b2c1a9d4e5f01",
             "name": "Entrada exclusiva de prueba", "outputs": 2,
             "func": "const trama = { topic: msg.payload.tema, payload: JSON.stringify(msg.payload.lectura) };\n"
                     "msg.statusCode = 202; msg.payload = { recibida: true }; return [trama, msg];",
             "wires": [["1b7d9e3c5a2f8b05"], ["67e5700000000003"]]},
            {"id": "67e5700000000003", "type": "http response", "z": "7f3b2c1a9d4e5f01",
             "statusCode": "", "headers": {}, "wires": []},
        ])
        return prueba

    def setUp(self):
        self.sql("DROP TRIGGER IF EXISTS fallo_s67 ON eventos_dispositivo; "
                 "DROP FUNCTION IF EXISTS fallo_s67();")
        super().setUp()
        self.sql("""
INSERT INTO usuarios (id, rol_id, cliente_id, nombre, email, password_hash) VALUES
 (1, 2, 1, 'Cliente uno', 'uno@test.local', 'sin-login'),
 (2, 2, 2, 'Cliente dos', 'dos@test.local', 'sin-login'),
 (3, 1, NULL, 'Admin prueba', 'admin@test.local', 'sin-login');
""")

    def activar(self, cuerpo=None, ruta=None, autorizacion="cliente1"):
        return self.pedir("POST", ruta or self.RUTA,
                          self.CUERPO if cuerpo is None else cuerpo, autorizacion)

    def test_activar_normaliza_codigo_y_registra_asignacion_y_evento(self):
        estado, nodo, cabeceras = self.activar({"codigo": " w3fj 7kta ", "nombre": "  Aula d'Ávila  "})
        self.assertEqual(estado, 201)
        self.assertEqual(nodo["id"], 2)
        self.assertEqual(nodo["ubicacionId"], 1)
        self.assertEqual(nodo["nombre"], "Aula d'Ávila")
        self.assertEqual(nodo["estado"], "en_uso")
        self.assertTrue(nodo["esperando"])
        self.assertFalse(nodo["conectado"])
        for campo in ("fecha", "temperatura", "humedad", "presion", "rsR0", "nivelAire"):
            self.assertIsNone(nodo[campo])
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(self.sql("SELECT estado, cliente_id, ubicacion_id, asignado_por, "
                                 "asignado_en IS NOT NULL FROM dispositivos WHERE id = 2;"), "en_uso|1|1|1|t")
        self.assertEqual(self.sql("SELECT texto, usuario_id FROM eventos_dispositivo "
                                 "WHERE dispositivo_id = 2 ORDER BY id DESC LIMIT 1;"),
                         "Activado por el cliente como «Aula d'Ávila»|1")
        estado, listado, _ = self.pedir("GET", self.RUTA)
        self.assertEqual(estado, 200)
        self.assertEqual(next(n for n in listado["nodos"] if n["id"] == 2), nodo)
        self.assertEqual(listado["reservadosSinActivar"], 0)

    def test_get_nodos_reales_aislados_y_reservas_del_cliente(self):
        estado, datos, _ = self.pedir("GET", self.RUTA)
        self.assertEqual(estado, 200)
        self.assertEqual([n["id"] for n in datos["nodos"]], [1])
        self.assertEqual(datos["reservadosSinActivar"], 1)
        self.assertEqual(self.pedir("GET", "/api/ubicaciones/2/dispositivos")[1],
                         {"nodos": [], "reservadosSinActivar": 1})
        for ruta in ("/api/ubicaciones/3/dispositivos", "/api/ubicaciones/2147483647/dispositivos"):
            self.assertEqual(self.pedir("GET", ruta)[0], 403)
            self.assertEqual(self.activar(ruta=ruta)[0], 403)
        datos = self.pedir("GET", "/api/ubicaciones/3/dispositivos",
                           autorizacion=token(2, usuario=2))[1]
        self.assertEqual(datos, {"nodos": [], "reservadosSinActivar": 0})

    def test_sesion_y_rol_en_ambas_rutas(self):
        for metodo, cuerpo in (("GET", None), ("POST", self.CUERPO)):
            for credencial in (None, "invalido", token(vencido=True), token(secreto="otro")):
                with self.subTest(metodo=metodo, credencial=credencial):
                    self.assertEqual(self.pedir(metodo, self.RUTA, cuerpo, credencial)[0], 401)
            for credencial in (token(None, "admin", usuario=3), token(None), token(usuario=None)):
                self.assertEqual(self.pedir(metodo, self.RUTA, cuerpo, credencial)[0], 403)
        self.assertEqual(self.sql("SELECT estado FROM dispositivos WHERE id = 2;"), "reservado")

    def test_validacion_sin_modificar_el_monitor(self):
        invalidos = ({}, [], {"codigo": None, "nombre": "X"}, {"codigo": 12345678, "nombre": "X"},
                     {"codigo": "W3FJ.7KTA", "nombre": "X"}, {"codigo": "W3FJ-7KT", "nombre": "X"},
                     {"codigo": "W3FJ-7KTA", "nombre": ""}, {"codigo": "W3FJ-7KTA", "nombre": " \t "},
                     {"codigo": "W3FJ-7KTA", "nombre": None}, {"codigo": "W3FJ-7KTA", "nombre": 67},
                     {"codigo": "W3FJ-7KTA", "nombre": "X", "cliente_id": 2})
        for cuerpo in invalidos:
            with self.subTest(cuerpo=cuerpo):
                self.assertEqual(self.activar(cuerpo)[0], 400)
        for identificador in ("0", "-1", "1.5", "abc", "01", "2147483648"):
            for metodo in ("GET", "POST"):
                ruta = f"/api/ubicaciones/{identificador}/dispositivos"
                self.assertEqual(self.pedir(metodo, ruta, self.CUERPO if metodo == "POST" else None)[0], 400)
        self.assertEqual(self.sql("SELECT estado, ubicacion_id, asignado_por FROM dispositivos WHERE id = 2;"),
                         "reservado||")
        self.assertEqual(self.sql("SELECT count(*) FROM eventos_dispositivo WHERE dispositivo_id = 2;"), "2")

    def test_codigos_no_reservados_y_estados_no_activables(self):
        self.assertEqual(self.activar({"codigo": "ZZZZ-ZZZZ", "nombre": "X"})[0], 404)
        self.assertEqual(self.activar({"codigo": "M5RY-2QFJ", "nombre": "X"})[0], 403)
        self.sql("UPDATE dispositivos SET cliente_id = 2 WHERE id = 2;")
        self.assertEqual(self.activar()[0], 403)
        for estado in ("en_uso", "desactivado", "retirado"):
            self.sql(f"UPDATE dispositivos SET cliente_id = 1, estado = '{estado}' WHERE id = 2;")
            with self.subTest(estado=estado):
                respuesta, datos, _ = self.activar()
                self.assertEqual(respuesta, 409)
                self.assertIn("mensaje", datos)

    def test_ubicacion_archivada_no_activa_y_sigue_consultable(self):
        self.assertEqual(self.pedir("PATCH", "/api/ubicaciones/1", {"archivada": True})[0], 200)
        estado, datos, _ = self.activar()
        self.assertEqual(estado, 409)
        self.assertIn("archivada", datos["mensaje"])
        self.assertEqual(self.pedir("GET", self.RUTA)[0], 200)
        self.assertEqual(self.sql("SELECT estado FROM dispositivos WHERE id = 2;"), "reservado")

    def test_conexion_y_sensores_usan_la_lectura_de_esa_ubicacion(self):
        self.sql("""
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 1, ubicacion_id = 2, ultima_lectura_en = now()
 WHERE id = 3;
INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora, temperatura, humedad, presion, mq135_v)
 VALUES (3, 1, now(), 22, 50, 750, 0.4);
""")
        nodo = self.pedir("GET", "/api/ubicaciones/2/dispositivos")[1]["nodos"][0]
        self.assertTrue(nodo["esperando"])
        self.assertFalse(nodo["conectado"])
        self.assertIsNone(nodo["fecha"])
        self.sql("INSERT INTO lecturas (dispositivo_id, ubicacion_id, temperatura, humedad, presion, mq135_v) "
                 "VALUES (3, 2, 23.5, 45, NULL, 0.4);")
        nodo = self.pedir("GET", "/api/ubicaciones/2/dispositivos")[1]["nodos"][0]
        self.assertFalse(nodo["esperando"])
        self.assertTrue(nodo["conectado"])
        self.assertEqual(nodo["temperatura"], 23.5)
        self.assertIsNone(nodo["presion"])
        self.assertEqual(nodo["nivelAire"], "sin_calibrar")
        self.sql("UPDATE dispositivos SET estado = 'desactivado' WHERE id = 3;")
        nodo = self.pedir("GET", "/api/ubicaciones/2/dispositivos")[1]["nodos"][0]
        self.assertEqual(nodo["estado"], "desactivado")
        self.assertFalse(nodo["conectado"])

    def test_fallo_del_evento_revierte_la_activacion_completa(self):
        self.sql("""
CREATE FUNCTION fallo_s67() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'DETALLE_INTERNO_S67'; END $$;
CREATE TRIGGER fallo_s67 BEFORE INSERT ON eventos_dispositivo
 FOR EACH ROW EXECUTE FUNCTION fallo_s67();
""")
        estado, datos, _ = self.activar()
        self.assertEqual(estado, 500)
        self.assertIn("mensaje", datos)
        self.assertNotIn("DETALLE_INTERNO_S67", json.dumps(datos))
        self.assertEqual(self.sql("SELECT estado, ubicacion_id, asignado_en, asignado_por "
                                 "FROM dispositivos WHERE id = 2;"), "reservado|||")
        self.assertEqual(self.sql("SELECT count(*) FROM eventos_dispositivo WHERE dispositivo_id = 2;"), "2")

    def simultaneas(self, primera, segunda):
        barrera = threading.Barrier(2)

        def ejecutar(funcion):
            barrera.wait(timeout=5)
            return funcion()

        with ThreadPoolExecutor(max_workers=2) as ejecutor:
            uno = ejecutor.submit(ejecutar, primera)
            dos = ejecutor.submit(ejecutar, segunda)
            return uno.result(timeout=15), dos.result(timeout=15)

    def test_dos_activaciones_simultaneas_solo_asignan_una_vez(self):
        uno, dos = self.simultaneas(self.activar, lambda: self.activar(ruta="/api/ubicaciones/2/dispositivos"))
        self.assertEqual(sorted([uno[0], dos[0]]), [201, 409])
        self.assertEqual(self.sql("SELECT count(*) FROM eventos_dispositivo "
                                 "WHERE dispositivo_id = 2 AND texto LIKE 'Activado por%';"), "1")
        self.assertEqual(self.sql("SELECT estado, asignado_por FROM dispositivos WHERE id = 2;"), "en_uso|1")

    def test_reserva_admin_simultanea_no_cambia_el_dueno_de_un_nodo_activo(self):
        activacion, reserva = self.simultaneas(
            self.activar,
            lambda: self.pedir("PATCH", "/api/admin/dispositivos/2", {"clienteId": 2},
                               token(None, "admin", usuario=3)),
        )
        self.assertIn((activacion[0], reserva[0]), {(201, 409), (403, 200)})
        actual = self.sql("SELECT estado, cliente_id, ubicacion_id FROM dispositivos WHERE id = 2;")
        self.assertEqual(actual, "en_uso|1|1" if activacion[0] == 201 else "reservado|2|")

    def test_archivar_simultaneo_se_serializa_con_la_activacion(self):
        activacion, archivo = self.simultaneas(
            self.activar, lambda: self.pedir("PATCH", "/api/ubicaciones/1", {"archivada": True}),
        )
        self.assertEqual(archivo[0], 200)
        self.assertIn(activacion[0], {201, 409})
        self.assertEqual(self.sql("SELECT archivada FROM ubicaciones WHERE id = 1;"), "t")
        self.assertEqual(self.sql("SELECT estado FROM dispositivos WHERE id = 2;"),
                         "en_uso" if activacion[0] == 201 else "reservado")

    def test_registrar_reservar_activar_y_guardar_primera_lectura(self):
        admin = token(None, "admin", usuario=3)
        estado, monitor, _ = self.pedir("POST", "/api/admin/dispositivos",
                                      {"mac": "AA:BB:CC:DD:EE:67"}, admin)
        self.assertEqual(estado, 201)
        self.assertEqual(monitor["estado"], "disponible")
        identificador = monitor["id"]
        estado, reservado, _ = self.pedir("PATCH", f"/api/admin/dispositivos/{identificador}",
                                        {"clienteId": 1}, admin)
        self.assertEqual(estado, 200)
        self.assertEqual(reservado["estado"], "reservado")
        trama = {"tema": "telemetria/AABBCCDDEE67/lecturas", "lectura": {
            "mac": "AA:BB:CC:DD:EE:67", "ts": int(time.time() * 1000), "uptime": 3605,
            "temperatura": 24.5, "humedad": 45, "presion": 750, "mq135_v": 0.421,
            "rssi": -58, "fw": "1.1.0",
        }}
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", trama)[0], 202)
        esperar(lambda: "Monitor AA:BB:CC:DD:EE:67 en estado reservado" in docker("logs", self.nodered),
                "descarte real de la trama del monitor reservado", segundos=10)
        self.assertEqual(self.sql(f"SELECT count(*) FROM lecturas WHERE dispositivo_id = {identificador};"), "0")
        estado, nodo, _ = self.activar({"codigo": reservado["codigo"].lower().replace("-", ""),
                                      "nombre": "Estación de prueba"})
        self.assertEqual(estado, 201)
        self.assertEqual(nodo["id"], identificador)
        trama["lectura"]["ts"] = int(time.time() * 1000)
        self.assertEqual(self.pedir("POST", "/__prueba/lecturas", trama)[0], 202)
        esperar(lambda: self.sql(f"SELECT count(*) FROM lecturas WHERE dispositivo_id = {identificador};") == "1",
                "guardado real de la primera lectura", segundos=10)
        self.assertEqual(self.sql(f"SELECT ubicacion_id, temperatura FROM lecturas "
                                 f"WHERE dispositivo_id = {identificador};"), "1|24.50")
        nodos = self.pedir("GET", self.RUTA)[1]["nodos"]
        real = next(n for n in nodos if n["id"] == identificador)
        self.assertTrue(real["conectado"])
        self.assertFalse(real["esperando"])
        self.assertEqual(real["temperatura"], 24.5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
