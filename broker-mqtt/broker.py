import asyncio
import logging
import os
import secrets
import signal
from dataclasses import dataclass, field

import paquetes as p
import websocket
from acl import Permisos, SinRestriccion, leer_acl
from temas import coincide, filtro_valido, tema_valido
from usuarios import credenciales_validas, leer_usuarios

registro = logging.getLogger("broker")

ESPERA_CONNECT_S = 10
TAMANO_LECTURA = 64 * 1024
LIMITE_BUFER_SALIDA = 256 * 1024
MAXIMO_TEMAS_POR_CLIENTE = 256
MAXIMO_RUTAS = 10000


@dataclass(eq=False)
class Cliente:
    client_id: str
    escritor: asyncio.StreamWriter
    keepalive: int
    permisos: object = field(default_factory=SinRestriccion)
    filtros: set = field(default_factory=set)
    temas: dict = field(default_factory=dict)

    def enviar(self, datos):
        if not self.escritor.is_closing():
            self.escritor.write(datos)

    def puede_publicar(self, tema):
        permitido = self.temas.get(tema)
        if permitido is None:
            if not tema_valido(tema):
                raise p.ErrorProtocolo(f"tema inválido «{tema}»")
            permitido = self.permisos.puede_publicar(tema)
            if len(self.temas) < MAXIMO_TEMAS_POR_CLIENTE:
                self.temas[tema] = permitido
        return permitido


class Broker:
    def __init__(self, usuarios, reglas=None, resumen_s=60):
        self.usuarios = usuarios
        self.reglas = reglas
        self.resumen_s = resumen_s
        self.clientes = {}
        self.rutas = {}
        self.publicaciones = 0
        self.entregas = 0
        self.servidor = None
        self.servidor_ws = None
        self.tarea_resumen = None

    async def iniciar(self, host="0.0.0.0", puerto=1883, puerto_ws=None):
        self.servidor = await asyncio.start_server(self.atender, host, puerto)
        if puerto_ws is not None:
            self.servidor_ws = await asyncio.start_server(self.atender_ws, host, puerto_ws)
        if self.resumen_s:
            self.tarea_resumen = asyncio.create_task(self.resumir())
        return self.servidor

    async def resumir(self):
        while True:
            await asyncio.sleep(self.resumen_s)
            if self.publicaciones:
                registro.info(
                    "Últimos %d s: %d PUBLISH, %d entregas, %d clientes conectados",
                    self.resumen_s, self.publicaciones, self.entregas, len(self.clientes),
                )
                self.publicaciones = 0
                self.entregas = 0

    def puerto(self):
        return self.servidor.sockets[0].getsockname()[1]

    def puerto_ws(self):
        return self.servidor_ws.sockets[0].getsockname()[1]

    async def detener(self):
        if self.tarea_resumen is not None:
            self.tarea_resumen.cancel()
        servidores = [s for s in (self.servidor, self.servidor_ws) if s is not None]
        for servidor in servidores:
            servidor.close()
        for cliente in list(self.clientes.values()):
            cliente.escritor.close()
        for servidor in servidores:
            await servidor.wait_closed()

    async def atender_ws(self, lector, escritor):
        par = escritor.get_extra_info("peername") or ("?", "?")
        try:
            lector_ws, escritor_ws = await websocket.aceptar(lector, escritor)
        except (p.ErrorProtocolo, asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError) as error:
            registro.warning("WebSocket rechazado desde %s:%s: %s", par[0], par[1], str(error) or type(error).__name__)
            escritor.close()
            return
        await self.atender(lector_ws, escritor_ws)

    async def atender(self, lector, escritor):
        direccion = "%s:%s" % (escritor.get_extra_info("peername") or ("?", "?"))[:2]
        cliente = None
        motivo = "DISCONNECT"
        buffer = bytearray()
        try:
            cliente, pos = await self.conectar(lector, escritor, direccion, buffer)
            if cliente is not None:
                await self.sesion(cliente, lector, buffer, pos)
        except asyncio.TimeoutError:
            motivo = "keepalive vencido" if cliente else "no envió CONNECT a tiempo"
        except (asyncio.IncompleteReadError, ConnectionError):
            motivo = "conexión cortada"
        except p.ErrorProtocolo as error:
            motivo = f"error de protocolo: {error}"
        finally:
            if cliente is not None and self.clientes.get(cliente.client_id) is cliente:
                del self.clientes[cliente.client_id]
                if cliente.filtros:
                    self.rutas.clear()
                registro.info("Desconectado %s (%s): %s", cliente.client_id, direccion, motivo)
            escritor.close()

    async def rechazar(self, escritor, codigo, direccion, motivo):
        escritor.write(p.connack(codigo))
        await escritor.drain()
        registro.warning("CONNECT rechazado desde %s (código %d): %s", direccion, codigo, motivo)

    @staticmethod
    async def leer_mas(lector, buffer, espera):
        datos = await asyncio.wait_for(lector.read(TAMANO_LECTURA), espera)
        if not datos:
            raise asyncio.IncompleteReadError(b"", 1)
        buffer += datos

    async def conectar(self, lector, escritor, direccion, buffer):
        async with asyncio.timeout(ESPERA_CONNECT_S):
            while (paquete := p.extraer(buffer)) is None:
                await self.leer_mas(lector, buffer, None)
        tipo, _, cuerpo, pos = paquete
        if tipo != p.CONNECT:
            raise p.ErrorProtocolo("el primer paquete no es CONNECT")
        datos = p.decodificar_connect(cuerpo)

        if datos.protocolo != "MQTT" or datos.nivel != 4:
            await self.rechazar(escritor, p.VERSION_NO_ACEPTADA, direccion, "no es MQTT 3.1.1")
            return None, pos
        if not datos.client_id:
            datos.client_id = f"auto-{secrets.token_hex(6)}"
        if datos.usuario is None:
            await self.rechazar(escritor, p.NO_AUTORIZADO, direccion, f"{datos.client_id} sin usuario")
            return None, pos
        if not credenciales_validas(self.usuarios, datos.usuario, datos.clave):
            await self.rechazar(
                escritor, p.CREDENCIALES_INVALIDAS, direccion, f"{datos.client_id}: usuario o clave incorrectos"
            )
            return None, pos

        anterior = self.clientes.pop(datos.client_id, None)
        if anterior is not None:
            anterior.escritor.close()
            if anterior.filtros:
                self.rutas.clear()

        permisos = SinRestriccion() if self.reglas is None else Permisos(self.reglas, datos.usuario, datos.client_id)
        cliente = Cliente(datos.client_id, escritor, datos.keepalive, permisos)
        self.clientes[cliente.client_id] = cliente
        cliente.enviar(p.connack(p.ACEPTADA))
        registro.info("Conectado %s desde %s como %s", cliente.client_id, direccion, datos.usuario)
        return cliente, pos

    async def sesion(self, cliente, lector, buffer, pos):
        espera = cliente.keepalive * 1.5 if cliente.keepalive else None
        escritor = cliente.escritor
        while True:
            while (paquete := p.extraer(buffer, pos)) is not None:
                tipo, banderas, cuerpo, pos = paquete
                if tipo == p.PUBLISH:
                    self.recibir_publicacion(cliente, banderas, cuerpo)
                elif tipo == p.SUBSCRIBE:
                    self.suscribir(cliente, cuerpo)
                elif tipo == p.UNSUBSCRIBE:
                    self.desuscribir(cliente, cuerpo)
                elif tipo == p.PINGREQ:
                    cliente.enviar(p.pingresp())
                elif tipo == p.DISCONNECT:
                    return
                else:
                    raise p.ErrorProtocolo(f"paquete de tipo {tipo} no soportado")
            del buffer[:pos]
            pos = 0
            if escritor.transport.get_write_buffer_size() > LIMITE_BUFER_SALIDA:
                await escritor.drain()
            await self.leer_mas(lector, buffer, espera)

    def recibir_publicacion(self, cliente, banderas, cuerpo):
        qos = (banderas >> 1) & 0x03
        if qos:
            raise p.ErrorProtocolo(f"QoS {qos} no soportado, solo QoS 0")
        tema = p.tema_de_publish(cuerpo)
        if not cliente.puede_publicar(tema):
            registro.warning("PUBLISH denegado por la ACL: %s → %s (descartado)", cliente.client_id, tema)
            return
        destinos = self.destinos(tema)
        if destinos:
            paquete = p.reenviar_publish(cuerpo)
            for destino in destinos:
                destino.enviar(paquete)
        self.publicaciones += 1
        self.entregas += len(destinos)
        if registro.isEnabledFor(logging.DEBUG):
            registro.debug("PUBLISH %s → %s (%d bytes, %d entregas)", cliente.client_id, tema,
                           len(cuerpo) - len(tema.encode("utf-8")) - 2, len(destinos))

    def destinos(self, tema):
        destinos = self.rutas.get(tema)
        if destinos is None:
            destinos = tuple(
                c for c in self.clientes.values() if any(coincide(filtro, tema) for filtro in c.filtros)
            )
            if len(self.rutas) >= MAXIMO_RUTAS:
                self.rutas.clear()
            self.rutas[tema] = destinos
        return destinos

    def suscribir(self, cliente, cuerpo):
        id_paquete, filtros = p.decodificar_subscribe(cuerpo)
        codigos = []
        for filtro in filtros:
            if not filtro_valido(filtro):
                codigos.append(0x80)
            elif not cliente.permisos.puede_suscribirse(filtro):
                codigos.append(0x80)
                registro.warning("SUBSCRIBE denegado por la ACL: %s → %s", cliente.client_id, filtro)
            else:
                cliente.filtros.add(filtro)
                codigos.append(0x00)
                self.rutas.clear()
        cliente.enviar(p.suback(id_paquete, codigos))
        aceptados = [f for f, codigo in zip(filtros, codigos) if codigo == 0x00]
        if aceptados:
            registro.info("SUBSCRIBE %s → %s", cliente.client_id, ", ".join(aceptados))

    def desuscribir(self, cliente, cuerpo):
        id_paquete, filtros = p.decodificar_unsubscribe(cuerpo)
        for filtro in filtros:
            cliente.filtros.discard(filtro)
        self.rutas.clear()
        cliente.enviar(p.unsuback(id_paquete))
        registro.info("UNSUBSCRIBE %s → %s", cliente.client_id, ", ".join(filtros))


async def principal():
    logging.basicConfig(
        level=os.environ.get("BROKER_LOG", "INFO").upper(),
        format="%(asctime)s %(levelname)-7s %(message)s",
    )
    usuarios = leer_usuarios(os.environ.get("BROKER_USERS", ""))
    if not usuarios:
        registro.error("BROKER_USERS está vacío: define usuario:clave,usuario:clave")
        raise SystemExit(1)
    reglas = leer_acl(os.environ.get("BROKER_ACL", ""))
    if not reglas:
        registro.warning("BROKER_ACL está vacío: cualquier usuario puede publicar y suscribirse a todo")
    puerto = int(os.environ.get("BROKER_PUERTO", "1883"))
    puerto_ws = int(os.environ.get("BROKER_PUERTO_WS", "9001")) or None

    resumen_s = int(os.environ.get("BROKER_RESUMEN_S", "60"))
    broker = Broker(usuarios, reglas or None, resumen_s)
    await broker.iniciar(puerto=puerto, puerto_ws=puerto_ws)
    registro.info("Broker TeleMon escuchando en el puerto %d (MQTT 3.1.1, QoS 0)", puerto)
    if puerto_ws:
        registro.info("MQTT sobre WebSocket en el puerto %d", puerto_ws)
    for regla in reglas:
        registro.info("ACL: %s %s %s", regla.usuario, "/".join(sorted(regla.acciones)), regla.patron)

    parar = asyncio.Event()
    bucle = asyncio.get_running_loop()
    for senal in (signal.SIGINT, signal.SIGTERM):
        bucle.add_signal_handler(senal, parar.set)
    await parar.wait()

    registro.info("Deteniendo el broker")
    await broker.detener()


if __name__ == "__main__":
    asyncio.run(principal())
