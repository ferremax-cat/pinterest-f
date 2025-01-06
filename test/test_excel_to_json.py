import unittest
import pandas as pd
import json
import os
from scripts.excel_to_json import convert_excel_to_json, convert_all_excel_files

class TestExcelToJson(unittest.TestCase):
    def setUp(self):
        # Configurar rutas de prueba para que apunten a la carpeta json en la raíz
        self.excel_dir = 'excel'
        self.json_dir = 'json'
        
        # Crear directorio json si no existe
        os.makedirs(self.json_dir, exist_ok=True)

    def print_json_contents(self):
        """Imprime el contenido de todos los JSONs"""
        # Verificar clientes_permisos.json
        with open(os.path.join(self.json_dir, 'clientes_permisos.json')) as f:
            clientes = json.load(f)
            print("\nContenido de clientes_permisos.json:", json.dumps(clientes, indent=2))

        # Verificar grupos_clientes.json
        with open(os.path.join(self.json_dir, 'grupos_clientes.json')) as f:
            grupos = json.load(f)
            print("\nContenido de grupos_clientes.json:", json.dumps(grupos, indent=2))

        # Verificar productos.json
        with open(os.path.join(self.json_dir, 'productos.json')) as f:
            productos = json.load(f)
            print("\nContenido de productos.json:", json.dumps(productos, indent=2))

        # Verificar promociones.json
        with open(os.path.join(self.json_dir, 'promociones.json')) as f:
            promociones = json.load(f)
            print("\nContenido de promociones.json:", json.dumps(promociones, indent=2))

    def create_test_excel_files(self):
        """Crear los 4 archivos Excel de prueba"""
        # CLIENTES_PERMISOS
        df_clientes = pd.DataFrame({
            'CUENTA': ['C100', 'C200'],
            'NOMBRE': ['FERRETERIA JUAN', 'CORRALON PEDRO'],
            'CATEGORIAS': ['FERRET', 'CORRAL'],
            'LISTA_PRECIOS': ['LISTA_D', 'LISTA_E']
        })
        df_clientes.to_excel(os.path.join(self.excel_dir, 'CLIENTES_PERMISOS.xlsx'), index=False)

        # GRUPOS_CLIENTES
        df_grupos = pd.DataFrame({
            'NOMBRE_GRUPO': ['GRUPO_FERRET', 'GRUPO_CORRAL'],
            'CLIENTES': ['C100', 'C200']
        })
        df_grupos.to_excel(os.path.join(self.excel_dir, 'GRUPOS_CLIENTES.xlsx'), index=False)

        # PRODUCTOS
        df_productos = pd.DataFrame({
            'CODIGO': ['P100', 'P200'],
            'ARTICULO': ['MARTILLO STANLEY', 'PINTURA ALBA'],
            'RUBRO': ['HERRAM', 'PINT'],
            'BULTO': [12, 4],
            'P_LISTA_D': [1500.00, 8500.00],
            'P_LISTA_E': [1400.00, 8000.00],
            'P_LISTA_F': [1300.00, 7500.00]
        })
        df_productos.to_excel(os.path.join(self.excel_dir, 'PRODUCTOS.xlsx'), index=False)

        # PROMOCIONES
        df_promos = pd.DataFrame({
            'CODIGO_PRODUCTO': ['P100', 'P200'],
            'TIPO_LISTA': ['LISTA_D', 'LISTA_E'],
            'PRECIO_ESPECIAL': [1200.00, 7500.00],
            'VIGENCIA_HASTA': ['2025-12-31', '2025-12-31'],
            'GRUPOS': ['GRUPO_FERRET', 'GRUPO_CORRAL']
        })
        df_promos.to_excel(os.path.join(self.excel_dir, 'PROMOCIONES.xlsx'), index=False)

    def verify_data_relationships(self):
        """Verificar las relaciones entre los archivos JSON"""
        with open(os.path.join(self.json_dir, 'clientes_permisos.json')) as f:
            clientes = json.load(f)
        with open(os.path.join(self.json_dir, 'grupos_clientes.json')) as f:
            grupos = json.load(f)
        with open(os.path.join(self.json_dir, 'productos.json')) as f:
            productos = json.load(f)
        with open(os.path.join(self.json_dir, 'promociones.json')) as f:
            promociones = json.load(f)

        # Verificar relaciones cliente-grupo
        for grupo in grupos:
            clientes_grupo = grupo['CLIENTES'].split(',')
            for cliente in clientes_grupo:
                self.assertTrue(
                    any(c['CUENTA'] == cliente.strip() for c in clientes),
                    f"Cliente {cliente} no encontrado"
                )

        # Verificar relaciones producto-promoción
        for promo in promociones:
            self.assertTrue(
                any(p['CODIGO'] == promo['CODIGO_PRODUCTO'] for p in productos),
                f"Producto {promo['CODIGO_PRODUCTO']} no encontrado"
            )
  
    
    def test_complete_workflow(self):
        """Prueba la conversión de todos los archivos en conjunto"""
        # Crear los 4 archivos Excel de prueba
        self.create_test_excel_files()

        # Ejecutar conversión
        convert_all_excel_files(self.excel_dir, self.json_dir, True)  # Pasamos True para silent)

        # Verificar que se crearon los 4 JSON
        expected_files = [
            'clientes_permisos.json',
            'grupos_clientes.json',
            'productos.json',
            'promociones.json'
        ]

        for file in expected_files:
            json_path = os.path.join(self.json_dir, file)
            self.assertTrue(os.path.exists(json_path))
            
        # Verificar relaciones entre archivos
        self.verify_data_relationships()


    def test_file_update_trigger(self):
        """Prueba que la modificación de Excel dispara la conversión"""
        # Crear estado inicial
        #self.create_test_excel_files()
        convert_all_excel_files(self.excel_dir, self.json_dir, True)  # Pasamos True para silent)

        # Simular modificación de archivo Excel
        df_nuevo = pd.DataFrame({
            'CODIGO': ['P999'],
            'ARTICULO': ['NUEVO PRODUCTO'],
            'RUBRO': ['NUEVO'],
            'BULTO': [1],
            'P_LISTA_D': [100.00],
            'P_LISTA_E': [90.00],
            'P_LISTA_F': [80.00]
        })
        df_nuevo.to_excel(os.path.join(self.excel_dir, 'PRODUCTOS.xlsx'), index=False)

        # Ejecutar conversión
        convert_all_excel_files(self.excel_dir, self.json_dir)

        # Verificar actualización
        with open(os.path.join(self.json_dir, 'productos.json')) as f:
            data = json.load(f)
            self.assertTrue(
                any(p['CODIGO'] == 'P999' for p in data),
                "Nuevo producto no encontrado en JSON"
            )



    def tearDown(self):
        # Limpiar archivos de prueba
        for file in os.listdir(self.excel_dir):
            os.remove(os.path.join(self.excel_dir, file))
        for file in os.listdir(self.json_dir):
            os.remove(os.path.join(self.json_dir, file))
        
        os.rmdir(self.excel_dir)
        os.rmdir(self.json_dir)

    def test_json_content(self):
        """Verificar el contenido y estructura de los JSON generados"""
        # Primero generar los JSON
        self.create_test_excel_files()
        convert_all_excel_files(self.excel_dir, self.json_dir, True)  # Pasamos True para silent)
        
        # Verificar clientes_permisos.json
        with open(os.path.join(self.json_dir, 'clientes_permisos.json')) as f:
            clientes = json.load(f)
            self.assertTrue(isinstance(clientes, list))
            if len(clientes) > 0:
                cliente = clientes[0]
                self.assertIn('CUENTA', cliente)
                self.assertIn('NOMBRE', cliente)
                self.assertIn('CATEGORIAS', cliente)
                self.assertIn('LISTA_PRECIOS', cliente)
                print("Contenido de clientes_permisos.json:", json.dumps(clientes, indent=2))

        # Verificar grupos_clientes.json
        with open(os.path.join(self.json_dir, 'grupos_clientes.json')) as f:
            grupos = json.load(f)
            self.assertTrue(isinstance(grupos, list))
            if len(grupos) > 0:
                grupo = grupos[0]
                self.assertIn('NOMBRE_GRUPO', grupo)
                self.assertIn('CLIENTES', grupo)
                print("Contenido de grupos_clientes.json:", json.dumps(grupos, indent=2))

        # Verificar productos.json
        with open(os.path.join(self.json_dir, 'productos.json')) as f:
            productos = json.load(f)
            self.assertTrue(isinstance(productos, list))
            if len(productos) > 0:
                producto = productos[0]
                self.assertIn('CODIGO', producto)
                self.assertIn('ARTICULO', producto)
                self.assertIn('RUBRO', producto)
                self.assertIn('BULTO', producto)
                self.assertIn('P_LISTA_D', producto)
                self.assertIn('P_LISTA_E', producto)
                self.assertIn('P_LISTA_F', producto)
                print("Contenido de productos.json:", json.dumps(productos, indent=2))

        # Verificar promociones.json
        with open(os.path.join(self.json_dir, 'promociones.json')) as f:
            promociones = json.load(f)
            self.assertTrue(isinstance(promociones, list))
            if len(promociones) > 0:
                promocion = promociones[0]
                self.assertIn('CODIGO_PRODUCTO', promocion)
                self.assertIn('TIPO_LISTA', promocion)
                self.assertIn('PRECIO_ESPECIAL', promocion)
                self.assertIn('VIGENCIA_HASTA', promocion)
                self.assertIn('GRUPOS', promocion)
                print("Contenido de promociones.json:", json.dumps(promociones, indent=2))


    def tearDown(self):
        # Removemos el tearDown para mantener los archivos
        pass


if __name__ == '__main__':
      unittest.main()