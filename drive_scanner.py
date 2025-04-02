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


def escanear_carpeta(carpeta_id):
    credenciales = obtener_credenciales()
    service = build('drive', 'v3', credentials=credenciales)
    
    resultados = []
    page_token = None
    
    while True:
        try:
            # Buscar archivos en la carpeta especificada
            response = service.files().list(
                q=f"'{carpeta_id}' in parents and (mimeType contains 'image/')",
                spaces='drive',
                fields='nextPageToken, files(id, name, webViewLink)',
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
                
            page_token = response.get('nextPageToken', None)
            if page_token is None:
                break
                
        except Exception as e:
            print(f'Ocurrió un error: {e}')
            break
    
    # Crear DataFrame y exportar a Excel
    df = pd.DataFrame(resultados)
    df.to_excel('imagenes_drive.xlsx', index=False)
    print(f'Se encontraron {len(resultados)} imágenes')
    return 'imagenes_drive.xlsx'

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
    dimensiones = {
        "version": "1.0",
        "lastUpdate": datetime.now().isoformat(),
        "images_dimensions": {}
    }
    
    # Obtener el diccionario de imágenes
    images_dict = catalog.get('images', {})
    total_images = len(images_dict)
    
    print(f"Procesando {total_images} imágenes para obtener dimensiones...")
    
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

# Uso del script
ID_CARPETA = '1cBGnmG32LEJe1IOhhueV1hW-Qk1tdnDS'  # ID de la carpeta de Google Drive
archivo_excel = escanear_carpeta(ID_CARPETA)

#AGREUE 25-3-25
# Agregar esta línea para ejecutar el nuevo método
print("\nGenerando archivo de dimensiones de imágenes...")
generar_json_dimensiones_rapido()