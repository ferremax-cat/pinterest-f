# scripts/excel_to_json.py
import pandas as pd
import json
import os
import requests
import re
import hashlib
import numbers
from datetime import datetime  # Agregamos esta importación

# Antes de pisar un JSON, comparar la cantidad de registros (ver guardia_registros.py)
try:
    import guardia_registros as guardia
except ImportError:
    from scripts import guardia_registros as guardia


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
                'promociones': re.search(r'promocionesId: [\'"](.+?)[\'"]', config).group(1),
                'catalogo_grupos': re.search(r'catalogoGruposId: [\'"](.+?)[\'"]', config).group(1),
                'catalogo_imagenes': re.search(r'catalogoImagenesId: [\'"](.+?)[\'"]', config).group(1),
                'margenes_clientes': re.search(r'margenesClientesId: [\'"](.+?)[\'"]', config).group(1),  # NUEVA LÍNEA
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

def update_from_local():
    """Actualiza JSONs desde archivos Excel locales"""
    print('Actualizando desde archivos Excel locales')
    # Cada archivo por separado: un error en uno no frena a los demas
    for paso in (excel_to_json, process_clients, process_groups, process_promotions,
                 process_catalogo_grupos_local, process_image_catalog_local):
        try:
            paso()
        except guardia.EscrituraBloqueada:
            pass   # ya se aviso: queda el archivo anterior
        except Exception as e:
            print(f'Error en actualización local ({paso.__name__}): {e}')
    print('Actualización local completada')


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

        guardia.escribir_json(f'json/{name}.json', result, indent=2, ensure_ascii=False)

    except Exception as e:
        print(f'Error procesando datos de {name}: {e}')
        raise



def process_product_row(result, row):
    """Procesa una fila de productos desde Google Sheets"""
    codigo = str(row['c'][0]['v'])

    # Conservar dos decimales, igual que en process_products
    precio_d = round(float(row['c'][4]['v']), 2) if row['c'][4] and isinstance(row['c'][4]['v'], (int, float)) else 0
    precio_e = round(float(row['c'][5]['v']), 2) if row['c'][5] and isinstance(row['c'][5]['v'], (int, float)) else 0
    precio_f = round(float(row['c'][6]['v']), 2) if row['c'][6] and isinstance(row['c'][6]['v'], (int, float)) else 0

    result[codigo] = {
        'name': row['c'][1]['v'] if row['c'][1] else '',
        'category': row['c'][2]['v'] if row['c'][2] else '',
        'bulk': row['c'][3]['v'] if row['c'][3] else '',
        'prices': {
            'D': precio_d,
            'E': precio_e,
            'F': precio_f
        }
        #'prices': {
           # 'D': row['c'][4]['v'] if row['c'][4] else 0,
            #'E': row['c'][5]['v'] if row['c'][5] else 0,
           # 'F': row['c'][6]['v'] if row['c'][6] else 0
        #}
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

# MODIFICACIÓN 2: Crear process_margin_row()
def process_margin_row(result, row):
    """Procesa una fila de márgenes desde Google Sheets"""
    try:
        print(f'Procesando fila de margen: {row}')

        # Obtener cliente (columna B, índice 1)
        cliente_valor = row['c'][1]['v']
        cliente = str(int(float(cliente_valor)))
        print(f'Cliente procesado: {cliente}')
        
        # Obtener datos de las otras columnas
        nombre = row['c'][2]['v'] if row['c'][2] else ''
        margen = int(row['c'][3]['v']) if row['c'][3] else 0
        mostrar = row['c'][4]['v'] if row['c'][4] else 'lista'
        fecha_cambio = row['c'][0]['v'] if row['c'][0] else ''  # Marca temporal
        
        result[cliente] = {
            'nombre': nombre,
            'margen': margen,
            'mostrar': mostrar,
            'ultima_actualizacion': fecha_cambio
        }
        print(f'Margen para cliente {cliente} agregado exitosamente')

    except Exception as e:
        print(f'Error procesando margen para cliente {cliente_valor if "cliente_valor" in locals() else "desconocido"}: {e}')

# MODIFICACIÓN 3: Crear función específica para márgenes
def process_margenes_sheet_data(data):
    """Procesa específicamente los datos de márgenes desde Google Sheets"""
    try:
        result = {}
        
        print(f'\nProcesando sheet de márgenes')
        print(f'Total de filas encontradas: {len(data["table"]["rows"])}')
        
        for index, row in enumerate(data['table']['rows']):
            print(f'\nRevisando fila {index + 1}:')
            print(f'Contenido de la fila: {row}')
            
            # Cliente está en columna B (índice 1)
            if not row['c'][1]:
                print(f'Fila {index + 1} saltada: No tiene datos de cliente')
                continue
            if not row['c'][1].get('v'):
                print(f'Fila {index + 1} saltada: No tiene valor de cliente')
                continue
            
            process_margin_row(result, row)
            
        print(f'\nTotal de márgenes procesados: {len(result)}')
        print(f'Clientes procesados: {list(result.keys())}')

        # Guardar JSON
        guardia.escribir_json('json/margenes_clientes.json', result, indent=2, ensure_ascii=False)
            
    except Exception as e:
        print(f'Error procesando datos de márgenes: {e}')
        raise


# Sin respaldo local: excel/MARGENES_CLIENTES.xlsx quedo viejo (4 clientes contra
# los 155 de las respuestas del formulario). Si Google no responde, queda el
# margenes_clientes.json anterior y se avisa
def update_margenes_from_sheets():
    """Actualiza márgenes desde Google Sheets (respuestas del formulario)"""
    try:
        sheet_id = get_sheet_ids()['margenes_clientes']
        print(f'Procesando margenes_clientes desde Google Sheets')

        data = get_sheet_data(sheet_id)
        if data:
            process_margenes_sheet_data(data)
            print(f'Actualizado margenes_clientes.json desde Google Sheets')
        else:
            print('AVISO: sin datos de Google Sheets para margenes_clientes: queda el archivo anterior')

    except guardia.EscrituraBloqueada:
        pass   # ya se aviso: quedan los márgenes anteriores
    except Exception as e:
        print(f'Error en actualización de márgenes desde Sheets: {e}')
        print('AVISO: queda el margenes_clientes.json anterior')



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

    
    # Truncar el precio para eliminar los decimales
    precio = 0
    if row['c'][2] and isinstance(row['c'][2]['v'], (int, float)):
        precio = round(float(row['c'][2]['v']), 2)

    if 'promotions' not in result:
        result['promotions'] = {}
    result['promotions'][codigo] = {
        'tipoLista': row['c'][1]['v'] if row['c'][1] else '',
        'precio': precio,
        'vigencia': row['c'][3]['v'] if row['c'][3] else '',
        'grupos': [g.strip() for g in str(row['c'][4]['v']).split('.') if g.strip()] if row['c'][4] else []
    }

# Mantener todas las funciones existentes de procesamiento local
# [Aquí van todas tus funciones existentes sin cambios]



def process_products(df):
    products = {}
    for _, row in df.iterrows():

        # Conservar dos decimales: el sistema de facturacion los usa y
        # truncarlos hacia diferencias en los importes de los pedidos
        precio_d = round(float(row['P_LISTA_D']), 2) if isinstance(row['P_LISTA_D'], (int, float)) else 0
        precio_e = round(float(row['P_LISTA_E']), 2) if isinstance(row['P_LISTA_E'], (int, float)) else 0
        precio_f = round(float(row['P_LISTA_F']), 2) if isinstance(row['P_LISTA_F'], (int, float)) else 0

        products[row['CODIGO']] = {
            'name': row['ARTICULO'],
            'category': row['RUBRO'],
            'bulk': row['BULTO'],
            #24-3
            'prices': {
                'D': precio_d,
                'E': precio_e,
                'F': precio_f
            }
            #24-3

            #'prices': {
             #   'D': row['P_LISTA_D'],
              #  'E': row['P_LISTA_E'],
               # 'F': row['P_LISTA_F']
           # }
        }
    print('productos.json generado exitosamente')    
    return products 


def excel_to_json():
    # Procesar PRODUCTOS.xlsx
    df_products = pd.read_excel('excel/PRODUCTOS.xlsx')
    products_json = process_products(df_products)
    
    # Guardar JSONs
    guardia.escribir_json('json/productos.json', products_json, indent=2)


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
        guardia.escribir_json('json/clientes_permisos.json', clients_data, indent=2)
            
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
                clients = [c.strip() for c in str(row['CLIENTES']).split('.') if c.strip()]
                groups_data["groups"][group_name] = clients
                
            # Guardar JSON
            # Se cuentan los clientes de todos los grupos, no los grupos: con
            # pocos grupos, la guardia solo frenaria un archivo vacio
            guardia.escribir_json('json/grupos_clientes.json', groups_data,
                                  contar=lambda d: sum(len(v) for v in d.get('groups', {}).values()),
                                  indent=2)
                
            print('grupos_clientes.json generado exitosamente')
                
        except Exception as e:
            print(f'Error procesando grupos: {e}')

# Tramos de las promociones: pares de columnas cant_1/desc_1, cant_2/desc_2, ...
# (sin distinguir mayusculas; puede haber huecos en la numeracion)
PAR_TRAMO = re.compile(r'^(cant|desc)_(\d+)$', re.IGNORECASE)


def _vacia(x):
    """Celda sin dato: vacia, NaN o texto en blanco (nunca 0)"""
    if x is None:
        return True
    if isinstance(x, str):
        return not x.strip()
    try:
        return bool(pd.isna(x))
    except (TypeError, ValueError):
        return False


def _numero(x):
    """La celda como float si es un numero (int, float o los de numpy); si no, None.
    Con celdas vacias pandas trae la columna como float64: 2 llega como 2.0"""
    if isinstance(x, bool) or not isinstance(x, numbers.Number):
        return None
    return float(x)


def _entero(x):
    """La celda como int si es un entero, aunque llegue como 2.0; si no, None"""
    n = _numero(x)
    return int(n) if n is not None and n == int(n) else None


def _fmt_pct(d):
    return str(int(d)) if d == int(d) else str(d).replace('.', ',')


def armar_promociones(df):
    """
    Arma promociones.json desde el DataFrame de excel/PROMOCIONES.xlsx.
    Devuelve (datos, errores): errores es una lista de textos con la fila de
    Excel y el codigo; si no esta vacia, no hay que publicar nada.

    Unidades: CANTIDAD_MINIMA y los cant_i estan en unidades sueltas, las del
    casillero de cantidad del vendedor (el bulto es solo una referencia).
    Por debajo de CANTIDAD_MINIMA no hay promocion (lista del cliente); desde
    el minimo, PRECIO_ESPECIAL; desde cant_i, PRECIO_ESPECIAL - desc_i %.

    Una fila sin tramos sale igual que antes (mismas claves y valores); con
    tramos agrega "tramos": [{"desde": 5, "desc": 5}, ...], ordenados.
    Son errores: un par incompleto, una cantidad que no es entero >= 1, un
    porcentaje no numerico o fuera de (0, 100) (entre 0 y 1: celda con formato
    %), una cantidad repetida, un tramo por debajo de CANTIDAD_MINIMA, un tramo
    mayor con igual o menos descuento, PRECIO_ESPECIAL vacio, no numerico o
    <= 0, y un CODIGO_PRODUCTO repetido. Los tramos desordenados se ordenan.
    """
    df = df.copy()
    # Las fechas como texto (VIGENCIA_HASTA: "2026-11-30")
    for column in df.select_dtypes(include=['datetime']):
        df[column] = df[column].astype(str)

    errores = []

    # Pares de columnas de tramos
    pares = {}
    for col in df.columns:
        m = PAR_TRAMO.match(str(col).strip())
        if m:
            pares.setdefault(int(m.group(2)), {})[m.group(1).lower()] = col
    for n, p in sorted(pares.items()):
        if 'cant' not in p or 'desc' not in p:
            falta = 'desc' if 'cant' in p else 'cant'
            errores.append(f'columnas: falta {falta}_{n} (los tramos van de a pares cant_{n} / desc_{n})')

    promotions = {}
    filas_de = {}
    for i, row in df.reset_index(drop=True).iterrows():
        fila = i + 2   # fila de Excel: el encabezado es la 1
        code = row['CODIGO_PRODUCTO']

        def error(motivo):
            errores.append(f'fila {fila} ({code}): {motivo}')

        if code in filas_de:
            error(f'código repetido (también en la fila {filas_de[code]})')
        else:
            filas_de[code] = fila

        # Precio especial a 2 decimales (el que usa la app y la base de los tramos)
        precio = _numero(row['PRECIO_ESPECIAL'])
        if precio is None or pd.isna(precio) or precio <= 0:
            error(f'PRECIO_ESPECIAL = {row["PRECIO_ESPECIAL"]!r}: tiene que ser un número mayor que 0')
            precio = 0
        else:
            precio = round(precio, 2)

        # Sin dato, 1 (como antes); 30.0 vale como 30
        cantidad_minima = 1
        if not _vacia(row.get('CANTIDAD_MINIMA')):
            cantidad_minima = _entero(row['CANTIDAD_MINIMA'])
            if cantidad_minima is None or cantidad_minima < 1:
                error(f'CANTIDAD_MINIMA = {row["CANTIDAD_MINIMA"]!r}: tiene que ser un entero mayor o igual a 1')
                cantidad_minima = 1

        tramos = []
        for n, p in sorted(pares.items()):
            if 'cant' not in p or 'desc' not in p:
                continue
            c, d = row[p['cant']], row[p['desc']]
            if _vacia(c) and _vacia(d):
                continue
            if _vacia(c) or _vacia(d):
                error(f'tramo {n}: falta {"cant" if _vacia(c) else "desc"}_{n} (están de a pares)')
                continue
            desde = _entero(c)
            if desde is None or desde < 1:
                error(f'cant_{n} = {c!r}: tiene que ser un entero mayor o igual a 1')
                continue
            pct = _numero(d)
            if pct is None:
                error(f'desc_{n} = {d!r}: no es un número')
                continue
            if 0 < pct < 1:
                error(f'desc_{n} = {d!r}: parece una celda con formato %; cargar el número (5, no 5 %)')
                continue
            if not 0 < pct < 100:
                error(f'desc_{n} = {d!r}: el porcentaje tiene que ser mayor que 0 y menor que 100')
                continue
            tramos.append((desde, int(pct) if pct == int(pct) else round(pct, 2)))

        tramos.sort()
        cantidades = [t[0] for t in tramos]
        repetidas = sorted({x for x in cantidades if cantidades.count(x) > 1})
        if repetidas:
            error(f'cantidad repetida en los tramos: {", ".join(map(str, repetidas))}')
        bajo_minimo = [x for x in cantidades if x < cantidad_minima]
        if bajo_minimo:
            error(f'tramo desde {", ".join(map(str, bajo_minimo))} por debajo de CANTIDAD_MINIMA ({cantidad_minima})')
        for (c1, d1), (c2, d2) in zip(tramos, tramos[1:]):
            if c2 > c1 and d2 <= d1:
                error(f'el tramo desde {c2} tiene {_fmt_pct(d2)} %, que no es más que el de {c1} ({_fmt_pct(d1)} %)')

        promo = {
            "tipoLista": row['TIPO_LISTA'],
            "precio": precio,
            "cantidadMinima": cantidad_minima,
            "vigencia": row['VIGENCIA_HASTA'],
            "grupos": [g.strip() for g in str(row['GRUPOS']).split('.') if g.strip()]
        }
        if tramos:
            promo["tramos"] = [{"desde": c, "desc": d} for c, d in tramos]
        promotions[code] = promo

    return {"promotions": promotions}, errores


def validar_promociones():
    """
    --validar-promociones: lee excel/PROMOCIONES.xlsx con armar_promociones y
    muestra las filas, los errores y si el resultado es identico al
    json/promociones.json publicado. No escribe nada ni bloquea.
    Codigo 0 si no hay errores.
    """
    df = pd.read_excel('excel/PROMOCIONES.xlsx')
    datos, errores = armar_promociones(df)
    con_tramos = sum(1 for p in datos['promotions'].values() if 'tramos' in p)
    print(f'{len(df)} filas, {len(errores)} errores, {con_tramos} con tramos')
    for e in errores:
        print('  ' + e)
    # Mismo texto que escribiria guardia.escribir_json(..., indent=2)
    nuevo = json.dumps(datos, indent=2)
    try:
        with open('json/promociones.json', encoding='utf-8') as f:
            publicado = f.read()
    except OSError:
        publicado = None
    if publicado is None:
        print('No hay json/promociones.json publicado para comparar')
    elif nuevo == publicado:
        print('Idéntico al json/promociones.json publicado')
    else:
        print('DISTINTO del json/promociones.json publicado' +
              (' (mismo contenido, otro formato)' if json.loads(publicado) == json.loads(nuevo) else ''))
    return 1 if errores else 0


def process_promotions():
    """
    Procesa excel/PROMOCIONES.xlsx y genera json/promociones.json con
    armar_promociones (precio especial a 2 decimales, tramos por cantidad).
    Con un error de carga (tramos, precio especial, codigo repetido) no
    escribe nada: queda el anterior, se muestran los errores con la fila y el
    codigo, y la corrida termina con codigo 1 (guardia.bloquear; --forzar no
    lo saltea). Para revisar el Excel sin escribir: --validar-promociones
    """
    try:
        df = pd.read_excel('excel/PROMOCIONES.xlsx')
        promotions_data, errores = armar_promociones(df)
        if errores:
            for e in errores:
                print('  ' + e)
            guardia.bloquear('promociones.json',
                             f'{len(errores)} error(es) de carga en excel/PROMOCIONES.xlsx (ver arriba)')

        # Guardar JSON
        guardia.escribir_json('json/promociones.json', promotions_data, indent=2)

        print('promociones.json generado exitosamente')

    except guardia.EscrituraBloqueada:
        # La toma update_from_local y la corrida termina con codigo 1
        raise
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

# AGREGUE ESTO- MANEJO CATALOGO GRUPOS, CONVIERTE EXCEL LOCAL A JSON
def process_catalogo_grupos(data):
    """
    Procesa los datos del catálogo de grupos desde Google Sheets.
    Los nombres de grupos se obtienen dinámicamente.
    """
    try:
        json_path = 'json/catalogo_grupos.json'
        catalogo_json = {}

        if 'table' in data and 'rows' in data['table']:
            print('Procesando datos de Google Sheets...')
            
            # Obtener metadata y nombre de la hoja actual
            sheet_name = data.get('table', {}).get('name', '')
            if sheet_name and sheet_name not in catalogo_json:
                catalogo_json[sheet_name] = []
            
            # Procesar filas
            total_rows = len(data['table']['rows'])
            print(f'Total de filas encontradas para {sheet_name}: {total_rows}')
            
            for row in data['table']['rows']:
                if 'c' in row and len(row['c']) > 0 and row['c'][0]:
                    codigo = row['c'][0].get('v', '')
                    if codigo and isinstance(codigo, str):
                        codigo = codigo.strip()
                        if codigo != "Codigo_Producto":  # Ignorar encabezado
                            catalogo_json[sheet_name].append(codigo)

        # Guardar JSON
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        print('Guardando resultados...')
        guardia.escribir_json(json_path, catalogo_json, indent=2, ensure_ascii=False)
            
        # Reporte final
        for grupo, productos in catalogo_json.items():
            print(f'Grupo {grupo}: {len(productos)} productos procesados')
        
        total_productos = sum(len(productos) for productos in catalogo_json.values())
        print(f'''
Proceso completado exitosamente:
- Total de grupos procesados: {len(catalogo_json)}
- Total de productos: {total_productos}
- Archivo guardado en: {json_path}
''')
        
    except Exception as e:
        print(f'Error procesando catálogo de grupos: {str(e)}')
        raise

def process_catalogo_grupos_local():
    """
    Procesa el catálogo de grupos desde Excel local.
    Los nombres de grupos se obtienen de las hojas del Excel.
    """
    try:
        excel_path = 'excel/catalogo_grupos.xlsx'
        json_path = 'json/catalogo_grupos.json'
        
        print('Iniciando procesamiento del catálogo de grupos...')
        excel = pd.ExcelFile(excel_path)
        
        # Obtener nombres de grupos de las hojas
        grupos = excel.sheet_names
        print(f'Se encontraron {len(grupos)} grupos para procesar')
        
        catalogo_json = {}
        
        # Procesar cada grupo (hoja)
        for nombre_grupo in grupos:
            print(f'Procesando grupo: {nombre_grupo}')
            
            # Leer solo la columna necesaria
            df = pd.read_excel(
                excel,
                sheet_name=nombre_grupo,
                usecols=['Codigo_Producto'],
                dtype={'Codigo_Producto': str}
            )
            
            # Procesar y limpiar datos
            productos = (df['Codigo_Producto']
                        .dropna()
                        .str.strip()
                        .unique()
                        .tolist())
            
            catalogo_json[nombre_grupo] = productos
            print(f'  → {len(productos)} productos procesados')

        # Guardar JSON
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        print('Guardando catálogo en JSON...')
        guardia.escribir_json(json_path, catalogo_json, indent=2, ensure_ascii=False)
            
        # Reporte final
        total_productos = sum(len(productos) for productos in catalogo_json.values())
        print(f'''
Proceso completado exitosamente:
- Total de grupos procesados: {len(grupos)}
- Total de productos: {total_productos}
- Archivo guardado en: {json_path}
''')
        
    except Exception as e:
        print(f'Error procesando catálogo de grupos local: {str(e)}')
        raise

#-agregue 20-3-25
def process_image_catalog(data):
    try:
        json_path = 'json/catalogo_imagenes.json'
        
        # Procesar datos nuevos de Google Sheets
        new_images = {}
        if 'table' in data and 'rows' in data['table']:
            for row in data['table']['rows']:
                if 'c' in row and len(row['c']) > 4:
                    codigo = row['c'][4].get('v', '').strip()
                    image_id = row['c'][1].get('v', '').strip()
                    
                    if codigo and image_id:
                        new_images[codigo] = image_id
        
        # Crear nuevo objeto JSON (sin combinar con existente)
        output = {
            "version": "1.0",
            "lastUpdate": datetime.now().isoformat(),
            "totalImages": len(new_images),
            "images": new_images
        }

        print(f"\nActualizando catálogo de imágenes:")
        print(f"- Total de imágenes de Google Sheets: {len(new_images)}")

        # Guardar el archivo
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        guardia.escribir_json(json_path, output, contar=lambda d: len(d.get('images', {})),
                              indent=2, ensure_ascii=False)

        print(f"Catálogo de imágenes actualizado exitosamente")

    except Exception as e:
        print(f"Error detallado: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise

#fin 20-3-25



# Agregar esta función de verificación
def verify_json_file(file_path):
    try:
        print(f"\nVerificando archivo: {file_path}")
        if not os.path.exists(file_path):
            print(f"¡Error! El archivo no existe en: {file_path}")
            return False

        with open(file_path, 'r', encoding='utf-8') as f:
            content = json.load(f)
            print(f"Contenido actual del archivo:")
            print(json.dumps(content, indent=2))
            return True
    except Exception as e:
        print(f"Error verificando archivo: {str(e)}")
        return False

#-agregue 20-3-25

def process_image_catalog_local():
    """Procesa el catálogo de imágenes desde Excel local."""
    try:
        excel_path = 'imagenes_drive.xlsx'  # Ajusta el nombre según tu archivo
        json_path = 'json/catalogo_imagenes.json'
        
        if not os.path.exists(excel_path):
            print(f"Archivo no encontrado: {excel_path}")
            return
            
        # Leer Excel
        df = pd.read_excel(excel_path)
        
        # Crear mapa de imágenes
        new_images = {}
        for _, row in df.iterrows():
            # Usar la columna 'articulo' como código y la columna 'id' como ID de imagen
            codigo = str(row.get('articulo', '')).strip()
            image_id = str(row.get('id', '')).strip()
            
            if codigo and image_id:
                new_images[codigo] = image_id
                
        # Con las mismas imagenes queda el lastUpdate anterior: el archivo sale
        # identico y el workflow de cada hora no lo commitea sin motivo
        ultima = datetime.now().isoformat()
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                anterior = json.load(f)
            if anterior.get('images') == new_images and anterior.get('lastUpdate'):
                ultima = anterior['lastUpdate']
        except (OSError, ValueError):
            pass   # sin archivo anterior (o ilegible): fecha de ahora

        # Crear el objeto de salida directamente con las nuevas imágenes
        output = {
            "version": "1.0",
            "lastUpdate": ultima,
            "totalImages": len(new_images),
            "images": new_images
        }
        
        print(f"\nActualizando catálogo de imágenes (local):")
        print(f"- Total de imágenes desde Excel: {len(new_images)}")
        
        # Guardar JSON
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        guardia.escribir_json(json_path, output, contar=lambda d: len(d.get('images', {})),
                              indent=2, ensure_ascii=False)
            
        print(f'catalogo_imagenes.json generado exitosamente desde Excel local')
            
    except Exception as e:
        print(f'Error procesando catálogo de imágenes local: {str(e)}')

def handle_git_conflicts(file_path):
    """Maneja conflictos de Git en archivos JSON"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Detectar marcadores de conflicto
            if "<<<<<<< HEAD" in content:
                print(f"Detectados conflictos de Git en {file_path}, intentando resolver...")
                
                # Simplemente tomar la versión más reciente (HEAD)
                resolved_content = re.sub(
                    r'<<<<<<< HEAD.*?=======.*?>>>>>>>[^\n]*\n',
                    '',
                    content,
                    flags=re.DOTALL
                )
                
                # Guardar archivo resuelto
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(resolved_content)
                    
                print(f"Conflictos resueltos en {file_path}")
                
    except Exception as e:
        print(f"Error al manejar conflictos: {str(e)}")
#-fin agregue 20-3-25     




# Archivos cuya huella va en json/version.json: el navegador revisa ese archivo
# cada 15 minutos (js/frescura-precios.js) y solo baja el que cambio
HUELLAS_VERSION = (
    ('productos', 'json/productos.json'),               # precios (frescura-precios.js)
    ('catalogo_grupos', 'json/catalogo_grupos.json'),   # destacados (destacados.js)
    ('promociones', 'json/promociones.json'),           # promociones (promociones.js)
    ('grupos_clientes', 'json/grupos_clientes.json'),   # grupo del cliente, para sus promociones (promociones.js)
    ('imagenes', 'json/catalogo_imagenes.json'),        # fotos (frescura-imagenes.js)
)


def huella_de(clave, ruta):
    """
    Huella del contenido, la misma en Windows y en GitHub. La rutina en Windows
    escribe los JSON con CRLF y git los guarda (y GitHub los calcula) con LF:
    con la huella de los bytes tal cual, cada publicacion desde Windows la daba
    vuelta y el bot la volvia a dar vuelta, sin que cambiara nada, y cada
    pestaña abierta volvia a bajar productos.json. Por eso se cuenta en LF.
    imagenes: solo el mapa codigo -> id, sin lastUpdate (la fecha no es una foto).
    """
    with open(ruta, 'rb') as f:
        datos = f.read()
    if clave == 'imagenes':
        images = json.loads(datos.decode('utf-8')).get('images', {})
        datos = json.dumps(images, sort_keys=True, ensure_ascii=False).encode('utf-8')
    return hashlib.sha256(datos.replace(b'\r\n', b'\n')).hexdigest()[:16]


def escribir_version():
    """
    json/version.json: huella de cada archivo de HUELLAS_VERSION (huella_de),
    para que el navegador detecte que cambiaron sin descargarlos completos. El
    'generado' de cada uno solo cambia si cambia su contenido: el workflow
    corre cada hora y solo commitea si hay cambios. Conserva las demas claves
    (indice, de generar_indice_busqueda.py; app, de version_app.py).
    """
    ruta_version = 'json/version.json'
    anterior = {}
    if os.path.exists(ruta_version):
        try:
            with open(ruta_version, 'r', encoding='utf-8') as f:
                anterior = json.load(f)
        except Exception:
            anterior = {}

    cambios = []
    for clave, ruta in HUELLAS_VERSION:
        if not os.path.exists(ruta):
            continue
        huella = huella_de(clave, ruta)
        if anterior.get(clave, {}).get('huella') == huella:
            continue   # sin cambios: queda su 'generado'
        anterior[clave] = {
            'huella': huella,
            'generado': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        }
        cambios.append(f'{clave} {huella}')

    if not cambios:
        return   # sin cambios: no tocar el archivo
    with open(ruta_version, 'w', encoding='utf-8') as f:
        json.dump(anterior, f, indent=2)
    print('version.json actualizado: ' + ', '.join(cambios))


def main():
    """Función principal: catálogo desde los Excel locales, márgenes desde Google Sheets"""
    print('Iniciando actualización de JSONs')
    if not verify_json_file('json/catalogo_imagenes.json'):  # Pasamos la ruta del archivo
        print("Error: No se puede escribir en el directorio json")
        return
    # Los datos del catalogo salen de los Excel de excel/: las planillas de Sheets
    # de productos, grupos, promociones y clientes quedaron viejas o de prueba.
    # De Sheets solo se leen los margenes (respuestas del formulario)
    update_from_local()
    update_margenes_from_sheets()

    # El navegador la usa para saber si tiene que actualizar los precios, los
    # destacados, las promociones, los grupos de clientes y las fotos
    try:
        escribir_version()
    except Exception as e:
        print(f'Error escribiendo version.json: {e}')

if __name__ == "__main__":
    import sys
    if '--solo-imagenes' in sys.argv:
        print('Modo: solo actualización de catálogo de imágenes')
        process_image_catalog_local()
        # La huella de las fotos en version.json: las pestañas abiertas las ven
        try:
            escribir_version()
        except Exception as e:
            print(f'Error escribiendo version.json: {e}')
    elif '--validar-promociones' in sys.argv:
        # Solo lee y muestra: no escribe ningun archivo
        sys.exit(validar_promociones())
    else:
        main()
    # Si algun archivo no se escribio para no pisar datos buenos: codigo 1
    guardia.terminar_si_hubo_bloqueos()