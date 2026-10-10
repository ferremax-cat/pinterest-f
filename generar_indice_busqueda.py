#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del índice de búsqueda v2 — Catálogo Ferremax

Lee json/productos.json y escribe json/search/v2/indice.json.
Antes de generar verifica los casos de js/search/v2/casos_normalizacion.json;
si alguno falla, no escribe nada (así un error nunca publica un índice roto).

Uso, desde cualquier carpeta del proyecto:
    python generar_indice_busqueda.py                      genera el índice
    python generar_indice_busqueda.py --probar             solo verifica los casos
    python generar_indice_busqueda.py --consulta "fix 3.5" muestra tokens y resultados

La normalización está escrita sin "lookbehind" en las expresiones regulares
para poder copiarla tal cual al motor en JavaScript. Las dos versiones deben
dar exactamente los mismos tokens: eso es lo que controlan los casos de prueba.
"""
import argparse
import gzip
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Rutas: se busca la raíz del proyecto subiendo hasta encontrar json/productos.json
# ---------------------------------------------------------------------------
def encontrar_raiz():
    carpeta = Path(__file__).resolve().parent
    for candidata in [carpeta, *carpeta.parents]:
        if (candidata / "json" / "productos.json").exists():
            return candidata
    sys.exit("No se encontró json/productos.json subiendo desde " + str(carpeta))


RAIZ = encontrar_raiz()
RUTA_PRODUCTOS = RAIZ / "json" / "productos.json"
RUTA_SALIDA = RAIZ / "json" / "search" / "v2" / "indice.json"
RUTA_CASOS = RAIZ / "js" / "search" / "v2" / "casos_normalizacion.json"


# ---------------------------------------------------------------------------
# Normalización y tokenización (debe ser idéntica en JavaScript)
# ---------------------------------------------------------------------------
PALABRAS_VACIAS = {"de", "del", "la", "las", "el", "los", "para", "con",
                   "en", "por", "al", "un", "una"}

RE_ACENTOS = re.compile(r"[\u0300-\u036f]")                  # tildes y la de la ñ
RE_COMA_DECIMAL = re.compile(r"(\d),(?=\d)")                 # 3,5  -> 3.5
RE_CEROS_FINALES = re.compile(r"(\d+\.\d*?[1-9])0+(?!\d)")   # 3.50 -> 3.5
RE_DECIMAL_CERO = re.compile(r"(\d+)\.0+(?!\d)")             # 4.0  -> 4
RE_X_ENTRE_MEDIDAS = re.compile(r"(\d[a-z\"]{0,3})x(?=\d)")  # 20mmx4mt -> 20mm x 4mt
RE_X_INICIAL = re.compile(r"(^|\s)x(?=\d)")                  # x15m -> x 15m
RE_FRACCION_MIXTA = re.compile(r"(^|\s)(\d{1,2})[\s.\-]+(\d+/\d+)")  # 1 1/2, 1.1/2 -> 1-1/2
RE_FRACCION_PEGADA = re.compile(r"(^|[^\d/.])(\d)(\d)/(\d{1,2})(?![\d/])")  # 11/2 -> 1-1/2
DENOMINADORES_PULGADA = {2, 4, 8, 16}


def _separar_fraccion_pegada(m):
    entero, numerador, denominador = int(m.group(2)), int(m.group(3)), int(m.group(4))
    if (denominador in DENOMINADORES_PULGADA and numerador < denominador
            and entero * 10 + numerador > denominador):
        return m.group(1) + m.group(2) + "-" + m.group(3) + "/" + m.group(4)
    return m.group(0)
RE_TOKEN = re.compile(
    r"\d+-\d+/\d+"                # 1-1/2 (fracción mixta)
    r"|\d+(?:[./]\d+)+[a-z]*"     # 3.5  1/2  3.5mm
    r"|\d+[a-z]+\d*[a-z]*"        # 20mm  15m  4mt
    r"|\d+"                       # 20
    r"|[a-z]/[a-z]"               # f/f  i/n
    r"|[a-z]+\d+[a-z\d]*"         # pn16
    r"|[a-z]+"                    # palabras
)
RE_PARTES = re.compile(r"\d+(?:[./]\d+)*|[a-z]+")
RE_TIENE_DIGITO = re.compile(r"\d")
RE_TIENE_LETRA = re.compile(r"[a-z]")
RE_PREFIJO_CATEGORIA = re.compile(r"^\s*\d+\s*\.\s*")       # "8.GUANTES" -> "GUANTES"


def normalizar(texto):
    t = str(texto or "").lower()
    t = unicodedata.normalize("NFD", t)
    t = RE_ACENTOS.sub("", t)
    t = RE_COMA_DECIMAL.sub(r"\1.", t)
    t = RE_CEROS_FINALES.sub(r"\1", t)
    t = RE_DECIMAL_CERO.sub(r"\1", t)
    t = RE_FRACCION_MIXTA.sub(r"\1\2-\3", t)
    t = RE_FRACCION_PEGADA.sub(_separar_fraccion_pegada, t)
    t = RE_X_ENTRE_MEDIDAS.sub(r"\1 x ", t)
    t = RE_X_INICIAL.sub(r"\1x ", t)
    return t


def tokenizar(texto, expandir=True):
    """expandir=True para el índice (20mm también se indexa como 20 y mm).
    expandir=False para la consulta del usuario."""
    salida, vistos = [], set()

    def agregar(tok):
        if tok in vistos:
            return
        if tok.isalpha() and (len(tok) < 2 or tok in PALABRAS_VACIAS):
            return
        vistos.add(tok)
        salida.append(tok)

    for m in RE_TOKEN.finditer(normalizar(texto)):
        tok = m.group(0)
        agregar(tok)
        if expandir and RE_TIENE_DIGITO.search(tok) and RE_TIENE_LETRA.search(tok):
            # 20mm -> 20 y mm. Pero pn20 -> solo pn: el 20 de una clase o modelo
            # no es una medida y haría que "20" encuentre caños de 25, 32, etc.
            empieza_con_letra = tok[0].isalpha()
            for parte in RE_PARTES.findall(tok):
                if empieza_con_letra and parte[0].isdigit():
                    continue
                agregar(parte)
    return salida


# ---------------------------------------------------------------------------
# Orden natural: los ids se asignan en este orden, y sirven de desempate
# (3.5x16, 3.5x20, 3.5x25 en lugar del orden del archivo)
# ---------------------------------------------------------------------------
def valor_numerico(txt):
    try:
        if "/" in txt:
            a, b = txt.split("/", 1)
            return float(a) / float(b) if float(b) else 0.0
        return float(txt)
    except ValueError:
        return 0.0


def clave_natural(nombre_normalizado):
    clave = []
    for parte in re.findall(r"\d+(?:[./]\d+)?|[a-z]+", nombre_normalizado):
        if parte[0].isdigit():
            clave.append((0, valor_numerico(parte), ""))
        else:
            clave.append((1, 0.0, parte))
    return clave


# ---------------------------------------------------------------------------
# Construcción del índice
# ---------------------------------------------------------------------------
def cargar_productos():
    with open(RUTA_PRODUCTOS, encoding="utf-8") as f:
        datos = json.load(f)
    if not isinstance(datos, dict):
        sys.exit("Formato inesperado en productos.json: se esperaba un objeto indexado por código")
    return {cod: p for cod, p in datos.items() if isinstance(p, dict)}


def construir_indice():
    filas = []
    for codigo, p in cargar_productos().items():
        nombre = p.get("name") or p.get("nombre") or ""
        categoria = p.get("category") or p.get("categoria") or ""
        filas.append((clave_natural(normalizar(nombre)), str(codigo), nombre, categoria))
    filas.sort(key=lambda f: (f[0], f[1]))

    productos, ix_nombre, ix_categoria = [], {}, {}
    for i, (_, codigo, nombre, categoria) in enumerate(filas):
        productos.append([codigo, nombre, categoria])
        for tok in tokenizar(nombre):
            ix_nombre.setdefault(tok, []).append(i)
        for tok in tokenizar(RE_PREFIJO_CATEGORIA.sub("", categoria)):
            ix_categoria.setdefault(tok, []).append(i)

    ahora = datetime.now(timezone.utc)
    return {
        "version": "v2-" + ahora.strftime("%Y%m%d-%H%M"),
        "generado": ahora.isoformat(timespec="seconds"),
        "total": len(productos),
        "productos": productos,
        "nombre": ix_nombre,
        "categoria": ix_categoria,
    }


# ---------------------------------------------------------------------------
# Casos de prueba y consulta de verificación
# ---------------------------------------------------------------------------
def probar_casos():
    if not RUTA_CASOS.exists():
        print("AVISO: no existe " + str(RUTA_CASOS.relative_to(RAIZ)))
        return False
    with open(RUTA_CASOS, encoding="utf-8") as f:
        casos = json.load(f)["casos"]
    fallas = 0
    for c in casos:
        obtenido = tokenizar(c["texto"], c.get("expandir", True))
        if obtenido != c["tokens"]:
            fallas += 1
            print("FALLA  " + repr(c["texto"]))
            print("   esperado: " + str(c["tokens"]))
            print("   obtenido: " + str(obtenido))
    print("Casos de normalización: {} de {} correctos".format(len(casos) - fallas, len(casos)))
    return fallas == 0


def consultar(indice, consulta, limite=15):
    tokens = tokenizar(consulta, expandir=False)
    print("Tokens de la consulta: " + str(tokens))
    if not tokens:
        return
    ix = indice["nombre"]
    conjuntos = [set(ix.get(t, [])) for t in tokens[:-1]]
    ultimo = tokens[-1]
    por_prefijo = set()
    for tok, ids in ix.items():
        if tok.startswith(ultimo):
            por_prefijo.update(ids)
    conjuntos.append(por_prefijo)
    resultado = sorted(set.intersection(*conjuntos))
    print("Productos con todas las palabras: {}".format(len(resultado)))
    for i in resultado[:limite]:
        codigo, nombre, _ = indice["productos"][i]
        print("   {:<16} {}".format(codigo, nombre))


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Índice de búsqueda v2 — Ferremax")
    ap.add_argument("--probar", action="store_true", help="solo verificar los casos")
    ap.add_argument("--consulta", help="mostrar tokens y resultados de una búsqueda")
    args = ap.parse_args()

    if not probar_casos():
        sys.exit("Hay casos de normalización fallidos: no se genera el índice.")
    if args.probar:
        return

    indice = construir_indice()

    if args.consulta:
        consultar(indice, args.consulta)
        return

    contenido = json.dumps(indice, ensure_ascii=False, separators=(",", ":"))
    RUTA_SALIDA.parent.mkdir(parents=True, exist_ok=True)
    temporal = RUTA_SALIDA.with_suffix(".tmp")
    temporal.write_text(contenido, encoding="utf-8")
    temporal.replace(RUTA_SALIDA)

    bytes_total = len(contenido.encode("utf-8"))
    bytes_gzip = len(gzip.compress(contenido.encode("utf-8")))
    print("Índice generado: " + str(RUTA_SALIDA.relative_to(RAIZ)))
    print("   versión:          " + indice["version"])
    print("   productos:        {}".format(indice["total"]))
    print("   tokens de nombre: {}".format(len(indice["nombre"])))
    print("   tokens categoría: {}".format(len(indice["categoria"])))
    print("   tamaño:           {:.2f} MB ({:.2f} MB comprimido)".format(
        bytes_total / 1048576, bytes_gzip / 1048576))


if __name__ == "__main__":
    main()
