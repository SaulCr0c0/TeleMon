def filtro_valido(filtro):
    if not filtro or "\x00" in filtro:
        return False
    niveles = filtro.split("/")
    for i, nivel in enumerate(niveles):
        if "#" in nivel and (nivel != "#" or i != len(niveles) - 1):
            return False
        if "+" in nivel and nivel != "+":
            return False
    return True


def tema_valido(tema):
    return bool(tema) and "\x00" not in tema and "+" not in tema and "#" not in tema


def coincide(filtro, tema):
    niveles_filtro = filtro.split("/")
    niveles_tema = tema.split("/")
    if tema.startswith("$") and niveles_filtro[0] in ("+", "#"):
        return False
    for i, nivel in enumerate(niveles_filtro):
        if nivel == "#":
            return True
        if i >= len(niveles_tema):
            return False
        if nivel != "+" and nivel != niveles_tema[i]:
            return False
    return len(niveles_filtro) == len(niveles_tema)
