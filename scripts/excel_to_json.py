# scripts/excel_to_json.py

import pandas as pd
import json

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
    return products


def excel_to_json():
    # Procesar PRODUCTOS.xlsx
    df_products = pd.read_excel('excel/PRODUCTOS.xlsx')
    products_json = process_products(df_products)
    
    # Guardar JSONs
    with open('json/products.json', 'w') as f:
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
        with open('json/clients.json', 'w') as f:
            json.dump(clients_data, f, indent=2)
            
        print('clients.json generado exitosamente')
            
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
            with open('json/groups.json', 'w') as f:
                json.dump(groups_data, f, indent=2)
                
            print('groups.json generado exitosamente')
                
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
        with open('json/promotions.json', 'w') as f:
            json.dump(promotions_data, f, indent=2)
            
        print('promotions.json generado exitosamente')
            
    except Exception as e:
        print(f'Error procesando promociones: {e}')



if __name__ == "__main__":
    excel_to_json()
    process_clients()
    process_groups()
    process_promotions()