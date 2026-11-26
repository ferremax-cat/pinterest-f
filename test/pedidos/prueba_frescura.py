"""
PRUEBA OFFLINE DE LAS HUELLAS DE json/version.json Y DE LOS JSON QUE NO TIENEN
QUE CAMBIAR SI NO CAMBIAN LOS DATOS:

- escribir_version (scripts/excel_to_json.py): la misma huella con CRLF (la
  rutina en Windows) y con LF (como lo guarda git y lo ve GitHub); huellas de
  imagenes (sin lastUpdate) y de grupos_clientes; conserva las demas claves y el
  generado si no cambio el contenido.
- process_image_catalog_local: con el mismo Excel, catalogo_imagenes.json queda
  identico byte a byte (conserva lastUpdate); con una foto nueva, cambia.
- --solo-imagenes tambien escribe version.json.
- generar_posiciones_bottom_completo (drive_scanner.py): con las mismas
  dimensiones no reescribe catalogo_dimensiones.json; con una que cambia, solo
  esa imagen lleva lastCalculated nuevo. Se ejecuta la funcion REAL sacada del
  archivo con ast: importar drive_scanner.py escanearia Drive.

Datos SINTETICOS en una carpeta temporal: no toca json/ ni excel/ del proyecto
(se comprueba con su huella antes y despues). La parte "proyecto" solo lee.

Uso, desde la raiz del proyecto:
    python test/pedidos/prueba_frescura.py
Termina con codigo 1 si alguna prueba falla.
"""
import ast
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import redirect_stdout
from datetime import datetime
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


# Huellas esperadas, calculadas aca sin usar el codigo del proyecto: lo que
# veria GitHub (LF) y, para imagenes, solo el mapa codigo -> id
def esperada(datos):
    return hashlib.sha256(datos.replace(b'\r\n', b'\n')).hexdigest()[:16]


def esperada_imagenes(datos):
    images = json.loads(datos.decode('utf-8')).get('images', {})
    return hashlib.sha256(json.dumps(images, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()[:16]


def huella_carpeta(carpeta):
    """(ruta, tamaño, fecha) de cada archivo: para comprobar que no se toco"""
    return sorted((str(p.relative_to(carpeta)), p.stat().st_size, p.stat().st_mtime_ns)
                  for p in Path(carpeta).rglob('*') if p.is_file())


def callado(fn, *a):
    with redirect_stdout(io.StringIO()):
        return fn(*a)


def leer_version(tmp):
    return json.loads((tmp / 'json' / 'version.json').read_text(encoding='utf-8'))


proyecto_antes = {c: huella_carpeta(RAIZ / c) for c in ('json', 'excel')}
origen = os.getcwd()
tmp = Path(tempfile.mkdtemp(prefix='ferremax-frescura-'))
try:
    os.chdir(tmp)
    (tmp / 'json').mkdir()
    J = tmp / 'json'
    productos = json.dumps({'A': {'name': 'UNO', 'prices': {'D': 1}}, 'B': {'name': 'DOS', 'prices': {'D': 2}}}, indent=2)
    grupos = json.dumps({'groups': {'G1': ['1', '2'], 'G2': ['3']}}, indent=2)
    imagenes = {'version': '1.0', 'lastUpdate': '2026-11-26T10:00:00', 'totalImages': 2,
                'images': {'A': 'ID-A', 'B': 'ID-B'}}

    # ---------- 1. CRLF y LF dan la misma huella ----------
    (J / 'version.json').write_text(json.dumps({'indice': {'huella': 'v2-x'}, 'app': {'huella': 'ap', 'generado': 'g'}}),
                                    encoding='utf-8')
    (J / 'productos.json').write_bytes(productos.replace('\n', '\r\n').encode('utf-8'))   # como la rutina en Windows
    (J / 'grupos_clientes.json').write_bytes(grupos.replace('\n', '\r\n').encode('utf-8'))
    (J / 'catalogo_imagenes.json').write_bytes(json.dumps(imagenes, indent=2).replace('\n', '\r\n').encode('utf-8'))
    callado(ej.escribir_version)
    v1 = leer_version(tmp)
    lf_productos = productos.encode('utf-8')
    ver('1. CRLF: la huella de productos es la de LF (la que calcula GitHub)',
        v1.get('productos', {}).get('huella') == esperada(lf_productos), v1.get('productos'))
    gen1 = v1.get('productos', {}).get('generado')
    time.sleep(1.1)
    (J / 'productos.json').write_bytes(lf_productos)   # el mismo archivo, como lo guarda git
    callado(ej.escribir_version)
    v2 = leer_version(tmp)
    ver('1. el mismo archivo en LF: misma huella y mismo generado (no hay vaiven)',
        v2.get('productos') == v1.get('productos') and v2['productos'].get('generado') == gen1, (v1.get('productos'), v2.get('productos')))

    # ---------- 2. imagenes y grupos_clientes en version.json ----------
    ver('2. version.json lleva la huella de grupos_clientes (la de LF)',
        v1.get('grupos_clientes', {}).get('huella') == esperada(grupos.encode('utf-8')) and 'generado' in v1.get('grupos_clientes', {}),
        v1.get('grupos_clientes'))
    ver('2. version.json lleva la huella de imagenes (solo el mapa, sin lastUpdate)',
        v1.get('imagenes', {}).get('huella') == esperada_imagenes(json.dumps(imagenes).encode('utf-8')) and
        'generado' in v1.get('imagenes', {}), v1.get('imagenes'))
    ver('2. conserva indice y app', v2.get('indice') == {'huella': 'v2-x'} and v2.get('app') == {'huella': 'ap', 'generado': 'g'}, v2)

    # ---------- 3. imagenes: lastUpdate no cuenta ----------
    otra = dict(imagenes, lastUpdate='2026-11-26T11:11:11')
    (J / 'catalogo_imagenes.json').write_text(json.dumps(otra, indent=2), encoding='utf-8')
    callado(ej.escribir_version)
    v3 = leer_version(tmp)
    ver('3. solo cambia lastUpdate: misma huella de imagenes y mismo generado',
        v3.get('imagenes') == v1.get('imagenes') and 'imagenes' in v3, (v1.get('imagenes'), v3.get('imagenes')))
    otra['images'] = {'A': 'ID-A', 'B': 'ID-B', 'C': 'ID-C'}
    (J / 'catalogo_imagenes.json').write_text(json.dumps(otra, indent=2), encoding='utf-8')
    callado(ej.escribir_version)
    v4 = leer_version(tmp)
    ver('3. una foto nueva: otra huella y otro generado',
        v4.get('imagenes', {}).get('huella') not in (None, v1.get('imagenes', {}).get('huella')) and
        v4['imagenes'].get('generado') != v1.get('imagenes', {}).get('generado'), v4.get('imagenes'))

    # ---------- 4. process_image_catalog_local conserva lastUpdate ----------
    def excel_imagenes(filas):
        pd.DataFrame({'articulo': [f[0] for f in filas], 'id': [f[1] for f in filas]}).to_excel(tmp / 'imagenes_drive.xlsx', index=False)

    (J / 'catalogo_imagenes.json').unlink()
    excel_imagenes([('A', 'ID-A'), ('B', 'ID-B')])
    callado(ej.process_image_catalog_local)
    b1 = (J / 'catalogo_imagenes.json').read_bytes()
    time.sleep(0.05)
    callado(ej.process_image_catalog_local)
    b2 = (J / 'catalogo_imagenes.json').read_bytes()
    ver('4. mismo Excel dos veces: catalogo_imagenes.json identico byte a byte', b1 == b2,
        (json.loads(b1).get('lastUpdate'), json.loads(b2).get('lastUpdate')))
    excel_imagenes([('A', 'ID-A'), ('B', 'ID-B2')])
    time.sleep(0.05)
    callado(ej.process_image_catalog_local)
    d3 = json.loads((J / 'catalogo_imagenes.json').read_bytes())
    ver('4. una foto cambiada: el mapa nuevo y otro lastUpdate',
        d3['images'] == {'A': 'ID-A', 'B': 'ID-B2'} and d3['lastUpdate'] != json.loads(b1)['lastUpdate'], d3)

    # ---------- 5. --solo-imagenes tambien escribe version.json ----------
    (J / 'version.json').write_text(json.dumps({'indice': {'huella': 'v2-x'}}), encoding='utf-8')
    entorno = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONIOENCODING='utf-8')
    r = subprocess.run([sys.executable, str(RAIZ / 'scripts' / 'excel_to_json.py'), '--solo-imagenes'],
                       cwd=tmp, capture_output=True, text=True, encoding='utf-8', env=entorno, timeout=120)
    v5 = leer_version(tmp)
    ver('5. --solo-imagenes: termina bien y version.json lleva la huella de imagenes',
        r.returncode == 0 and v5.get('imagenes', {}).get('huella') == esperada_imagenes((J / 'catalogo_imagenes.json').read_bytes()),
        (r.returncode, v5, r.stdout[-300:], r.stderr[-300:]))

    # ---------- 6. drive_scanner: generar_posiciones_bottom_completo ----------
    fuente = (RAIZ / 'drive_scanner.py').read_text(encoding='utf-8')
    nodo = next(n for n in ast.parse(fuente).body
                if isinstance(n, ast.FunctionDef) and n.name == 'generar_posiciones_bottom_completo')
    espacio = {'json': json, 'os': os, 'datetime': datetime}
    exec(compile(ast.Module(body=[nodo], type_ignores=[]), 'drive_scanner.py', 'exec'), espacio)
    posiciones = espacio['generar_posiciones_bottom_completo']
    dims = {'version': '1.0', 'lastUpdate': '2026-01-01T00:00:00', 'images_dimensions': {
        'A': {'width': 600, 'height': 600, 'ratio': 1.0},
        'B': {'width': 1000, 'height': 500, 'ratio': 2.0},
        'C': {'width': 400, 'height': 800, 'ratio': 0.5}}}
    ruta_dims = J / 'catalogo_dimensiones.json'
    ruta_dims.write_text(json.dumps(dims, indent=2), encoding='utf-8')
    callado(posiciones)
    p1 = ruta_dims.read_bytes()
    d1 = json.loads(p1)
    ver('6. primera corrida: tipo y posicion de cada imagen',
        d1['images_dimensions']['B'].get('imageType') == 'very_horizontal' and
        d1['images_dimensions']['C'].get('bottomPosition') == {'mobile': 48, 'tablet': 58, 'desktop': 68}, d1)
    m1 = ruta_dims.stat().st_mtime_ns
    time.sleep(0.05)
    callado(posiciones)
    ver('6. mismas dimensiones: catalogo_dimensiones.json no se reescribe',
        ruta_dims.read_bytes() == p1 and ruta_dims.stat().st_mtime_ns == m1,
        (d1.get('lastUpdate'), json.loads(ruta_dims.read_bytes()).get('lastUpdate')))
    d1['images_dimensions']['A']['ratio'] = 1.3   # A pasa a horizontal
    ruta_dims.write_text(json.dumps(d1, indent=2), encoding='utf-8')
    time.sleep(0.05)
    callado(posiciones)
    d2 = json.loads(ruta_dims.read_bytes())
    i1, i2 = d1['images_dimensions'], d2['images_dimensions']
    ver('6. una imagen cambia: solo ella lleva lastCalculated nuevo, y cambia lastUpdate',
        i2['A'].get('imageType') == 'horizontal' and i2['A'].get('lastCalculated') != i1['A'].get('lastCalculated') and
        i2['B'].get('lastCalculated') == i1['B'].get('lastCalculated') and
        i2['C'].get('lastCalculated') == i1['C'].get('lastCalculated') and d2.get('lastUpdate') != d1.get('lastUpdate'),
        {k: (i1[k].get('lastCalculated'), i2[k].get('lastCalculated')) for k in i2})
finally:
    os.chdir(origen)
    guardia._bloqueos.clear()
    shutil.rmtree(tmp, ignore_errors=True)

ver('carpeta temporal: json/ y excel/ del proyecto sin tocar',
    all(huella_carpeta(RAIZ / c) == proyecto_antes[c] for c in ('json', 'excel')))

# ---------- proyecto (solo lectura): cada huella de version.json es la de su archivo ----------
publicada = json.loads((RAIZ / 'json' / 'version.json').read_text(encoding='utf-8'))
for clave, ruta in (('productos', 'productos.json'), ('catalogo_grupos', 'catalogo_grupos.json'),
                    ('promociones', 'promociones.json'), ('grupos_clientes', 'grupos_clientes.json'),
                    ('imagenes', 'catalogo_imagenes.json')):
    if clave not in publicada:
        print(f'  (proyecto: version.json todavia no tiene "{clave}": la agrega la proxima corrida de la rutina)')
        continue
    datos = (RAIZ / 'json' / ruta).read_bytes()
    calc = esperada_imagenes(datos) if clave == 'imagenes' else esperada(datos)
    ver(f'proyecto: la huella de {clave} en version.json es la de {ruta} (en LF)',
        publicada[clave].get('huella') == calc, (publicada[clave].get('huella'), calc))

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
