import time
import unittest

from test_ubicaciones import RAIZ, EntornoHTTP, esperar


BASE = "da7ab45ec0de0001"


class AgregacionHTTP(EntornoHTTP):
    PREFIJO = "telemon-s45"
    TABS = {"64ab1cac10de0001", BASE}
    AUTOMATICO = False

    @classmethod
    def preparar_flujos(cls, prueba, originales):
        for nodo in prueba:
            if nodo["id"] in ("da7ab45ec0de0002", "da7ab45ec0de0006"):
                nodo.update({"repeat": "1" if cls.AUTOMATICO else "", "crontab": "", "once": cls.AUTOMATICO,
                             "onceDelay": "1"})
        return prueba

    def setUp(self):
        while time.time() % 60 > 50:
            time.sleep(0.5)
        super().setUp()
        self.sql((RAIZ / "database/03_agregacion.sql").read_text(encoding="utf-8"))
        self.sql("UPDATE dispositivos SET estado = 'en_uso', cliente_id = 1, ubicacion_id = 1 WHERE id = 2;")

    def leer(self, dispositivo, hace, temperatura=20, humedad=40, presion=750, rs_r0=0.9, ubicacion=1):
        self.sql(f"INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora, temperatura, humedad, presion, "
                 f"rs_r0) VALUES ({dispositivo}, {ubicacion}, {hace}, {temperatura}, {humedad}, {presion}, "
                 f"{rs_r0});")

    def minutos(self, dispositivo=1):
        return self.sql("SELECT round(extract(epoch FROM date_trunc('minute', now()) - minuto) / 60), "
                        "ubicacion_id, temp_avg, temp_min, temp_max, hum_avg, hum_min, hum_max, pres_avg, "
                        "rs_r0_avg, rs_r0_min, n_lecturas FROM lecturas_minuto "
                        f"WHERE dispositivo_id = {dispositivo} ORDER BY minuto;").splitlines()


class FuncionesSQL(AgregacionHTTP):
    def test_una_fila_por_nodo_y_minuto_cerrado(self):
        uno = "date_trunc('minute', now()) - interval '2 minutes'"
        for segundos, temperatura, humedad in ((5, 20, 40), (25, 22, "NULL"), (45, 27, 44)):
            self.leer(1, f"{uno} + interval '{segundos} seconds'", temperatura, humedad, rs_r0=0.8)
        self.leer(1, f"{uno} + interval '70 seconds'", 30, ubicacion=2)
        self.leer(2, f"{uno} + interval '10 seconds'", 18)
        self.leer(1, "date_trunc('minute', now()) + interval '1 second'", 99)
        self.assertEqual(self.sql("SELECT agregar_lecturas_minuto();"), "3")
        self.assertEqual(self.minutos(1), [
            "2|1|23.00|20.00|27.00|42.00|40.00|44.00|750.00|0.800|0.800|3",
            "1|2|30.00|30.00|30.00|40.00|40.00|40.00|750.00|0.900|0.900|1",
        ])
        self.assertEqual(self.minutos(2), ["2|1|18.00|18.00|18.00|40.00|40.00|40.00|750.00|0.900|0.900|1"])

    def test_repetir_no_duplica_y_completa_lo_que_llega_tarde(self):
        minuto = "date_trunc('minute', now()) - interval '1 minute'"
        self.leer(1, f"{minuto} + interval '5 seconds'", 20)
        self.assertEqual(self.sql("SELECT agregar_lecturas_minuto();"), "1")
        self.assertEqual(self.sql("SELECT agregar_lecturas_minuto();"), "0")
        self.assertEqual(self.sql("SELECT count(*) FROM lecturas_minuto;"), "1")
        self.leer(1, f"{minuto} + interval '30 seconds'", 30)
        self.assertEqual(self.sql("SELECT agregar_lecturas_minuto();"), "1")
        self.assertEqual(self.minutos(1), ["1|1|25.00|20.00|30.00|40.00|40.00|40.00|750.00|0.900|0.900|2"])

    def test_sin_lecturas_no_agrega_nada(self):
        self.assertEqual(self.sql("SELECT agregar_lecturas_minuto();"), "0")

    def test_limpiar_borra_crudas_viejas_y_conserva_las_agregadas(self):
        self.leer(1, "now() - interval '31 days'", 20)
        self.leer(1, "now() - interval '31 days' + interval '1 second'", 22)
        self.leer(1, "now() - interval '29 days'", 25)
        self.leer(1, "now() - interval '5 minutes'", 26)
        self.assertEqual(self.sql("SELECT limpiar_lecturas();"), "2")
        self.assertEqual(self.sql("SELECT count(*) FROM lecturas;"), "2")
        self.assertEqual(self.sql("SELECT count(*), sum(n_lecturas) FROM lecturas_minuto;"), "3|4")
        self.assertEqual(self.sql("SELECT temp_avg FROM lecturas_minuto ORDER BY minuto LIMIT 1;"), "21.00")
        self.assertEqual(self.sql("SELECT limpiar_lecturas();"), "0")


class NodeRED(AgregacionHTTP):
    AUTOMATICO = True

    def test_node_red_agrega_cada_minuto_y_limpia_cada_dia(self):
        self.leer(1, "now() - interval '40 days'", 20)
        self.leer(1, "date_trunc('minute', now()) - interval '1 minute'", 24)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas_minuto;") == "2", "agregación automática", 15)
        esperar(lambda: self.sql("SELECT count(*) FROM lecturas;") == "1", "limpieza automática", 15)
        self.assertEqual(self.sql("SELECT temperatura FROM lecturas;"), "24.00")


del AgregacionHTTP


if __name__ == "__main__":
    unittest.main()
