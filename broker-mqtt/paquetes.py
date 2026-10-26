from dataclasses import dataclass

CONNECT = 1
CONNACK = 2
PUBLISH = 3
SUBSCRIBE = 8
SUBACK = 9
UNSUBSCRIBE = 10
UNSUBACK = 11
PINGREQ = 12
PINGRESP = 13
DISCONNECT = 14

ACEPTADA = 0x00
VERSION_NO_ACEPTADA = 0x01
CREDENCIALES_INVALIDAS = 0x04
NO_AUTORIZADO = 0x05

TAMANO_MAXIMO = 256 * 1024


class ErrorProtocolo(Exception):
    pass


async def leer_longitud(lector):
    valor = 0
    multiplicador = 1
    for _ in range(4):
        byte = (await lector.readexactly(1))[0]
        valor += (byte & 0x7F) * multiplicador
        if not byte & 0x80:
            return valor
        multiplicador *= 128
    raise ErrorProtocolo("longitud restante de más de 4 bytes")


async def leer_paquete(lector):
    primero = (await lector.readexactly(1))[0]
    restante = await leer_longitud(lector)
    if restante > TAMANO_MAXIMO:
        raise ErrorProtocolo(f"paquete de {restante} bytes supera el máximo de {TAMANO_MAXIMO}")
    cuerpo = await lector.readexactly(restante) if restante else b""
    return primero >> 4, primero & 0x0F, cuerpo


def codificar_longitud(n):
    salida = bytearray()
    while True:
        byte = n % 128
        n //= 128
        if n:
            byte |= 0x80
        salida.append(byte)
        if not n:
            return bytes(salida)


def armar(tipo, banderas=0, cuerpo=b""):
    return bytes([(tipo << 4) | banderas]) + codificar_longitud(len(cuerpo)) + cuerpo


def cadena(texto):
    datos = texto.encode("utf-8")
    return len(datos).to_bytes(2, "big") + datos


class Cursor:
    def __init__(self, datos):
        self.datos = datos
        self.pos = 0

    def tomar(self, n):
        if self.pos + n > len(self.datos):
            raise ErrorProtocolo("paquete incompleto")
        valor = self.datos[self.pos:self.pos + n]
        self.pos += n
        return valor

    def byte(self):
        return self.tomar(1)[0]

    def entero16(self):
        return int.from_bytes(self.tomar(2), "big")

    def binario(self):
        return self.tomar(self.entero16())

    def texto(self):
        try:
            return self.binario().decode("utf-8")
        except UnicodeDecodeError as error:
            raise ErrorProtocolo("cadena que no es UTF-8") from error

    def resto(self):
        return self.tomar(len(self.datos) - self.pos)

    def quedan(self):
        return len(self.datos) - self.pos


@dataclass
class Conexion:
    protocolo: str
    nivel: int
    keepalive: int
    client_id: str
    usuario: str | None = None
    clave: bytes | None = None


def decodificar_connect(cuerpo):
    c = Cursor(cuerpo)
    protocolo = c.texto()
    nivel = c.byte()
    opciones = c.byte()
    keepalive = c.entero16()
    conexion = Conexion(protocolo, nivel, keepalive, c.texto())
    if opciones & 0x04:
        c.texto()
        c.binario()
    if opciones & 0x80:
        conexion.usuario = c.texto()
    if opciones & 0x40:
        conexion.clave = c.binario()
    return conexion


def connack(codigo):
    return armar(CONNACK, 0, bytes([0, codigo]))


def decodificar_publish(banderas, cuerpo):
    qos = (banderas >> 1) & 0x03
    c = Cursor(cuerpo)
    tema = c.texto()
    if qos:
        c.entero16()
    return tema, qos, c.resto()


def publish(tema, carga):
    return armar(PUBLISH, 0, cadena(tema) + carga)


def decodificar_subscribe(cuerpo):
    c = Cursor(cuerpo)
    id_paquete = c.entero16()
    filtros = []
    while c.quedan():
        filtros.append(c.texto())
        c.byte()
    if not filtros:
        raise ErrorProtocolo("SUBSCRIBE sin filtros")
    return id_paquete, filtros


def suback(id_paquete, codigos):
    return armar(SUBACK, 0, id_paquete.to_bytes(2, "big") + bytes(codigos))


def decodificar_unsubscribe(cuerpo):
    c = Cursor(cuerpo)
    id_paquete = c.entero16()
    filtros = []
    while c.quedan():
        filtros.append(c.texto())
    return id_paquete, filtros


def unsuback(id_paquete):
    return armar(UNSUBACK, 0, id_paquete.to_bytes(2, "big"))


def pingresp():
    return armar(PINGRESP)
