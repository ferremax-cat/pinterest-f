"""
Carga los datos financieros desde clientes_finanzas.json a la hoja
'finanzas' de la planilla Ferremax Sistema.

Se ejecuta despues del script que genera el JSON desde el Excel.
"""

import json
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

RAIZ = Path(__file__).resolve().parent.parent
CREDENCIAL = RAIZ / 'credenciales' / 'service-account.json'
ORIGEN = RAIZ / 'json' / 'clientes_finanzas.json'

PLANILLA_ID = '1U91v6CVHmlaF3wjRhxSpyxtvP6RE0YNicZHrNRVMso4'
HOJA = 'finanzas'

ENCABEZADOS = [
    'Cliente_ID', 'Nombre_Cliente', 'Vendedor', 'Saldo_Total',
    'CP_Este_Mes', 'PG_Prom_3M', 'PG_Este_Mes', 'Cupo_Mes',
    'Ult_Operacion', 'es_revendedor'
]

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
]


def conectar():
    if not CREDENCIAL.exists():
        print(f'ERROR: no se encuentra la credencial en {CREDENCIAL}')
        sys.exit(1)
    creds = Credentials.from_service_account_file(str(CREDENCIAL), scopes=SCOPES)
    return gspread.authorize(creds).open_by_key(PLANILLA_ID)


def leer_finanzas():
    if not ORIGEN.exists():
        print(f'ERROR: no se encuentra {ORIGEN}')
        sys.exit(1)

    with open(ORIGEN, encoding='utf-8') as f:
        datos = json.load(f)

    clientes = datos.get('clientes', datos)
    filas = []

    for cuenta, c in clientes.items():
        filas.append([
            str(c.get('numero_cuenta', cuenta)).strip(),
            str(c.get('nombre', '')).strip(),
            str(c.get('vendedor', '')).strip(),
            c.get('saldoTotal', 0),
            c.get('comproMes', 0),
            c.get('pgProm3M', 0),
            c.get('pagoMes', 0),
            c.get('cupoMes', 0),
            str(c.get('ultOperacion', '')).strip(),
            '',
        ])

    filas.sort(key=lambda f: f[1])
    return filas


def main():
    print('=' * 60)
    print('CARGA DE FINANZAS -> Google Sheets')
    print('=' * 60)

    filas = leer_finanzas()
    print(f'Leidos {len(filas)} clientes desde el JSON')

    planilla = conectar()
    hoja = planilla.worksheet(HOJA)

    # Conservar la marca de revendedor que ya este cargada a mano
    revendedores = {}
    try:
        previo = hoja.get_all_values()
        for fila in previo[1:]:
            if len(fila) >= 10 and fila[9].strip():
                revendedores[fila[0].strip()] = fila[9].strip()
    except Exception:
        pass

    if revendedores:
        for f in filas:
            if f[0] in revendedores:
                f[9] = revendedores[f[0]]
        print(f'Conservadas {len(revendedores)} marcas de revendedor')

    hoja.clear()
    hoja.update(values=[ENCABEZADOS] + filas, range_name='A1')
    hoja.format('A1:J1', {'textFormat': {'bold': True}})

    print(f'Escritas {len(filas)} filas en la hoja "{HOJA}"')
    print('OK')
    print('=' * 60)


if __name__ == '__main__':
    main()