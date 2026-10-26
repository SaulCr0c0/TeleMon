import asyncio
import logging
import unittest

import broker as modulo
import paquetes as p
from usuarios import leer_usuarios


class ClientePrueba:
    def __init__(self, lector, escritor):
        self.lector = lector
        self.escritor = escritor

    @classmethod
    async def conectar(cls, puerto, client_id, usuario="esp32", clave="secreto", keepalive=30):
        lector, escritor = await asyncio.open_connection("127.0.0.1", puerto)
        cliente = cls(lector, escritor)
        opciones = 0x02
        carga = p.cadena(client_id)
        if usuario is not None:
            opciones |= 0x80
            carga += p.cadena(usuario)
        if clave is not None:
            opciones |= 0x40
            carga += p.cadena(clave)
        cuerpo = p.cadena("MQTT") + bytes([4, opciones]) + keepalive.to_bytes(2, "big") + carga
        escritor.write(p.armar(p.CONNECT, 0, cuerpo))
        await escritor.drain()
        return cliente

    async def recibir(self, espera=2):
        return await asyncio.wait_for(p.leer_paquete(self.lector), espera)

    async def enviar(self, datos):
        self.escritor.write(datos)
        await self.escritor.drain()

    async def suscribir(self, *filtros, id_paquete=1):
        cuerpo = id_paquete.to_bytes(2, "big") + b"".join(p.cadena(f) + b"\x00" for f in filtros)
        await self.enviar(p.armar(p.SUBSCRIBE, 0x02, cuerpo))
        return await self.recibir()

    async def publicar(self, tema, carga, qos=0, id_paquete=1):
        cuerpo = p.cadena(tema) + (id_paquete.to_bytes(2, "big") if qos else b"") + carga
        await self.enviar(p.armar(p.PUBLISH, qos << 1, cuerpo))

    async def cerrado(self, espera=3):
        try:
            datos = await asyncio.wait_for(self.lector.read(1), espera)
        except ConnectionError:
            return True
        return datos == b""

    async def cerrar(self):
        self.escritor.close()
        try:
            await self.escritor.wait_closed()
        except ConnectionError:
            pass


class PruebasBroker(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        logging.getLogger("broker").setLevel(logging.CRITICAL)
        self.broker = modulo.Broker(leer_usuarios("esp32:secreto,nodered:otra"))
        await self.broker.iniciar("127.0.0.1", 0)
        self.puerto = self.broker.puerto()
        self.clientes = []

    async def asyncTearDown(self):
        for c in self.clientes:
            await c.cerrar()
        await self.broker.detener()

    async def nuevo(self, *args, **kwargs):
        cliente = await ClientePrueba.conectar(self.puerto, *args, **kwargs)
        self.clientes.append(cliente)
        return cliente

    async def test_connack_aceptado(self):
        c = await self.nuevo("F8B3B72BFC24")
        self.assertEqual(await c.recibir(), (p.CONNACK, 0, b"\x00\x00"))

    async def test_clave_incorrecta_rechazada_y_cerrada(self):
        c = await self.nuevo("F8B3B72BFC24", clave="mala")
        self.assertEqual(await c.recibir(), (p.CONNACK, 0, b"\x00\x04"))
        self.assertTrue(await c.cerrado())

    async def test_sin_usuario_no_autorizado(self):
        c = await self.nuevo("F8B3B72BFC24", usuario=None, clave=None)
        self.assertEqual(await c.recibir(), (p.CONNACK, 0, b"\x00\x05"))

    async def test_version_no_soportada(self):
        lector, escritor = await asyncio.open_connection("127.0.0.1", self.puerto)
        cuerpo = p.cadena("MQIsdp") + bytes([3, 0x02]) + (30).to_bytes(2, "big") + p.cadena("viejo")
        escritor.write(p.armar(p.CONNECT, 0, cuerpo))
        c = ClientePrueba(lector, escritor)
        self.clientes.append(c)
        self.assertEqual(await c.recibir(), (p.CONNACK, 0, b"\x00\x01"))

    async def test_primer_paquete_que_no_es_connect(self):
        lector, escritor = await asyncio.open_connection("127.0.0.1", self.puerto)
        c = ClientePrueba(lector, escritor)
        self.clientes.append(c)
        await c.enviar(p.armar(p.PINGREQ))
        self.assertTrue(await c.cerrado())

    async def test_enruta_con_comodin_mas(self):
        oyente = await self.nuevo("nodered", usuario="nodered", clave="otra")
        await oyente.recibir()
        tipo, _, cuerpo = await oyente.suscribir("telemetria/+/lecturas")
        self.assertEqual((tipo, cuerpo), (p.SUBACK, b"\x00\x01\x00"))
        nodo = await self.nuevo("F8B3B72BFC24")
        await nodo.recibir()
        await nodo.publicar("telemetria/F8B3B72BFC24/lecturas", b'{"temperatura":22.8}')
        tipo, _, cuerpo = await oyente.recibir()
        tema, _, carga = p.decodificar_publish(0, cuerpo)
        self.assertEqual((tipo, tema, carga), (p.PUBLISH, "telemetria/F8B3B72BFC24/lecturas", b'{"temperatura":22.8}'))

    async def test_no_entrega_lo_que_no_coincide(self):
        oyente = await self.nuevo("nodered", usuario="nodered", clave="otra")
        await oyente.recibir()
        await oyente.suscribir("telemetria/+/lecturas")
        nodo = await self.nuevo("A")
        await nodo.recibir()
        await nodo.publicar("otra/cosa", b"x")
        await nodo.publicar("telemetria/A/lecturas", b"si")
        _, _, cuerpo = await oyente.recibir()
        self.assertEqual(p.decodificar_publish(0, cuerpo)[2], b"si")

    async def test_entrega_una_vez_aunque_coincidan_dos_filtros(self):
        oyente = await self.nuevo("nodered", usuario="nodered", clave="otra")
        await oyente.recibir()
        await oyente.suscribir("telemetria/#", "telemetria/+/lecturas")
        nodo = await self.nuevo("A")
        await nodo.recibir()
        await nodo.publicar("telemetria/A/lecturas", b"uno")
        await nodo.publicar("telemetria/A/lecturas", b"dos")
        cargas = [p.decodificar_publish(0, (await oyente.recibir())[2])[2] for _ in range(2)]
        self.assertEqual(cargas, [b"uno", b"dos"])

    async def test_filtro_invalido_en_suback(self):
        c = await self.nuevo("X")
        await c.recibir()
        _, _, cuerpo = await c.suscribir("bien/#", "mal/#/x")
        self.assertEqual(cuerpo, b"\x00\x01\x00\x80")

    async def test_unsubscribe(self):
        oyente = await self.nuevo("nodered", usuario="nodered", clave="otra")
        await oyente.recibir()
        await oyente.suscribir("a/#")
        await oyente.enviar(p.armar(p.UNSUBSCRIBE, 0x02, (9).to_bytes(2, "big") + p.cadena("a/#")))
        self.assertEqual(await oyente.recibir(), (p.UNSUBACK, 0, b"\x00\x09"))
        nodo = await self.nuevo("N")
        await nodo.recibir()
        await nodo.publicar("a/b", b"x")
        with self.assertRaises(asyncio.TimeoutError):
            await oyente.recibir(espera=0.5)

    async def test_qos1_cierra_la_conexion(self):
        nodo = await self.nuevo("N")
        await nodo.recibir()
        await nodo.publicar("a/b", b"x", qos=1, id_paquete=42)
        self.assertTrue(await nodo.cerrado())

    async def test_publicar_con_comodin_cierra_la_conexion(self):
        c = await self.nuevo("X")
        await c.recibir()
        await c.publicar("telemetria/+/lecturas", b"x")
        self.assertTrue(await c.cerrado())

    async def test_ping(self):
        c = await self.nuevo("X")
        await c.recibir()
        await c.enviar(p.armar(p.PINGREQ))
        self.assertEqual(await c.recibir(), (p.PINGRESP, 0, b""))

    async def test_keepalive_vencido_desconecta(self):
        c = await self.nuevo("X", keepalive=1)
        await c.recibir()
        self.assertTrue(await c.cerrado(espera=3))
        self.assertNotIn("X", self.broker.clientes)

    async def test_mismo_client_id_reemplaza_la_conexion(self):
        primero = await self.nuevo("F8B3B72BFC24")
        await primero.recibir()
        segundo = await self.nuevo("F8B3B72BFC24")
        await segundo.recibir()
        self.assertTrue(await primero.cerrado())
        self.assertIs(self.broker.clientes["F8B3B72BFC24"].escritor.transport.is_closing(), False)

    async def test_disconnect_limpio(self):
        c = await self.nuevo("X")
        await c.recibir()
        await c.enviar(p.armar(p.DISCONNECT))
        self.assertTrue(await c.cerrado())
        await asyncio.sleep(0.05)
        self.assertNotIn("X", self.broker.clientes)

    async def test_client_id_vacio_recibe_uno_generado(self):
        c = await self.nuevo("")
        self.assertEqual((await c.recibir())[2], b"\x00\x00")
        self.assertTrue(any(i.startswith("auto-") for i in self.broker.clientes))


if __name__ == "__main__":
    unittest.main()
