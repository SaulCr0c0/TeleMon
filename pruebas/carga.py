import argparse
import json
import math
import os
import random
import re
import selectors
import statistics
import sys
import threading
import time
import uuid


def argumentos(argv=None):
    p = argparse.ArgumentParser(description="Clientes MQTT simulados para TeleMon")
    p.add_argument("--host", default="localhost")
    p.add_argument("--puerto", type=int, default=1883)
    p.add_argument("--clientes", type=int, default=10)
    p.add_argument("--duracion", type=float, default=60, help="segundos publicando")
    p.add_argument("--intervalo", type=float, default=5, help="segundos entre rondas")
    p.add_argument("--ids", default="", help="IDs de 12 caracteres hexadecimales, separados por coma")
    a = p.parse_args(argv)
    if not 1 <= a.puerto <= 65535 or a.clientes < 1:
        p.error("El puerto debe estar entre 1 y 65535 y clientes debe ser positivo.")
    if any(not math.isfinite(v) or v <= 0 for v in (a.duracion, a.intervalo)):
        p.error("Duración e intervalo deben ser números finitos positivos.")
    ids = [ident.strip().upper() for ident in a.ids.split(",") if ident.strip()]
    if any(not re.fullmatch(r"[0-9A-F]{12}", ident) for ident in ids):
        p.error("Cada ID debe tener 12 caracteres hexadecimales, sin dos puntos.")
    if len(ids) > a.clientes or len(set(ids)) != len(ids):
        p.error("Los IDs deben ser únicos y no superar la cantidad de clientes.")
    n = 0
    while len(ids) < a.clientes:
        ident = f"CA{n:010X}"
        if ident not in ids:
            ids.append(ident)
        n += 1
    a.ids = ids
    return a


def lectura(ident, inicio, ejecucion, secuencia):
    return {
        "mac": ":".join(ident[i:i + 2] for i in range(0, 12, 2)),
        "ts": int(time.time() * 1000),
        "uptime": int(time.monotonic() - inicio),
        "temperatura": round(random.uniform(20, 25), 2),
        "humedad": round(random.uniform(40, 55), 1),
        "presion": round(random.uniform(745, 752), 1),
        "mq135_v": round(random.uniform(0.35, 0.6), 3),
        "rssi": random.randint(-75, -50),
        "fw": "1.1.0",
        "carga_id": ejecucion,
        "carga_seq": secuencia,
    }


class Medicion:
    def __init__(self, ejecucion):
        self.ejecucion = ejecucion
        self.pendientes = {}
        self.latencias = []
        self.candado = threading.Lock()

    def registrar(self, tema, secuencia):
        with self.candado:
            self.pendientes[(tema, secuencia)] = time.monotonic()

    def cancelar(self, tema, secuencia):
        with self.candado:
            self.pendientes.pop((tema, secuencia), None)

    def recibir(self, tema, payload):
        try:
            dato = json.loads(payload)
        except (ValueError, UnicodeDecodeError):
            return
        if not isinstance(dato, dict) or dato.get("carga_id") != self.ejecucion:
            return
        secuencia = dato.get("carga_seq")
        if type(secuencia) is not int:
            return
        with self.candado:
            inicio = self.pendientes.pop((tema, secuencia), None)
            if inicio is not None:
                self.latencias.append((time.monotonic() - inicio) * 1000)

    def resumen(self):
        with self.candado:
            return list(self.latencias), len(self.pendientes)


class RedMqtt:
    def __init__(self):
        self.selector = selectors.DefaultSelector()
        self.activos = set()
        self.ultimo_mantenimiento = time.monotonic()

    def agregar(self, cliente):
        cliente.on_socket_open = self.abrir
        cliente.on_socket_close = self.cerrar_socket
        cliente.on_socket_register_write = self.escribir
        cliente.on_socket_unregister_write = self.solo_leer

    def abrir(self, cliente, _usuario, socket):
        self.selector.register(socket, selectors.EVENT_READ, cliente)
        self.activos.add(cliente)

    def cerrar_socket(self, cliente, _usuario, socket):
        self.selector.unregister(socket)
        self.activos.discard(cliente)

    def escribir(self, cliente, _usuario, socket):
        self.selector.modify(socket, selectors.EVENT_READ | selectors.EVENT_WRITE, cliente)

    def solo_leer(self, cliente, _usuario, socket):
        self.selector.modify(socket, selectors.EVENT_READ, cliente)

    def procesar(self, timeout):
        for clave, eventos in self.selector.select(timeout):
            cliente = clave.data
            if eventos & selectors.EVENT_READ:
                cliente.loop_read()
            if cliente.socket() is not None and eventos & selectors.EVENT_WRITE:
                cliente.loop_write()
        if time.monotonic() - self.ultimo_mantenimiento >= 1:
            for cliente in list(self.activos):
                cliente.loop_misc()
            self.ultimo_mantenimiento = time.monotonic()

    def esperar(self, condicion, timeout):
        fin = time.monotonic() + timeout
        while not condicion():
            restante = fin - time.monotonic()
            if restante <= 0:
                return False
            self.procesar(min(restante, 0.1))
        return True

    def cerrar(self):
        for cliente in list(self.activos):
            socket = cliente.socket()
            cliente.on_socket_close = None
            cliente.on_socket_register_write = None
            cliente.on_socket_unregister_write = None
            if socket is not None:
                self.selector.unregister(socket)
                socket.close()
            self.activos.discard(cliente)
        self.selector.close()


def ejecutar(a):
    import paho.mqtt.client as mqtt

    nombres = ("MQTT_USER_ESP32", "MQTT_PASS_ESP32", "MQTT_USER_NODERED", "MQTT_PASS_NODERED")
    if any(not os.environ.get(nombre) for nombre in nombres):
        raise RuntimeError("Faltan credenciales MQTT. Carga las cuatro variables del .env.")
    ejecucion = uuid.uuid4().hex
    medicion = Medicion(ejecucion)
    clientes = []
    fallos = []
    cerrando = threading.Event()
    suscrito = threading.Event()
    error_suscripcion = []
    red = RedMqtt()

    def al_desconectar(_c, ident, _flags, razon, _props):
        if not cerrando.is_set():
            fallos.append(f"Desconexión MQTT inesperada de {ident}: {razon}")

    def al_suscribir(_c, _u, _mid, razones, _props):
        if any(razon.is_failure for razon in razones):
            error_suscripcion.append("El broker rechazó la suscripción.")
        suscrito.set()

    def conectar(ident, usuario, clave, oyente=False):
        listo = threading.Event()
        errores = []

        def al_conectar(_c, _u, _flags, razon, _props):
            if razon.is_failure:
                errores.append(f"Conexión de {ident} rechazada: {razon}")
            listo.set()

        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=ident, reconnect_on_failure=False)
        clientes.append(c)
        c.user_data_set(ident)
        c.username_pw_set(usuario, clave)
        c.on_connect = al_conectar
        c.on_disconnect = al_desconectar
        red.agregar(c)
        if oyente:
            c.on_message = lambda _c, _u, m: medicion.recibir(m.topic, m.payload)
            c.on_subscribe = al_suscribir
        c.connect_timeout = 10
        c.connect(a.host, a.puerto, keepalive=60)
        if not red.esperar(lambda: listo.is_set() or bool(fallos), 10):
            raise RuntimeError(
                f"El broker no confirmó la conexión de {ident} en 10 segundos "
                f"({len(clientes) - 1} conexiones previas)."
            )
        if errores:
            raise RuntimeError(errores[0])
        if fallos:
            raise RuntimeError(fallos[0])
        return c

    try:
        oyente = conectar(f"carga-oyente-{ejecucion}", os.environ[nombres[2]], os.environ[nombres[3]], True)
        resultado, _ = oyente.subscribe("telemetria/+/lecturas", qos=0)
        if resultado != mqtt.MQTT_ERR_SUCCESS or not red.esperar(suscrito.is_set, 10):
            raise RuntimeError("No se confirmó la suscripción en 10 segundos.")
        if error_suscripcion:
            raise RuntimeError(error_suscripcion[0])
        publicadores = []
        for ident in a.ids:
            publicadores.append((ident, conectar(ident, os.environ[nombres[0]], os.environ[nombres[1]])))
            if len(publicadores) % 100 == 0:
                print(f"Conectados: {len(publicadores)}/{a.clientes} publicadores", flush=True)
        print(f"{len(publicadores)} publicadores + 1 oyente en {a.host}:{a.puerto}; QoS 0")
        print(f"Duración: {a.duracion:g} s; intervalo: {a.intervalo:g} s", flush=True)
        inicio = time.monotonic()
        fin = inicio + a.duracion
        siguiente = inicio
        enviados = 0
        secuencia = 0
        while time.monotonic() < fin:
            if fallos:
                raise RuntimeError(fallos[0])
            for ident, c in publicadores:
                if time.monotonic() >= fin:
                    break
                tema = f"telemetria/{ident}/lecturas"
                payload = json.dumps(lectura(ident, inicio, ejecucion, secuencia))
                medicion.registrar(tema, secuencia)
                info = c.publish(tema, payload, qos=0)
                if info.rc != mqtt.MQTT_ERR_SUCCESS:
                    medicion.cancelar(tema, secuencia)
                    raise RuntimeError(f"No se pudo publicar: código MQTT {info.rc}.")
                enviados += 1
                secuencia += 1
                red.procesar(0)
            siguiente = max(siguiente + a.intervalo, time.monotonic())
            red.esperar(lambda: bool(fallos), max(0, min(siguiente, fin) - time.monotonic()))
        limite = time.monotonic() + 5
        while medicion.resumen()[1] and time.monotonic() < limite and not fallos:
            red.procesar(0.05)
        if fallos:
            raise RuntimeError(fallos[0])
        latencias, perdidos = medicion.resumen()
        print(f"Enviados: {enviados}  Recibidos: {len(latencias)}  Perdidos: {perdidos}")
        if latencias:
            p95 = sorted(latencias)[math.ceil(len(latencias) * 0.95) - 1]
            print(f"Latencia p50: {statistics.median(latencias):.1f} ms  p95: {p95:.1f} ms")
        else:
            print("Sin mensajes recibidos: no se puede calcular latencia.")
        return 1 if perdidos or not latencias else 0
    finally:
        cerrando.set()
        try:
            for c in reversed(clientes):
                c.disconnect()
            red.esperar(lambda: not red.activos, 5)
        finally:
            red.cerrar()


def main():
    a = argumentos()
    try:
        return ejecutar(a)
    except ImportError:
        print("Instala las dependencias: python -m pip install -r requirements.txt", file=sys.stderr)
    except KeyboardInterrupt:
        print("Prueba interrumpida; no hay resultado completo.", file=sys.stderr)
        return 130
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Prueba incompleta: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
