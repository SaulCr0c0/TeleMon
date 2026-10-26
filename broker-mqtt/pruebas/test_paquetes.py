import asyncio
import unittest

import paquetes as p


async def leer_de(funcion, datos):
    lector = asyncio.StreamReader()
    lector.feed_data(datos)
    lector.feed_eof()
    return await funcion(lector)


class PruebasLongitud(unittest.TestCase):
    def test_ejemplos_de_la_especificacion(self):
        casos = {0: b"\x00", 127: b"\x7f", 128: b"\x80\x01", 16_383: b"\xff\x7f", 16_384: b"\x80\x80\x01",
                 268_435_455: b"\xff\xff\xff\x7f"}
        for valor, codificado in casos.items():
            self.assertEqual(p.codificar_longitud(valor), codificado)
            self.assertEqual(asyncio.run(leer_de(p.leer_longitud, codificado)), valor)

    def test_longitud_de_cinco_bytes(self):
        with self.assertRaises(p.ErrorProtocolo):
            asyncio.run(leer_de(p.leer_longitud, b"\xff\xff\xff\xff\x01"))


class PruebasPaquetes(unittest.TestCase):
    def connect(self):
        carga = p.cadena("F8B3B72BFC24") + p.cadena("esp32") + p.cadena("secreto")
        return p.cadena("MQTT") + bytes([4, 0xC2]) + (15).to_bytes(2, "big") + carga

    def test_connect(self):
        datos = p.decodificar_connect(self.connect())
        self.assertEqual((datos.protocolo, datos.nivel, datos.keepalive), ("MQTT", 4, 15))
        self.assertEqual((datos.client_id, datos.usuario, datos.clave), ("F8B3B72BFC24", "esp32", b"secreto"))

    def test_connect_incompleto(self):
        with self.assertRaises(p.ErrorProtocolo):
            p.decodificar_connect(self.connect()[:-3])

    def test_connack(self):
        self.assertEqual(p.connack(p.ACEPTADA), b"\x20\x02\x00\x00")
        self.assertEqual(p.connack(p.CREDENCIALES_INVALIDAS), b"\x20\x02\x00\x04")

    def test_publish_ida_y_vuelta(self):
        paquete = p.publish("telemetria/X/lecturas", b'{"t":1}')
        tipo, banderas, cuerpo = asyncio.run(leer_de(p.leer_paquete, paquete))
        self.assertEqual(tipo, p.PUBLISH)
        self.assertEqual(p.decodificar_publish(banderas, cuerpo), ("telemetria/X/lecturas", 0, b'{"t":1}'))

    def test_subscribe_y_suback(self):
        cuerpo = (5).to_bytes(2, "big") + p.cadena("telemetria/+/lecturas") + b"\x00" + p.cadena("x/#") + b"\x01"
        self.assertEqual(p.decodificar_subscribe(cuerpo), (5, ["telemetria/+/lecturas", "x/#"]))
        self.assertEqual(p.suback(5, [0, 0x80]), b"\x90\x04\x00\x05\x00\x80")

    def test_paquete_demasiado_grande(self):
        cabecera = bytes([p.PUBLISH << 4]) + p.codificar_longitud(p.TAMANO_MAXIMO + 1)
        with self.assertRaises(p.ErrorProtocolo):
            asyncio.run(leer_de(p.leer_paquete, cabecera))

    def test_pingresp(self):
        self.assertEqual(p.pingresp(), b"\xd0\x00")


if __name__ == "__main__":
    unittest.main()
