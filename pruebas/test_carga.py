import contextlib
import io
import json
import socket
import sys
import unittest

from carga import Medicion, RedMqtt, argumentos


class PruebasCarga(unittest.TestCase):
    def test_cierre_libera_sockets_pendientes_y_callbacks(self):
        lector, escritor = socket.socketpair()
        with lector, escritor:
            class Cliente:
                def socket(self):
                    return lector

            cliente = Cliente()
            red = RedMqtt()
            red.agregar(cliente)
            red.abrir(cliente, None, lector)
            red.escribir(cliente, None, lector)
            red.cerrar()
            self.assertEqual(lector.fileno(), -1)
            self.assertFalse(red.activos)
            self.assertIsNone(cliente.on_socket_close)
            self.assertIsNone(cliente.on_socket_unregister_write)

    @unittest.skipUnless(sys.platform.startswith("linux"), "Regresión de select en Linux/WSL")
    def test_red_procesa_descriptores_superiores_a_1024(self):
        import fcntl
        import resource

        if resource.getrlimit(resource.RLIMIT_NOFILE)[0] <= 1100:
            self.skipTest("El sistema no permite abrir el descriptor 1100")
        lector, escritor = socket.socketpair()
        with lector, escritor:
            descriptor = fcntl.fcntl(lector.fileno(), fcntl.F_DUPFD_CLOEXEC, 1100)
            with socket.socket(fileno=descriptor) as alto:
                class Cliente:
                    recibido = b""

                    def socket(self):
                        return alto

                    def loop_read(self):
                        self.recibido = alto.recv(32)

                red = RedMqtt()
                cliente = Cliente()
                try:
                    red.abrir(cliente, None, alto)
                    escritor.sendall(b"confirmacion")
                    red.procesar(0.2)
                    self.assertEqual(cliente.recibido, b"confirmacion")
                    red.cerrar_socket(cliente, None, alto)
                    self.assertFalse(red.activos)
                finally:
                    red.cerrar()

    def test_ids_explicitos_no_colisionan_con_generados(self):
        a = argumentos(["--clientes", "3", "--ids", "ca0000000000"])
        self.assertEqual(a.ids, ["CA0000000000", "CA0000000001", "CA0000000002"])

    def test_rechaza_argumentos_invalidos(self):
        casos = [
            ["--clientes", "0"], ["--duracion", "nan"], ["--intervalo", "0"],
            ["--puerto", "65536"], ["--ids", "invalido"],
            ["--ids", "CA0000000000,CA0000000000"],
            ["--clientes", "1", "--ids", "CA0000000000,CA0000000001"],
        ]
        for caso in casos:
            with self.subTest(caso=caso), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    argumentos(caso)
                self.assertEqual(error.exception.code, 2)

    def test_excluye_ajenos_duplicados_y_mensajes_malformados(self):
        m = Medicion("actual")
        tema = "telemetria/CA0000000000/lecturas"
        m.registrar(tema, 1)
        m.registrar(tema, 2)
        for payload in [b"no json", b"\xff", b"[]", b'{"carga_id":"otra","carga_seq":1}',
                        b'{"carga_id":"actual","carga_seq":[]}']:
            m.recibir(tema, payload)
        correcto = json.dumps({"carga_id": "actual", "carga_seq": 1})
        m.recibir("otro/tema", correcto)
        self.assertEqual(m.resumen(), ([], 2))
        m.recibir(tema, correcto)
        m.recibir(tema, correcto)
        latencias, pendientes = m.resumen()
        self.assertEqual(len(latencias), 1)
        self.assertGreaterEqual(latencias[0], 0)
        self.assertEqual(pendientes, 1)
        m.cancelar(tema, 2)
        self.assertEqual(m.resumen()[1], 0)


if __name__ == "__main__":
    unittest.main()
