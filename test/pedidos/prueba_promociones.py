"""
PRUEBA OFFLINE DE LAS PROMOCIONES EN scripts/excel_to_json.py: armar_promociones
(tramos por cantidad cant_N / desc_N y sus validaciones), el bloqueo cuando hay
errores de carga (guardia.bloquear), --validar-promociones y la huella de
promociones en version.json. Datos SINTETICOS en DataFrames y en una carpeta
temporal: no toca json/ ni excel/ del proyecto (salvo leer el Excel real para
comprobar que da lo mismo que el JSON publicado).

Uso, desde la raiz del proyecto:
    python test/pedidos/prueba_promociones.py
Termina con codigo 1 si alguna prueba falla.
"""
import io
import json
import os
import shutil
import sys
import tempfile
import time
from contextlib import redirect_stdout
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import excel_to_json as ej  # noqa: E402
import guardia_registros as guardia  # noqa: E402

ok = fallas = 0


def ver(nombre, cond, extra=''):
    global ok, fallas
    if cond:
        ok += 1
    else:
        fallas += 1
        print('FALLA:', nombre, extra)


GRUPOS = 'RECURRENTE_300K-400K.PREMIUM.PREMIUM TOP'


def df(filas, **extra):
    """DataFrame como el del Excel: columnas de siempre y las de tramos que se pasen"""
    base = {
        'CODIGO_PRODUCTO': [f[0] for f in filas],
        'TIPO_LISTA': ['F'] * len(filas),
        'PRECIO_ESPECIAL': [f[1] for f in filas],
        'VIGENCIA_HASTA': pd.to_datetime(['2026-11-30'] * len(filas)),
        'GRUPOS': [GRUPOS] * len(filas),
        'CANTIDAD_MINIMA': [f[2] for f in filas],
    }
    base.update(extra)
    return pd.DataFrame(base)


def armar(d):
    with redirect_stdout(io.StringIO()):
        return ej.armar_promociones(d)


def hay(errores, texto):
    return any(texto in e for e in errores)


# ---------- sin tramos: igual que antes ----------
datos, errores = armar(df([('ROD125', 15755.9, 1), ('SF08000', 7186.0, 30)]))
ver('sin tramos: sin errores', errores == [], errores)
ver('sin tramos: las mismas claves y valores de siempre', datos == {'promotions': {
    'ROD125': {'tipoLista': 'F', 'precio': 15755.9, 'cantidadMinima': 1, 'vigencia': '2026-11-30',
               'grupos': ['RECURRENTE_300K-400K', 'PREMIUM', 'PREMIUM TOP']},
    'SF08000': {'tipoLista': 'F', 'precio': 7186.0, 'cantidadMinima': 30, 'vigencia': '2026-11-30',
                'grupos': ['RECURRENTE_300K-400K', 'PREMIUM', 'PREMIUM TOP']}}}, json.dumps(datos))
ver('sin tramos: ninguna clave "tramos"', all('tramos' not in p for p in datos['promotions'].values()))
ver('precio especial a 2 decimales', armar(df([('A', 100.456, 1)]))[0]['promotions']['A']['precio'] == 100.46)

# ---------- con tramos ----------
d, e = armar(df([('A', 1000.0, 1)], cant_1=[5], desc_1=[5]))
ver('un tramo', e == [] and d['promotions']['A']['tramos'] == [{'desde': 5, 'desc': 5}], json.dumps(d))
d, e = armar(df([('A', 1000.0, 2)], cant_1=[5], desc_1=[5], cant_2=[10], desc_2=[8], cant_3=[20], desc_3=[12.5]))
ver('tres tramos, con decimal en el %', e == [] and d['promotions']['A']['tramos'] ==
    [{'desde': 5, 'desc': 5}, {'desde': 10, 'desc': 8}, {'desde': 20, 'desc': 12.5}], json.dumps(d))
d, e = armar(df([('A', 1000.0, 1)], cant_1=[10], desc_1=[8], cant_2=[5], desc_2=[5]))
ver('tramos desordenados: se ordenan, sin error', e == [] and
    [t['desde'] for t in d['promotions']['A']['tramos']] == [5, 10], json.dumps(d))
d, e = armar(df([('A', 1000.0, 1)], cant_1=[5], desc_1=[5], cant_3=[10], desc_3=[8]))
ver('hueco en la numeracion (1 y 3)', e == [] and len(d['promotions']['A']['tramos']) == 2, e)
d, e = armar(df([('A', 1000.0, 1)], CANT_1=[5], Desc_1=[5]))
ver('nombres de columna sin distinguir mayusculas', e == [] and d['promotions']['A']['tramos'] == [{'desde': 5, 'desc': 5}], e)

# ---------- columnas float64 por tener celdas vacias ----------
nan = float('nan')
d, e = armar(df([('A', 1000.0, 1.0), ('B', 2000.0, 30.0), ('C', 3000.0, 1.0)],
                cant_1=[5.0, nan, 2.0], desc_1=[5.0, nan, 5.0]))
ver('float64: la columna llega como float', str(df([('A', 1.0, 1)], cant_1=[5.0, ][:1], desc_1=[nan]).dtypes['desc_1']) == 'float64')
ver('float64: 5.0 y 2.0 se aceptan como enteros', e == [], e)
ver('float64: el JSON lleva enteros (5, no 5.0)', d['promotions']['A']['tramos'] == [{'desde': 5, 'desc': 5}] and
    isinstance(d['promotions']['A']['tramos'][0]['desde'], int) and isinstance(d['promotions']['A']['tramos'][0]['desc'], int),
    json.dumps(d))
ver('float64: CANTIDAD_MINIMA 30.0 sale como 30', d['promotions']['B']['cantidadMinima'] == 30 and
    isinstance(d['promotions']['B']['cantidadMinima'], int))
ver('float64: celda vacia = sin tramo (no 0)', 'tramos' not in d['promotions']['B'])
d, e = armar(df([('A', 1000.0, 1.0)], cant_1=[2.5], desc_1=[5.0]))
ver('float64: 2.5 es error', hay(e, 'cant_1 = 2.5'), e)
d, e = armar(df([('A', 1000.0, 2.0)], cant_1=[2.0], desc_1=[5.0]))
ver('float64: cant 2.0 contra minimo 2.0, sin error', e == [], e)

# ---------- errores de carga ----------
casos = [
    ('columna sin su par', df([('A', 1000.0, 1)], cant_2=[5]), 'falta desc_2'),
    ('cantidad sin porcentaje', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[nan]), 'falta desc_1'),
    ('porcentaje sin cantidad', df([('A', 1000.0, 1)], cant_1=[nan], desc_1=[5]), 'falta cant_1'),
    ('cantidad 0', df([('A', 1000.0, 1)], cant_1=[0], desc_1=[5]), 'cant_1 = 0'),
    ('cantidad no numerica', df([('A', 1000.0, 1)], cant_1=['cinco'], desc_1=[5]), "cant_1 = 'cinco'"),
    ('porcentaje no numerico', df([('A', 1000.0, 1)], cant_1=[5], desc_1=['5%']), 'no es un número'),
    ('porcentaje con formato % (0,05)', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[0.05]), 'formato %'),
    ('porcentaje 0', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[0]), 'mayor que 0 y menor que 100'),
    ('porcentaje 100', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[100]), 'mayor que 0 y menor que 100'),
    ('porcentaje negativo', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[-5]), 'mayor que 0 y menor que 100'),
    ('cantidad repetida', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[5], cant_2=[5], desc_2=[8]), 'cantidad repetida'),
    ('tramo por debajo del minimo', df([('A', 1000.0, 10)], cant_1=[5], desc_1=[5]), 'por debajo de CANTIDAD_MINIMA (10)'),
    ('tramo mayor con igual %', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[5], cant_2=[10], desc_2=[5]), 'no es más que'),
    ('tramo mayor con menos %', df([('A', 1000.0, 1)], cant_1=[5], desc_1=[8], cant_2=[10], desc_2=[5]), 'no es más que'),
    ('precio especial vacio', df([('A', nan, 1)]), 'PRECIO_ESPECIAL'),
    ('precio especial texto', df([('A', 'mil', 1)]), 'PRECIO_ESPECIAL'),
    ('precio especial 0', df([('A', 0, 1)]), 'PRECIO_ESPECIAL'),
    ('codigo repetido', df([('A', 1000.0, 1), ('A', 1000.0, 1)]), 'código repetido'),
    ('minimo no entero', df([('A', 1000.0, 2.5)]), 'CANTIDAD_MINIMA'),
]
for nombre, d_, texto in casos:
    _, e = armar(d_)
    ver(f'error: {nombre}', hay(e, texto), e)
_, e = armar(df([('X', 1000.0, 10)], cant_1=[5], desc_1=[5]))
ver('el error dice la fila de Excel y el codigo', e and e[0].startswith('fila 2 (X):'), e)

# ---------- bloqueo, --forzar, --validar-promociones y huella (carpeta temporal) ----------
tmp = Path(tempfile.mkdtemp(prefix='ferremax-promos-'))
origen = os.getcwd()
argv = list(sys.argv)
try:
    os.chdir(tmp)
    (tmp / 'excel').mkdir()
    (tmp / 'json').mkdir()
    publicado = {'promotions': {'VIEJA': {'tipoLista': 'F', 'precio': 1.0, 'cantidadMinima': 1,
                                          'vigencia': '2026-11-30', 'grupos': ['PREMIUM']}}}
    texto_publicado = json.dumps(publicado, indent=2)
    (tmp / 'json' / 'promociones.json').write_text(texto_publicado, encoding='utf-8')

    # Excel con un error: no escribe, queda el anterior, se registra el bloqueo
    df([('A', 1000.0, 10)], cant_1=[5], desc_1=[5]).to_excel(tmp / 'excel' / 'PROMOCIONES.xlsx', index=False)
    for forzar in (False, True):
        guardia._bloqueos.clear()
        sys.argv = ['excel_to_json.py'] + (['--forzar'] if forzar else [])
        lanzo = False
        salida = io.StringIO()
        with redirect_stdout(salida):
            try:
                ej.process_promotions()
            except guardia.EscrituraBloqueada:
                lanzo = True
        rotulo = 'con --forzar' if forzar else 'sin --forzar'
        ver(f'bloqueo {rotulo}: lanza EscrituraBloqueada', lanzo)
        ver(f'bloqueo {rotulo}: queda el archivo anterior',
            (tmp / 'json' / 'promociones.json').read_text(encoding='utf-8') == texto_publicado)
        ver(f'bloqueo {rotulo}: muestra la fila y el motivo', 'fila 2 (A)' in salida.getvalue() and 'BLOQUEADO' in salida.getvalue(),
            salida.getvalue())
        ver(f'bloqueo {rotulo}: la corrida termina con codigo 1', guardia.hubo_bloqueos())
    guardia._bloqueos.clear()
    sys.argv = ['excel_to_json.py']

    # update_from_local toma el bloqueo y sigue con los demas archivos
    llamados = []
    pasos = (ej.excel_to_json, ej.process_clients, ej.process_groups, ej.process_promotions,
             ej.process_catalogo_grupos_local, ej.process_image_catalog_local)
    guardados = {p.__name__: p for p in pasos}
    try:
        for p in pasos:
            if p is not ej.process_promotions:
                setattr(ej, p.__name__, lambda n=p.__name__: llamados.append(n))
        with redirect_stdout(io.StringIO()):
            ej.update_from_local()
    finally:
        for n, p in guardados.items():
            setattr(ej, n, p)
    ver('update_from_local sigue con los otros pasos despues del bloqueo',
        'process_image_catalog_local' in llamados and guardia.hubo_bloqueos(), llamados)
    guardia._bloqueos.clear()

    # Excel sin errores: escribe con los tramos
    df([('A', 1000.0, 1)], cant_1=[5], desc_1=[5]).to_excel(tmp / 'excel' / 'PROMOCIONES.xlsx', index=False)
    with redirect_stdout(io.StringIO()):
        ej.process_promotions()
    escrito = json.loads((tmp / 'json' / 'promociones.json').read_text(encoding='utf-8'))
    ver('sin errores: escribe el JSON con tramos', escrito['promotions']['A']['tramos'] == [{'desde': 5, 'desc': 5}], escrito)
    ver('sin errores: ningun bloqueo', not guardia.hubo_bloqueos())

    # --validar-promociones: no escribe nada
    df([('B', 2000.0, 1)], cant_1=[3], desc_1=[4]).to_excel(tmp / 'excel' / 'PROMOCIONES.xlsx', index=False)
    antes = (tmp / 'json' / 'promociones.json').read_bytes()
    m = os.path.getmtime(tmp / 'json' / 'promociones.json')
    time.sleep(0.05)
    salida = io.StringIO()
    with redirect_stdout(salida):
        codigo = ej.validar_promociones()
    ver('--validar-promociones no escribe', (tmp / 'json' / 'promociones.json').read_bytes() == antes and
        os.path.getmtime(tmp / 'json' / 'promociones.json') == m)
    ver('--validar-promociones informa filas, errores, tramos y si es distinto',
        '1 filas, 0 errores, 1 con tramos' in salida.getvalue() and 'DISTINTO' in salida.getvalue() and codigo == 0,
        salida.getvalue())
    df([('B', 2000.0, 5)], cant_1=[3], desc_1=[4]).to_excel(tmp / 'excel' / 'PROMOCIONES.xlsx', index=False)
    with redirect_stdout(io.StringIO()):
        codigo = ej.validar_promociones()
    ver('--validar-promociones con errores: codigo 1 y sin bloqueo', codigo == 1 and not guardia.hubo_bloqueos())

    # Huella de promociones en version.json, conservando las demas claves
    (tmp / 'json' / 'version.json').write_text(json.dumps({'indice': {'huella': 'v2-x'}}, indent=2), encoding='utf-8')
    (tmp / 'json' / 'productos.json').write_text('{"A": 1}', encoding='utf-8')
    with redirect_stdout(io.StringIO()):
        ej.escribir_version()
    v = json.loads((tmp / 'json' / 'version.json').read_text(encoding='utf-8'))
    ver('version.json: huella y generado de promociones', 'huella' in v.get('promociones', {}) and 'generado' in v['promociones'], v)
    ver('version.json: conserva indice y escribe productos', v.get('indice') == {'huella': 'v2-x'} and 'productos' in v, v)
    gen = v['promociones']['generado']
    time.sleep(1.1)
    with redirect_stdout(io.StringIO()):
        ej.escribir_version()
    ver('version.json: mismo contenido, mismo generado',
        json.loads((tmp / 'json' / 'version.json').read_text(encoding='utf-8'))['promociones']['generado'] == gen)
finally:
    os.chdir(origen)
    sys.argv = argv
    guardia._bloqueos.clear()
    shutil.rmtree(tmp, ignore_errors=True)

# ---------- el Excel real del proyecto (solo lectura) ----------
real = RAIZ / 'excel' / 'PROMOCIONES.xlsx'
publicado = RAIZ / 'json' / 'promociones.json'
if real.exists() and publicado.exists():
    d, e = armar(pd.read_excel(real))
    ver('Excel real: sin errores', e == [], e)
    ver('Excel real: identico al promociones.json publicado',
        json.dumps(d, indent=2) == publicado.read_text(encoding='utf-8'))

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
