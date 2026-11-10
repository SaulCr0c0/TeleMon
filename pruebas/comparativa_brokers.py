import argparse
import csv
import json
import math
import os
import platform
import re
import secrets
import statistics
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PRUEBAS = RAIZ / "pruebas"
RED = "telemon-comparativa"
IMAGEN_PROPIO = "telemon-comparativa-propio"
IMAGEN_ANTERIOR = "telemon-comparativa-propio-anterior"
IMAGEN_CLIENTE = "telemon-comparativa-cliente"
IMAGEN_MOSQUITTO = "eclipse-mosquitto:2"
IMAGEN_CAPTURA = "nicolaka/netshoot:v0.13"

BROKERS = {
    "mosquitto": {"contenedor": "cmp-mosquitto", "nombre": "Mosquitto"},
    "propio-anterior": {"contenedor": "cmp-propio-anterior", "nombre": "Broker propio sin optimizar", "log": "INFO"},
    "propio": {"contenedor": "cmp-propio", "nombre": "Broker propio", "log": "INFO"},
    "propio-sin-log": {"contenedor": "cmp-propio-sin-log", "nombre": "Broker propio (log WARNING)", "log": "WARNING"},
}

ESCENARIOS = {
    "1-cliente": {"clientes": 1, "duracion": 60, "intervalo": 1.0},
    "10-clientes": {"clientes": 10, "duracion": 60, "intervalo": 1.0},
    "50-clientes": {"clientes": 50, "duracion": 60, "intervalo": 1.0},
    "estres-50": {"clientes": 50, "duracion": 30, "intervalo": 0.01},
}

CLIENTE_DOCKERFILE = """FROM python:3.12-slim
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
"""

CICLO_CAPTURA = """
import os, time
import paho.mqtt.client as mqtt
c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="A1B2C3D4E5F6", protocol=mqtt.MQTTv311)
c.username_pw_set(os.environ["MQTT_USER_ESP32"], os.environ["MQTT_PASS_ESP32"])
c.connect(os.environ["HOST"], 1883, keepalive=60)
c.loop_start()
time.sleep(0.5)
c.publish("telemetria/A1B2C3D4E5F6/lecturas", '{"mac":"A1:B2:C3:D4:E5:F6","ts":1762732800000,"uptime":3600,"temperatura":22.4,"humedad":55.0,"presion":746.8,"mq135_v":0.415,"rssi":-61,"fw":"1.1.0"}', qos=0).wait_for_publish()
time.sleep(0.5)
c.disconnect()
c.loop_stop()
"""


def docker(*args, entrada=None, verificar=True, capturar=True):
    resultado = subprocess.run(
        ["docker", *args], input=entrada, text=True,
        stdout=subprocess.PIPE if capturar else None, stderr=subprocess.STDOUT if capturar else None,
    )
    if verificar and resultado.returncode:
        raise RuntimeError(f"docker {' '.join(args[:3])} falló:\n{resultado.stdout}")
    return (resultado.stdout or "").strip()


def credenciales():
    return {
        "MQTT_USER_ESP32": "esp32",
        "MQTT_PASS_ESP32": secrets.token_hex(12),
        "MQTT_USER_NODERED": "nodered",
        "MQTT_PASS_NODERED": secrets.token_hex(12),
    }


def variables(env):
    salida = []
    for clave, valor in env.items():
        salida += ["-e", f"{clave}={valor}"]
    return salida


class Recursos:
    def __init__(self, contenedor, periodo=0.5):
        self.periodo = periodo
        ident = docker("inspect", "-f", "{{.Id}}", contenedor)
        self.ruta = self.buscar_cgroup(ident)
        self.contenedor = contenedor
        self.muestras = []
        self.parar = threading.Event()
        self.hilo = threading.Thread(target=self.medir, daemon=True)

    @staticmethod
    def buscar_cgroup(ident):
        for ruta in (
            Path(f"/sys/fs/cgroup/system.slice/docker-{ident}.scope"),
            Path(f"/sys/fs/cgroup/docker/{ident}"),
        ):
            if (ruta / "cpu.stat").exists():
                return ruta
        raise RuntimeError("No se encontró el cgroup v2 del contenedor")

    def leer(self):
        cpu = 0
        for linea in (self.ruta / "cpu.stat").read_text().splitlines():
            if linea.startswith("usage_usec "):
                cpu = int(linea.split()[1])
        memoria = int((self.ruta / "memory.current").read_text())
        for linea in (self.ruta / "memory.stat").read_text().splitlines():
            if linea.startswith("inactive_file "):
                memoria -= int(linea.split()[1])
        return time.monotonic(), cpu, memoria

    def medir(self):
        anterior = self.leer()
        while not self.parar.wait(self.periodo):
            actual = self.leer()
            segundos = actual[0] - anterior[0]
            cpu = (actual[1] - anterior[1]) / 1e6 / segundos * 100
            self.muestras.append((cpu, actual[2] / 2**20))
            anterior = actual

    def __enter__(self):
        self.hilo.start()
        return self

    def __exit__(self, *_):
        self.parar.set()
        self.hilo.join()

    def resumen(self):
        if not self.muestras:
            return {"cpu_prom": None, "cpu_max": None, "ram_prom_mib": None, "ram_max_mib": None}
        cpus = [m[0] for m in self.muestras]
        rams = [m[1] for m in self.muestras]
        return {
            "cpu_prom": round(statistics.fmean(cpus), 2),
            "cpu_max": round(max(cpus), 2),
            "ram_prom_mib": round(statistics.fmean(rams), 2),
            "ram_max_mib": round(max(rams), 2),
        }


def preparar(env, brokers, anterior):
    docker("network", "rm", RED, verificar=False)
    docker("network", "create", RED)
    docker("pull", "-q", IMAGEN_MOSQUITTO)
    docker("pull", "-q", IMAGEN_CAPTURA)
    docker("build", "-q", "-t", IMAGEN_PROPIO, str(RAIZ / "broker-mqtt"))
    if "propio-anterior" in brokers:
        docker("build", "-q", "-t", IMAGEN_ANTERIOR, str(Path(anterior).resolve()))
    docker("build", "-q", "-t", IMAGEN_CLIENTE, "-f", "-", str(PRUEBAS), entrada=CLIENTE_DOCKERFILE)
    acl = f"{env['MQTT_USER_ESP32']}:write:telemetria/%c/lecturas,{env['MQTT_USER_NODERED']}:read:telemetria/#"
    usuarios = (
        f"{env['MQTT_USER_ESP32']}:{env['MQTT_PASS_ESP32']},"
        f"{env['MQTT_USER_NODERED']}:{env['MQTT_PASS_NODERED']}"
    )
    for clave in brokers:
        broker = BROKERS[clave]
        docker("rm", "-f", broker["contenedor"], verificar=False)
        if clave == "mosquitto":
            docker(
                "run", "-d", "--name", broker["contenedor"], "--network", RED, *variables(env),
                "-v", f"{RAIZ / 'mosquitto' / 'config'}:/mosquitto/config:ro",
                "--entrypoint", "/bin/sh", IMAGEN_MOSQUITTO, "/mosquitto/config/entrypoint.sh",
            )
        else:
            docker(
                "run", "-d", "--name", broker["contenedor"], "--network", RED,
                "-e", f"BROKER_USERS={usuarios}", "-e", f"BROKER_ACL={acl}", "-e", f"BROKER_LOG={broker['log']}",
                IMAGEN_ANTERIOR if clave == "propio-anterior" else IMAGEN_PROPIO,
            )
    time.sleep(3)


def limpiar():
    for broker in BROKERS.values():
        docker("rm", "-f", broker["contenedor"], verificar=False)
    docker("rm", "-f", "cmp-captura", verificar=False)
    docker("network", "rm", RED, verificar=False)


def correr_carga(env, broker, escenario, salida, nodelay):
    e = ESCENARIOS[escenario]
    salida.unlink(missing_ok=True)
    registro = docker(
        "run", "--rm", "--network", RED, "--user", f"{os.getuid()}:{os.getgid()}",
        "-v", f"{PRUEBAS}:/pruebas:ro", "-v", f"{salida.parent}:/salida", *variables(env),
        IMAGEN_CLIENTE, "python", "-B", "/pruebas/carga.py",
        "--host", BROKERS[broker]["contenedor"], "--clientes", str(e["clientes"]),
        "--duracion", str(e["duracion"]), "--intervalo", str(e["intervalo"]),
        "--salida", f"/salida/{salida.name}", *(["--nodelay"] if nodelay else []), verificar=False,
    )
    if not salida.exists():
        raise RuntimeError(f"La carga contra {broker} no terminó:\n{registro}")
    return json.loads(salida.read_text())


def medir_corrida(env, broker, escenario, repeticion, carpeta, nodelay):
    contenedor = BROKERS[broker]["contenedor"]
    docker("restart", "-t", "2", contenedor)
    time.sleep(3)
    with Recursos(contenedor) as reposo:
        time.sleep(5)
    crudo = carpeta / "crudos" / f"{escenario}_{broker}_{repeticion}.json"
    with Recursos(contenedor) as carga:
        datos = correr_carga(env, broker, escenario, crudo, nodelay)
    fila = {
        "escenario": escenario, "broker": broker, "repeticion": repeticion,
        "clientes": datos["clientes"], "intervalo_s": datos["intervalo_s"], "duracion_real_s": datos["duracion_real_s"],
        "enviados": datos["enviados"], "recibidos": datos["recibidos"], "perdidos": datos["perdidos"],
        "tasa_msg_s": round(datos["enviados"] / datos["duracion_real_s"], 1),
        "p50_ms": datos["p50_ms"], "p95_ms": datos["p95_ms"], "p99_ms": datos["p99_ms"], "max_ms": datos["max_ms"],
        "ram_reposo_mib": reposo.resumen()["ram_prom_mib"],
        **carga.resumen(),
    }
    print(
        f"  {escenario:12} {broker:15} rep {repeticion}: {fila['recibidos']}/{fila['enviados']} "
        f"p50 {fila['p50_ms']} ms p95 {fila['p95_ms']} ms CPU {fila['cpu_prom']} % RAM {fila['ram_max_mib']} MiB",
        flush=True,
    )
    return fila


def percentil(valores, p):
    ordenados = sorted(valores)
    return ordenados[max(0, math.ceil(len(ordenados) * p) - 1)]


def resumir(filas, carpeta):
    resumen = []
    for escenario in ESCENARIOS:
        for broker in BROKERS:
            grupo = [f for f in filas if f["escenario"] == escenario and f["broker"] == broker]
            if not grupo:
                continue
            latencias = []
            for f in grupo:
                crudo = carpeta / "crudos" / f"{escenario}_{broker}_{f['repeticion']}.json"
                latencias += json.loads(crudo.read_text())["latencias_ms"]
            enviados = sum(f["enviados"] for f in grupo)
            perdidos = sum(f["perdidos"] for f in grupo)
            resumen.append({
                "escenario": escenario, "broker": broker, "repeticiones": len(grupo),
                "clientes": grupo[0]["clientes"], "enviados": enviados, "perdidos": perdidos,
                "perdida_pct": round(perdidos / enviados * 100, 3) if enviados else None,
                "tasa_msg_s": round(statistics.fmean(f["tasa_msg_s"] for f in grupo), 1),
                "p50_ms": round(statistics.median(latencias), 3) if latencias else None,
                "p95_ms": round(percentil(latencias, 0.95), 3) if latencias else None,
                "p99_ms": round(percentil(latencias, 0.99), 3) if latencias else None,
                "max_ms": round(max(latencias), 3) if latencias else None,
                "cpu_prom": round(statistics.fmean(f["cpu_prom"] for f in grupo), 2),
                "cpu_max": round(max(f["cpu_max"] for f in grupo), 2),
                "ram_reposo_mib": round(statistics.fmean(f["ram_reposo_mib"] for f in grupo), 2),
                "ram_prom_mib": round(statistics.fmean(f["ram_prom_mib"] for f in grupo), 2),
                "ram_max_mib": round(max(f["ram_max_mib"] for f in grupo), 2),
            })
    escribir_csv(carpeta / "resumen.csv", resumen)
    return resumen


def escribir_csv(ruta, filas):
    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=list(filas[0]))
        escritor.writeheader()
        escritor.writerows(filas)


def capturar(env, carpeta):
    for broker in ("mosquitto", "propio"):
        contenedor = BROKERS[broker]["contenedor"]
        pcap = f"{broker}-ciclo.pcap"
        docker("rm", "-f", "cmp-captura", verificar=False)
        docker(
            "run", "-d", "--name", "cmp-captura", "--net", f"container:{contenedor}",
            "-v", f"{carpeta}:/salida", IMAGEN_CAPTURA,
            "tcpdump", "-i", "eth0", "-U", "-s", "0", "-w", f"/salida/{pcap}", "tcp", "port", "1883",
        )
        time.sleep(2)
        docker(
            "run", "--rm", "--network", RED, *variables(env), "-e", f"HOST={contenedor}",
            IMAGEN_CLIENTE, "python", "-c", CICLO_CAPTURA,
        )
        time.sleep(1)
        docker("stop", "-t", "2", "cmp-captura")
        docker("rm", "-f", "cmp-captura")
        detalle = docker(
            "run", "--rm", "-v", f"{carpeta}:/salida", IMAGEN_CAPTURA,
            "tshark", "-r", f"/salida/{pcap}", "-d", "tcp.port==1883,mqtt",
            "-T", "fields", "-E", "separator=;", "-E", "header=y",
            "-e", "frame.number", "-e", "frame.time_relative", "-e", "ip.src", "-e", "ip.dst",
            "-e", "frame.len", "-e", "tcp.len", "-e", "_ws.col.Info",
        )
        (carpeta / f"{broker}-ciclo.csv").write_text(detalle + "\n", encoding="utf-8")
        docker("run", "--rm", "--user", f"{os.getuid()}:{os.getgid()}", "-v", f"{carpeta}:/salida",
               IMAGEN_CAPTURA, "chmod", "a+r", f"/salida/{pcap}", verificar=False)
        print(f"  Captura de {broker}: {pcap}", flush=True)


def version_mosquitto():
    texto = docker("run", "--rm", "--entrypoint", "mosquitto", IMAGEN_MOSQUITTO, "-h", verificar=False)
    encontrada = re.search(r"mosquitto version ([0-9.]+)", texto)
    return encontrada.group(1) if encontrada else ""


def entorno(carpeta, args):
    datos = {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "equipo": platform.node(),
        "sistema": platform.platform(),
        "nucleos": os.cpu_count(),
        "cpu": next((l.split(":", 1)[1].strip() for l in Path("/proc/cpuinfo").read_text().splitlines()
                     if l.startswith("model name")), ""),
        "ram_gib": round(int(Path("/proc/meminfo").read_text().split()[1]) / 2**20, 1),
        "docker": docker("version", "-f", "{{.Server.Version}}"),
        "mosquitto": version_mosquitto(),
        "python_broker": docker("run", "--rm", IMAGEN_PROPIO, "python", "--version"),
        "commit": args.commit or subprocess.run(["git", "-C", str(RAIZ), "rev-parse", "--short", "HEAD"],
                                                capture_output=True, text=True).stdout.strip(),
        "repeticiones": args.repeticiones,
        "escenarios": {k: ESCENARIOS[k] for k in args.escenarios},
        "brokers": args.brokers,
        "nodelay": args.nodelay,
        "anterior": args.anterior,
    }
    (carpeta / "entorno.json").write_text(json.dumps(datos, indent=2, ensure_ascii=False), encoding="utf-8")
    return datos


def main():
    p = argparse.ArgumentParser(description="Comparativa Mosquitto vs. broker propio (#80)")
    p.add_argument("--repeticiones", type=int, default=3)
    p.add_argument("--escenarios", nargs="+", default=list(ESCENARIOS), choices=list(ESCENARIOS))
    p.add_argument("--brokers", nargs="+", default=["mosquitto", "propio", "propio-sin-log"], choices=list(BROKERS))
    p.add_argument("--salida", default=str(PRUEBAS / "comparativa" / datetime.now().strftime("%Y-%m-%d_%H%M")))
    p.add_argument("--sin-captura", action="store_true")
    p.add_argument("--commit", default="", help="commit del código medido, si la carpeta no es un repositorio git")
    p.add_argument("--duracion", type=float, help="segundos de cada corrida, en lugar de los del escenario")
    p.add_argument("--anterior", default="", help="carpeta broker-mqtt de otra versión, medida como propio-anterior")
    p.add_argument("--nodelay", action="store_true", help="el cliente de carga desactiva el algoritmo de Nagle")
    args = p.parse_args()
    if "propio-anterior" in args.brokers and not args.anterior:
        p.error("propio-anterior necesita --anterior <carpeta broker-mqtt>")
    if args.duracion:
        for e in ESCENARIOS.values():
            e["duracion"] = args.duracion

    carpeta = Path(args.salida).resolve()
    (carpeta / "crudos").mkdir(parents=True, exist_ok=True)
    env = credenciales()
    filas = []
    try:
        print("Preparando la red y los brokers de prueba...", flush=True)
        preparar(env, args.brokers, args.anterior)
        datos = entorno(carpeta, args)
        print(f"{datos['cpu']} · {datos['nucleos']} núcleos · {datos['ram_gib']} GiB · {datos['mosquitto']}", flush=True)
        for repeticion in range(1, args.repeticiones + 1):
            orden = args.brokers if repeticion % 2 else list(reversed(args.brokers))
            for escenario in args.escenarios:
                for broker in orden:
                    filas.append(medir_corrida(env, broker, escenario, repeticion, carpeta, args.nodelay))
                    escribir_csv(carpeta / "corridas.csv", filas)
        resumen = resumir(filas, carpeta)
        if not args.sin_captura:
            capturar(env, carpeta)
    finally:
        limpiar()

    print("\nResumen")
    for f in resumen:
        print(
            f"  {f['escenario']:12} {f['broker']:15} perdidos {f['perdidos']}/{f['enviados']} "
            f"p50 {f['p50_ms']} p95 {f['p95_ms']} p99 {f['p99_ms']} ms · CPU {f['cpu_prom']} % · "
            f"RAM {f['ram_reposo_mib']} → {f['ram_max_mib']} MiB"
        )
    print(f"\nResultados en {carpeta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
