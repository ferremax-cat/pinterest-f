"""
PRUEBA OFFLINE DE scripts/historial_compras.py: las compras para el precio
anterior (columna compras de la hoja historial), los renglones de descuento
sobre el total y la union de codigos cortados. Arma un VENTAS.DBF SINTETICO en
una carpeta temporal (ningun dato real) y no conecta a nada: ni a la red, ni a
la planilla.

Uso, desde la raiz del proyecto:
    python test/pedidos/prueba_historial_compras.py
Termina con codigo 1 si alguna prueba falla.
"""
import base64
import gzip
import io
import json
import shutil
import struct
import sys
import tempfile
from contextlib import redirect_stdout
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import historial_compras as hc  # noqa: E402

ok = fallas = 0


def ver(nombre, cond, extra=''):
    global ok, fallas
    if cond:
        ok += 1
    else:
        fallas += 1
        print('FALLA:', nombre, extra)


# ---------- DBF sintetico, con los campos del real ----------
CAMPOS_DBF = [('COMPTE', 'C', 15, 0), ('CANTIDAD', 'N', 9, 2), ('NOMBRE', 'C', 40, 0), ('FINAL', 'N', 12, 2),
              ('ARTICULO', 'C', 15, 0), ('REMITO', 'C', 12, 0), ('CUENTA', 'C', 5, 0), ('BULTOS', 'N', 4, 0),
              ('UNIDADES', 'N', 9, 2), ('DESCUENTO', 'C', 4, 0), ('PRECIO', 'N', 12, 2), ('IMPORTE', 'N', 12, 2),
              ('IVA', 'N', 5, 2), ('NIVA', 'N', 1, 0), ('NRG', 'N', 1, 0), ('VENDEDOR', 'C', 5, 0),
              ('CONTAB', 'C', 15, 0), ('UTILIDAD', 'N', 12, 2), ('FECHA', 'D', 8, 0), ('IMPUESTO', 'N', 12, 2),
              ('DESPACHO', 'C', 10, 0), ('ENVASE', 'N', 10, 2), ('DESC_ITEM', 'N', 15, 3)]


def escribir_dbf(ruta, renglones):
    """renglones: dicts con algunos campos (el resto, vacios); '_borrado': True lo marca borrado."""
    largo_reg = 1 + sum(c[2] for c in CAMPOS_DBF)
    largo_cab = 32 + 32 * len(CAMPOS_DBF) + 1
    cab = struct.pack('<BBBBIHH20x', 0x03, 126, 11, 10, len(renglones), largo_cab, largo_reg)
    for nombre, tipo, largo, dec in CAMPOS_DBF:
        cab += nombre.encode('latin1').ljust(11, b'\0') + tipo.encode() + b'\0' * 4 + bytes([largo, dec]) + b'\0' * 14
    cab += b'\x0D'
    cuerpo = b''
    for r in renglones:
        reg = b'*' if r.get('_borrado') else b' '
        for nombre, tipo, largo, dec in CAMPOS_DBF:
            v = r.get(nombre, '')
            if tipo == 'N':
                t = (f'{float(v):.{dec}f}' if v != '' else '').rjust(largo)
            else:
                t = str(v).ljust(largo)
            reg += t.encode('latin1')[:largo]
        cuerpo += reg
    Path(ruta).write_bytes(cab + cuerpo + b'\x1A')


hoy = date.today()
dia = lambda n: (hoy - timedelta(days=n)).strftime('%Y%m%d')
iso = lambda n: (hoy - timedelta(days=n)).isoformat()


def renglon(compte, n, cuenta, articulo, nombre, cantidad, precio, iva=21, contab='VENTAS', **extra):
    importe = round(cantidad * precio, 2)
    return dict(COMPTE=compte, FECHA=dia(n), CUENTA=cuenta, ARTICULO=articulo, NOMBRE=nombre, CANTIDAD=cantidad,
                PRECIO=precio, IMPORTE=importe, FINAL=round(importe * (1 + iva / 100), 2), IVA=iva, CONTAB=contab,
                UTILIDAD=123.45, DESC_ITEM=-30, **extra)


def descuento(compte, n, cuenta, codigo, nombre, base, pct):
    # Como en el sistema: cantidad -1, fuera del catalogo, CONTAB "IVA VENTA"
    return renglon(compte, n, cuenta, codigo, nombre, -1, round(base * pct / 100, 2), contab='IVA VENTA')


CATALOGO = {
    'EVO115TF': {'name': 'DISCO EVOLUTION 115'},
    'A1': {'name': 'ARTICULO UNO'},
    'TYRO41F-16-5662': {'name': 'TARUGO TYRO 16'},
    'CAFPLG1-2X11-2': {'name': 'PROLONG CROMO P CANIL 1/2 x11/2" CAFU'},
    'CAFPLG1-2X11-4': {'name': 'PROLONG CROMO P CANIL 1/2 x11/4" CAFU'},
}
C1, C2, C3, C4 = 'PRa000000000010', 'PRa000000000011', 'FCb000000000012', 'PRa000000000013'
R = [
    # C1 (hace 40 dias): EVO y A1, con -7% pago contado
    renglon(C1, 40, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 2, 9177.58),
    renglon(C1, 40, '00100', 'A1', 'ARTICULO UNO', 1, 100, contab='IVA VENTA'),   # CONTAB no se usa
    descuento(C1, 40, '00100', '00007', 'DESCUENTO 7% POR PAGO CONT.', 18455.16, 7),
    # C2 (30 dias): EVO a 9000, con -5% y -7% en cascada (codigos 00005 y 00007)
    renglon(C2, 30, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 1, 9000),
    descuento(C2, 30, '00100', '00005', 'DESCUENTO 5%', 9000, 5),
    descuento(C2, 30, '00100', '00007', 'DESCUENTO 7% POR PAGO CONT.', 8550, 7),
    # C3 (20 dias): EVO, una devolucion de EVO (cantidad negativa, del catalogo) y mercaderia a descontar
    renglon(C3, 20, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 3, 9100),
    renglon(C3, 20, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', -1, 9100),
    renglon(C3, 20, '00100', '00119', 'MERCADERIA RETIRADA A DESCONTAR', -1, 500),
    # C4 (10 dias): EVO; A1 dos veces en el mismo comprobante; codigos cortados
    renglon(C4, 10, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 1, 9500),
    renglon(C4, 10, '00100', 'A1', 'ARTICULO UNO', 1, 110),
    renglon(C4, 10, '00100', 'A1', 'ARTICULO UNO', 2, 111),
    renglon(C4, 10, '00100', 'TYRO41F-16-56', 'TARUGO TYRO 16', 5, 8.36),
    renglon(C4, 10, '00100', 'CAFPLG1-2X11-', 'PROLONG CROMO P CANIL 1/2 x11/2" CAFU', 1, 3226.47),
    renglon(C4, 10, '00100', 'CAFPLG1-2X11-', 'OTRA COSA', 1, 1),               # ambiguo sin nombre igual
    renglon(C4, 10, '00100', 'X-NO-ESTA', 'NO ESTA EN EL CATALOGO', 1, 1),
    # Nota de credito (mas nueva): no es compra
    renglon('NCa000000000001', 5, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 1, 1),
    # Renglon borrado: no cuenta
    dict(renglon('PRa000000000099', 2, '00100', 'EVO115TF', 'DISCO EVOLUTION 115', 1, 2), _borrado=True),
    # Otra cuenta, con IVA 10,5
    renglon('PRb000000000020', 15, '00200', 'A1', 'ARTICULO UNO', 4, 200, iva=10.5),
    # Otra cuenta: el -7 % solo sobre la mitad del comprobante (descuento parcial)
    renglon('PRa000000000014', 12, '00300', 'EVO115TF', 'DISCO EVOLUTION 115', 1, 1000),
    renglon('PRa000000000014', 12, '00300', 'A1', 'ARTICULO UNO', 1, 1000),
    descuento('PRa000000000014', 12, '00300', '00007', 'DESCUENTO 7% POR PAGO CONT.', 1000, 7),
]

tmp = Path(tempfile.mkdtemp(prefix='ferremax-prueba-hist-'))
try:
    dbf = tmp / 'VENTAS.DBF'
    escribir_dbf(dbf, R)
    ver('el DBF sintetico es valido', hc.dbf_invalido(dbf) is None, hc.dbf_invalido(dbf))
    filas, ultima, _ = hc.leer_dbf(dbf, dia(365), dia(729))
    ver('leer_dbf: sin el renglon borrado', len(filas) == len(R) - 1, len(filas))
    ver('UTILIDAD y CONTAB no se leen', 'UTILIDAD' not in hc.CAMPOS and 'CONTAB' not in hc.CAMPOS and
        not any(k in f for f in filas for k in ('utilidad', 'contab')))

    unir = hc.preparar_union(list(CATALOGO), {c: v['name'] for c, v in CATALOGO.items()})
    ver('codigo cortado unico: TYRO41F-16-56 -> TYRO41F-16-5662', unir('TYRO41F-16-56', 'TARUGO TYRO 16') == 'TYRO41F-16-5662')
    ver('cortado unico tambien sin nombre (como hasta ahora)', unir('TYRO41F-16-56') == 'TYRO41F-16-5662')
    ver('cortado ambiguo con el mismo nombre: el de ese nombre',
        unir('CAFPLG1-2X11-', 'PROLONG CROMO P CANIL 1/2 x11/2" CAFU') == 'CAFPLG1-2X11-2')
    ver('cortado ambiguo con el nombre del otro: el otro',
        unir('CAFPLG1-2X11-', 'PROLONG  CROMO P CANIL 1/2 x11/4" CAFU') == 'CAFPLG1-2X11-4')
    ver('cortado ambiguo sin nombre o con otro nombre: no se une',
        unir('CAFPLG1-2X11-') is None and unir('CAFPLG1-2X11-', 'OTRA COSA') is None)
    unir_sin_nombres = hc.preparar_union(list(CATALOGO))
    ver('sin nombres del catalogo, el ambiguo no se une', unir_sin_nombres('CAFPLG1-2X11-', 'PROLONG CROMO P CANIL 1/2 x11/2" CAFU') is None)
    ver('exacto y desconocido como antes', unir('EVO115TF') == 'EVO115TF' and unir('X-NO-ESTA') is None)

    es_desc = [f['articulo'] for f in filas if hc.es_descuento_total(f, unir)]
    ver('renglones de descuento: 00007, 00005, 00007 y el 00007 parcial (por nombre y cantidad, no por codigo ni CONTAB)',
        sorted(es_desc) == ['00005', '00007', '00007', '00007'], es_desc)
    ver('00119 "MERCADERIA RETIRADA A DESCONTAR" no es descuento sobre el total',
        not any(hc.es_descuento_total(f, unir) for f in filas if f['articulo'] == '00119'))
    desc = hc.descuentos_comprobante(filas, unir)
    ver('descuento de C1: [[7, contado]]', desc.get((C1, '00100')) == [[7, 'contado']], desc)
    ver('cascada de C2: [[5, ""], [7, contado]] en orden', desc.get((C2, '00100')) == [[5, ''], [7, 'contado']])
    ver('C3 y C4 sin descuento', (C3, '00100') not in desc and (C4, '00100') not in desc)

    parciales = hc.descuentos_parciales(filas, unir, desc)
    ver('descuento parcial: solo el comprobante cuyo -7 % no cierra con su base', parciales == {('PRa000000000014', '00300')}, parciales)
    ver('el -7 % de C1 y la cascada de C2 cierran: no son parciales', (C1, '00100') not in parciales and (C2, '00100') not in parciales)
    compras = hc.armar_compras(filas, unir, desc, parciales)
    evo = compras['100']['EVO115TF']
    ver('cuenta sin ceros adelante (100)', set(compras) == {'100', '200', '300'}, list(compras))
    ver('la compra del comprobante parcial queda marcada; las otras no', compras['300']['EVO115TF'][0][6] is True and
        all(c[6] is False for c in evo))
    ver('EVO: las ultimas 3, de la mas reciente a la mas vieja (sin la NC, ni la borrada, ni la de hace 40 dias)',
        [c[1] for c in evo] == [C4, C3, C2], [c[1] for c in evo])
    ver('EVO en C3: la devolucion (cantidad negativa) no resta ni es compra', evo[1][2] == 3)
    ver('precio sin IVA tal cual (PRECIO) y la fecha', evo[0][3] == 9500 and evo[0][0] == iso(10) and evo[0][4] == 21)
    ver('EVO en C2: con la cascada como aclaracion', evo[2][5] == [[5, ''], [7, 'contado']])
    a1 = compras['100']['A1']
    ver('A1: dos renglones del mismo comprobante se suman, con el precio del ultimo', a1[0][1] == C4 and a1[0][2] == 3 and a1[0][3] == 111, a1)
    ver('A1 con CONTAB "IVA VENTA" igual es compra', [c[1] for c in a1] == [C4, C1])
    ver('codigo cortado guardado con el codigo del catalogo', 'TYRO41F-16-5662' in compras['100'] and 'CAFPLG1-2X11-2' in compras['100'])
    ver('ambiguo sin nombre igual y fuera del catalogo: no estan', 'CAFPLG1-2X11-4' not in compras['100'] and
        not any(k.startswith('X-') or k.startswith('000') for k in compras['100']))
    ver('IVA 10,5 guardado', compras['200']['A1'][0][4] == 10.5)

    texto, n = hc.comprimir_compras(compras['100'], iso(0))
    d = json.loads(gzip.decompress(base64.b64decode(texto)).decode('utf-8'))
    ver('celda: v1, act y todos los articulos', d['v'] == 1 and d['act'] == iso(0) and n == len(compras['100']) == len(d['c']))
    k = d['k']
    e = d['c']['EVO115TF']
    ver('celda: comprobante sin ceros, fecha y descuentos', k[e[0][0]] == ['PRa13', iso(10)] and
        k[e[2][0]] == ['PRa11', iso(30), [[5, ''], [7, 'contado']]], [k[x[0]] for x in e])
    ver('celda: cantidad y precio sin IVA; sin IVA cuando es 21', e[0][1:] == [1, 9500])
    ver('celda: un comprobante con varios articulos se guarda una vez', len(k) == len({tuple(x[:2]) for x in k}))
    texto2, _ = hc.comprimir_compras(compras['200'], iso(0))
    d2 = json.loads(gzip.decompress(base64.b64decode(texto2)).decode('utf-8'))
    ver('celda: IVA 10,5 como cuarto valor', d2['c']['A1'][0] == [0, 4, 200, 10.5], d2)
    ver('celda: sin marca de parcial en los comprobantes que cierran', all(len(x) <= 3 for x in k))
    texto3p, _ = hc.comprimir_compras(compras['300'], iso(0))
    d3p = json.loads(gzip.decompress(base64.b64decode(texto3p)).decode('utf-8'))
    ver('celda: el comprobante parcial lleva un 1 como cuarto valor', d3p['k'] == [['PRa14', iso(12), [[7, 'contado']], 1]], d3p['k'])
    ver('celda: sin cuentas ni nombres de clientes', '00100' not in json.dumps(d) and 'cuenta' not in json.dumps(d))

    # Recorte: con una celda chica se van los articulos de compra mas vieja
    antes = hc.MAX_CELDA
    hc.MAX_CELDA = len(texto) - 40
    texto3, n3 = hc.comprimir_compras(compras['100'], iso(0))
    hc.MAX_CELDA = antes
    d3 = json.loads(gzip.decompress(base64.b64decode(texto3)).decode('utf-8'))
    ver('recorte: entra en la celda y quedan los mas recientes', len(texto3) <= len(texto) - 40 and n3 < n and 'EVO115TF' in d3['c'], (n3, list(d3['c'])))

    # El historial de la columna D sigue igual: precio neto con IVA y el descuento del comprobante
    hist, con_desc, _ = hc.armar_historial(filas, unir)
    ver('columna D: EVO ultima compra C4 a 9500 x 1,21 (sin descuento)', hist['100']['EVO115TF'][:3] == [iso(10), 1, 11495.0], hist['100']['EVO115TF'])
    ver('columna D: comprobantes con descuento (C1, C2 y el parcial)', con_desc == 3, con_desc)
    ver('columna D: A1 de C1 con el -7%', round(100 * 1.21 * 0.93, 2) == 112.53)

    # main con --sin-subir: no conecta, no escribe la hoja y solo muestra cantidades
    cat = tmp / 'productos.json'
    cat.write_text(json.dumps(CATALOGO), encoding='utf-8')
    hc.CATALOGO = cat
    conecto = []
    hc.conectar = lambda: conecto.append(1)
    hc.limpiar_cache = lambda: conecto.append(2)
    argv = sys.argv
    sys.argv = ['historial_compras.py', '--sin-copiar', '--sin-subir', '--dbf', str(dbf)]
    salida = io.StringIO()
    try:
        with redirect_stdout(salida):
            hc.main()
        error = None
    except SystemExit as ex:
        error = ex
    finally:
        sys.argv = argv
    s = salida.getvalue()
    ver('--sin-subir: termina bien sin conectar', error is None and not conecto, (error, s[-300:]))
    ver('--sin-subir: muestra las cifras de compras', 'Compras (precio anterior)' in s and 'en cascada' in s, s[-400:])
    ver('--sin-subir: cuenta los descuentos parciales', '1 parciales: a verificar' in s, s[-400:])
    ver('por pantalla ninguna cuenta ni comprobante', not any(x in s for x in ('00100', '00200', '00300', 'PRa', 'FCb')), s)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
