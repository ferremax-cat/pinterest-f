"""
PRUEBA OFFLINE DE scripts/convertir_clientes_finanzas.py: de un mismo Excel
escribe clientes_finanzas.json y clientes_nombres.json (solo nombre y sigla
del vendedor de cada cuenta, ningun dato financiero), los dos o ninguno
(guardia.escribir_jsons): si la guardia de cantidad bloquea, o si falla la
escritura de uno, quedan los dos anteriores.

NO ESCRIBE NUNCA FUERA DE SU CARPETA TEMPORAL: todo pasa en tempfile, y antes
y despues se toma la huella (sha256) de excel/ y json/ del repositorio (la
raiz sale de este archivo, no del directorio actual); si algo cambio, falla.
Ver test/test_excel_to_json.py: una prueba anterior piso esos archivos.

Tambien la fecha de ultima operacion (ultOperacion): con fechas en el Excel
nunca sale vacia, aunque una celda sea un numero de serie de Excel (el 25/11
eso dejo la columna como object y se perdieron todas), y si igual se pierde
una proporcion alta, el conversor avisa por la salida de error y la rutina lo
muestra como aviso. Y los nueve campos de cada cliente, con su tipo.

Uso, desde cualquier carpeta:
    python test/pedidos/prueba_clientes_nombres.py
Termina con codigo 1 si alguna prueba falla.
"""
import hashlib
import io
import json
import math
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import convertir_clientes_finanzas as cf  # noqa: E402
import guardia_registros as guardia  # noqa: E402
import rutina_diaria as rutina  # noqa: E402

ok = fallas = 0


def ver(nombre, cond, extra=''):
    global ok, fallas
    if cond:
        ok += 1
    else:
        fallas += 1
        print('FALLA:', nombre, extra)


def huellas_protegidas():
    """{ruta: sha256} de cada archivo de excel/ y json/ del repositorio (solo lectura)"""
    res = {}
    for carpeta in (RAIZ / 'excel', RAIZ / 'json'):
        for p in sorted(carpeta.rglob('*')) if carpeta.exists() else []:
            if p.is_file():
                res[p.relative_to(RAIZ).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    return res


CLAVES_FINANCIERAS = {'pgProm3M', 'comproMes', 'saldoTotal', 'pagoMes', 'cupoMes', 'ultOperacion', 'numero_cuenta'}


def excel(ruta, n, desde=100):
    """Un Excel de finanzas sintetico con n clientes"""
    pd.DataFrame({
        'Cliente_ID': [desde + i for i in range(n)],
        'Nombre_Cliente': [f'  FERRETERIA {i}  ' if i else None for i in range(n)],   # el primero sin nombre
        'Vendedor': [None if i == 2 else 'RF' if i % 2 else 'JG' for i in range(n)],   # el tercero sin vendedor
        'PG_Prom_3M': [1000.5] * n, 'CP_Este_Mes': [200] * n, 'Saldo_Total': ['$ 1.234,56'] * n,
        'PG_Este_Mes': [300] * n, 'Cupo_Mes': [5000] * n, 'Ult_Operacion': ['01/11/2026'] * n,
    }).to_excel(ruta, index=False)


def excel_fechas(ruta, fechas, desde=100):
    """Excel de finanzas con todos los datos completos y Ult_Operacion = fechas,
    una por cliente y tal cual (fechas reales, numeros, textos o None)"""
    n = len(fechas)
    pd.DataFrame({
        'Cliente_ID': [desde + i for i in range(n)],
        'Nombre_Cliente': [f'FERRETERIA {i}' for i in range(n)],
        'Vendedor': ['RF' if i % 2 else 'JG' for i in range(n)],
        'PG_Prom_3M': [1000.5] * n, 'CP_Este_Mes': [200] * n, 'Saldo_Total': ['$ 1.234,56'] * n,
        'PG_Este_Mes': [300] * n, 'Cupo_Mes': [5000] * n, 'Ult_Operacion': fechas,
    }).to_excel(ruta, index=False)


def correr(excel_path, carpeta, con_errores=False):
    """convertir() en silencio; devuelve el codigo de salida (0 si termino bien)
    y la salida (con con_errores, tambien la salida de error aparte)"""
    guardia._bloqueos.clear()
    salida, errores = io.StringIO(), io.StringIO()
    try:
        with redirect_stdout(salida), redirect_stderr(errores):
            cf.convertir(excel_path, carpeta)
        codigo = 0
    except SystemExit as e:
        codigo = e.code
    if con_errores:
        return codigo, salida.getvalue(), errores.getvalue()
    return codigo, salida.getvalue()


def leer(ruta):
    return json.loads(Path(ruta).read_text(encoding='utf-8'))


TEXTOS = ('nombre', 'numero_cuenta', 'vendedor', 'ultOperacion')
NUMEROS = ('pgProm3M', 'comproMes', 'saldoTotal', 'pagoMes', 'cupoMes')


def campos_mal(clientes):
    """De clientes_finanzas.json: [(cuenta, motivo)] de los clientes sin
    exactamente los nueve campos con su tipo (texto o numero, nunca NaN ni bool)"""
    mal = []
    for cuenta, c in clientes.items():
        if set(c) != set(TEXTOS + NUMEROS):
            mal.append((cuenta, f'claves {sorted(c)}'))
            continue
        for k in TEXTOS:
            if not isinstance(c[k], str):
                mal.append((cuenta, f'{k} es {type(c[k]).__name__}'))
        for k in NUMEROS:
            if isinstance(c[k], bool) or not isinstance(c[k], (int, float)) or math.isnan(c[k]):
                mal.append((cuenta, f'{k} no es un numero ({type(c[k]).__name__})'))
        if c['numero_cuenta'] != cuenta:
            mal.append((cuenta, 'numero_cuenta distinto de la cuenta'))
    return mal


def avisos(errores):
    """Lineas de aviso de la salida de error (las que la rutina toma como aviso)"""
    return [l for l in errores.splitlines() if l.strip().startswith('AVISO')]


antes = huellas_protegidas()
with tempfile.TemporaryDirectory(prefix='ferremax-nombres-') as tmp:
    tmp = Path(tmp).resolve()
    ver('la carpeta temporal no esta dentro del repositorio', RAIZ not in tmp.parents)
    xls = tmp / 'clientes_finanzas.xlsx'
    carpeta = tmp / 'json'
    fin = carpeta / 'clientes_finanzas.json'
    nom = carpeta / 'clientes_nombres.json'

    # 1. Primera corrida: los dos archivos, de la misma lista
    excel(xls, 20)
    codigo, _ = correr(xls, carpeta)
    ver('1 primera corrida: termina bien y escribe los dos', codigo == 0 and fin.exists() and nom.exists(), codigo)
    f, n = leer(fin), leer(nom)
    ver('1 la misma lista de cuentas en los dos', set(f['clientes']) == set(n['clientes']) and len(n['clientes']) == 20)
    ver('1 nombres: formato {"clientes": {cuenta: {nombre, vendedor}}}', list(n) == ['clientes'] and
        all(set(v) == {'nombre', 'vendedor'} for v in n['clientes'].values()), json.dumps(n)[:200])
    texto_nom = nom.read_text(encoding='utf-8')
    ver('1 nombres: ninguna clave ni valor financiero en el archivo',
        not any(k in texto_nom for k in CLAVES_FINANCIERAS) and '1234' not in texto_nom and '5000' not in texto_nom)
    ver('1 nombres: sin espacios de mas y vacio si falta', n['clientes']['101'] == {'nombre': 'FERRETERIA 1', 'vendedor': 'RF'} and
        n['clientes']['100']['nombre'] == '', json.dumps(n['clientes']['100']))
    ver('1 finanzas: igual que antes (los datos financieros siguen ahi)', f['clientes']['101']['saldoTotal'] == 1234.56 and
        f['clientes']['101']['cupoMes'] == 5000 and f['clientes']['101']['numero_cuenta'] == '101')
    ver('1 finanzas: el cliente sin nombre queda con texto vacio (no NaN)', f['clientes']['100']['nombre'] == '',
        repr(f['clientes']['100']['nombre']))
    ver('1 finanzas: el cliente sin vendedor queda con texto vacio (no NaN)', f['clientes']['102']['vendedor'] == '',
        repr(f['clientes']['102']['vendedor']))
    ver('1 nombres: el cliente sin vendedor queda con texto vacio', n['clientes']['102']['vendedor'] == '',
        repr(n['clientes']['102']['vendedor']))
    mal = campos_mal(f['clientes'])
    ver('7 nueve campos con su tipo (Excel con un cliente sin nombre y otro sin vendedor)', not mal, mal[:3])
    ver('1 sin temporales sueltos', not list(carpeta.glob('*.tmp')))

    # 2. La guardia bloquea (5 de 20 clientes): no se escribe NINGUNO
    bytes_fin, bytes_nom = fin.read_bytes(), nom.read_bytes()
    excel(xls, 5)
    codigo, salida = correr(xls, carpeta)
    ver('2 guardia: termina con error y avisa BLOQUEADO', codigo == 1 and 'BLOQUEADO' in salida, salida[-300:])
    ver('2 guardia: clientes_finanzas.json queda igual', fin.read_bytes() == bytes_fin)
    ver('2 guardia: clientes_nombres.json queda igual', nom.read_bytes() == bytes_nom)
    ver('2 guardia: sin temporales sueltos', not list(carpeta.glob('*.tmp')))

    # 3. Solo el de nombres tiene muchos menos (por ejemplo, uno viejo a mano): tampoco se escribe ninguno
    nom.write_text(json.dumps({'clientes': {str(i): {'nombre': 'X', 'vendedor': 'RF'} for i in range(100)}}), encoding='utf-8')
    bytes_nom = nom.read_bytes()
    excel(xls, 20)
    codigo, salida = correr(xls, carpeta)
    ver('3 bloquea el segundo archivo: no se escribe el primero', codigo == 1 and fin.read_bytes() == bytes_fin and
        nom.read_bytes() == bytes_nom, salida[-300:])

    # 4. Falla la escritura del segundo archivo: quedan los dos anteriores
    nom.unlink()
    codigo, _ = correr(xls, carpeta)
    ver('4 sin clientes_nombres.json previo: se escriben los dos', codigo == 0 and nom.exists())
    bytes_fin, bytes_nom = fin.read_bytes(), nom.read_bytes()
    excel(xls, 22)
    dump_real = guardia.json.dump
    llamadas = []

    def dump_que_falla(datos, f, **kw):
        llamadas.append(1)
        if len(llamadas) == 2:
            raise OSError('disco lleno (simulado)')
        return dump_real(datos, f, **kw)
    guardia.json.dump = dump_que_falla
    try:
        codigo, salida = correr(xls, carpeta)
    finally:
        guardia.json.dump = dump_real
    ver('4 falla al escribir el segundo: error', codigo == 1, salida[-300:])
    ver('4 falla al escribir el segundo: los dos quedan como estaban', fin.read_bytes() == bytes_fin and nom.read_bytes() == bytes_nom)
    ver('4 falla al escribir el segundo: sin temporales sueltos', not list(carpeta.glob('*.tmp')))

    # 5. escribir_jsons solo: un bloqueo con varios archivos no escribe ninguno
    a, b = tmp / 'a.json', tmp / 'b.json'
    a.write_text(json.dumps({'x': {str(i): 1 for i in range(50)}}), encoding='utf-8')
    guardia._bloqueos.clear()
    try:
        with redirect_stdout(io.StringIO()):
            guardia.escribir_jsons([(b, {'x': {'1': 1}}, None), (a, {'x': {'1': 1}}, None)])
        bloqueado = False
    except guardia.EscrituraBloqueada:
        bloqueado = True
    ver('5 escribir_jsons: el bloqueo del segundo frena al primero (que no existia)', bloqueado and not b.exists())
    guardia._bloqueos.clear()

    # 6. ultOperacion: con fecha en el Excel, nunca vacia y en dd/mm/aaaa
    #    (el texto que ya leen la app y la planilla). Cada caso en su carpeta
    dias = [datetime(2026, 11, 1 + i) for i in range(20)]
    esperado = [f'{1 + i:02d}/11/2026' for i in range(20)]

    # 6a. Toda la columna con fechas reales: pandas la lee como Timestamp
    excel_fechas(xls, dias)
    ver('6a el Excel de prueba se lee como Timestamp', pd.read_excel(xls)['Ult_Operacion'].dtype.kind == 'M')
    codigo, _, err = correr(xls, tmp / 'j6a', con_errores=True)
    f6 = leer(tmp / 'j6a' / 'clientes_finanzas.json')['clientes']
    ver('6a fechas reales: dd/mm/aaaa exacto en todos', codigo == 0 and
        [f6[str(100 + i)]['ultOperacion'] for i in range(20)] == esperado,
        [f6[str(100 + i)]['ultOperacion'] for i in range(3)])
    ver('6a fechas reales: sin aviso', not avisos(err), err[-300:])
    mal = campos_mal(f6)
    ver('7 nueve campos con su tipo (Excel completo)', not mal, mal[:3])

    # 6b. Lo del 25/11: fechas reales y UNA celda con el numero de serie de
    #     Excel (46338 = 12/11/2026). La columna queda object y las fechas
    #     llegan como datetime.datetime, que no es pd.Timestamp
    excel_fechas(xls, dias[:19] + [46338])
    col = pd.read_excel(xls)['Ult_Operacion']
    ver('6b el Excel de prueba reproduce el caso (object, datetime y un numero)', col.dtype == object and
        not isinstance(col[0], pd.Timestamp) and isinstance(col[0], datetime) and col[19] == 46338,
        f'{col.dtype} {type(col[0]).__name__} {col[19]!r}')
    codigo, _, err = correr(xls, tmp / 'j6b', con_errores=True)
    f6 = leer(tmp / 'j6b' / 'clientes_finanzas.json')['clientes']
    fechas6 = [f6[str(100 + i)]['ultOperacion'] for i in range(20)]
    ver('6b ninguna ultOperacion vacia', codigo == 0 and '' not in fechas6, f'{fechas6.count("")} vacias')
    ver('6b las fechas reales en dd/mm/aaaa exacto', fechas6[:19] == esperado[:19], fechas6[:3])
    ver('6b el numero de serie 46338 sale 12/11/2026', fechas6[19] == '12/11/2026', repr(fechas6[19]))

    # 6c. Una celda vacia sigue dando '' (no hay fecha que perder)
    excel_fechas(xls, dias[:18] + [None, 46338.0])
    codigo, _, err = correr(xls, tmp / 'j6c', con_errores=True)
    f6 = leer(tmp / 'j6c' / 'clientes_finanzas.json')['clientes']
    ver('6c celda vacia: "", y el resto con su fecha', codigo == 0 and f6['118']['ultOperacion'] == '' and
        f6['119']['ultOperacion'] == '12/11/2026' and f6['100']['ultOperacion'] == '01/11/2026',
        f"{f6['118']['ultOperacion']!r} {f6['119']['ultOperacion']!r}")
    ver('6c celda vacia: sin aviso', not avisos(err), err[-300:])

    # 8. Aviso (no bloqueo) si se pierde la fecha de muchos clientes con dato en el Excel
    excel_fechas(xls, ['ayer'] * 20)            # dato que no se entiende como fecha
    codigo, _, err = correr(xls, tmp / 'j8a', con_errores=True)
    ver('8a se pierden las 20: AVISO por la salida de error', len(avisos(err)) == 1 and '20 de 20' in err, err[-300:])
    ver('8a se pierden las 20: no bloquea (escribe los dos)', codigo == 0 and
        (tmp / 'j8a' / 'clientes_finanzas.json').exists() and (tmp / 'j8a' / 'clientes_nombres.json').exists())
    excel_fechas(xls, dias[:19] + ['ayer'])     # 1 de 20 = 5 %, debajo del umbral
    codigo, _, err = correr(xls, tmp / 'j8b', con_errores=True)
    ver('8b se pierde 1 de 20: sin aviso', codigo == 0 and not avisos(err), err[-300:])
    excel_fechas(xls, [None] * 20)              # columna vacia: no hay nada que perder
    codigo, _, err = correr(xls, tmp / 'j8c', con_errores=True)
    ver('8c columna vacia en el Excel: sin aviso', codigo == 0 and not avisos(err), err[-300:])

    # 9. La rutina lo muestra como aviso: su propio correr() con el paso de
    #    finanzas (patrones y textos reales), apuntado a la carpeta temporal
    paso_fin = next(p for p in rutina.PASOS if p['clave'] == 'fin_json')

    def paso_rutina(excel_path, carpeta):
        comando = [sys.executable, '-c',
                   'import sys; sys.path.insert(0, "scripts"); import convertir_clientes_finanzas as c; '
                   'c.convertir(sys.argv[1], sys.argv[2])', str(excel_path), str(carpeta)]
        with redirect_stdout(io.StringIO()):
            return rutina.correr(dict(paso_fin, comando=comando, archivos=[]), io.StringIO())

    excel_fechas(xls, ['ayer'] * 20)
    estado, motivo = paso_rutina(xls, tmp / 'j9a')
    ver('9a rutina: fechas perdidas = aviso, con el texto del conversor', estado == 'aviso' and 'AVISO' in motivo,
        f'{estado} {motivo}')
    ver('9a rutina: el paso explica la consecuencia en el resumen', 'Ult_Operacion' in paso_fin.get('si_aviso', ''))
    excel_fechas(xls, dias)
    estado, motivo = paso_rutina(xls, tmp / 'j9b')
    ver('9b rutina: fechas bien = ok', estado == 'ok', f'{estado} {motivo}')

ver('el repositorio no cambio (excel/ y json/)', huellas_protegidas() == antes)

# El archivo real del proyecto, si ya existe (solo lectura)
real_nom, real_fin = RAIZ / 'json' / 'clientes_nombres.json', RAIZ / 'json' / 'clientes_finanzas.json'
if real_nom.exists() and real_fin.exists():
    rn, rf = leer(real_nom), leer(real_fin)
    ver('proyecto: clientes_nombres.json con las mismas cuentas que clientes_finanzas.json',
        set(rn.get('clientes', {})) == set(rf.get('clientes', {})))
    ver('proyecto: clientes_nombres.json sin datos financieros',
        all(set(v) == {'nombre', 'vendedor'} for v in rn.get('clientes', {}).values()))
    mal = campos_mal(rf.get('clientes', {}))
    ver('proyecto: clientes_finanzas.json con los nueve campos y su tipo', not mal, mal[:3])
    vacias = sum(1 for c in rf.get('clientes', {}).values() if c.get('ultOperacion') == '')
    ver('proyecto: clientes_finanzas.json con ultOperacion (menos del 10 % vacias)',
        vacias < 0.1 * max(len(rf.get('clientes', {})), 1), f'{vacias} de {len(rf.get("clientes", {}))} vacias')

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
