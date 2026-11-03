"""
Carga los usuarios desde funcionalidades_usuarios.json a la hoja
'usuarios' de la planilla Ferremax Sistema.

Ademas de cargar, valida que las credenciales y los permisos
esten bien configurados. Si este script corre, la Etapa 0 esta cerrada.
"""

import json
import sys
import requests
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# Antes de borrar la hoja, comparar la cantidad de usuarios (ver guardia_registros.py)
try:
    import guardia_registros as guardia
except ImportError:
    from scripts import guardia_registros as guardia

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

    # Antes de borrar la hoja: con muchos menos usuarios que los cargados, el
    # JSON vino incompleto. Sin poder leer la hoja actual, no hay con que comparar
    try:
        actuales = sum(1 for f in hoja.get_all_values()[1:] if f and f[0].strip())
    except Exception:
        actuales = None
    try:
        guardia.revisar('hoja usuarios', actuales, len(filas))
    except guardia.EscrituraBloqueada:
        sys.exit(1)   # ya se aviso: quedo la hoja anterior y no se limpio la cache

    hoja.clear()
    hoja.update(values=[ENCABEZADOS] + filas, range_name='A1')
    hoja.format('A1:E1', {'textFormat': {'bold': True}})

    print(f'Escritas {len(filas)} filas en la hoja "{HOJA}"')

    # Limpiar la cache del servidor: sin esto un usuario nuevo no puede
    # entrar, y las bajas o cambios de rol no se aplican, hasta 6 horas
    URL_API = ('https://script.google.com/macros/s/'
               'AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec')
    try:
        r = requests.get(URL_API + '?accion=limpiar_cache_usr', timeout=30)
        if not r.json().get('ok'):
            raise RuntimeError(r.text[:80])
        print('Cache del servidor limpiada:', r.text[:80])
    except Exception as e:
        print('AVISO: no se pudo limpiar la cache del servidor:', e)
        print('Abri la URL a mano o volve a correr el script')

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