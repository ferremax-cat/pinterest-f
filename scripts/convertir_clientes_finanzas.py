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

def main():
    print("\n" + "="*60)
    print("📄 CONVERTIDOR: clientes_finanzas.xlsx → JSON")
    print("="*60 + "\n")
    
    # Rutas
    excel_path = Path(__file__).parent.parent / 'excel' / 'clientes_finanzas.xlsx'
    json_path = Path(__file__).parent.parent / 'json' / 'clientes_finanzas.json'
    
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
        # Con muchos menos clientes que el actual, el Excel vino incompleto
        guardia.escribir_json(json_path, output, ensure_ascii=False, indent=2)

        # Verificar que se guardó correctamente
        with open(json_path, 'r', encoding='utf-8') as f:
            verificacion = json.load(f)
            clientes_guardados = len(verificacion.get('clientes', {}))
        
        print(f"✅ Guardado: {json_path}")
        print(f"✅ Verificado: {clientes_guardados} clientes en el archivo")
        
        if clientes_guardados != len(clientes):
            print(f"⚠️  ADVERTENCIA: Se esperaban {len(clientes)} pero hay {clientes_guardados}")

    except guardia.EscrituraBloqueada:
        sys.exit(1)   # ya se aviso: quedo el JSON anterior
    except PermissionError:
        print(f"❌ ERROR: No se puede escribir el archivo (puede estar abierto en otro programa)")
        print(f"   Cierra el archivo {json_path.name} y vuelve a ejecutar el script")
        sys.exit(1)
    except Exception as e:
        print(f"❌ ERROR al guardar: {e}")
        sys.exit(1)

    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    main()