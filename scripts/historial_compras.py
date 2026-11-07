r"""
HISTORIAL DE COMPRAS POR CLIENTE -> hoja 'historial' de Ferremax Sistema

1. Copia el VENTAS.DBF del sistema de gestion (\\Madre\c\SMM\VENTAS.DBF) a
   C:\analisis_vtas\VENTAS.DBF. El original SOLO se abre para leer: nunca se
   mueve, renombra, edita, bloquea ni borra, y en su carpeta no se escribe
   nada (si se toca, el sistema de gestion deja de funcionar). La copia pasa
   por un temporal que se verifica antes de reemplazar la anterior; si algo
   falla, se sigue con la copia anterior y se avisa.
2. De la copia toma las compras de los ultimos 12 meses y arma por cliente la
   lista de articulos del catalogo que compro: fecha, cantidad y precio neto
   unitario con IVA de la ultima compra, y para futuras alertas de reposicion,
   cuantas veces lo compro, el intervalo tipico entre compras y la cantidad
   tipica por compra. Tambien las listas ya armadas de habituales (hasta 20) y
   dejo de comprar (hasta 10, sin repetir habituales), sin los articulos de
   temporada fuera de su temporada que hace mucho que no compra (perfil de 24
   meses de todas las ventas).
3. Lo sube a la hoja 'historial': una fila por cliente, con el resumen
   comprimido en una celda, para que el servidor (accion historial_cliente)
   lea una sola fila.

Son datos sensibles: no se escriben en ningun archivo del repositorio. Por
pantalla (y en el registro de la rutina) solo salen cantidades, nunca cuentas
ni nombres.

Que se cuenta:
  - renglones vigentes (los borrados del DBF no), con cantidad positiva y que
    no sean notas de credito;
  - solo articulos del catalogo (json/productos.json): asi quedan afuera los
    conceptos (descuentos, redondeos, fletes). El sistema corta los codigos a
    13 caracteres: uno de 13 se une con el unico del catalogo que empieza
    asi; si no esta igual, se prueba sin espacios ni signos (forma compacta);
  - precio neto unitario con IVA = PRECIO x (1 + IVA/100) x (1 - descuento del
    comprobante). El descuento sobre el total va en renglones aparte del mismo
    comprobante, fuera del catalogo, con cantidad negativa y el nombre
    "DESCUENTO ...": es lo que suman sobre el resto del comprobante.

Uso:
    python scripts/historial_compras.py                (lo corre la rutina diaria)
    python scripts/historial_compras.py --sin-copiar   usa la copia que ya esta, sin ir a la red
    python scripts/historial_compras.py --sin-subir    no escribe la hoja: solo muestra las cifras
    python scripts/historial_compras.py --origen \\otra\c\VENTAS.DBF --dbf D:\copia\VENTAS.DBF
Las rutas tambien se pueden fijar con FERREMAX_VENTAS_ORIGEN (el original) y
FERREMAX_VENTAS_DBF (la copia).
"""
import base64
import gzip
import json
import math
import os
import re
import shutil
import struct
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import median

import gspread
import requests
from google.oauth2.service_account import Credentials

# Antes de borrar la hoja, comparar la cantidad de clientes (ver guardia_registros.py)
try:
    import guardia_registros as guardia
except ImportError:
    from scripts import guardia_registros as guardia

RAIZ = Path(__file__).resolve().parent.parent
CREDENCIAL = RAIZ / 'credenciales' / 'service-account.json'
CATALOGO = RAIZ / 'json' / 'productos.json'
ORIGEN_POR_DEFECTO = r'\\Madre\c\SMM\VENTAS.DBF'
DBF_POR_DEFECTO = r'C:\analisis_vtas\VENTAS.DBF'

PLANILLA_ID = '1U91v6CVHmlaF3wjRhxSpyxtvP6RE0YNicZHrNRVMso4'
HOJA = 'historial'
ENCABEZADOS = ['cuenta', 'actualizado', 'articulos', 'historial']
URL_API = ('https://script.google.com/macros/s/'
           'AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec')

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
]

DIAS = 365
# Perfil de temporada de cada articulo: las ventas de 24 meses de todos los clientes
DIAS_PERFIL = 730
MAX_HABITUALES = 20
MAX_DEJO = 10
# Una celda de Google Sheets admite 50.000 caracteres: se deja margen
MAX_CELDA = 49000
# Si el DBF termina hace mas dias que esto, el sistema dejo de exportarlo
DIAS_DBF_VIEJO = 3
# Si el original cambia mientras se copia (el sistema esta escribiendo)
INTENTOS_COPIA = 3
ESPERA_COPIA_S = 5
FILAS_POR_ENVIO = 100
ES_DESCUENTO = re.compile(r'^\s*DESC', re.I)
CAMPOS = ('COMPTE', 'FECHA', 'CUENTA', 'ARTICULO', 'NOMBRE', 'CANTIDAD', 'PRECIO', 'IMPORTE', 'IVA')


def opcion(nombre):
    if nombre in sys.argv:
        i = sys.argv.index(nombre)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def numero(texto):
    try:
        return float(texto or 0)
    except ValueError:
        return 0.0


# ---------- copia del DBF del sistema de gestion ----------
# REGLA: el original solo se usa en huella (os.stat) y en abrir_solo_lectura.
# Todo lo que se escribe (el temporal y el reemplazo) esta en la carpeta de la copia.

def abrir_solo_lectura(ruta):
    """Abre el original para leer sin impedirle nada al sistema de gestion. En
    Windows, open(..., 'rb') no deja borrarlo ni renombrarlo mientras esta
    abierto; CreateFileW con los tres permisos compartidos si. En otros
    sistemas, open(..., 'rb') no bloquea."""
    if os.name != 'nt':
        return open(ruta, 'rb')
    import ctypes
    import msvcrt
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.CreateFileW.restype = wintypes.HANDLE
    kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                     wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    GENERIC_READ = 0x80000000
    COMPARTIR_TODO = 0x1 | 0x2 | 0x4   # FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
    OPEN_EXISTING = 3                  # solo si existe: nunca lo crea
    FILE_ATTRIBUTE_NORMAL = 0x80
    h = kernel32.CreateFileW(str(ruta), GENERIC_READ, COMPARTIR_TODO, None, OPEN_EXISTING,
                             FILE_ATTRIBUTE_NORMAL, None)
    if h is None or h == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        fd = msvcrt.open_osfhandle(h, os.O_RDONLY | os.O_BINARY)
    except OSError:
        kernel32.CloseHandle(h)
        raise
    return os.fdopen(fd, 'rb')


def huella(ruta):
    """Fecha de modificacion y tamano, sin abrir el archivo."""
    st = os.stat(ruta)
    return st.st_mtime_ns, st.st_size


def dbf_invalido(ruta):
    """Motivo si el archivo no es un DBF completo; None si esta bien."""
    tamano = os.path.getsize(ruta)
    with open(ruta, 'rb') as f:
        cab = f.read(32)
    if len(cab) < 32 or cab[0] not in (0x03, 0x83):
        return 'el encabezado no es de un DBF'
    total, largo_cab, largo_reg = struct.unpack('<IHH', cab[4:12])
    if largo_cab < 33 or largo_reg < 1:
        return 'el encabezado no es de un DBF'
    esperado = largo_cab + total * largo_reg
    if tamano not in (esperado, esperado + 1):   # +1: la marca de fin de archivo
        return f'tiene {tamano} bytes y su encabezado dice {total} registros ({esperado} bytes)'
    return None


def borrar_temporal(temporal):
    try:
        temporal.unlink()
    except OSError:
        pass


def copiar_dbf(origen, copia):
    """Copia el original sobre la copia, pasando por un temporal verificado.
    Devuelve None si salio bien, o el motivo por el que quedo la copia anterior."""
    carpeta = lambda r: os.path.normcase(os.path.dirname(os.path.abspath(r)))
    if carpeta(origen) == carpeta(copia):
        return 'la copia no puede estar en la carpeta del original'
    copia = Path(copia)
    copia.parent.mkdir(parents=True, exist_ok=True)
    temporal = copia.with_name(copia.name + '.tmp')

    for intento in range(1, INTENTOS_COPIA + 1):
        try:
            antes = huella(origen)
            src = abrir_solo_lectura(origen)
        except OSError as e:
            return f'el original no está accesible ({e.strerror or e})'
        try:
            with src, open(temporal, 'wb') as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            despues = huella(origen)
        except OSError as e:
            borrar_temporal(temporal)
            return f'no se pudo copiar ({e.strerror or e})'

        if antes != despues or os.path.getsize(temporal) != despues[1]:
            print(f'   El original cambió mientras se copiaba (intento {intento} de {INTENTOS_COPIA})')
            if intento < INTENTOS_COPIA:
                time.sleep(ESPERA_COPIA_S)
            continue

        motivo = dbf_invalido(temporal)
        if motivo:
            borrar_temporal(temporal)
            return 'la copia no se pudo verificar: ' + motivo
        try:
            os.replace(temporal, copia)
        except OSError as e:
            borrar_temporal(temporal)
            return f'no se pudo reemplazar la copia anterior: ¿está abierta en otro programa? ({e.strerror or e})'
        return None

    borrar_temporal(temporal)
    return f'el original cambió durante la copia en los {INTENTOS_COPIA} intentos'


# ---------- lectura de la copia ----------

def leer_dbf(ruta, desde, desde_perfil=None):
    """Renglones vigentes con FECHA >= desde ('AAAAMMDD'), la ultima fecha del
    archivo y, para el perfil de temporada, las compras (fecha, cuenta, articulo)
    con desde_perfil <= FECHA < desde: cantidad positiva y sin notas de credito."""
    with open(ruta, 'rb') as f:
        cab = f.read(32)
        total, largo_cab, largo_reg = struct.unpack('<IHH', cab[4:12])
        f.seek(0)
        cab = f.read(largo_cab)
        campos, pos, o = {}, 1, 32
        while cab[o] != 0x0D:
            nombre = cab[o:o + 11].split(b'\0')[0].decode('latin1')
            campos[nombre] = slice(pos, pos + cab[o + 16])
            pos += cab[o + 16]
            o += 32
        faltan = [c for c in CAMPOS if c not in campos]
        if faltan:
            raise ValueError('al DBF le faltan los campos ' + ', '.join(faltan))

        filas, viejas, ultima, leidos = [], [], '', 0
        while leidos < total:
            cuantos = min(20000, total - leidos)
            bloque = f.read(largo_reg * cuantos)
            leidos += cuantos
            for b in range(0, len(bloque) - largo_reg + 1, largo_reg):
                r = bloque[b:b + largo_reg]
                if r[0] == 0x2A:              # renglon borrado
                    continue
                fecha = r[campos['FECHA']].decode('latin1')
                if fecha > ultima:
                    ultima = fecha
                if fecha < desde:
                    if desde_perfil and fecha >= desde_perfil:
                        txt = lambda c: r[campos[c]].decode('latin1').strip()
                        if numero(txt('CANTIDAD')) > 0 and not txt('COMPTE').upper().startswith('NC'):
                            viejas.append((fecha, txt('CUENTA'), txt('ARTICULO')))
                    continue
                txt = lambda c: r[campos[c]].decode('latin1').strip()
                filas.append({
                    'compte': txt('COMPTE'), 'fecha': fecha, 'cuenta': txt('CUENTA'),
                    'articulo': txt('ARTICULO'), 'nombre': txt('NOMBRE'),
                    'cantidad': numero(txt('CANTIDAD')), 'precio': numero(txt('PRECIO')),
                    'importe': numero(txt('IMPORTE')), 'iva': numero(txt('IVA')),
                })
    return filas, ultima, viejas


def compactar(codigo):
    return re.sub(r'[^A-Z0-9]', '', codigo.upper())


def preparar_union(codigos):
    """Funcion: articulo del DBF -> codigo del catalogo, o None."""
    exacto = {c.upper(): c for c in codigos}
    por13, compacto = defaultdict(list), defaultdict(list)
    for c in codigos:
        if len(c) > 13:
            por13[c[:13].upper()].append(c)
        compacto[compactar(c)].append(c)
    memo = {}

    def unir(articulo):
        if articulo not in memo:
            a = articulo.upper()
            if a in exacto:
                r = exacto[a]
            elif len(a) == 13 and a in por13:
                # Codigo cortado por el sistema: solo si un unico codigo empieza asi
                r = por13[a][0] if len(por13[a]) == 1 else None
            else:
                v = compacto.get(compactar(a), [])
                r = v[0] if len(v) == 1 else None
            memo[articulo] = r
        return memo[articulo]

    return unir


def cuenta_app(cuenta):
    """El DBF guarda la cuenta con ceros adelante (01234); la app y la planilla, sin."""
    return str(int(cuenta)) if cuenta.isdigit() else cuenta


# ---------- historial ----------

def armar_historial(filas, unir):
    """cuenta -> {codigo: [fecha, cantidad, precio, veces, intervalo, cantidad_tipica]}:
    fecha 'AAAA-MM-DD', cantidad y precio neto con IVA de la ultima compra; veces,
    los dias distintos en que lo compro; intervalo, la mediana de dias entre esas
    compras (solo con 3 o mas; si no, None); cantidad_tipica, la mediana por compra."""
    # 1. Descuento sobre el total de cada comprobante
    base, desc = defaultdict(float), defaultdict(float)
    for f in filas:
        k = (f['compte'], f['cuenta'])
        if f['cantidad'] < 0 and unir(f['articulo']) is None and ES_DESCUENTO.match(f['nombre']):
            desc[k] -= f['importe']
        else:
            base[k] += f['importe']
    descuento, sin_calcular = {}, 0
    for k, d in desc.items():
        if base[k] > 0 and 0 < d < base[k]:
            descuento[k] = d / base[k]
        else:
            sin_calcular += 1

    # 2. Compras de cada articulo por cliente, por dia: varias el mismo dia se suman,
    #    y el precio es el del ultimo comprobante del dia
    por_dia = defaultdict(lambda: defaultdict(dict))   # cuenta -> codigo -> fecha -> [cantidad, precio]
    compras = sorted((f for f in filas if f['cantidad'] > 0 and not f['compte'].upper().startswith('NC')),
                     key=lambda f: (f['fecha'], f['compte']))
    for f in compras:
        codigo = unir(f['articulo'])
        if not codigo:
            continue
        neto = f['precio'] * (1 + f['iva'] / 100) * (1 - descuento.get((f['compte'], f['cuenta']), 0))
        fecha = f'{f["fecha"][:4]}-{f["fecha"][4:6]}-{f["fecha"][6:]}'
        dia = por_dia[cuenta_app(f['cuenta'])][codigo].setdefault(fecha, [0, 0])
        dia[0] = round(dia[0] + f['cantidad'], 2)
        dia[1] = round(neto, 2) if f['precio'] > 0 else 0   # 0: sin precio (bonificado)

    # 3. Ultima compra y datos de reposicion
    hist = {}
    for cuenta, articulos in por_dia.items():
        hist[cuenta] = {}
        for codigo, dias in articulos.items():
            fechas = sorted(dias)
            ultima = fechas[-1]
            intervalo = None
            if len(fechas) >= 3:
                d = [date.fromisoformat(x) for x in fechas]
                intervalo = round(median((b - a).days for a, b in zip(d, d[1:])), 1)
            tipica = round(median(q for q, _ in dias.values()), 2)
            hist[cuenta][codigo] = [ultima, dias[ultima][0], dias[ultima][1], len(fechas), intervalo, tipica]
    return hist, len(descuento), sin_calcular


def fuera_de_temporada(filas, viejas, unir, mes):
    """Articulos de temporada que este mes estan fuera de su temporada. Perfil
    mensual de cada articulo con las compras cliente-dia de 24 meses (todos los
    clientes); de temporada si sus 3 meses seguidos mas fuertes suman el 50 % o
    mas, y fuera de temporada si este mes vende menos de la mitad de un mes
    promedio (12 x participacion del mes < 0,5). Solo con 20 compras o mas."""
    compras = {(f['fecha'], f['cuenta'], f['articulo']) for f in filas
               if f['cantidad'] > 0 and not f['compte'].upper().startswith('NC')}
    compras.update(viejas)
    dias = set()
    perfil = defaultdict(lambda: [0] * 12)
    for fecha, cuenta, articulo in compras:
        codigo = unir(articulo)
        clave = (fecha, cuenta_app(cuenta), codigo)
        if codigo and clave not in dias:
            dias.add(clave)
            perfil[codigo][int(fecha[4:6]) - 1] += 1
    fuera = set()
    for codigo, p in perfil.items():
        total = sum(p)
        if total < 20:
            continue
        fuertes = max(p[m] + p[(m + 1) % 12] + p[(m + 2) % 12] for m in range(12))
        if fuertes / total >= 0.5 and 12 * p[mes - 1] / total < 0.5:
            fuera.add(codigo)
    return fuera


def listas_reposicion(articulos, hoy, fuera):
    """Habituales y dejo de comprar de un cliente, con sus articulos de
    armar_historial ({codigo: [fecha, cantidad, precio, veces, intervalo, tipica]}).
    habituales: hasta MAX_HABITUALES con 3 compras o mas (dias distintos), por veces
      y, a igual cantidad, por la compra mas reciente: [codigo, veces, tipica, ultima,
      toca], con toca = ultima + intervalo (dias enteros, hacia arriba): desde ese dia
      le toca.
    dejo: hasta MAX_DEJO de los que siguen (nunca uno que ya este en habituales), con
      3 compras o mas y sin comprar hace 3 intervalos o mas: [codigo, veces, tipica, ultima].
    Un articulo de temporada fuera de su temporada que lleva 3 intervalos o mas sin
    comprarse no va a ninguna de las dos (no es una alarma: vuelve en su temporada),
    y su lugar lo ocupa el siguiente.
    Los 3 intervalos se cuentan con el intervalo entero (hacia arriba), el mismo que
    la app saca de toca - ultima: asi la app marca "Hace mucho que no lo pide" en
    habituales con la misma regla y el mismo dia."""
    con = sorted(((c, v) for c, v in articulos.items() if v[3] >= 3 and v[4] is not None),
                 key=lambda x: (x[1][3], x[1][0], x[0]), reverse=True)
    habituales, dejo = [], []
    for codigo, (ultima, _, _, veces, intervalo, tipica) in con:
        dia = date.fromisoformat(ultima)
        dias_int = math.ceil(intervalo)
        lejos = (hoy - dia).days >= 3 * dias_int
        if lejos and codigo in fuera:
            continue
        if len(habituales) < MAX_HABITUALES:
            habituales.append([codigo, veces, tipica, ultima, (dia + timedelta(days=dias_int)).isoformat()])
        elif len(dejo) < MAX_DEJO and lejos:
            dejo.append([codigo, veces, tipica, ultima])
    return habituales, dejo


def comprimir(articulos, actualizado, habituales=(), dejo=()):
    """Celda de un cliente, en gzip y base64:
      {"v":3, "act":fecha,
       "a":[[codigo, fecha, cantidad, precio, veces, intervalo, cantidad_tipica], ...],
       "hab":[[codigo, veces, cantidad_tipica, ultima, toca], ...],
       "dej":[[codigo, veces, cantidad_tipica, ultima], ...]}
    'a' va de la compra mas reciente a la mas vieja; si no entra en una celda se
    recortan sus mas viejas (hab y dej quedan enteras).
    Formato extensible: quien lee usa solo las claves y posiciones que conoce. Lo
    nuevo va en claves nuevas o al final de cada fila; nunca se cambia el
    significado ni la posicion de un campo, asi el servidor publicado sigue
    funcionando. 'v' sube con cada agregado, pero ningun lector la exige.
    Devuelve (texto, articulos incluidos)."""
    lista = sorted(([c] + v for c, v in articulos.items()), key=lambda x: x[1], reverse=True)
    while True:
        datos = json.dumps({'v': 3, 'act': actualizado, 'a': lista, 'hab': list(habituales), 'dej': list(dejo)},
                           separators=(',', ':'), ensure_ascii=False)
        texto = base64.b64encode(gzip.compress(datos.encode('utf-8'), mtime=0)).decode('ascii')
        if len(texto) <= MAX_CELDA:
            return texto, len(lista)
        lista = lista[:int(len(lista) * 0.9)]


# ---------- planilla ----------

def conectar():
    if not CREDENCIAL.exists():
        print(f'ERROR: no se encuentra la credencial en {CREDENCIAL}')
        sys.exit(1)
    creds = Credentials.from_service_account_file(str(CREDENCIAL), scopes=SCOPES)
    return gspread.authorize(creds).open_by_key(PLANILLA_ID)


def subir(planilla, filas):
    try:
        hoja = planilla.worksheet(HOJA)
        actuales = max(len(hoja.col_values(1)) - 1, 0)
    except gspread.WorksheetNotFound:
        hoja = planilla.add_worksheet(title=HOJA, rows=len(filas) + 1, cols=len(ENCABEZADOS))
        actuales = None
        print(f'Creada la hoja "{HOJA}": ocultala y protegela')

    # Con muchos menos clientes que los cargados, el DBF vino incompleto
    try:
        guardia.revisar('hoja historial', actuales, len(filas))
    except guardia.EscrituraBloqueada:
        sys.exit(1)   # ya se aviso: queda la hoja anterior

    hoja.clear()
    hoja.resize(rows=len(filas) + 1, cols=len(ENCABEZADOS))
    # RAW: la cuenta y la fecha quedan como texto, tal cual
    hoja.update(values=[ENCABEZADOS], range_name='A1', value_input_option='RAW')
    for i in range(0, len(filas), FILAS_POR_ENVIO):
        hoja.update(values=filas[i:i + FILAS_POR_ENVIO], range_name=f'A{i + 2}', value_input_option='RAW')
    print(f'Escritas {len(filas)} filas en la hoja "{HOJA}"')


def limpiar_cache():
    """Sin esto el servidor sigue con el historial de ayer hasta 6 horas."""
    try:
        r = requests.get(URL_API + '?accion=limpiar_cache_hist', timeout=30).json()
        if r.get('ok'):
            print('Cache del servidor limpiada')
        elif r.get('error') == 'usar POST para acciones con datos':
            print('El servidor todavia no tiene la accion del historial: no hay cache que limpiar')
        else:
            raise RuntimeError(str(r)[:80])
    except Exception as e:
        print('AVISO: no se pudo limpiar la cache del servidor:', e)
        print('Abri la URL de limpiar_cache_hist a mano o volve a correr el script')


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    print('=' * 60)
    print('HISTORIAL DE COMPRAS -> Google Sheets')
    print('=' * 60)

    origen = opcion('--origen') or os.environ.get('FERREMAX_VENTAS_ORIGEN') or ORIGEN_POR_DEFECTO
    ruta = Path(opcion('--dbf') or os.environ.get('FERREMAX_VENTAS_DBF') or DBF_POR_DEFECTO)

    # 1. Copia del sistema de gestion; si falla, sigue la anterior
    if '--sin-copiar' in sys.argv:
        print('--sin-copiar: se usa la copia que ya está, sin acceder al original')
    else:
        print(f'Copiando {origen} -> {ruta}')
        motivo = copiar_dbf(origen, ruta)
        if motivo is None:
            print('Copia verificada')
        elif ruta.exists():
            ultima_copia = datetime.fromtimestamp(ruta.stat().st_mtime).strftime('%d/%m/%Y %H:%M')
            print(f'AVISO: no se copió el DBF del sistema: {motivo}. Sigue la copia del {ultima_copia}')
        else:
            print(f'ERROR: no se copió el DBF del sistema ({motivo}) y no hay una copia anterior')
            sys.exit(1)
    if not ruta.exists():
        print(f'ERROR: no se encuentra la copia del historial de ventas en {ruta}')
        sys.exit(1)
    motivo = dbf_invalido(ruta)
    if motivo:
        print(f'ERROR: la copia {ruta} no sirve: {motivo}')
        sys.exit(1)

    # 2. Historial de 12 meses
    with open(CATALOGO, encoding='utf-8') as f:
        unir = preparar_union(list(json.load(f).keys()))
    hoy = date.today()
    filas, ultima, viejas = leer_dbf(ruta, (hoy - timedelta(days=DIAS)).strftime('%Y%m%d'),
                                     (hoy - timedelta(days=DIAS_PERFIL - 1)).strftime('%Y%m%d'))
    print(f'Leidos {len(filas)} renglones de los ultimos 12 meses y {len(viejas)} compras '
          'de los 12 anteriores (para la temporada)')
    if not ultima.strip():
        print('ERROR: el DBF no tiene renglones con fecha')
        sys.exit(1)
    dias = (hoy - date(int(ultima[:4]), int(ultima[4:6]), int(ultima[6:]))).days
    if dias > DIAS_DBF_VIEJO:
        print(f'AVISO: el DBF termina el {ultima[6:]}/{ultima[4:6]}/{ultima[:4]}, hace {dias} dias: '
              'el sistema de gestion no lo actualizo')

    hist, con_descuento, sin_calcular = armar_historial(filas, unir)
    fuera = fuera_de_temporada(filas, viejas, unir, hoy.month)
    actualizado = hoy.isoformat()
    filas_hoja, recortados, con_hab, con_dej = [], 0, 0, 0
    for cuenta in sorted(hist):
        habituales, dejo = listas_reposicion(hist[cuenta], hoy, fuera)
        con_hab += bool(habituales)
        con_dej += bool(dejo)
        texto, incluidos = comprimir(hist[cuenta], actualizado, habituales, dejo)
        if incluidos < len(hist[cuenta]):
            recortados += 1
        filas_hoja.append([cuenta, actualizado, incluidos, texto])
    if not filas_hoja:
        print('ERROR: ningun cliente con compras del catalogo en los ultimos 12 meses')
        sys.exit(1)

    largos = sorted(len(f[3]) for f in filas_hoja)
    print(f'{len(filas_hoja)} clientes | artículos: {sum(f[2] for f in filas_hoja)} | '
          f'comprobantes con descuento: {con_descuento} (sin poder calcularlo: {sin_calcular})')
    print(f'Celda: mediana {largos[len(largos) // 2]} caracteres, la mas grande {largos[-1]} (limite {MAX_CELDA})')
    print(f'Habituales: {con_hab} clientes | dejó de comprar: {con_dej} clientes | '
          f'artículos fuera de temporada este mes: {len(fuera)}')
    if recortados:
        print(f'AVISO: {recortados} cliente(s) no entraban en una celda: quedaron sus compras mas recientes')

    # 3. Planilla y cache del servidor
    if '--sin-subir' in sys.argv:
        print('--sin-subir: no se escribio la hoja')
        return
    subir(conectar(), filas_hoja)
    limpiar_cache()
    print('OK')
    print('=' * 60)


if __name__ == '__main__':
    main()
