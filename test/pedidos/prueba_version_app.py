"""
PRUEBA OFFLINE DE scripts/version_app.py: la huella de los archivos de la app,
que archivos entran y cuales no, la escritura de js/version-app.js y de
version.json["app"], --comprobar, y que todo lo que cargan los HTML y los
import de js/ quede dentro de la huella. Archivos SINTETICOS en una carpeta
temporal: del proyecto solo se LEEN los HTML y js/ (prueba de cobertura).

Uso, desde la raiz del proyecto:
    python test/pedidos/prueba_version_app.py
Termina con codigo 1 si alguna prueba falla.
"""
import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import version_app as va  # noqa: E402

ok = fallas = 0


def ver(nombre, cond, extra=''):
    global ok, fallas
    if cond:
        ok += 1
    else:
        fallas += 1
        print('FALLA:', nombre, extra)


def callado(f, *a, **k):
    salida = io.StringIO()
    with redirect_stdout(salida):
        r = f(*a, **k)
    return r, salida.getvalue()


ARCHIVOS = {
    'catalogo.html': '<html>catalogo</html>\n',
    'imprimir.html': '<html>imprimir</html>\n',
    'login.html': '<html>login</html>\n',
    'index.html': '<html>index</html>\n',
    'test-login.html': '<html>prueba</html>\n',
    'estilos-copia.css': 'body{}\n',
    'login.css': 'form{}\n',
    'js/carrito.js': 'export const a = 1;\n',
    'js/search/v2/buscador-v2.js': 'var b = 2;\n',
    'css/hoja.css': '.hj{}\n',
    'fontawesome/css/all.min.css': '.fa{}\n',
    'json/productos.json': '{"A": 1}',
    'scripts/excel_to_json.py': 'print(1)\n',
}

seguidos_real = va.archivos_seguidos
tmp = Path(tempfile.mkdtemp(prefix='version_app_'))
try:
    for rel, texto in ARCHIVOS.items():
        p = tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(texto, encoding='utf-8', newline='\n')

    # ---------- git ls-files: la funcion real en una carpeta que no es repositorio ----------
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        r = seguidos_real(tmp)
    ver('sin repositorio: archivos_seguidos da None', r is None, r)
    ver('sin repositorio: avisa por la salida de error', 'AVISO: no se pudo usar git ls-files' in err.getvalue(), err.getvalue())

    # En la carpeta sintetica, git simulado: primero "sin git" (la lista sale
    # del disco, en silencio), que es el camino de casi toda esta prueba
    va.archivos_seguidos = lambda raiz: None
    lista_disco = va.archivos_de_la_app(tmp)
    h_disco = va.calcular_huella(tmp)

    # Un .js en el disco que git no sigue no cambia la huella
    seguidos = set(lista_disco)
    va.archivos_seguidos = lambda raiz: set(seguidos)
    ver('git sigue todo: la misma lista que el disco', va.archivos_de_la_app(tmp) == lista_disco)
    (tmp / 'js' / 'temporal.js').write_text('var x = 1;\n', encoding='utf-8')
    ver('un .js no seguido por git no entra en la lista', 'js/temporal.js' not in va.archivos_de_la_app(tmp))
    ver('un .js no seguido por git no cambia la huella', va.calcular_huella(tmp) == h_disco)
    va.archivos_seguidos = lambda raiz: None
    ver('sin git, el mismo .js si entra (lista del disco)', 'js/temporal.js' in va.archivos_de_la_app(tmp) and
        va.calcular_huella(tmp) != h_disco)
    (tmp / 'js' / 'temporal.js').unlink()

    # Un archivo que git sigue pero que no esta en el disco no entra
    va.archivos_seguidos = lambda raiz: set(seguidos) | {'js/borrado.js'}
    ver('seguido por git pero borrado del disco: no entra', 'js/borrado.js' not in va.archivos_de_la_app(tmp) and
        va.calcular_huella(tmp) == h_disco)
    # Lo que git sigue fuera de los patrones tampoco entra
    va.archivos_seguidos = lambda raiz: set(seguidos) | {'json/productos.json', 'scripts/excel_to_json.py', 'test-login.html'}
    ver('seguido por git pero fuera de los patrones: no entra', va.archivos_de_la_app(tmp) == lista_disco)

    # El resto de la prueba, con la lista del disco
    va.archivos_seguidos = lambda raiz: None

    # ---------- que archivos entran ----------
    lista = va.archivos_de_la_app(tmp)
    ver('entran html, css, js, css/ y fontawesome',
        lista == sorted(['catalogo.html', 'imprimir.html', 'login.html', 'index.html', 'estilos-copia.css',
                         'login.css', 'js/carrito.js', 'js/search/v2/buscador-v2.js', 'css/hoja.css',
                         'fontawesome/css/all.min.css']), lista)

    # ---------- la huella ----------
    h0 = va.calcular_huella(tmp)
    ver('huella de 12 caracteres hexadecimales', re.fullmatch(r'[0-9a-f]{12}', h0) is not None, h0)
    ver('mismos archivos, misma huella', va.calcular_huella(tmp) == h0)

    crlf = tmp / 'js' / 'carrito.js'
    crlf.write_bytes(b'export const a = 1;\r\n')
    ver('CRLF o LF dan la misma huella', va.calcular_huella(tmp) == h0)
    crlf.write_text(ARCHIVOS['js/carrito.js'], encoding='utf-8', newline='\n')

    def cambia_con(rel, cambia=True):
        p = tmp / rel
        antes = p.read_bytes() if p.exists() else None
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes((antes or b'') + b'// cambio\n')
        distinta = va.calcular_huella(tmp) != h0
        if antes is None:
            p.unlink()
        else:
            p.write_bytes(antes)
        ver(f'{"cambia" if cambia else "no cambia"} la huella: {rel}', distinta == cambia)

    for rel in ('js/carrito.js', 'js/search/v2/buscador-v2.js', 'css/hoja.css', 'estilos-copia.css',
                'catalogo.html', 'imprimir.html', 'login.html', 'fontawesome/css/all.min.css'):
        cambia_con(rel)
    cambia_con('js/nuevo.js')   # un archivo nuevo de la app tambien
    for rel in ('js/version-app.js', 'json/productos.json', 'test-login.html', 'scripts/excel_to_json.py'):
        cambia_con(rel, cambia=False)
    ver('la huella volvio a la original', va.calcular_huella(tmp) == h0)

    # ---------- escritura ----------
    ruta_js = tmp / 'js' / 'version-app.js'
    ruta_ver = tmp / 'json' / 'version.json'
    otras = {'productos': {'huella': 'p1', 'generado': '2026-11-17T10:00:00Z'},
             'indice': {'huella': 'v2-x'},
             'promociones': {'huella': 'pr1', 'generado': '2026-11-17T10:00:00Z'}}
    ruta_ver.write_text(json.dumps(otras, indent=2), encoding='utf-8')

    codigo, _ = callado(va.actualizar, tmp)
    js = va.leer_js(tmp)
    v = json.loads(ruta_ver.read_text(encoding='utf-8'))
    ver('primera corrida: codigo 0', codigo == 0)
    ver('version-app.js con la huella', js and js['huella'] == h0, js)
    ver('version-app.js define window.VERSION_APP',
        "window.VERSION_APP = { huella: '" + h0 + "'" in ruta_js.read_text(encoding='utf-8'))
    ver('version.json["app"] igual a version-app.js', v.get('app') == js, v.get('app'))
    ver('version.json conserva productos, indice y promociones',
        all(v.get(k) == otras[k] for k in otras), v)
    ver('generado con formato UTC', re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', js['generado']) is not None, js)
    ver('version.json sin salto final, indent 2', ruta_ver.read_text(encoding='utf-8') == json.dumps(v, indent=2))

    m_js, m_ver = os.path.getmtime(ruta_js), os.path.getmtime(ruta_ver)
    time.sleep(1.1)
    codigo, salida = callado(va.actualizar, tmp)
    ver('segunda corrida: no escribe nada',
        codigo == 0 and os.path.getmtime(ruta_js) == m_js and os.path.getmtime(ruta_ver) == m_ver, salida)
    ver('segunda corrida: mismo generado', va.leer_js(tmp) == js)

    # Un cambio de la app: huella y generado nuevos en los dos
    (tmp / 'js' / 'carrito.js').write_text('export const a = 2;\n', encoding='utf-8')
    callado(va.actualizar, tmp)
    js2 = va.leer_js(tmp)
    v2 = json.loads(ruta_ver.read_text(encoding='utf-8'))
    ver('cambio de la app: huella nueva', js2['huella'] != h0 and js2['huella'] == va.calcular_huella(tmp))
    ver('cambio de la app: generado nuevo', js2['generado'] != js['generado'], js2)
    ver('cambio de la app: version.json igual', v2['app'] == js2)

    # version.json sin "app" (un merge): se repone con el generado de la pagina
    del v2['app']
    ruta_ver.write_text(json.dumps(v2, indent=2), encoding='utf-8')
    m_js = os.path.getmtime(ruta_js)
    time.sleep(1.1)
    callado(va.actualizar, tmp)
    v3 = json.loads(ruta_ver.read_text(encoding='utf-8'))
    ver('sin "app": se repone con el generado de version-app.js', v3.get('app') == js2, v3.get('app'))
    ver('sin "app": version-app.js no se toca', os.path.getmtime(ruta_js) == m_js)

    # version-app.js borrado: se rehace con el generado de version.json
    ruta_js.unlink()
    callado(va.actualizar, tmp)
    ver('sin version-app.js: se rehace con el generado de version.json', va.leer_js(tmp) == js2)

    # ---------- --comprobar ----------
    codigo, _ = callado(va.actualizar, tmp, comprobar=True)
    ver('--comprobar al dia: 0', codigo == 0)
    (tmp / 'css' / 'hoja.css').write_text('.hj{color:red}\n', encoding='utf-8')
    antes_js, antes_ver = ruta_js.read_bytes(), ruta_ver.read_bytes()
    codigo, salida = callado(va.actualizar, tmp, comprobar=True)
    ver('--comprobar desactualizado: 1', codigo == 1 and 'DESACTUALIZADO' in salida, salida)
    ver('--comprobar no escribe', ruta_js.read_bytes() == antes_js and ruta_ver.read_bytes() == antes_ver)

    # ---------- version.json ilegible ----------
    ruta_ver.write_text('{ roto', encoding='utf-8')
    codigo, salida = callado(va.actualizar, tmp)
    ver('version.json ilegible: codigo 1', codigo == 1 and 'ERROR' in salida, salida)
    ver('version.json ilegible: no escribe nada',
        ruta_ver.read_text(encoding='utf-8') == '{ roto' and ruta_js.read_bytes() == antes_js)

    # ---------- sin version.json: se crea ----------
    ruta_ver.unlink()
    codigo, _ = callado(va.actualizar, tmp)
    ver('sin version.json: se crea con "app"',
        codigo == 0 and json.loads(ruta_ver.read_text(encoding='utf-8')).get('app', {}).get('huella') == va.calcular_huella(tmp))
finally:
    va.archivos_seguidos = seguidos_real
    shutil.rmtree(tmp, ignore_errors=True)

# ---------- el proyecto real: la lista sale de git ls-files ----------
seguidos_proyecto = va.archivos_seguidos(RAIZ)
ver('proyecto real: git ls-files responde', seguidos_proyecto is not None)
if (RAIZ / 'js' / 'modificaciones-temp.js').exists():
    ver('proyecto real: js/modificaciones-temp.js (ignorado por git) no entra en la huella',
        'js/modificaciones-temp.js' not in va.archivos_de_la_app(RAIZ))

# ---------- cobertura sobre el proyecto real (solo lectura) ----------
# Todo lo local que cargan las paginas y los import de js/ tiene que estar en
# la huella: si no, un cambio en ese archivo no avisaria a nadie
dentro = set(va.archivos_de_la_app(RAIZ)) | {va.RUTA_JS}
FUERA_PERMITIDO = ('json/', 'img/', 'fontawesome/webfonts/')
faltan = []


def revisar_ref(ref, base, origen):
    ref = ref.split('#')[0].split('?')[0].strip()
    if not ref or re.match(r'^[a-z]+:', ref, re.I) or ref.startswith('//'):
        return   # externo (https:, data:, mailto:) o ancla
    ruta = (base / ref).resolve()
    try:
        rel = ruta.relative_to(RAIZ).as_posix()
    except ValueError:
        return
    if not rel.endswith(('.js', '.css', '.html')) or rel.startswith(FUERA_PERMITIDO):
        return
    if rel not in dentro:
        faltan.append(f'{origen} -> {rel}')


for pagina in ('catalogo.html', 'imprimir.html', 'login.html', 'index.html'):
    texto = (RAIZ / pagina).read_text(encoding='utf-8', errors='replace')
    texto = re.sub(r'<!--.*?-->', '', texto, flags=re.S)   # lo comentado no se carga
    for ref in re.findall(r'''<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']''', texto, re.I):
        revisar_ref(ref, RAIZ, pagina)
    for ref in re.findall(r'''(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}/[^"']+)["']''', texto):
        revisar_ref(ref, RAIZ, pagina)

for js in (RAIZ / 'js').rglob('*.js'):
    texto = js.read_text(encoding='utf-8', errors='replace')
    for ref in re.findall(r'''(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}/[^"']+)["']''', texto):
        revisar_ref(ref, js.parent, js.relative_to(RAIZ).as_posix())

ver('cobertura: todo lo que cargan los HTML y los import de js/ esta en la huella', not faltan, faltan)
ver('cobertura: catalogo.html esta en la huella', 'catalogo.html' in dentro)
ver('cobertura: los test-*.html no estan', not any(r.startswith('test-') for r in dentro))

# ----- version-app.js diferido (solo se LEEN los HTML) -----
# Con defer no frena el armado de la pagina y sigue corriendo antes que los
# modulos: los scripts diferidos y los modulos se ejecutan en el orden en que
# aparecen. async romperia ese orden. Los clasicos sin defer que leen
# VERSION_APP (funcionalidades-menu.js) lo hacen despues de DOMContentLoaded
for pagina in ('catalogo.html', 'imprimir.html', 'login.html'):
    texto = (RAIZ / pagina).read_text(encoding='utf-8', errors='replace')
    texto = re.sub(r'<!--.*?-->', '', texto, flags=re.S)   # lo comentado no se carga
    etiquetas = [(m.start(), m.group(0)) for m in re.finditer(r'<script\b[^>]*>', texto, re.I)]
    propias = [(i, e) for i, e in etiquetas if re.search(r'''\bsrc\s*=\s*["'][^"']*version-app\.js["']''', e, re.I)]
    ver(f'{pagina}: carga version-app.js una vez', len(propias) == 1, propias)
    if len(propias) != 1:
        continue
    pos, tag = propias[0]
    ver(f'{pagina}: version-app.js con defer', re.search(r'\sdefer\b', tag, re.I) is not None, tag)
    ver(f'{pagina}: version-app.js sin async', re.search(r'\sasync\b', tag, re.I) is None, tag)
    ver(f'{pagina}: version-app.js es clasico (no type="module")', re.search(r'\btype\s*=', tag, re.I) is None, tag)
    modulos = [i for i, e in etiquetas if re.search(r'''\btype\s*=\s*["']?module''', e, re.I)]
    ver(f'{pagina}: tiene modulos (la prueba mira algo)', bool(modulos))
    ver(f'{pagina}: version-app.js antes que cualquier type="module"', all(pos < i for i in modulos))

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
