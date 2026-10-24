"""
RUTINA DIARIA DE DATOS - Ferremax

Corre en orden todo lo que hay que actualizar cada dia, aunque un paso falle:

  1. JSON del catalogo (scripts/excel_to_json.py)
  2. Indice de busqueda (generar_indice_busqueda.py)
  3. Prueba del buscador (node js/search/v2/probar_busquedas.js), como aviso
  4. Finanzas: JSON desde excel/clientes_finanzas.xlsx
  5. Finanzas: hoja de la planilla y cache del servidor (necesita el 4)
  6. Usuarios: JSON desde los Excel de usuarios y funcionalidades
  7. Usuarios: hoja de la planilla (necesita el 6)

Un paso que necesita otro que fallo se omite (no se carga un JSON viejo a la
planilla). Al final muestra un resumen: que salio bien, que fallo, que quedo
desactualizado y que archivos cambiaron (para publicarlos: commit y push).

Las imagenes no estan aca: tienen su propio circuito (Drive Scanner).

Uso:
    python scripts/rutina_diaria.py            (o doble clic en rutina-diaria.bat)
    python scripts/rutina_diaria.py --forzar   escribe aunque baje mucho la
                                               cantidad de registros (ver
                                               scripts/guardia_registros.py)

La salida completa queda en salida/rutina_AAAAMMDD_HHMM.log.
Termina con codigo 1 si algun paso fallo.
"""
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PY = sys.executable
TIEMPO_MAX_S = 15 * 60          # por paso

PASOS = [
    {
        'clave': 'json',
        'nombre': 'JSON del catálogo',
        'comando': [PY, 'scripts/excel_to_json.py'],
        'archivos': ['json/productos.json'],
        'avisos': [r'^\s*Error\b', r'^\s*AVISO\b'],
        'si_falla': 'Productos, precios, clientes, grupos, promociones o márgenes del catálogo pueden estar viejos.',
        'si_aviso': ('Algún archivo dio error, o los márgenes no se pudieron leer de Google Sheets y '
                     'quedaron los anteriores: revisá el registro.'),
    },
    {
        'clave': 'indice',
        'nombre': 'Índice de búsqueda',
        'comando': [PY, 'generar_indice_busqueda.py'],
        'archivos': ['json/search/v2/indice.json'],
        'sin_cambios': r'Índice sin cambios',
        'nota_si_fallo': {'json': 'se armó con el productos.json anterior, porque falló el paso de JSON'},
        'si_falla': 'Los productos nuevos o cambiados no aparecen en el buscador, o aparecen con datos viejos.',
    },
    {
        'clave': 'prueba',
        'nombre': 'Prueba del buscador',
        'comando': ['node', 'js/search/v2/probar_busquedas.js'],
        'requiere': ['indice'],
        'programa': 'node',
        'falla_es_aviso': True,
        'si_aviso': 'Algún caso de búsqueda no da lo esperado: revisá el detalle antes de publicar el índice.',
    },
    {
        'clave': 'fin_json',
        'nombre': 'Finanzas: JSON desde clientes_finanzas.xlsx',
        'comando': [PY, 'scripts/convertir_clientes_finanzas.py'],
        'archivos': ['json/clientes_finanzas.json'],
        'errores': [r'❌'],
        'si_falla': 'La búsqueda de clientes del catálogo muestra saldos y cupos viejos.',
    },
    {
        'clave': 'fin_hoja',
        'nombre': 'Finanzas: hoja de la planilla y caché del servidor',
        'comando': [PY, 'scripts/cargar_finanzas_sheets.py'],
        'requiere': ['fin_json'],
        'avisos': [r'AVISO: no se pudo limpiar'],
        'si_falla': 'El cupo del semáforo puede estar viejo: el servidor sigue con la hoja anterior.',
        'si_aviso': ('La caché del servidor no se limpió: el semáforo puede usar los cupos anteriores hasta '
                     '1 hora. Volvé a correr este paso o abrí la URL de limpiar_cache_fin.'),
    },
    {
        'clave': 'usr_json',
        'nombre': 'Usuarios: JSON desde los Excel de usuarios y funcionalidades',
        'comando': [PY, 'scripts/converter_usuarios_funcionalidades_to_json.py'],
        'archivos': ['json/funcionalidades_usuarios.json', 'json/funcionalidades.json'],
        'errores': [r'❌', r'CON ERRORES'],
        'si_falla': 'Usuarios nuevos, bajas o cambios de rol no llegan al menú del catálogo.',
    },
    {
        'clave': 'usr_hoja',
        'nombre': 'Usuarios: hoja de la planilla',
        'comando': [PY, 'scripts/cargar_usuarios_sheets.py'],
        'requiere': ['usr_json'],
        'si_falla': ('Usuarios nuevos no pueden iniciar sesión, y las bajas o cambios de rol '
                     'no se aplican en el servidor.'),
    },
]

SIMBOLO = {'ok': '✓', 'aviso': '⚠', 'falla': '✗', 'omitido': '○'}


def fmt_duracion(s):
    return f'{int(s // 60)} min {int(s % 60)} s' if s >= 60 else f'{s:.0f} s'


def huellas():
    """Fecha de modificacion de los archivos de datos, para saber cuales cambiaron."""
    rutas = list((RAIZ / 'json').glob('*.json')) + [RAIZ / 'json' / 'search' / 'v2' / 'indice.json']
    return {p: p.stat().st_mtime for p in rutas if p.exists()}


def correr(paso, log):
    """Corre un paso mostrando su salida. Devuelve (estado, motivo)."""
    if paso.get('programa') and not shutil.which(paso['programa']):
        return 'omitido', f"{paso['programa']} no está instalado"

    inicio = time.time()
    # Los scripts imprimen tildes y simbolos: sin esto, en Windows fallan al
    # escribir en una tuberia
    entorno = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    try:
        proc = subprocess.Popen(paso['comando'], cwd=RAIZ, env=entorno, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    except OSError as e:
        return 'falla', f'no se pudo ejecutar: {e}'

    vencido = threading.Event()

    def cortar():
        vencido.set()
        proc.kill()

    reloj = threading.Timer(TIEMPO_MAX_S, cortar)
    reloj.start()
    lineas = []
    try:
        for linea in proc.stdout:
            linea = linea.rstrip('\n')
            lineas.append(linea)
            print('   ' + linea)
            log.write(linea + '\n')
        proc.wait()
    finally:
        reloj.cancel()

    salida = '\n'.join(lineas)
    bloqueos = [l.split('BLOQUEADO:', 1)[1].strip() for l in lineas if 'BLOQUEADO:' in l]

    def coincide(patrones):
        return next((l.strip() for l in lineas if any(re.search(p, l) for p in patrones)), None)

    if vencido.is_set():
        return 'falla', f'no terminó en {TIEMPO_MAX_S // 60} minutos'
    if proc.returncode != 0:
        motivo = ('no se escribió para no pisar datos buenos: ' + bloqueos[0]) if bloqueos \
            else f'terminó con error (código {proc.returncode})'
        return ('aviso' if paso.get('falla_es_aviso') else 'falla'), motivo
    error = coincide(paso.get('errores', []))
    if error:
        return 'falla', error[:200]
    viejos = [a for a in paso.get('archivos', [])
              if not (RAIZ / a).exists() or (RAIZ / a).stat().st_mtime < inicio - 1]
    if viejos and not (paso.get('sin_cambios') and re.search(paso['sin_cambios'], salida)):
        return 'falla', 'no se actualizó ' + ', '.join(viejos)
    aviso = coincide(paso.get('avisos', []))
    if aviso:
        return 'aviso', aviso[:200]
    return 'ok', ''


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    if '--forzar' in sys.argv:
        os.environ['FERREMAX_FORZAR'] = '1'   # lo heredan todos los pasos

    comienzo = datetime.now()
    (RAIZ / 'salida').mkdir(exist_ok=True)
    ruta_log = RAIZ / 'salida' / f'rutina_{comienzo:%Y%m%d_%H%M}.log'
    antes = huellas()
    estados, resultados = {}, []

    with open(ruta_log, 'w', encoding='utf-8') as log:
        for i, paso in enumerate(PASOS, 1):
            titulo = f'[{i}/{len(PASOS)}] {paso["nombre"]}'
            print('\n' + '=' * 60 + '\n' + titulo + '\n' + '=' * 60)
            log.write(f'\n===== {titulo} =====\n')

            # No cargar a la planilla un JSON que no se pudo generar
            faltan = [r for r in paso.get('requiere', []) if estados.get(r) not in ('ok', 'aviso')]
            t0 = time.time()
            if faltan:
                previos = ', '.join(f'«{p["nombre"]}»' for p in PASOS if p['clave'] in faltan)
                estado, motivo = 'omitido', f'no se corrió porque no terminó bien {previos}'
                print('   ' + motivo)
            else:
                estado, motivo = correr(paso, log)
                for clave, nota in paso.get('nota_si_fallo', {}).items():
                    if estados.get(clave) == 'falla' and estado in ('ok', 'aviso'):
                        estado, motivo = 'aviso', nota
            estados[paso['clave']] = estado
            resultados.append((paso, estado, motivo, time.time() - t0))
            log.write(f'--> {estado}: {motivo}\n')

        # ---------- resumen ----------
        cambiaron = sorted(str(p.relative_to(RAIZ)).replace('\\', '/')
                           for p, t in huellas().items() if antes.get(p) != t)
        total = (datetime.now() - comienzo).total_seconds()
        lineas = ['', '=' * 60,
                  f'RESUMEN DE LA RUTINA · {comienzo:%d/%m/%Y %H:%M} · {fmt_duracion(total)}',
                  '=' * 60]
        for paso, estado, motivo, dur in resultados:
            lineas.append(f'  {SIMBOLO[estado]} {paso["nombre"]}' + (f' — {motivo}' if motivo else '') +
                          f'  ({fmt_duracion(dur)})')

        consecuencias = []
        for paso, estado, motivo, _ in resultados:
            if estado in ('falla', 'omitido') and paso.get('si_falla'):
                consecuencias.append(f'  • {paso["si_falla"]}  [{paso["nombre"]}]')
            elif estado == 'aviso' and paso.get('si_aviso'):
                consecuencias.append(f'  • {paso["si_aviso"]}  [{paso["nombre"]}]')
        lineas.append('-' * 60)
        if consecuencias:
            lineas.append('QUÉ PUEDE HABER QUEDADO DESACTUALIZADO')
            lineas += consecuencias
        else:
            lineas.append('Todo quedó actualizado.')

        lineas.append('-' * 60)
        if cambiaron:
            lineas.append('Archivos que cambiaron (para que el catálogo publicado los vea: commit y push):')
            lineas += [f'  {c}' for c in cambiaron]
        else:
            lineas.append('Ningún archivo del catálogo cambió.')
        lineas.append(f'Registro completo: {ruta_log.relative_to(RAIZ)}')

        texto = '\n'.join(lineas)
        print(texto)
        log.write(texto + '\n')

    sys.exit(1 if any(e == 'falla' for e in estados.values()) else 0)


if __name__ == '__main__':
    main()
