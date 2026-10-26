import hmac


def leer_usuarios(texto):
    usuarios = {}
    for par in (texto or "").split(","):
        par = par.strip()
        if not par:
            continue
        usuario, separador, clave = par.partition(":")
        if not separador or not usuario or not clave:
            raise ValueError(f"BROKER_USERS mal formado cerca de «{par}»; se espera usuario:clave")
        usuarios[usuario] = clave.encode("utf-8")
    return usuarios


def credenciales_validas(usuarios, usuario, clave):
    if usuario is None or clave is None or usuario not in usuarios:
        hmac.compare_digest(b"x", b"y")
        return False
    return hmac.compare_digest(usuarios[usuario], clave)
