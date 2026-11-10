import csv
import json
import tempfile
import unittest
from pathlib import Path

import comparativa_brokers as cmp


class PruebasComparativa(unittest.TestCase):
    def test_percentil_por_rango_superior(self):
        valores = list(range(1, 101))
        self.assertEqual(cmp.percentil(valores, 0.5), 50)
        self.assertEqual(cmp.percentil(valores, 0.95), 95)
        self.assertEqual(cmp.percentil([7], 0.99), 7)

    def test_resumir_combina_repeticiones(self):
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp)
            (carpeta / "crudos").mkdir()
            filas = []
            for rep, latencias in ((1, [1.0, 2.0, 3.0]), (2, [4.0, 5.0, 6.0])):
                (carpeta / "crudos" / f"1-cliente_mosquitto_{rep}.json").write_text(
                    json.dumps({"latencias_ms": latencias}))
                filas.append({
                    "escenario": "1-cliente", "broker": "mosquitto", "repeticion": rep, "clientes": 1,
                    "enviados": 3, "perdidos": rep - 1, "tasa_msg_s": 1.0, "cpu_prom": rep, "cpu_max": rep * 2,
                    "ram_reposo_mib": 2.0, "ram_prom_mib": 2.5, "ram_max_mib": 2.0 + rep,
                })
            resumen = cmp.resumir(filas, carpeta)
            self.assertEqual(len(resumen), 1)
            fila = resumen[0]
            self.assertEqual((fila["enviados"], fila["perdidos"], fila["repeticiones"]), (6, 1, 2))
            self.assertEqual(fila["p50_ms"], 3.5)
            self.assertEqual(fila["max_ms"], 6.0)
            self.assertEqual((fila["cpu_prom"], fila["cpu_max"], fila["ram_max_mib"]), (1.5, 4, 4.0))
            with open(carpeta / "resumen.csv", encoding="utf-8") as archivo:
                self.assertEqual(next(csv.DictReader(archivo))["perdidos"], "1")


if __name__ == "__main__":
    unittest.main()
