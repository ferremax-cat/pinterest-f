"""
PRUEBA DE convert_all_excel_files (scripts/excel_to_json.py)

!!! ESTA PRUEBA NO PUEDE ESCRIBIR NUNCA FUERA DE SU CARPETA TEMPORAL !!!

Por que: excel/ y json/ del repositorio son el catalogo que publica la app.
Una version anterior de esta prueba usaba las rutas relativas 'excel' y
'json': corrida desde la raiz, piso los 4 Excel reales (CLIENTES_PERMISOS,
GRUPOS_CLIENTES, PRODUCTOS, PROMOCIONES) y sus 4 JSON con clientes
inventados (C100 FERRETERIA JUAN, C200 CORRALON PEDRO) y con otra
estructura (lista de registros) que la app no puede leer. Un git add -A en
ese momento habria publicado un catalogo falso. Ademas tenia un tearDown
que BORRABA todos los archivos de excel/ y json/ y las dos carpetas; no
corria solo porque un segundo tearDown vacio lo reemplazaba.

Por eso:
- cada caso trabaja en su propia carpeta temporal (tempfile), fuera del
  repositorio, y tearDown borra solo esa carpeta;
- antes de escribir se controla que la carpeta temporal no este dentro del
  repositorio;
- antes y despues de todos los casos se toma la huella (sha256) de cada
  archivo de excel/ y json/ del repositorio: si algo cambio, la prueba falla.
  RAIZ sale de la ubicacion de este archivo, no del directorio desde el que
  se corre: la proteccion vale aunque se ejecute desde otra carpeta.
No volver a rutas relativas ni a limpiar carpetas del repositorio.

Nota: convert_all_excel_files y convert_excel_to_json no las usa ningun
script ni workflow (solo esta prueba): son candidatas a borrarse, con esta
prueba, en la limpieza de scripts/excel_to_json.py.

Uso, desde cualquier carpeta:
    python -m unittest test.test_excel_to_json      (desde la raiz)
    python test/test_excel_to_json.py
"""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

# La raiz del repositorio, deducida de este archivo (test/ esta en la raiz)
RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from scripts.excel_to_json import convert_all_excel_files  # noqa: E402

# Las carpetas del repositorio que esta prueba nunca puede tocar
CARPETAS_PROTEGIDAS = (RAIZ / 'excel', RAIZ / 'json')


def huellas_protegidas():
    """{ruta relativa: sha256} de cada archivo de excel/ y json/ del repositorio (solo lectura)"""
    res = {}
    for carpeta in CARPETAS_PROTEGIDAS:
        if not carpeta.exists():
            continue
        for p in sorted(carpeta.rglob('*')):
            if p.is_file():
                res[p.relative_to(RAIZ).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    return res


def dentro_del_repositorio(ruta):
    ruta = Path(ruta).resolve()
    return ruta == RAIZ or RAIZ in ruta.parents


class TestExcelToJson(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.huellas_antes = huellas_protegidas()

    @classmethod
    def tearDownClass(cls):
        despues = huellas_protegidas()
        cambiados = sorted(r for r in set(cls.huellas_antes) | set(despues)
                           if cls.huellas_antes.get(r) != despues.get(r))
        if cambiados:
            raise AssertionError('La prueba modifico archivos del repositorio: ' + ', '.join(cambiados))

    def setUp(self):
        # Carpeta temporal propia de este caso, fuera del repositorio
        self._tmp = tempfile.TemporaryDirectory(prefix='ferremax-excel-')
        base = Path(self._tmp.name)
        if dentro_del_repositorio(base):
            self._tmp.cleanup()
            self.fail(f'La carpeta temporal {base} quedo dentro del repositorio: no se escribe nada')
        self.base = base
        self.excel_dir = base / 'excel'
        self.json_dir = base / 'json'
        self.excel_dir.mkdir()
        self.json_dir.mkdir()

    def tearDown(self):
        # Solo la carpeta temporal de este caso
        self._tmp.cleanup()

    def escribir_excel(self, df, nombre):
        """Escribe un Excel de prueba, solo dentro de la carpeta temporal"""
        ruta = (self.excel_dir / nombre).resolve()
        self.assertIn(self.base.resolve(), ruta.parents, f'{ruta} fuera de la carpeta temporal')
        df.to_excel(ruta, index=False)

    def leer_json(self, nombre):
        with open(self.json_dir / nombre, encoding='utf-8') as f:
            return json.load(f)

    def convertir(self):
        convert_all_excel_files(str(self.excel_dir), str(self.json_dir), True)

    def create_test_excel_files(self):
        """Los 4 Excel de prueba, en la carpeta temporal"""
        self.escribir_excel(pd.DataFrame({
            'CUENTA': ['C100', 'C200'],
            'NOMBRE': ['FERRETERIA JUAN', 'CORRALON PEDRO'],
            'CATEGORIAS': ['FERRET', 'CORRAL'],
            'LISTA_PRECIOS': ['LISTA_D', 'LISTA_E']
        }), 'CLIENTES_PERMISOS.xlsx')
        self.escribir_excel(pd.DataFrame({
            'NOMBRE_GRUPO': ['GRUPO_FERRET', 'GRUPO_CORRAL'],
            'CLIENTES': ['C100', 'C200']
        }), 'GRUPOS_CLIENTES.xlsx')
        self.escribir_excel(pd.DataFrame({
            'CODIGO': ['P100', 'P200'],
            'ARTICULO': ['MARTILLO STANLEY', 'PINTURA ALBA'],
            'RUBRO': ['HERRAM', 'PINT'],
            'BULTO': [12, 4],
            'P_LISTA_D': [1500.00, 8500.00],
            'P_LISTA_E': [1400.00, 8000.00],
            'P_LISTA_F': [1300.00, 7500.00]
        }), 'PRODUCTOS.xlsx')
        self.escribir_excel(pd.DataFrame({
            'CODIGO_PRODUCTO': ['P100', 'P200'],
            'TIPO_LISTA': ['LISTA_D', 'LISTA_E'],
            'PRECIO_ESPECIAL': [1200.00, 7500.00],
            'VIGENCIA_HASTA': ['2025-12-31', '2025-12-31'],
            'GRUPOS': ['GRUPO_FERRET', 'GRUPO_CORRAL']
        }), 'PROMOCIONES.xlsx')

    def verify_data_relationships(self):
        """Relaciones entre los JSON generados"""
        clientes = self.leer_json('clientes_permisos.json')
        grupos = self.leer_json('grupos_clientes.json')
        productos = self.leer_json('productos.json')
        promociones = self.leer_json('promociones.json')
        for grupo in grupos:
            for cliente in grupo['CLIENTES'].split(','):
                self.assertTrue(any(c['CUENTA'] == cliente.strip() for c in clientes), f'Cliente {cliente} no encontrado')
        for promo in promociones:
            self.assertTrue(any(p['CODIGO'] == promo['CODIGO_PRODUCTO'] for p in productos),
                            f"Producto {promo['CODIGO_PRODUCTO']} no encontrado")

    def test_complete_workflow(self):
        """La conversion de los 4 archivos en conjunto"""
        self.create_test_excel_files()
        self.convertir()
        for nombre in ('clientes_permisos.json', 'grupos_clientes.json', 'productos.json', 'promociones.json'):
            self.assertTrue((self.json_dir / nombre).exists(), nombre)
        self.verify_data_relationships()

    def test_file_update_trigger(self):
        """Un Excel modificado se vuelve a convertir"""
        # Estado inicial: los Excel de prueba (nunca los del repositorio)
        self.create_test_excel_files()
        self.convertir()
        self.escribir_excel(pd.DataFrame({
            'CODIGO': ['P999'],
            'ARTICULO': ['NUEVO PRODUCTO'],
            'RUBRO': ['NUEVO'],
            'BULTO': [1],
            'P_LISTA_D': [100.00],
            'P_LISTA_E': [90.00],
            'P_LISTA_F': [80.00]
        }), 'PRODUCTOS.xlsx')
        self.convertir()
        self.assertTrue(any(p['CODIGO'] == 'P999' for p in self.leer_json('productos.json')),
                        'Nuevo producto no encontrado en JSON')

    def test_json_content(self):
        """Contenido y estructura de los JSON generados"""
        self.create_test_excel_files()
        self.convertir()
        campos = {
            'clientes_permisos.json': ('CUENTA', 'NOMBRE', 'CATEGORIAS', 'LISTA_PRECIOS'),
            'grupos_clientes.json': ('NOMBRE_GRUPO', 'CLIENTES'),
            'productos.json': ('CODIGO', 'ARTICULO', 'RUBRO', 'BULTO', 'P_LISTA_D', 'P_LISTA_E', 'P_LISTA_F'),
            'promociones.json': ('CODIGO_PRODUCTO', 'TIPO_LISTA', 'PRECIO_ESPECIAL', 'VIGENCIA_HASTA', 'GRUPOS'),
        }
        for nombre, claves in campos.items():
            datos = self.leer_json(nombre)
            self.assertIsInstance(datos, list, nombre)
            self.assertTrue(datos, nombre)
            for clave in claves:
                self.assertIn(clave, datos[0], f'{nombre}: falta {clave}')


if __name__ == '__main__':
    unittest.main()
