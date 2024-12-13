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

if __name__ == "__main__":
    excel_to_json()