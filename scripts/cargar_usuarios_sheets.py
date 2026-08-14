"""
Carga los usuarios desde funcionalidades_usuarios.json a la hoja
'usuarios' de la planilla Ferremax Sistema.

Ademas de cargar, valida que las credenciales y los permisos
esten bien configurados. Si este script corre, la Etapa 0 esta cerrada.
"""

import json
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

RAIZ = Path(__file__).resolve().parent.parent
CREDENCIAL = RAIZ / 'credenciales' / 'service-account.json'
ORIGEN = RAIZ / 'json' / 'funcionalidades_usuarios.json'

PLANILLA_ID = '1U91v6CVHmlaF3wjRhxSpyxtvP6RE0YNicZHrNRVMso4'
HOJA = 'usuarios'

ENCABEZADOS = ['codigo', 'clave', 'nombre', 'rol', 'activo']

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
]


def conectar():
    if not CREDENCIAL.exists():
        print(f'ERROR: no se encuentra la credencial en {CREDENCIAL}')
        sys.exit(1)

    creds = Credentials.from_service_account_file(str(CREDENCIAL), scopes=SCOPES)
    cliente = gspread.authorize(creds)
    return cliente.open_by_key(PLANILLA_ID)


def leer_usuarios():
    if not ORIGEN.exists():
        print(f'ERROR: no se encuentra {ORIGEN}')
        sys.exit(1)

    with open(ORIGEN, encoding='utf-8') as f:
        datos = json.load(f)

    usuarios = datos.get('usuarios', datos)
    filas = []

    for clave_obj, u in usuarios.items():
        filas.append([
            str(u.get('codigo', '')).strip(),
            str(u.get('clave', clave_obj)).strip(),
            str(u.get('nombre', '')).strip(),
            str(u.get('rol', '')).strip(),
            'SI',
        ])

    filas.sort(key=lambda f: (f[3], f[2]))
    return filas


def main():
    print('=' * 60)
    print('CARGA DE USUARIOS -> Google Sheets')
    print('=' * 60)

    filas = leer_usuarios()
    print(f'Leidos {len(filas)} usuarios desde el JSON')

    planilla = conectar()
    print(f'Conectado a: {planilla.title}')

    hoja = planilla.worksheet(HOJA)
    hoja.clear()
    hoja.update(values=[ENCABEZADOS] + filas, range_name='A1')
    hoja.format('A1:E1', {'textFormat': {'bold': True}})

    print(f'Escritas {len(filas)} filas en la hoja "{HOJA}"')

    roles = {}
    for f in filas:
        roles[f[3]] = roles.get(f[3], 0) + 1
    print('\nUsuarios por rol:')
    for rol, cant in sorted(roles.items()):
        print(f'  {rol}: {cant}')

    print('\nOK - credenciales y permisos validados')
    print('=' * 60)


if __name__ == '__main__':
    main()