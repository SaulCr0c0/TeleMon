import time
import unittest
from urllib.parse import urlencode

from test_ubicaciones import RAIZ, EntornoHTTP, token


HISTORIAL = "415702a1c0de0001"


class HistorialHTTP(EntornoHTTP):
    PREFIJO = "telemon-s71"
    TABS = {"64ab1cac10de0001", HISTORIAL}

    def setUp(self):
        super().setUp()
        self.sql((RAIZ / "database/03_agregacion.sql").read_text(encoding="utf-8"))
        self.sql("""
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 1, ubicacion_id = 1, nombre = 'Biblioteca' WHERE id = 2;
UPDATE dispositivos SET estado = 'en_uso', cliente_id = 2, ubicacion_id = 3, nombre = 'Vivero' WHERE id = 3;
INSERT INTO lecturas (dispositivo_id, ubicacion_id, fecha_hora, temperatura, humedad, presion, mq135_v,
                      rs_r0, nivel_aire) VALUES
 (1, 1, '2026-10-20 10:00:05-04', 20, 40, 750, 0.5, 0.9, 'bueno'),
 (1, 1, '2026-10-20 10:00:35-04', 22, NULL, 752, 0.6, NULL, NULL),
 (1, 1, '2026-10-20 10:01:10-04', 24, 44, 754, NULL, NULL, NULL),
 (2, 1, '2026-10-20 10:00:20-04', 18, 50, 748, 0.4, 0.6, 'moderado'),
 (1, 2, '2026-10-20 10:02:00-04', 30, 30, 740, 0.5, 0.4, 'malo'),
 (3, 3, '2026-10-20 10:00:00-04', 26, 60, 745, 0.5, 0.95, 'bueno');
""")

    def historial(self, ubicacion=1, autorizacion="cliente1", **filtros):
        filtros = {"desde": "2026-10-20T13:00:00Z", "hasta": "2026-10-20T15:00:00Z", **filtros}
        return self.pedir("GET", f"/api/ubicaciones/{ubicacion}/lecturas?{urlencode(filtros)}",
                          autorizacion=autorizacion)

    def test_sesion_y_aislamiento(self):
        self.assertEqual(self.historial(autorizacion=None)[0], 401)
        self.assertEqual(self.historial(autorizacion=token(2))[:2], (403, {"mensaje": "No tienes permiso."}))
        self.assertEqual(self.historial(autorizacion=token(None, "admin"))[0], 403)
        self.assertEqual(self.historial(3)[0], 403)
        self.assertEqual(self.historial(99)[0], 403)
        estado, datos, _ = self.historial(3, autorizacion=token(2))
        self.assertEqual((estado, [f["nodo"] for f in datos["filas"]]), (200, ["Vivero"]))

    def test_sin_agrupar_de_la_mas_nueva_a_la_mas_vieja(self):
        estado, datos, cabeceras = self.historial()
        self.assertEqual(estado, 200)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual((datos["total"], datos["pagina"], datos["porPagina"]), (4, 1, 20))
        self.assertEqual([(f["fecha"], f["nodo"]) for f in datos["filas"]], [
            ("2026-10-20T14:01:10.000Z", "Aula 3"), ("2026-10-20T14:00:35.000Z", "Aula 3"),
            ("2026-10-20T14:00:20.000Z", "Biblioteca"), ("2026-10-20T14:00:05.000Z", "Aula 3"),
        ])
        self.assertEqual(datos["filas"][3], {
            "fecha": "2026-10-20T14:00:05.000Z", "dispositivoId": 1, "nodo": "Aula 3", "temperatura": 20,
            "humedad": 40, "presion": 750, "rsR0": 0.9, "nivelAire": "bueno"})
        self.assertEqual([f["nivelAire"] for f in datos["filas"]], [None, "sin_calibrar", "moderado", "bueno"])

    def test_filtros_y_paginacion(self):
        datos = self.historial(nodo=2)[1]
        self.assertEqual([f["dispositivoId"] for f in datos["filas"]], [2])
        datos = self.historial(desde="2026-10-20T14:00:30Z", hasta="2026-10-20T14:01:00Z")[1]
        self.assertEqual([f["fecha"] for f in datos["filas"]], ["2026-10-20T14:00:35.000Z"])
        datos = self.historial(pagina=2, porPagina=3)[1]
        self.assertEqual((datos["total"], datos["pagina"], datos["porPagina"], len(datos["filas"])), (4, 2, 3, 1))
        self.assertEqual(self.historial(pagina=9)[1]["filas"], [])
        self.assertEqual(self.historial(porPagina=5000)[1]["porPagina"], 1000)
        self.assertEqual(self.historial(nodo=3)[1]["total"], 0)
        for filtros, mensaje in (
            ({"desde": "ayer"}, "Fecha no válida."), ({"nodo": "abc"}, "Nodo no válido."),
            ({"agrupar": "semana"}, "Agrupación no válida."),
            ({"desde": "2026-10-21T00:00:00Z"}, "La fecha inicial debe ser anterior a la final."),
        ):
            with self.subTest(filtros=filtros):
                self.assertEqual(self.historial(**filtros)[:2], (400, {"mensaje": mensaje}))

    def test_por_minuto_desde_las_lecturas(self):
        datos = self.historial(agrupar="minuto")[1]
        self.assertEqual([(f["fecha"], f["dispositivoId"], f["temperatura"], f["humedad"], f["rsR0"], f["nivelAire"])
                          for f in datos["filas"]], [
            ("2026-10-20T14:01:00.000Z", 1, 24, 44, None, None),
            ("2026-10-20T14:00:00.000Z", 1, 21, 40, 0.9, "bueno"),
            ("2026-10-20T14:00:00.000Z", 2, 18, 50, 0.6, "moderado"),
        ])

    def test_por_hora_y_por_dia_desde_lecturas_minuto(self):
        self.sql("SELECT agregar_lecturas_minuto();")
        datos = self.historial(agrupar="hora")[1]
        self.assertEqual([(f["fecha"], f["dispositivoId"], f["temperatura"], f["presion"], f["rsR0"])
                          for f in datos["filas"]], [
            ("2026-10-20T14:00:00.000Z", 1, 22, 752, 0.9),
            ("2026-10-20T14:00:00.000Z", 2, 18, 748, 0.6),
        ])
        datos = self.historial(agrupar="dia", desde="2026-10-19T00:00:00Z", hasta="2026-10-21T00:00:00Z")[1]
        self.assertEqual([(f["fecha"], f["dispositivoId"], f["temperatura"]) for f in datos["filas"]], [
            ("2026-10-20T04:00:00.000Z", 1, 22), ("2026-10-20T04:00:00.000Z", 2, 18),
        ])

    def test_siete_dias_por_hora_en_menos_de_un_segundo(self):
        self.sql("""
INSERT INTO dispositivos (id, mac_address, codigo, cliente_id, ubicacion_id, nombre, estado)
SELECT 10 + g, 'AA:AA:AA:AA:AA:' || lpad(g::text, 2, '0'), 'AAAA-AA' || lpad(g::text, 2, '0'), 1, 1,
  'Nodo ' || g, 'en_uso' FROM generate_series(1, 4) g;
INSERT INTO lecturas_minuto (dispositivo_id, ubicacion_id, minuto, temp_avg, hum_avg, pres_avg, rs_r0_avg,
                             n_lecturas)
SELECT d, 1, date_trunc('minute', now()) - m * interval '1 minute', 20 + random() * 5, 45, 750, 0.9, 12
FROM unnest(ARRAY[1, 2, 11, 12, 13, 14]) d, generate_series(1, 10080) m;
ANALYZE lecturas_minuto;
""")
        hasta = time.time()
        filtros = {"agrupar": "hora", "porPagina": 200,
                   "desde": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(hasta - 7 * 86400)),
                   "hasta": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(hasta))}
        self.historial(**filtros)
        inicio = time.monotonic()
        estado, datos, _ = self.historial(**filtros)
        duracion = time.monotonic() - inicio
        self.assertEqual(estado, 200)
        self.assertGreaterEqual(datos["total"], 6 * 168)
        self.assertLess(duracion, 1)


if __name__ == "__main__":
    unittest.main()
