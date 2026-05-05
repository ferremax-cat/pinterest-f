from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pandas as pd
import os.path
import pickle

import sys
sys.path.append(r'C:\Users\herna\AppData\Roaming\Python\Python312\site-packages')

import requests
from datetime import datetime
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


TIMESTAMP_FILE = './json/ultimo_scan.json'

def cargar_ultimo_timestamp():
    # Si el archivo no existe, es el primer escaneo: traemos todo
    if not os.path.exists(TIMESTAMP_FILE):
        return None
    with open(TIMESTAMP_FILE, 'r') as f:
        data = json.load(f)
    # Devuelve el string de fecha guardado, ej: "2025-04-29T14:41:23.847Z"
    return data.get('ultimo_modified_time', None)

def guardar_ultimo_timestamp(timestamp_str):
    # Guarda el modifiedTime más reciente encontrado en Drive
    with open(TIMESTAMP_FILE, 'w') as f:
        json.dump({'ultimo_modified_time': timestamp_str}, f, indent=2)
    print(f"Timestamp guardado: {timestamp_str}")

# def obtener_credenciales():
#     credenciales = None
#     # Verificar si ya existen tokens guardados
#     if os.path.exists('token.pickle'):
#         with open('token.pickle', 'rb') as token:
#             credenciales = pickle.load(token)
    
#     # Si no hay credenciales válidas, hacer login
#     if not credenciales or not credenciales.valid:
#         if credenciales and credenciales.expired and credenciales.refresh_token:
#             credenciales.refresh(Request())
#         else:
#             flow = InstalledAppFlow.from_client_secrets_file(
#                 'credentials.json', SCOPES)
#             credenciales = flow.run_local_server(port=0)
        
#         # Guardar credenciales para la próxima vez
#         with open('token.pickle', 'wb') as token:
#             pickle.dump(credenciales, token)
    
#     return credenciales

def obtener_credenciales():
    credenciales = None
    # Verificar si ya existen tokens guardados
    if os.path.exists('token.pickle'):
        try:
            with open('token.pickle', 'rb') as token:
                credenciales = pickle.load(token)
            
            # Intentar refrescar si han expirado
            if credenciales and credenciales.expired and credenciales.refresh_token:
                try:
                    credenciales.refresh(Request())
                except:
                    # Si falla el refresco, eliminar el token y forzar nueva autenticación
                    credenciales = None
                    os.remove('token.pickle')
                    print("Token inválido eliminado, se solicitará nueva autenticación")
        except:
            # En caso de problemas con el archivo token.pickle
            credenciales = None
    
    # Si no hay credenciales válidas, hacer login
    if not credenciales:
        flow = InstalledAppFlow.from_client_secrets_file(
            'credentials.json', SCOPES)
        credenciales = flow.run_local_server(port=0)
        
        # Guardar credenciales para la próxima vez
        with open('token.pickle', 'wb') as token:
            pickle.dump(credenciales, token)
    
    return credenciales


def escanear_carpeta(carpeta_id, verificar_eliminaciones=False):
    credenciales = obtener_credenciales()
    service = build('drive', 'v3', credentials=credenciales)
    
    resultados = []

    ultimo_timestamp = cargar_ultimo_timestamp()
    nuevo_timestamp = None  # Aquí iremos guardando el modifiedTime más reciente que encontremos

    # Construir el filtro de fecha para la query de Drive
    # Si hay timestamp previo, traemos solo archivos modificados DESDE ese momento
    if ultimo_timestamp:
        filtro_fecha = f" and modifiedTime >= '{ultimo_timestamp}'"
        print(f"Escaneo incremental desde: {ultimo_timestamp}")
    else:
        filtro_fecha = ""
        print("Primer escaneo: procesando todas las imágenes")

    page_token = None
    
    while True:
        try:
            # Buscar archivos en la carpeta especificada
            response = service.files().list(
                q=f"'{carpeta_id}' in parents and (mimeType contains 'image/'){filtro_fecha}",
                spaces='drive',
                fields='nextPageToken, files(id, name, webViewLink, modifiedTime)',
                pageToken=page_token
            ).execute()
            
            for archivo in response.get('files', []):
                #agregue 20-3-25
                # Extraer el nombre del archivo sin la extensión
                nombre_archivo = archivo['name']
                #articulo = nombre_archivo.split('.')[0] if '.' in nombre_archivo else nombre_archivo
    
                # Manejar archivos con múltiples puntos (como TF.414.png)
                # Esto elimina solo la extensión del archivo, no todos los puntos
                if '.' in nombre_archivo:
                    # Encontrar la última ocurrencia del punto
                    ultimo_punto = nombre_archivo.rfind('.')
                    articulo = nombre_archivo[:ultimo_punto]
                else:
                    articulo = nombre_archivo

                #fin 20-3-25

                resultados.append({
                    'nombre': archivo['name'],
                    'id': archivo['id'],
                    'link_original': archivo['webViewLink'],
                    'link_vista': f"https://drive.google.com/uc?export=view&id={archivo['id']}",
                    'articulo': articulo # Nueva columna con el nombre sin extensión
                })

                # Rastrear el modifiedTime más reciente de este escaneo
                mod_time = archivo.get('modifiedTime')
                if mod_time:
                    if nuevo_timestamp is None or mod_time > nuevo_timestamp:
                        # Comparación de strings ISO 8601: funciona correctamente por su formato
                        nuevo_timestamp = mod_time
                
            page_token = response.get('nextPageToken', None)
            if page_token is None:
                break
                
        except Exception as e:
            print(f'Ocurrió un error: {e}')
            break
    
    # Crear DataFrame y exportar a Excel
    excel_path = 'imagenes_drive.xlsx'
    
    if ultimo_timestamp and resultados:
        if os.path.exists(excel_path):
            df_existente = pd.read_excel(excel_path)
            df_nuevos = pd.DataFrame(resultados)
            df_combinado = pd.concat([df_existente, df_nuevos], ignore_index=True)
            df_combinado.drop_duplicates(subset='id', keep='last', inplace=True)
            df_combinado.to_excel(excel_path, index=False)
            print(f"Se agregaron/actualizaron {len(resultados)} imágenes. Total: {len(df_combinado)}")
        else:
            pd.DataFrame(resultados).to_excel(excel_path, index=False)
            print(f"Se encontraron {len(resultados)} imágenes (nuevo archivo)")
    elif not ultimo_timestamp:
        pd.DataFrame(resultados).to_excel(excel_path, index=False)
        print(f"Escaneo completo: {len(resultados)} imágenes guardadas")
    else:
        print("No se encontraron imágenes nuevas desde el último escaneo")
    
    if nuevo_timestamp:
        guardar_ultimo_timestamp(nuevo_timestamp)
    
    
    if verificar_eliminaciones and os.path.exists(excel_path):
        print("\nVerificando imágenes eliminadas de Drive...")
        ids_activos = obtener_ids_activos_drive(service, carpeta_id)
        df_actual = pd.read_excel(excel_path)
        total_antes = len(df_actual)
        df_limpio = df_actual[df_actual['id'].isin(ids_activos)]
        eliminados = total_antes - len(df_limpio)
        if eliminados > 0:
            df_limpio.to_excel(excel_path, index=False)
            print(f"Se eliminaron {eliminados} imágenes que ya no existen en Drive. Total: {len(df_limpio)}")
        else:
            print("No se detectaron imágenes eliminadas")

    return excel_path

def obtener_ids_activos_drive(service, carpeta_id):
    """
    Trae SOLO los IDs de todas las imágenes activas en Drive.
    No trae nombre ni links - es la consulta más liviana posible.
    """
    ids_activos = set()
    page_token = None

    while True:
        try:
            response = service.files().list(
                q=f"'{carpeta_id}' in parents and (mimeType contains 'image/')",
                spaces='drive',
                fields='nextPageToken, files(id)',
                pageToken=page_token
            ).execute()

            for archivo in response.get('files', []):
                ids_activos.add(archivo['id'])

            page_token = response.get('nextPageToken', None)
            if page_token is None:
                break

        except Exception as e:
            print(f'Error obteniendo IDs activos: {e}')
            break

    print(f"IDs activos en Drive: {len(ids_activos)}")
    return ids_activos

#AGREGUE 25-3-25
# Añadir este nuevo método al final, antes del código de ejecución
def generar_json_dimensiones_rapido():
    """
    Genera un archivo JSON con dimensiones de imágenes usando
    procesamiento paralelo para máxima velocidad
    """
    # Rutas de archivos
    catalogo_path = './json/catalogo_imagenes.json'
    dimensiones_path = './json/catalogo_dimensiones.json'
    
    # Verificar si existe el catálogo
    if not os.path.exists(catalogo_path):
        print(f"Error: No se encontró el archivo {catalogo_path}")
        return False
    
    # Cargar catálogo existente
    with open(catalogo_path, 'r', encoding='utf-8') as file:
        catalog = json.load(file)
    
    # Preparar estructura para el archivo de dimensiones
    # Cargar dimensiones existentes si ya hay un archivo previo
    if os.path.exists(dimensiones_path):
        with open(dimensiones_path, 'r', encoding='utf-8') as file:
            dimensiones = json.load(file)
        print(f"Dimensiones existentes cargadas: {len(dimensiones['images_dimensions'])} imágenes ya procesadas")
    else:
        dimensiones = {
            "version": "1.0",
            "lastUpdate": datetime.now().isoformat(),
            "images_dimensions": {}
        }
    
    # Obtener el diccionario de imágenes
    images_dict = catalog.get('images', {})
    
    # Filtrar solo las imágenes que NO están en el archivo de dimensiones
    ya_procesadas = set(dimensiones['images_dimensions'].keys())
    images_dict = {k: v for k, v in images_dict.items() if k not in ya_procesadas}
    total_images = len(images_dict)
    
    if total_images == 0:
        print("No hay imágenes nuevas para procesar en dimensiones")
        return True
    
    print(f"Imágenes nuevas a procesar: {total_images} imágenes para obtener dimensiones...")
    
    
    
    # Función para procesar una imagen individual
    def procesar_imagen(code, drive_id):
        try:
            # URL de la imagen
            image_url = f"https://lh3.googleusercontent.com/d/{drive_id}"
            
            # Hacer una solicitud HEAD para obtener solo los metadatos
            # Si esto no funciona, podemos usar valores predeterminados
            # o estimaciones basadas en proporción común
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.head(image_url, headers=headers, timeout=3)
            
            # Valores predeterminados basados en proporciones comunes
            # Estas relaciones de aspecto son muy comunes en fotografías
            ratios_comunes = [1.33, 1.5, 1.78, 0.75, 1.0] 
            
            # Para el propósito de un layout de tipo Pinterest, 
            # lo importante es la proporción, no el tamaño real
            width = 800
            height = int(width / ratios_comunes[code.__hash__() % len(ratios_comunes)])
            ratio = width / height
            
            # Intento adivinando por tipo de contenido
            content_type = response.headers.get('Content-Type', '')
            if 'image' in content_type:
                # Las imágenes pequeñas suelen ser iconos (relación 1:1)
                # Las grandes suelen ser fotos de productos (proporción 4:3 o 16:9)
                content_length = int(response.headers.get('Content-Length', '0'))
                if content_length < 10000:  # Es un icono pequeño
                    ratio = 1.0 
                elif content_length > 100000:  # Es una imagen grande
                    ratio = 1.78  # 16:9
                else:  # Imagen de tamaño medio
                    ratio = 1.33  # 4:3
                    
                height = int(width / ratio)
            
            return code, {
                "width": width,
                "height": height,
                "ratio": round(ratio, 3)
            }
            
        except Exception as e:
            print(f"Error procesando {code}: {str(e)}")
            # Valores predeterminados en caso de error
            return code, {
                "width": 800,
                "height": 600,
                "ratio": 1.333
            }
    
    # Usar procesamiento paralelo con múltiples hilos
    max_workers = min(32, os.cpu_count() * 4)  # Ajustar según capacidad
    print(f"Usando {max_workers} workers para procesamiento en paralelo")
    
    completed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Crear tareas para cada imagen
        futures = {executor.submit(procesar_imagen, code, drive_id): code 
                  for code, drive_id in images_dict.items()}
        
        # Procesar resultados a medida que se completan
        for future in as_completed(futures):
            code, dims = future.result()
            dimensiones["images_dimensions"][code] = dims
            
            completed += 1
            if completed % 50 == 0 or completed == total_images:
                print(f"Progreso: {completed}/{total_images} imágenes procesadas ({int(completed/total_images*100)}%)")
    
    # Guardar el archivo de dimensiones
    os.makedirs(os.path.dirname(dimensiones_path), exist_ok=True)
    with open(dimensiones_path, 'w', encoding='utf-8') as file:
        json.dump(dimensiones, file, indent=2)
    print(f"Archivo de dimensiones generado con éxito: {dimensiones_path}")
    
    return True


def generar_posiciones_bottom_completo():
    """
    Toma el archivo catalogo_dimensiones.json generado por generar_json_dimensiones_rapido()
    y le agrega los campos de posicionamiento del bottom-row
    """
    dimensiones_path = './json/catalogo_dimensiones.json'
    
    # Verificar que existe el archivo base
    if not os.path.exists(dimensiones_path):
        print(f"Error: No se encontró {dimensiones_path}")
        return False
    
    # Cargar dimensiones existentes
    with open(dimensiones_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    
    # Función para calcular posiciones (igual que la de JavaScript)
    def calculate_bottom_positions(width, height, ratio):
        # Determinar tipo de imagen
        if ratio >= 1.6:
            image_type = 'very_horizontal'
        elif ratio >= 1.2:
            image_type = 'horizontal'
        elif ratio >= 0.8:
            image_type = 'square'
        else:
            image_type = 'vertical'
        
        # Tabla de valores
        bottom_values = {
            'very_horizontal': {'mobile': 50, 'tablet': 65, 'desktop': 75},
            'horizontal':      {'mobile': 55, 'tablet': 64, 'desktop': 74},
            'square':          {'mobile': 52, 'tablet': 62, 'desktop': 72},
            'vertical':        {'mobile': 48, 'tablet': 58, 'desktop': 68}
        }
        
        return {
            'imageType': image_type,
            'bottomPosition': bottom_values[image_type]
        }
    
    # Procesar cada imagen
    processed_count = 0
    for code, dims in data['images_dimensions'].items():
        # Calcular posiciones
        positions = calculate_bottom_positions(dims['width'], dims['height'], dims['ratio'])
        
        # Agregar nuevos campos
        dims['imageType'] = positions['imageType']
        dims['bottomPosition'] = positions['bottomPosition']
        dims['autoGenerated'] = True
        dims['lastCalculated'] = datetime.now().isoformat()
        
        processed_count += 1
    
    # Actualizar metadatos
    data['version'] = '2.0'
    data['lastUpdate'] = datetime.now().isoformat()
    data['description'] = 'Catálogo con dimensiones y posiciones de bottom-row calculadas automáticamente'
    
    # Guardar archivo actualizado
    with open(dimensiones_path, 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=2)
    
    print(f"✅ Posiciones calculadas para {processed_count} imágenes")
    print(f"✅ Archivo actualizado: {dimensiones_path}")
    return True

# Uso del script
ID_CARPETA = '1cBGnmG32LEJe1IOhhueV1hW-Qk1tdnDS'  # ID de la carpeta de Google Drive
import sys
limpiar = '--limpiar' in sys.argv
archivo_excel = escanear_carpeta(ID_CARPETA, limpiar)

#AGREUE 25-3-25
# Agregar esta línea para ejecutar el nuevo método
print("\nGenerando archivo de dimensiones de imágenes...")
generar_json_dimensiones_rapido()

# AGREGAR AQUÍ - NUEVA FUNCIÓN
print("\nGenerando posiciones de bottom-row automáticamente...")
generar_posiciones_bottom_completo()

# FIN DEL ARCHIVO