import asyncio
import base64
import logging
import os
import unittest

import broker as modulo
import paquetes as p
import websocket as ws
from acl import leer_acl
from usuarios import leer_usuarios


def enmascarada(opcode, datos, fin=True):
    mascara = os.urandom(4)
    n = len(datos)
    primero = (0x80 if fin else 0) | opcode
    if n < 126:
        cabecera = bytes([primero, 0x80 | n])
    elif n < 65536:
        cabecera = bytes([primero, 0x80 | 126]) + n.to_bytes(2, "big")
    else:
        cabecera = bytes([primero, 0x80 | 127]) + n.to_bytes(8, "big")
    return cabecera + mascara + ws.desenmascarar(datos, mascara)


def connect(client_id, usuario="esp32", clave="secreto", keepalive=30):
    carga = p.cadena(client_id) + p.cadena(usuario) + p.cadena(clave)
    cuerpo = p.cadena("MQTT") + bytes([4, 0xC2]) + keepalive.to_bytes(2, "big") + carga
    return p.armar(p.CONNECT, 0, cuerpo)


class ClienteWS:
    def __init__(self, lector, escritor):
        self.lector = lector
        self.escritor = escritor
        self.pendiente = bytearray()

    @classmethod
    async def abrir(cls, puerto, protocolo="mqtt", extra=""):
        lector, escritor = await asyncio.open_connection("127.0.0.1", puerto)
        clave = base64.b64encode(os.urandom(16)).decode()
        pedido = (
            "GET / HTTP/1.1\r\nHost: mqtt.telemon.site\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {clave}\r\nSec-WebSocket-Version: 13\r\n"
        )
        if protocolo:
            pedido += f"Sec-WebSocket-Protocol: {protocolo}\r\n"
        escritor.write((pedido + extra + "\r\n").encode())
        await escritor.drain()
        respuesta = (await asyncio.wait_for(lector.readuntil(b"\r\n\r\n"), 2)).decode()
        cliente = cls(lector, escritor)
        cliente.respuesta = respuesta
        cliente.clave = clave
        return cliente

    async def enviar(self, datos, opcode=ws.BINARIA):
        self.escritor.write(enmascarada(opcode, datos))
        await self.escritor.drain()

    async def trama(self, espera=2):
        primero, segundo = await asyncio.wait_for(self.lector.readexactly(2), espera)
        largo = segundo & 0x7F
        if largo == 126:
            largo = int.from_bytes(await self.lector.readexactly(2), "big")
        elif largo == 127:
            largo = int.from_bytes(await self.lector.readexactly(8), "big")
        return primero & 0x0F, await self.lector.readexactly(largo)

    async def cerrado(self, espera=3):
        try:
            while True:
                datos = await asyncio.wait_for(self.lector.read(64), espera)
                if not datos:
                    return True
        except ConnectionError:
            return True

    async def cerrar(self):
        self.escritor.close()
        try:
            await self.escritor.wait_closed()
        except ConnectionError:
            pass


class LectorDeBytes:
    def __init__(self, buffer):
        self.buffer = buffer
        self.pos = 0

    async def readexactly(self, n):
        if self.pos + n > len(self.buffer):
            raise asyncio.IncompleteReadError(bytes(self.buffer[self.pos:]), n)
        datos = bytes(self.buffer[self.pos:self.pos + n])
        self.pos += n
        return datos

    def consumir(self):
        del self.buffer[:self.pos]


class PruebasFunciones(unittest.TestCase):
    def test_aceptacion_del_rfc_6455(self):
        self.assertEqual(ws.aceptacion("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_desenmascarar_es_reversible(self):
        mascara = b"\x37\xfa\x21\x3d"
        self.assertEqual(ws.desenmascarar(ws.desenmascarar(b"Hello", mascara), mascara), b"Hello")
        self.assertEqual(ws.desenmascarar(b"\x7f\x9f\x4d\x51\x58", mascara), b"Hello")

    def test_tramas_del_servidor_con_largo_extendido(self):
        self.assertEqual(ws.trama(ws.BINARIA, b"x" * 5)[:2], b"\x82\x05")
        self.assertEqual(ws.trama(ws.BINARIA, b"x" * 300)[:4], b"\x82\x7e\x01\x2c")
        self.assertEqual(ws.trama(ws.BINARIA, b"x" * 70000)[:2], b"\x82\x7f")


class PruebasWebSocket(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        logging.getLogger("broker").setLevel(logging.CRITICAL)
        reglas = leer_acl("esp32:write:telemetria/%c/lecturas,nodered:read:telemetria/#")
        self.broker = modulo.Broker(leer_usuarios("esp32:secreto,nodered:otra"), reglas)
        await self.broker.iniciar("127.0.0.1", 0, puerto_ws=0)
        self.puerto = self.broker.puerto_ws()
        self.clientes = []

    async def asyncTearDown(self):
        for c in self.clientes:
            await c.cerrar()
        await self.broker.detener()

    async def abrir(self, *args, **kwargs):
        cliente = await ClienteWS.abrir(self.puerto, *args, **kwargs)
        self.clientes.append(cliente)
        return cliente

    async def recibir(self, cliente, espera=2):
        lector = LectorDeBytes(cliente.pendiente)
        while True:
            try:
                paquete = await p.leer_paquete(lector)
                lector.consumir()
                return paquete
            except asyncio.IncompleteReadError:
                lector.pos = 0
                opcode, datos = await cliente.trama(espera)
                self.assertEqual(opcode, ws.BINARIA)
                cliente.pendiente += datos

    async def conectado(self, client_id, **kwargs):
        cliente = await self.abrir()
        await cliente.enviar(connect(client_id, **kwargs))
        self.assertEqual(await self.recibir(cliente), (p.CONNACK, 0, b"\x00\x00"))
        return cliente

    async def test_saludo_con_subprotocolo_mqtt(self):
        cliente = await self.abrir()
        self.assertTrue(cliente.respuesta.startswith("HTTP/1.1 101 "))
        self.assertIn(f"Sec-WebSocket-Accept: {ws.aceptacion(cliente.clave)}\r\n", cliente.respuesta)
        self.assertIn("Sec-WebSocket-Protocol: mqtt\r\n", cliente.respuesta)

    async def test_subprotocolo_desconocido_rechazado(self):
        cliente = await self.abrir(protocolo="chat")
        self.assertTrue(cliente.respuesta.startswith("HTTP/1.1 400 "))
        self.assertTrue(await cliente.cerrado())

    async def test_pedido_http_comun_rechazado(self):
        lector, escritor = await asyncio.open_connection("127.0.0.1", self.puerto)
        escritor.write(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
        respuesta = await asyncio.wait_for(lector.read(100), 2)
        escritor.close()
        self.assertTrue(respuesta.startswith(b"HTTP/1.1 400 "))

    async def test_clave_incorrecta_por_websocket(self):
        cliente = await self.abrir()
        await cliente.enviar(connect("F8B3B72BFC24", clave="mala"))
        self.assertEqual(await self.recibir(cliente), (p.CONNACK, 0, b"\x00\x04"))

    async def test_publica_por_websocket_y_recibe_por_tcp(self):
        lector, escritor = await asyncio.open_connection("127.0.0.1", self.broker.puerto())
        escritor.write(connect("nodered", usuario="nodered", clave="otra"))
        await p.leer_paquete(lector)
        cuerpo = (1).to_bytes(2, "big") + p.cadena("telemetria/+/lecturas") + b"\x00"
        escritor.write(p.armar(p.SUBSCRIBE, 0x02, cuerpo))
        self.assertEqual((await p.leer_paquete(lector))[0], p.SUBACK)

        nodo = await self.conectado("F8B3B72BFC24")
        await nodo.enviar(p.publish("telemetria/F8B3B72BFC24/lecturas", b'{"temperatura":22.8}'))
        tipo, _, cuerpo = await asyncio.wait_for(p.leer_paquete(lector), 2)
        escritor.close()
        self.assertEqual(p.decodificar_publish(0, cuerpo)[2], b'{"temperatura":22.8}')

    async def test_recibe_por_websocket(self):
        oyente = await self.conectado("nodered", usuario="nodered", clave="otra")
        await oyente.enviar(p.armar(p.SUBSCRIBE, 0x02, (7).to_bytes(2, "big") + p.cadena("telemetria/#") + b"\x00"))
        self.assertEqual(await self.recibir(oyente), (p.SUBACK, 0, b"\x00\x07\x00"))
        nodo = await self.conectado("A1")
        carga = b"x" * 70000
        await nodo.enviar(p.publish("telemetria/A1/lecturas", carga))
        tipo, _, cuerpo = await self.recibir(oyente)
        self.assertEqual((tipo, p.decodificar_publish(0, cuerpo)[2]), (p.PUBLISH, carga))

    async def test_paquete_partido_en_varias_tramas_y_dos_en_una(self):
        cliente = await self.abrir()
        paquete = connect("F8B3B72BFC24")
        cliente.escritor.write(enmascarada(ws.BINARIA, paquete[:5], fin=False))
        cliente.escritor.write(enmascarada(ws.CONTINUACION, paquete[5:]))
        await cliente.escritor.drain()
        self.assertEqual(await self.recibir(cliente), (p.CONNACK, 0, b"\x00\x00"))
        await cliente.enviar(p.armar(p.PINGREQ) + p.armar(p.PINGREQ))
        self.assertEqual(await self.recibir(cliente), (p.PINGRESP, 0, b""))
        self.assertEqual(await self.recibir(cliente), (p.PINGRESP, 0, b""))

    async def test_ping_de_websocket_responde_pong(self):
        cliente = await self.conectado("X1")
        await cliente.enviar(b"hola", opcode=ws.PING)
        self.assertEqual(await cliente.trama(), (ws.PONG, b"hola"))

    async def test_trama_de_texto_cierra(self):
        cliente = await self.conectado("X1")
        await cliente.enviar(b"hola", opcode=ws.TEXTO)
        self.assertTrue(await cliente.cerrado())

    async def test_cierre_del_cliente(self):
        cliente = await self.conectado("X1")
        await cliente.enviar((1000).to_bytes(2, "big"), opcode=ws.CIERRE)
        self.assertEqual(await cliente.trama(), (ws.CIERRE, (1000).to_bytes(2, "big")))
        self.assertTrue(await cliente.cerrado())
        await asyncio.sleep(0.05)
        self.assertNotIn("X1", self.broker.clientes)

    async def test_trama_sin_mascara_cierra(self):
        cliente = await self.conectado("X1")
        cliente.escritor.write(ws.trama(ws.BINARIA, p.armar(p.PINGREQ)))
        await cliente.escritor.drain()
        self.assertTrue(await cliente.cerrado())

    async def test_acl_tambien_por_websocket(self):
        nodo = await self.conectado("F8B3B72BFC24")
        await nodo.enviar(p.armar(p.SUBSCRIBE, 0x02, (1).to_bytes(2, "big") + p.cadena("telemetria/#") + b"\x00"))
        self.assertEqual(await self.recibir(nodo), (p.SUBACK, 0, b"\x00\x01\x80"))

    async def test_ip_real_desde_cloudflare(self):
        cliente = await self.abrir(extra="Cf-Connecting-Ip: 181.115.1.2\r\n")
        with self.assertLogs("broker", level="INFO") as registro:
            logging.getLogger("broker").setLevel(logging.INFO)
            await cliente.enviar(connect("F8B3B72BFC24"))
            await self.recibir(cliente)
        self.assertTrue(any("181.115.1.2" in linea for linea in registro.output))


if __name__ == "__main__":
    unittest.main()
