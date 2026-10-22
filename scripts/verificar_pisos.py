"""
Revisa la tabla EXCEPCIONES_PISO de js/imprimir-hojas.js contra json/productos.json.

Las reglas se leen del mismo archivo JS, asi el script nunca queda
desincronizado de la tabla. Se aplica la misma logica que pisoDe:
gana la primera regla cuyo prefijo coincide con el comienzo del codigo
(y, si tiene rubros, la categoria empieza con alguno); sin regla, el piso
sale del numero de la categoria (1 a 5: 1er piso, 6 a 9: planta baja).

Muestra, por cada prefijo de la tabla y en el mismo orden:
  - cada rubro con su cantidad, el piso por categoria y el piso final,
    marcando con * los que cambian por una regla;
  - los productos que cumplen mas de una regla (el orden decide);
  - un resumen de cuantos productos cambian de piso.

Uso, desde cualquier carpeta:
    python scripts/verificar_pisos.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA_JS = RAIZ / 'js' / 'imprimir-hojas.js'
RUTA_PRODUCTOS = RAIZ / 'json' / 'productos.json'

# Regla de la tabla: { prefijo: 'X', rubros: ['A', 'B'], piso: PISO_1 },  // comentario
RE_REGLA = re.compile(
    r"\{\s*prefijo:\s*'([^']*)'\s*(?:,\s*rubros:\s*\[([^\]]*)\])?\s*,\s*piso:\s*(PISO_\w+)\s*\}")


def norm(s):
    """Igual que normTexto en el JS: sin espacios de mas y en mayusculas."""
    return re.sub(r'\s+', ' ', str(s or '').strip()).upper()


def leer_reglas():
    """Constantes de piso y reglas de EXCEPCIONES_PISO, en el orden de la tabla."""
    js = RUTA_JS.read_text(encoding='utf-8')
    pisos = dict(re.findall(r"const (PISO_\w+) = '([^']*)';", js))
    for nombre in ('PISO_PB', 'PISO_1', 'PISO_SIN'):
        if nombre not in pisos:
            sys.exit(f'No se encontro la constante {nombre} en {RUTA_JS.name}')

    tabla = re.search(r'const EXCEPCIONES_PISO = \[(.*?)\n\];', js, re.S)
    if not tabla:
        sys.exit(f'No se encontro EXCEPCIONES_PISO en {RUTA_JS.name}')

    reglas = []
    for linea in tabla.group(1).splitlines():
        codigo, _, comentario = linea.partition('//')
        if not codigo.strip():
            continue
        m = RE_REGLA.search(codigo)
        if not m:
            # Una linea con codigo que no es una regla reconocible: mejor
            # avisar que revisar con una tabla incompleta
            sys.exit(f'No se entiende esta regla de {RUTA_JS.name}: {linea.strip()}')
        prefijo, rubros, piso = m.groups()
        if piso not in pisos:
            sys.exit(f'Piso desconocido {piso} en la regla: {linea.strip()}')
        reglas.append({
            'prefijo': norm(prefijo),
            'rubros': [norm(r) for r in re.findall(r"'([^']*)'", rubros or '')],
            'piso': pisos[piso],
            'comentario': comentario.strip()
        })
    return pisos, reglas


def aplica(regla, cod, cat):
    return cod.startswith(regla['prefijo']) and (
        not regla['rubros'] or any(cat.startswith(r) for r in regla['rubros']))


def piso_por_categoria(categoria, pisos):
    m = re.match(r'\s*(\d+)', str(categoria or ''))
    n = int(m.group(1)) if m else 0
    if 1 <= n <= 5:
        return pisos['PISO_1']
    if 6 <= n <= 9:
        return pisos['PISO_PB']
    return pisos['PISO_SIN']


def main():
    # En la consola de Windows, para los acentos y la Ñ
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

    pisos, reglas = leer_reglas()
    productos = json.loads(RUTA_PRODUCTOS.read_text(encoding='utf-8'))
    print(f'{len(reglas)} reglas en {RUTA_JS.relative_to(RAIZ)} · {len(productos)} productos\n')

    # Piso final de cada producto y la regla que lo decide
    final = {}
    superpuestos = Counter()
    for codigo, datos in productos.items():
        cod, cat = norm(codigo), norm(datos.get('category', ''))
        coinciden = [i for i, r in enumerate(reglas) if aplica(r, cod, cat)]
        base = piso_por_categoria(datos.get('category', ''), pisos)
        regla = coinciden[0] if coinciden else None
        final[codigo] = (base, reglas[regla]['piso'] if regla is not None else base, regla)
        if len(coinciden) > 1:
            superpuestos[' / '.join(
                reglas[i]['prefijo'] + (f" {reglas[i]['rubros']}" if reglas[i]['rubros'] else '') +
                ' -> ' + reglas[i]['piso'] for i in coinciden)] += 1

    # Por prefijo, en el orden de la tabla (un prefijo con varias reglas, una vez)
    vistos = []
    for r in reglas:
        if r['prefijo'] not in vistos:
            vistos.append(r['prefijo'])

    for prefijo in vistos:
        del_prefijo = [c for c in productos if norm(c).startswith(prefijo)]
        filas = Counter()
        for c in del_prefijo:
            base, piso, regla = final[c]
            filas[(norm(productos[c].get('category', '')), base, piso, regla)] += 1
        cambian = sum(n for (_, base, piso, _), n in filas.items() if base != piso)
        print(f'{prefijo}: {len(del_prefijo)} productos, {cambian} cambian de piso por la tabla')
        for r in reglas:
            if r['prefijo'] == prefijo:
                rubros = f" rubros {r['rubros']}" if r['rubros'] else ' todo el prefijo'
                print(f"   regla:{rubros} -> {r['piso']}  // {r['comentario']}")
        for (rubro, base, piso, regla), n in sorted(filas.items()):
            marca = '*' if base != piso else ' '
            destino = f'{piso} (regla)' if regla is not None else f'{piso} (categoria)'
            print(f'  {marca}{n:4}  {rubro:<40} {base:<14} -> {destino}')
        print()

    print('Productos que cumplen mas de una regla (gana la primera de la tabla):')
    if superpuestos:
        for combinacion, n in superpuestos.most_common():
            print(f'  {n:4}  {combinacion}')
    else:
        print('  ninguno')

    cambios = Counter((base, piso) for base, piso, _ in final.values() if base != piso)
    print(f'\nCambian de piso por la tabla: {sum(cambios.values())} productos')
    for (base, piso), n in sorted(cambios.items()):
        print(f'  {n:4}  de {base} a {piso}')


if __name__ == '__main__':
    main()
