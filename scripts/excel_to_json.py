# scripts/excel_to_json.py

import pandas as pd
import json
import os



def process_products(df):
    products = {}
    for _, row in df.iterrows():
        products[row['CODIGO']] = {
            'name': row['ARTICULO'],
            'category': row['RUBRO'],
            'bulk': row['BULTO'],
            'prices': {
                'D': row['P_LISTA_D'],
                'E': row['P_LISTA_E'],
                'F': row['P_LISTA_F']
            }
        }
    print('productos.json generado exitosamente')    
    return products 


def excel_to_json():
    # Procesar PRODUCTOS.xlsx
    df_products = pd.read_excel('excel/PRODUCTOS.xlsx')
    products_json = process_products(df_products)
    
    # Guardar JSONs
    with open('json/productos.json', 'w') as f:
        json.dump(products_json, f, indent=2)


def process_clients():
    """Procesa CLIENTES_PERMISOS.xlsx y genera clients.json"""
    try:
        # Leer Excel
        df = pd.read_excel('excel/CLIENTES_PERMISOS.xlsx')
        
        # Procesar datos
        clients_data = {}
        for _, row in df.iterrows():
            clients_data[str(row['CUENTA'])] = {
                'name': row['NOMBRE'],
                'categories': row['CATEGORIAS'],
                'priceList': row['LISTA_PRECIOS']
            }
            
        # Guardar JSON
        with open('json/clientes_permisos.json', 'w') as f:
            json.dump(clients_data, f, indent=2)
            
        print('clientes_permisos.json generado exitosamente')
            
    except Exception as e:
        print(f'Error procesando clientes: {e}')     



def process_groups():
        """Procesa GRUPOS_CLIENTES.xlsx y genera groups.json"""
        try:
            # Leer Excel
            df = pd.read_excel('excel/GRUPOS_CLIENTES.xlsx')
            
            # Procesar datos
            groups_data = {"groups": {}}
            for _, row in df.iterrows():
                group_name = row['NOMBRE_GRUPO']
                clients = str(row['CLIENTES']).split(',')
                groups_data["groups"][group_name] = clients
                
            # Guardar JSON
            with open('json/grupos_clientes.json', 'w') as f:
                json.dump(groups_data, f, indent=2)
                
            print('grupos_clientes.json generado exitosamente')
                
        except Exception as e:
            print(f'Error procesando grupos: {e}')

def process_promotions():
    """Procesa PROMOCIONES.xlsx y genera promotions.json"""
    try:
        # Leer Excel
        df = pd.read_excel('excel/PROMOCIONES.xlsx')

        # Convertir todas las columnas de tipo datetime a cadenas 
        for column in df.select_dtypes(include=['datetime']): 
            df[column] = df[column].astype(str)
        
        # Procesar datos
        promotions_data = {"promotions": {}}
        for _, row in df.iterrows():
            code = row['CODIGO_PRODUCTO']
            promotions_data["promotions"][code] = {
                "tipoLista": row['TIPO_LISTA'],
                "precio": row['PRECIO_ESPECIAL'],
                "vigencia": row['VIGENCIA_HASTA'],
                "grupos": row['GRUPOS'].split(',')
            }
            
        # Guardar JSON
        with open('json/promociones.json', 'w') as f:
            json.dump(promotions_data, f, indent=2)
            
        print('promociones.json generado exitosamente')
            
    except Exception as e:
        print(f'Error procesando promociones: {e}')

    def convert_excel_to_json(input_dir='excel', output_dir='json'):
        """
        Convierte los archivos Excel a JSON usando los archivos reales
        """
        # Asegurar que el directorio de salida existe
        os.makedirs(output_dir, exist_ok=True)

        # Lista de archivos a procesar
        files_to_process = {
            'CLIENTES_PERMISOS.xlsx': 'clientes_permisos.json',
            'GRUPOS_CLIENTES.xlsx': 'grupos_clientes.json',
            'PRODUCTOS.xlsx': 'productos.json',
            'PROMOCIONES.xlsx': 'promociones.json'
        }

        for excel_file, json_file in files_to_process.items():
            try:
                excel_path = os.path.join(input_dir, excel_file)
                if not os.path.exists(excel_path):
                    print(f"Archivo no encontrado: {excel_path}")
                    continue

                # Leer Excel
                df = pd.read_excel(excel_path)
                
                # Convertir a JSON
                json_path = os.path.join(output_dir, json_file)
                data = df.to_dict('records')
                
                # Guardar JSON
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                print(f"Archivo {excel_file} convertido exitosamente a {json_file}")
                
            except Exception as e:
                print(f"Error procesando {excel_file}: {str(e)}")

def convert_excel_to_json(excel_file, json_file,silent=False):
    """
    Convierte un archivo Excel específico a JSON.
    """
    try:
        df = pd.read_excel(excel_file)
        data = df.to_dict('records')
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        if not silent:  # Solo imprime si silent es False  
            print(f"Successfully converted {os.path.basename(excel_file)} to {os.path.basename(json_file)}")
        return True
    except Exception as e:
        if not silent:
            print(f"Error converting {excel_file}: {str(e)}")
        return False

def convert_all_excel_files(excel_dir, json_dir,silent=False):
    """
    Convierte todos los archivos Excel en el directorio a JSON.
    
    Args:
        excel_dir (str): Directorio con archivos Excel
        json_dir (str): Directorio donde se guardarán los JSON
    """
    # Crear directorio JSON si no existe
    os.makedirs(json_dir, exist_ok=True)
    
    # Mapeo de archivos
    excel_files = {
        'CLIENTES_PERMISOS.xlsx': 'clientes_permisos.json',
        'GRUPOS_CLIENTES.xlsx': 'grupos_clientes.json',
        'PRODUCTOS.xlsx': 'productos.json',
        'PROMOCIONES.xlsx': 'promociones.json'
    }
    
    results = []
    for excel_file, json_file in excel_files.items():
        excel_path = os.path.join(excel_dir, excel_file)
        json_path = os.path.join(json_dir, json_file)
        
        if os.path.exists(excel_path):
            success = convert_excel_to_json(excel_path, json_path, silent)
            results.append((json_file, success))
        elif not silent:
            print(f"Archivo Excel no encontrado: {excel_name}")
            results.append((json_file, False))
    return all(success for _, success in results)        

if __name__ == "__main__":
    excel_to_json()
    process_clients()
    process_groups()
    process_promotions()