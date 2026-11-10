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


class PruebasExtraer(unittest.TestCase):
    def test_paquete_incompleto_devuelve_none(self):
        paquete = p.armar(p.PUBLISH, 0, p.cadena("a/b") + b"x" * 300)
        for corte in range(len(paquete)):
            with self.subTest(corte=corte):
                self.assertIsNone(p.extraer(bytearray(paquete[:corte])))

    def test_varios_paquetes_en_un_buffer(self):
        buffer = bytearray(p.armar(p.PUBLISH, 0, p.cadena("a/b") + b"hola") + p.armar(p.PINGREQ))
        tipo, banderas, cuerpo, pos = p.extraer(buffer)
        self.assertEqual((tipo, banderas, p.tema_de_publish(cuerpo)), (p.PUBLISH, 0, "a/b"))
        self.assertEqual(p.extraer(buffer, pos), (p.PINGREQ, 0, b"", len(buffer)))

    def test_longitud_de_cinco_bytes_en_buffer(self):
        with self.assertRaises(p.ErrorProtocolo):
            p.extraer(bytearray(b"\x30\xff\xff\xff\xff\x01"))

    def test_reenviar_publish_conserva_los_bytes(self):
        original = p.publish("telemetria/A/lecturas", b'{"t":1}')
        _, _, cuerpo, _ = p.extraer(bytearray(original))
        self.assertEqual(p.reenviar_publish(cuerpo), original)

    def test_tema_de_publish_incompleto(self):
        with self.assertRaises(p.ErrorProtocolo):
            p.tema_de_publish(b"\x00\x09abc")


if __name__ == "__main__":
    unittest.main()
