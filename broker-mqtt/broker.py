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


@dataclass(eq=False)
class Cliente:
    client_id: str
    escritor: asyncio.StreamWriter
    keepalive: int
    permisos: object = field(default_factory=SinRestriccion)
    filtros: set = field(default_factory=set)

    def enviar(self, datos):
        if not self.escritor.is_closing():
            self.escritor.write(datos)


class Broker:
    def __init__(self, usuarios, reglas=None):
        self.usuarios = usuarios
        self.reglas = reglas
        self.clientes = {}
        self.servidor = None
        self.servidor_ws = None

    async def iniciar(self, host="0.0.0.0", puerto=1883, puerto_ws=None):
        self.servidor = await asyncio.start_server(self.atender, host, puerto)
        if puerto_ws is not None:
            self.servidor_ws = await asyncio.start_server(self.atender_ws, host, puerto_ws)
        return self.servidor

    def puerto(self):
        return self.servidor.sockets[0].getsockname()[1]

    def puerto_ws(self):
        return self.servidor_ws.sockets[0].getsockname()[1]

    async def detener(self):
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
        try:
            cliente = await self.conectar(lector, escritor, direccion)
            if cliente is not None:
                await self.sesion(cliente, lector)
        except asyncio.TimeoutError:
            motivo = "keepalive vencido" if cliente else "no envió CONNECT a tiempo"
        except (asyncio.IncompleteReadError, ConnectionError):
            motivo = "conexión cortada"
        except p.ErrorProtocolo as error:
            motivo = f"error de protocolo: {error}"
        finally:
            if cliente is not None and self.clientes.get(cliente.client_id) is cliente:
                del self.clientes[cliente.client_id]
                registro.info("Desconectado %s (%s): %s", cliente.client_id, direccion, motivo)
            escritor.close()

    async def rechazar(self, escritor, codigo, direccion, motivo):
        escritor.write(p.connack(codigo))
        await escritor.drain()
        registro.warning("CONNECT rechazado desde %s (código %d): %s", direccion, codigo, motivo)

    async def conectar(self, lector, escritor, direccion):
        tipo, _, cuerpo = await asyncio.wait_for(p.leer_paquete(lector), ESPERA_CONNECT_S)
        if tipo != p.CONNECT:
            raise p.ErrorProtocolo("el primer paquete no es CONNECT")
        datos = p.decodificar_connect(cuerpo)

        if datos.protocolo != "MQTT" or datos.nivel != 4:
            await self.rechazar(escritor, p.VERSION_NO_ACEPTADA, direccion, "no es MQTT 3.1.1")
            return None
        if not datos.client_id:
            datos.client_id = f"auto-{secrets.token_hex(6)}"
        if datos.usuario is None:
            await self.rechazar(escritor, p.NO_AUTORIZADO, direccion, f"{datos.client_id} sin usuario")
            return None
        if not credenciales_validas(self.usuarios, datos.usuario, datos.clave):
            await self.rechazar(
                escritor, p.CREDENCIALES_INVALIDAS, direccion, f"{datos.client_id}: usuario o clave incorrectos"
            )
            return None

        anterior = self.clientes.pop(datos.client_id, None)
        if anterior is not None:
            anterior.escritor.close()

        permisos = SinRestriccion() if self.reglas is None else Permisos(self.reglas, datos.usuario, datos.client_id)
        cliente = Cliente(datos.client_id, escritor, datos.keepalive, permisos)
        self.clientes[cliente.client_id] = cliente
        cliente.enviar(p.connack(p.ACEPTADA))
        registro.info("Conectado %s desde %s como %s", cliente.client_id, direccion, datos.usuario)
        return cliente

    async def sesion(self, cliente, lector):
        espera = cliente.keepalive * 1.5 if cliente.keepalive else None
        while True:
            tipo, banderas, cuerpo = await asyncio.wait_for(p.leer_paquete(lector), espera)
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
            await cliente.escritor.drain()

    def recibir_publicacion(self, cliente, banderas, cuerpo):
        tema, qos, carga = p.decodificar_publish(banderas, cuerpo)
        if qos != 0:
            raise p.ErrorProtocolo(f"QoS {qos} no soportado, solo QoS 0")
        if not tema_valido(tema):
            raise p.ErrorProtocolo(f"tema inválido «{tema}»")
        if not cliente.permisos.puede_publicar(tema):
            registro.warning("PUBLISH denegado por la ACL: %s → %s (descartado)", cliente.client_id, tema)
            return
        entregas = self.enrutar(tema, carga)
        registro.info("PUBLISH %s → %s (%d bytes, %d entregas)", cliente.client_id, tema, len(carga), entregas)

    def enrutar(self, tema, carga):
        paquete = p.publish(tema, carga)
        entregas = 0
        for destino in list(self.clientes.values()):
            if any(coincide(filtro, tema) for filtro in destino.filtros):
                destino.enviar(paquete)
                entregas += 1
        return entregas

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
        cliente.enviar(p.suback(id_paquete, codigos))
        aceptados = [f for f, codigo in zip(filtros, codigos) if codigo == 0x00]
        if aceptados:
            registro.info("SUBSCRIBE %s → %s", cliente.client_id, ", ".join(aceptados))

    def desuscribir(self, cliente, cuerpo):
        id_paquete, filtros = p.decodificar_unsubscribe(cuerpo)
        for filtro in filtros:
            cliente.filtros.discard(filtro)
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

    broker = Broker(usuarios, reglas or None)
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
