"""
VERSION DE LA APP

Los vendedores dejan la app abierta todo el dia: una pestana sigue ejecutando
el JavaScript que cargo a la manana aunque ya se haya publicado otro. Para
saberlo, la pagina lleva escrita su propia version (js/version-app.js, un
script clasico que define window.VERSION_APP) y la compara con la publicada
en json/version.json (clave "app"), que el navegador ya lee cada 15 minutos
(js/frescura-precios.js; ver js/actualizacion-app.js).

La version es una huella de todos los archivos de la app (ARCHIVOS_DE_LA_APP):
cambia cuando cambia cualquiera de ellos, sin acordarse de nada. La calcula el
workflow "Version de la app" (.github/workflows/version-app.yml) en cada push
a production; js/version-app.js NO se edita a mano.

- huella: sha256 de (ruta + contenido) de cada archivo, en orden, con el
  contenido de CRLF a LF (da lo mismo en Windows y en el runner de Linux).
- generado: hora UTC en que cambio la huella; con la misma huella se conserva.
- Escribe la misma {huella, generado} en js/version-app.js y en
  json/version.json["app"] (conservando las demas claves), cada uno solo si
  cambio. Si a version.json le falta "app" (por ejemplo, despues de un merge),
  la repone con el generado de version-app.js.
- Si version.json existe pero no se puede leer, no escribe nada y termina con
  codigo 1 (se perderian las huellas de productos, indice y promociones).

Uso, desde la raiz del proyecto:
    python scripts/version_app.py               calcula y escribe
    python scripts/version_app.py --comprobar   no escribe: 0 al dia, 1 si no
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA_JS = 'js/version-app.js'
RUTA_VERSION = 'json/version.json'

# Archivos cuya huella es la version. test/prueba_version_app.py comprueba
# que todo lo que cargan los HTML y los import de js/ quede adentro
ARCHIVOS_DE_LA_APP = (
    '*.html',                  # catalogo, imprimir, login, index (menos test-*.html)
    '*.css',                   # estilos-copia.css, login.css
    'js/**/*.js',              # menos js/version-app.js (es el resultado)
    'css/**/*.css',
    'fontawesome/css/*.css',
)


def archivos_de_la_app(raiz=RAIZ):
    """Rutas relativas (con /), ordenadas, de los archivos que forman la version"""
    raiz = Path(raiz)
    rutas = set()
    for patron in ARCHIVOS_DE_LA_APP:
        for p in raiz.glob(patron):
            if not p.is_file():
                continue
            rel = p.relative_to(raiz).as_posix()
            if rel == RUTA_JS or (patron == '*.html' and p.name.startswith('test-')):
                continue
            rutas.add(rel)
    return sorted(rutas)


def calcular_huella(raiz=RAIZ):
    h = hashlib.sha256()
    for rel in archivos_de_la_app(raiz):
        contenido = (Path(raiz) / rel).read_bytes().replace(b'\r\n', b'\n')
        h.update(rel.encode('utf-8') + b'\0' + contenido + b'\0')
    return h.hexdigest()[:12]


def leer_js(raiz=RAIZ):
    """{huella, generado} de js/version-app.js, o None si no esta o no se entiende"""
    try:
        texto = (Path(raiz) / RUTA_JS).read_text(encoding='utf-8')
    except OSError:
        return None
    huella = re.search(r"huella:\s*'([0-9a-f]+)'", texto)
    generado = re.search(r"generado:\s*'([^']+)'", texto)
    if not huella or not generado:
        return None
    return {'huella': huella.group(1), 'generado': generado.group(1)}


def contenido_js(v):
    return ('// Version de la app: huella de sus archivos (js, css y html). La compara\n'
            '// js/actualizacion-app.js con la publicada en json/version.json ("app").\n'
            '// GENERADO por scripts/version_app.py (workflow "Version de la app"): no editar a mano\n'
            f"window.VERSION_APP = {{ huella: '{v['huella']}', generado: '{v['generado']}' }};\n")


def _escribir(ruta, texto):
    """Escritura atomica: archivo temporal y reemplazo"""
    temporal = ruta.with_suffix(ruta.suffix + '.tmp')
    with open(temporal, 'w', encoding='utf-8', newline='\n') as f:
        f.write(texto)
    temporal.replace(ruta)


def actualizar(raiz=RAIZ, comprobar=False):
    """Devuelve el codigo de salida: 0 bien (o al dia), 1 error (o desactualizado con comprobar)"""
    raiz = Path(raiz)
    ruta_version = raiz / RUTA_VERSION

    datos = {}
    if ruta_version.exists():
        try:
            with open(ruta_version, encoding='utf-8') as f:
                datos = json.load(f)
            if not isinstance(datos, dict):
                raise ValueError('no es un objeto')
        except (OSError, ValueError) as e:
            print(f'ERROR: no se pudo leer {RUTA_VERSION} ({e}); no se escribe nada')
            return 1

    huella = calcular_huella(raiz)
    js = leer_js(raiz)
    app = datos.get('app') if isinstance(datos.get('app'), dict) else None

    # Con la misma huella se conserva el generado (primero el de la pagina)
    if js and js['huella'] == huella:
        generado = js['generado']
    elif app and app.get('huella') == huella and app.get('generado'):
        generado = app['generado']
    else:
        generado = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    nuevo = {'huella': huella, 'generado': generado}

    cambia_js = js != nuevo
    cambia_version = app != nuevo

    if comprobar:
        if cambia_js or cambia_version:
            print(f'DESACTUALIZADO: la huella actual es {huella}; '
                  f'version-app.js tiene {js["huella"] if js else "nada"}, '
                  f'version.json tiene {app.get("huella") if app else "nada"}. '
                  'Correr python scripts/version_app.py')
            return 1
        print(f'Al dia: {huella} ({generado})')
        return 0

    if cambia_js:
        _escribir(raiz / RUTA_JS, contenido_js(nuevo))
    if cambia_version:
        datos['app'] = nuevo
        # Mismo formato que excel_to_json.py y generar_indice_busqueda.py (indent=2, sin salto final)
        _escribir(ruta_version, json.dumps(datos, indent=2))
    if cambia_js or cambia_version:
        print(f'Version de la app: {huella} ({generado})')
    else:
        print(f'Version de la app sin cambios: {huella}')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Version de la app (huella de sus archivos)')
    parser.add_argument('--comprobar', action='store_true',
                        help='no escribe: termina con 0 si esta al dia y con 1 si no')
    parser.add_argument('--raiz', default=str(RAIZ), help=argparse.SUPPRESS)
    args = parser.parse_args()
    sys.exit(actualizar(args.raiz, comprobar=args.comprobar))
