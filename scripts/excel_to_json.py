# scripts/excel_to_json.py
import pandas as pd
import json
import os
import requests
import re

def get_sheet_ids():
    """Lee los IDs desde config.js"""
    try:
        config_path = 'js/config.js'  # Ruta específica para tu proyecto
        
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = f.read()
            print(f'Configuración encontrada en: {config_path}')
            return {
                'clientes_permisos': re.search(r'clientesPermisosId: [\'"](.+?)[\'"]', config).group(1),
                'grupos_clientes': re.search(r'gruposId: [\'"](.+?)[\'"]', config).group(1),
                'productos': re.search(r'productosId: [\'"](.+?)[\'"]', config).group(1),
                'promociones': re.search(r'promocionesId: [\'"](.+?)[\'"]', config).group(1)
            }
        
        print(f'No se encontró el archivo en: {config_path}')
        raise FileNotFoundError(f'config.js no encontrado en {config_path}')
    except Exception as e:
        print(f'Error leyendo config.js: {e}')
        raise


def get_sheet_data(sheet_id):
    """Obtiene datos de Google Sheets"""
    try:
        url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:json'
        response = requests.get(url)
        return json.loads(response.text[47:-2])
    except Exception as e:
        print(f'Error obteniendo datos de Google Sheets: {e}')
        return None

def update_from_sheets():
    """Actualiza JSONs desde Google Sheets"""
    try:
        sheets = get_sheet_ids()
        for name, sheet_id in sheets.items():
            try:
                print(f'Procesando {name} desde Google Sheets')
                data = get_sheet_data(sheet_id)
                if data:
                    process_sheet_data(name, data)
                    print(f'Actualizado {name}.json desde Google Sheets')
            except Exception as e:
                print(f'Error procesando {name}: {e}')
                # Si falla Google Sheets, intentar con Excel local
                print(f'Intentando actualizar {name} desde Excel local')
                update_from_local()
    except Exception as e:
        print(f'Error en actualización desde Sheets: {e}')
        update_from_local()

def update_from_local():
    """Actualiza JSONs desde archivos Excel locales"""
    try:
        print('Actualizando desde archivos Excel locales')
        excel_to_json()
        process_clients()
        process_groups()
        process_promotions()
        print('Actualización local completada')
    except Exception as e:
        print(f'Error en actualización local: {e}')


def process_sheet_data(name, data):
    """Procesa los datos obtenidos de Google Sheets y los guarda como JSON"""
    try:
        result = {}
        
        # Solo mostrar logs detallados para clientes_permisos
        if name == 'clientes_permisos':
            print(f'\nProcesando sheet: {name}')
            print(f'Total de filas encontradas: {len(data["table"]["rows"])}')
            
            for index, row in enumerate(data['table']['rows']):
                print(f'\nRevisando fila {index + 1}:')
                print(f'Contenido de la fila: {row}')
                
                if not row['c'][0]:
                    print(f'Fila {index + 1} saltada: No tiene datos en la primera columna')
                    continue
                    
                if not row['c'][0].get('v'):
                    print(f'Fila {index + 1} saltada: No tiene valor en la primera columna')
                    continue

                process_client_row(result, row)
                
            print(f'\nTotal de clientes procesados: {len(result)}')
            print(f'Clientes procesados: {list(result.keys())}')
        else:
            # Para otros sheets, procesar sin logs detallados
            for row in data['table']['rows']:
                if row['c'][0] and row['c'][0].get('v'):
                    if name == 'grupos_clientes':
                        process_group_row(result, row)
                    elif name == 'productos':
                        process_product_row(result, row)
                    elif name == 'promociones':
                        process_promotion_row(result, row)

        with open(f'json/{name}.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
    except Exception as e:
        print(f'Error procesando datos de {name}: {e}')
        raise



def process_product_row(result, row):
    """Procesa una fila de productos desde Google Sheets"""
    codigo = str(row['c'][0]['v'])
    result[codigo] = {
        'name': row['c'][1]['v'] if row['c'][1] else '',
        'category': row['c'][2]['v'] if row['c'][2] else '',
        'bulk': row['c'][3]['v'] if row['c'][3] else '',
        'prices': {
            'D': row['c'][4]['v'] if row['c'][4] else 0,
            'E': row['c'][5]['v'] if row['c'][5] else 0,
            'F': row['c'][6]['v'] if row['c'][6] else 0
        }
    }

def process_client_row(result, row):
    """Procesa una fila de clientes desde Google Sheets"""
    try:
        # Log de datos crudos
        print(f'Procesando fila cruda: {row}')

        # Convertir el valor a entero antes de usarlo como key
        cuenta_valor = row['c'][0]['v']
        cuenta = str(int(float(cuenta_valor)))  # Convierte a entero y luego a string
        print(f'Cuenta procesada: {cuenta}')
        
        result[cuenta] = {
            'name': row['c'][1]['v'] if row['c'][1] else '',
            'categories': row['c'][2]['v'] if row['c'][2] else '',
            'priceList': row['c'][3]['v'] if row['c'][3] else ''
        }
        print(f'Datos del cliente: {cuenta}')
        print(f'Cliente {cuenta} agregado exitosamente')

    except Exception as e:
        print(f'Error procesando cuenta {cuenta_valor if "cuenta_valor" in locals() else "desconocida"}: {e}')

def process_group_row(result, row):
    """Procesa una fila de grupos desde Google Sheets"""
    nombre_grupo = row['c'][0]['v']
    clientes = str(row['c'][1]['v']).split(',') if row['c'][1] else []
    if 'groups' not in result:
        result['groups'] = {}
    result['groups'][nombre_grupo] = clientes

def process_promotion_row(result, row):
    """Procesa una fila de promociones desde Google Sheets"""
    codigo = str(row['c'][0]['v'])
    if 'promotions' not in result:
        result['promotions'] = {}
    result['promotions'][codigo] = {
        'tipoLista': row['c'][1]['v'] if row['c'][1] else '',
        'precio': row['c'][2]['v'] if row['c'][2] else 0,
        'vigencia': row['c'][3]['v'] if row['c'][3] else '',
        'grupos': str(row['c'][4]['v']).split(',') if row['c'][4] else []
    }

# Mantener todas las funciones existentes de procesamiento local
# [Aquí van todas tus funciones existentes sin cambios]



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
            print(f"Archivo Excel no encontrado: {excel_file}")
            results.append((json_file, False))
    return all(success for _, success in results)        

def main():
    """Función principal que intenta primero Google Sheets y luego local"""
    try:
        print('Iniciando actualización de JSONs')
        update_from_sheets()
    except Exception as e:
        print(f'Error en actualización desde Sheets: {e}')
        print('Intentando actualización local')
        update_from_local()

if __name__ == "__main__":
    main()