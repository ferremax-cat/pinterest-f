import pandas as pd
import json
import sys
from pathlib import Path

# Antes de pisar el JSON, comparar la cantidad de clientes (ver guardia_registros.py)
try:
    import guardia_registros as guardia
except ImportError:
    from scripts import guardia_registros as guardia

def limpiar_moneda(valor):
    """Convierte valor monetario a número"""
    if pd.isna(valor):
        return 0
    if isinstance(valor, str):
        # Quitar $, espacios, puntos de miles
        valor = valor.replace('$', '').replace(' ', '').replace('.', '').replace(',', '.')
        # Convertir - al inicio
        if valor.startswith('-'):
            return -float(valor[1:])
        return float(valor)
    return float(valor)

def formatear_fecha(valor):
    """Convierte fecha a formato dd/mm/yyyy"""
    if pd.isna(valor):
        return ""
    
    try:
        # Si es datetime de pandas
        if isinstance(valor, pd.Timestamp):
            return valor.strftime('%d/%m/%Y')
        # Si es string, intentar parsear
        elif isinstance(valor, str):
            # Ya está en formato correcto
            if '/' in valor:
                return valor
            # Intentar parsear otros formatos
            fecha = pd.to_datetime(valor)
            return fecha.strftime('%d/%m/%Y')
        else:
            return ""
    except:
        return ""

RAIZ = Path(__file__).resolve().parent.parent


def texto(valor):
    """Celda de texto: '' si esta vacia, sin espacios de mas"""
    return '' if pd.isna(valor) else str(valor).strip()


def nombres_de(clientes):
    """clientes_nombres.json: de cada cliente, SOLO nombre y sigla del vendedor.
    Ningun dato financiero: lo baja cualquiera (la entrega especial, "despues
    de quien", y despues el buscador de clientes)"""
    return {"clientes": {cuenta: {"nombre": texto(c["nombre"]), "vendedor": texto(c["vendedor"])}
                         for cuenta, c in clientes.items()}}


def main():
    convertir(RAIZ / 'excel' / 'clientes_finanzas.xlsx', RAIZ / 'json')


def convertir(excel_path, carpeta_json):
    """Lee el Excel de finanzas y escribe, de la misma lista de clientes,
    clientes_finanzas.json y clientes_nombres.json: los dos o ninguno
    (guardia.escribir_jsons). Termina con sys.exit(1) si algo falla"""
    print("\n" + "="*60)
    print("📄 CONVERTIDOR: clientes_finanzas.xlsx → JSON (finanzas y nombres)")
    print("="*60 + "\n")

    # Rutas
    excel_path = Path(excel_path)
    json_path = Path(carpeta_json) / 'clientes_finanzas.json'
    nombres_path = Path(carpeta_json) / 'clientes_nombres.json'

    print(f"📂 Leyendo: {excel_path}")
    
    # Leer Excel
    try:
        df = pd.read_excel(excel_path)
    except FileNotFoundError:
        print(f"❌ ERROR: No se encontró el archivo {excel_path}")
        sys.exit(1)
    
    print(f"✅ Leídas {len(df)} filas")
    
    # Crear diccionario de clientes
    clientes = {}
    
    for _, row in df.iterrows():
        cuenta = str(int(row['Cliente_ID']))
        
        clientes[cuenta] = {
            "nombre": row['Nombre_Cliente'],
            "numero_cuenta": cuenta,
            "vendedor": row['Vendedor'],
            "pgProm3M": limpiar_moneda(row['PG_Prom_3M']),
            "comproMes": limpiar_moneda(row['CP_Este_Mes']),
            "saldoTotal": limpiar_moneda(row['Saldo_Total']),
            "pagoMes": limpiar_moneda(row['PG_Este_Mes']),
            "cupoMes": limpiar_moneda(row['Cupo_Mes']),
            "ultOperacion": formatear_fecha(row['Ult_Operacion'])  # ⭐ NUEVA LÍNEA
        }
    
    # Guardar JSON
    output = {"clientes": clientes}

    json_path.parent.mkdir(exist_ok=True)

    # Verificar si existe y avisar
    if json_path.exists():
        print(f"⚠️  Sobrescribiendo archivo existente: {json_path}")

    try:
        # Los dos de la misma lista, o ninguno: con muchos menos clientes que el
        # actual (el Excel vino incompleto) no se escribe ninguno, y si falla la
        # escritura de uno quedan los dos anteriores. Asi la app (nombres) y el
        # servidor (hoja finanzas, desde clientes_finanzas.json) ven los mismos
        guardia.escribir_jsons([
            (json_path, output, {'ensure_ascii': False, 'indent': 2}),
            (nombres_path, nombres_de(clientes), {'ensure_ascii': False, 'indent': 2}),
        ])

        # Verificar que se guardaron correctamente
        for ruta in (json_path, nombres_path):
            with open(ruta, 'r', encoding='utf-8') as f:
                clientes_guardados = len(json.load(f).get('clientes', {}))
            print(f"✅ Guardado: {ruta}")
            print(f"✅ Verificado: {clientes_guardados} clientes en el archivo")
            if clientes_guardados != len(clientes):
                print(f"⚠️  ADVERTENCIA: Se esperaban {len(clientes)} pero hay {clientes_guardados}")

    except guardia.EscrituraBloqueada:
        sys.exit(1)   # ya se aviso: quedaron los dos JSON anteriores
    except PermissionError:
        print(f"❌ ERROR: No se puede escribir el archivo (puede estar abierto en otro programa)")
        print(f"   Cierra {json_path.name} y {nombres_path.name} y vuelve a ejecutar el script")
        sys.exit(1)
    except Exception as e:
        print(f"❌ ERROR al guardar: {e}")
        sys.exit(1)

    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    main()