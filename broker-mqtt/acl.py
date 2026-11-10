from dataclasses import dataclass

from temas import coincide, filtro_valido

ACCIONES = {"read": {"read"}, "write": {"write"}, "readwrite": {"read", "write"}}
PROHIBIDOS_EN_SUSTITUCION = ("/", "+", "#")


@dataclass(frozen=True)
class Regla:
    usuario: str
    acciones: frozenset
    patron: str


def leer_acl(texto):
    reglas = []
    for entrada in (texto or "").split(","):
        entrada = entrada.strip()
        if not entrada:
            continue
        partes = entrada.split(":", 2)
        if len(partes) != 3 or not all(partes):
            raise ValueError(f"BROKER_ACL mal formado cerca de «{entrada}»; se espera usuario:accion:patron")
        usuario, accion, patron = partes
        if accion not in ACCIONES:
            raise ValueError(f"BROKER_ACL: acción «{accion}» desconocida; usa read, write o readwrite")
        if not filtro_valido(patron.replace("%c", "x").replace("%u", "x")):
            raise ValueError(f"BROKER_ACL: patrón «{patron}» inválido")
        reglas.append(Regla(usuario, frozenset(ACCIONES[accion]), patron))
    return reglas


def sustituir(patron, usuario, client_id):
    for marca, valor in (("%c", client_id), ("%u", usuario)):
        if marca in patron:
            if not valor or any(s in valor for s in PROHIBIDOS_EN_SUSTITUCION):
                return None
            patron = patron.replace(marca, valor)
    return patron


def cubre(patron, filtro):
    niveles_patron = patron.split("/")
    niveles_filtro = filtro.split("/")
    for i, nivel in enumerate(niveles_patron):
        if nivel == "#":
            return True
        if i >= len(niveles_filtro):
            return False
        pedido = niveles_filtro[i]
        if pedido == "#":
            return False
        if nivel == "+":
            continue
        if pedido == "+" or pedido != nivel:
            return False
    return len(niveles_patron) == len(niveles_filtro)


class Permisos:
    def __init__(self, reglas, usuario, client_id):
        self.lectura = []
        self.escritura = []
        for regla in reglas:
            if regla.usuario != usuario:
                continue
            patron = sustituir(regla.patron, usuario, client_id)
            if patron is None:
                continue
            if "read" in regla.acciones:
                self.lectura.append(patron)
            if "write" in regla.acciones:
                self.escritura.append(patron)

    def puede_publicar(self, tema):
        return any(coincide(patron, tema) for patron in self.escritura)

    def puede_suscribirse(self, filtro):
        return any(cubre(patron, filtro) for patron in self.lectura)


class SinRestriccion:
    def puede_publicar(self, tema):
        return True

    def puede_suscribirse(self, filtro):
        return True
