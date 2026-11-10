import asyncio
import base64
import hashlib

from paquetes import TAMANO_MAXIMO, ErrorProtocolo

GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
SUBPROTOCOLOS = ("mqtt", "mqttv3.1")
ESPERA_SALUDO_S = 10
CABECERA_MAXIMA = 8192
TRAMA_MAXIMA = TAMANO_MAXIMO + 16

CONTINUACION = 0x0
TEXTO = 0x1
BINARIA = 0x2
CIERRE = 0x8
PING = 0x9
PONG = 0xA

RESPUESTA_INVALIDA = b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"


class CierreWebSocket(ConnectionError):
    pass


def aceptacion(clave):
    return base64.b64encode(hashlib.sha1(clave.encode("ascii") + GUID).digest()).decode("ascii")


def desenmascarar(datos, mascara):
    if not datos:
        return b""
    n = len(datos)
    repetida = (mascara * (n // 4 + 1))[:n]
    return (int.from_bytes(datos, "big") ^ int.from_bytes(repetida, "big")).to_bytes(n, "big")


def trama(opcode, datos=b""):
    n = len(datos)
    if n < 126:
        cabecera = bytes([0x80 | opcode, n])
    elif n < 65536:
        cabecera = bytes([0x80 | opcode, 126]) + n.to_bytes(2, "big")
    else:
        cabecera = bytes([0x80 | opcode, 127]) + n.to_bytes(8, "big")
    return cabecera + datos


async def leer_trama(lector):
    primero, segundo = await lector.readexactly(2)
    if primero & 0x70:
        raise ErrorProtocolo("trama WebSocket con bits RSV activos")
    opcode = primero & 0x0F
    if not segundo & 0x80:
        raise ErrorProtocolo("trama WebSocket del cliente sin máscara")
    largo = segundo & 0x7F
    if largo == 126:
        largo = int.from_bytes(await lector.readexactly(2), "big")
    elif largo == 127:
        largo = int.from_bytes(await lector.readexactly(8), "big")
    if largo > TRAMA_MAXIMA:
        raise ErrorProtocolo(f"trama WebSocket de {largo} bytes supera el máximo")
    if opcode >= CIERRE and (largo > 125 or not primero & 0x80):
        raise ErrorProtocolo("trama de control WebSocket inválida")
    mascara = await lector.readexactly(4)
    return opcode, desenmascarar(await lector.readexactly(largo), mascara)


def leer_cabecera(texto):
    lineas = texto.split("\r\n")
    partes = lineas[0].split(" ")
    campos = {}
    for linea in lineas[1:]:
        nombre, separador, valor = linea.partition(":")
        if separador:
            campos[nombre.strip().lower()] = valor.strip()
    return partes, campos


def origen_real(campos):
    reenviado = campos.get("x-forwarded-for", "").split(",")[0].strip()
    return campos.get("cf-connecting-ip") or reenviado or None


async def aceptar(lector, escritor):
    try:
        cabecera = await asyncio.wait_for(lector.readuntil(b"\r\n\r\n"), ESPERA_SALUDO_S)
    except asyncio.LimitOverrunError as error:
        raise ErrorProtocolo("cabecera HTTP demasiado grande") from error
    if len(cabecera) > CABECERA_MAXIMA:
        raise ErrorProtocolo("cabecera HTTP demasiado grande")
    partes, campos = leer_cabecera(cabecera.decode("latin-1"))
    clave = campos.get("sec-websocket-key", "")
    valido = (
        len(partes) == 3
        and partes[0] == "GET"
        and "websocket" in campos.get("upgrade", "").lower()
        and "upgrade" in campos.get("connection", "").lower()
        and campos.get("sec-websocket-version") == "13"
        and clave
    )
    pedidos = [x.strip() for x in campos.get("sec-websocket-protocol", "").split(",") if x.strip()]
    elegido = next((x for x in pedidos if x in SUBPROTOCOLOS), None)
    if not valido or (pedidos and elegido is None):
        escritor.write(RESPUESTA_INVALIDA)
        await escritor.drain()
        motivo = "subprotocolo no soportado" if valido else "no es un pedido de WebSocket"
        raise ErrorProtocolo(motivo)

    respuesta = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Accept: {aceptacion(clave)}",
    ]
    if elegido:
        respuesta.append(f"Sec-WebSocket-Protocol: {elegido}")
    escritor.write(("\r\n".join(respuesta) + "\r\n\r\n").encode("ascii"))
    await escritor.drain()
    return LectorWS(lector, escritor), EscritorWS(escritor, origen_real(campos))


class LectorWS:
    def __init__(self, lector, escritor):
        self.lector = lector
        self.escritor = escritor
        self.pendiente = bytearray()

    async def readexactly(self, n):
        while len(self.pendiente) < n:
            await self.siguiente_trama()
        datos = bytes(self.pendiente[:n])
        del self.pendiente[:n]
        return datos

    async def siguiente_trama(self):
        opcode, datos = await leer_trama(self.lector)
        if opcode in (BINARIA, CONTINUACION):
            self.pendiente += datos
        elif opcode == PING:
            self.escritor.write(trama(PONG, datos))
        elif opcode == CIERRE:
            if not self.escritor.is_closing():
                self.escritor.write(trama(CIERRE, datos[:2]))
            raise CierreWebSocket("el cliente cerró el WebSocket")
        elif opcode == TEXTO:
            raise ErrorProtocolo("MQTT sobre WebSocket exige tramas binarias")
        elif opcode != PONG:
            raise ErrorProtocolo(f"opcode WebSocket {opcode} desconocido")


class EscritorWS:
    def __init__(self, escritor, origen=None):
        self.escritor = escritor
        self.origen = origen

    def write(self, datos):
        self.escritor.write(trama(BINARIA, datos))

    async def drain(self):
        await self.escritor.drain()

    def is_closing(self):
        return self.escritor.is_closing()

    def close(self):
        if not self.escritor.is_closing():
            self.escritor.write(trama(CIERRE, (1000).to_bytes(2, "big")))
        self.escritor.close()

    async def wait_closed(self):
        await self.escritor.wait_closed()

    def get_extra_info(self, nombre, defecto=None):
        if nombre == "peername":
            if self.origen:
                return (self.origen, "ws")
            par = self.escritor.get_extra_info("peername")
            return (par[0], f"{par[1]}/ws") if par else defecto
        return self.escritor.get_extra_info(nombre, defecto)
