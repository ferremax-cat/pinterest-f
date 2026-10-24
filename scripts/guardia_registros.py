"""
GUARDIA DE REGISTROS

Antes de reemplazar un archivo de datos (o una hoja de la planilla), compara
cuantos registros tiene hoy con cuantos se van a escribir. Si el nuevo tiene
muchos menos, la fuente probablemente respondio incompleta o quedo a medio
editar: no se escribe, se avisa con una linea "BLOQUEADO: ..." y el script
termina con error (terminar_si_hubo_bloqueos).

Lo usa cada script por su cuenta, asi protege igual corriendolos por separado
o desde scripts/rutina_diaria.py.

Criterio: siempre se frena si el nuevo queda vacio; ademas, si tiene menos que
la proporcion minima del anterior (80%, o la de UMBRALES). Con menos de
MINIMO_PARA_PROPORCION registros, solo se frena si queda vacio.

Para escribir igual (por ejemplo, despues de una limpieza grande a proposito):
agregar --forzar al comando, o definir FERREMAX_FORZAR=1.
"""
import json
import os
import sys
from pathlib import Path

PROPORCION_MINIMA = 0.8
MINIMO_PARA_PROPORCION = 10

# Proporcion por nombre de archivo u hoja. None: solo se frena si queda vacio
UMBRALES = {
    'productos.json': 0.9,      # lista grande y estable
    'indice.json': 0.9,         # sale de productos.json
    'promociones.json': None,   # terminan y se reemplazan de a muchas
}


class EscrituraBloqueada(Exception):
    """El archivo nuevo tiene muchos menos registros que el actual."""


_bloqueos = []


def forzado():
    return '--forzar' in sys.argv or os.environ.get('FERREMAX_FORZAR') == '1'


def contar_registros(datos):
    """Registros de un JSON de datos. Un objeto con un solo contenedor adentro
    ({"clientes": {...}}) cuenta lo de adentro; un objeto de listas
    (catalogo_grupos) suma las listas; si no, cuenta las claves."""
    if isinstance(datos, list):
        return len(datos)
    if not isinstance(datos, dict):
        return 0
    if len(datos) == 1:
        (unico,) = datos.values()
        if isinstance(unico, (dict, list)):
            return len(unico)
    if datos and all(isinstance(v, list) for v in datos.values()):
        return sum(len(v) for v in datos.values())
    return len(datos)


def contar_json(ruta, contar=contar_registros):
    """Registros del archivo actual; None si no existe o no se puede leer
    (no hay con que comparar, y entonces no se frena)."""
    try:
        with open(ruta, encoding='utf-8') as f:
            return contar(json.load(f))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None


def revisar(nombre, anterior, nuevo):
    """Lanza EscrituraBloqueada si el nuevo es sospechosamente menor."""
    if anterior is None or forzado():
        return
    proporcion = UMBRALES.get(nombre, PROPORCION_MINIMA)
    if anterior > 0 and nuevo == 0:
        motivo = 'quedaria vacio'
    elif proporcion is not None and anterior >= MINIMO_PARA_PROPORCION and nuevo < anterior * proporcion:
        motivo = f'{round(nuevo * 100 / anterior)}%, el minimo es {round(proporcion * 100)}%'
    else:
        return
    texto = (f'{nombre}: tenia {anterior} registros y se iban a escribir {nuevo} ({motivo}). '
             'No se escribio: quedo el anterior. Si la baja es a proposito, correr con --forzar.')
    _bloqueos.append(texto)
    print('BLOQUEADO: ' + texto)
    raise EscrituraBloqueada(texto)


def escribir_json(ruta, datos, contar=contar_registros, encoding='utf-8', **opciones_dump):
    """Revisa la cantidad y escribe el JSON de forma atomica (archivo temporal
    y reemplazo). opciones_dump: las mismas de json.dump (indent, ensure_ascii)."""
    ruta = Path(ruta)
    revisar(ruta.name, contar_json(ruta, contar), contar(datos))
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(ruta.suffix + '.tmp')
    with open(temporal, 'w', encoding=encoding) as f:
        json.dump(datos, f, **opciones_dump)
    os.replace(temporal, ruta)


def hubo_bloqueos():
    return bool(_bloqueos)


def terminar_si_hubo_bloqueos():
    """Al final de cada script: si algo se freno, terminar con codigo 1."""
    if _bloqueos:
        print(f'\n{len(_bloqueos)} archivo(s) no se escribieron para no pisar datos buenos:')
        for b in _bloqueos:
            print('  - ' + b)
        sys.exit(1)
