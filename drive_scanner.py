from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pandas as pd
import os.path
import pickle

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
                articulo = nombre_archivo.split('.')[0] if '.' in nombre_archivo else nombre_archivo
    
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

# Uso del script
ID_CARPETA = '1cBGnmG32LEJe1IOhhueV1hW-Qk1tdnDS'  # ID de la carpeta de Google Drive
archivo_excel = escanear_carpeta(ID_CARPETA)