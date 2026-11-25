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

Uso, desde cualquier carpeta:
    python test/pedidos/prueba_clientes_nombres.py
Termina con codigo 1 si alguna prueba falla.
"""
import hashlib
import io
import json
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import convertir_clientes_finanzas as cf  # noqa: E402
import guardia_registros as guardia  # noqa: E402

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
        'Vendedor': ['RF' if i % 2 else 'JG' for i in range(n)],
        'PG_Prom_3M': [1000.5] * n, 'CP_Este_Mes': [200] * n, 'Saldo_Total': ['$ 1.234,56'] * n,
        'PG_Este_Mes': [300] * n, 'Cupo_Mes': [5000] * n, 'Ult_Operacion': ['01/11/2026'] * n,
    }).to_excel(ruta, index=False)


def correr(excel_path, carpeta):
    """convertir() en silencio; devuelve el codigo de salida (0 si termino bien)"""
    guardia._bloqueos.clear()
    salida = io.StringIO()
    try:
        with redirect_stdout(salida):
            cf.convertir(excel_path, carpeta)
        return 0, salida.getvalue()
    except SystemExit as e:
        return e.code, salida.getvalue()


def leer(ruta):
    return json.loads(Path(ruta).read_text(encoding='utf-8'))


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

ver('el repositorio no cambio (excel/ y json/)', huellas_protegidas() == antes)

# El archivo real del proyecto, si ya existe (solo lectura)
real_nom, real_fin = RAIZ / 'json' / 'clientes_nombres.json', RAIZ / 'json' / 'clientes_finanzas.json'
if real_nom.exists() and real_fin.exists():
    rn, rf = leer(real_nom), leer(real_fin)
    ver('proyecto: clientes_nombres.json con las mismas cuentas que clientes_finanzas.json',
        set(rn.get('clientes', {})) == set(rf.get('clientes', {})))
    ver('proyecto: clientes_nombres.json sin datos financieros',
        all(set(v) == {'nombre', 'vendedor'} for v in rn.get('clientes', {}).values()))

print(f'\n{ok}/{ok + fallas} pruebas bien')
sys.exit(1 if fallas else 0)
