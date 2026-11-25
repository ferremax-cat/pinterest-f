import pandas as pd
import json
import numbers
import sys
from datetime import date, datetime, timedelta
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

# Numero de serie de Excel: dias desde el 30/12/1899 (1 = 01/01/1900,
# 2958465 = 31/12/9999)
EPOCA_EXCEL = datetime(1899, 12, 30)
SERIE_MAX = 2958465

# Aviso si, de los clientes con algo en Ult_Operacion, al menos esta
# proporcion queda con ultOperacion vacio (dato que no se entiende como fecha)
UMBRAL_FECHAS_PERDIDAS = 0.10


def formatear_fecha(valor):
    """Convierte fecha a formato dd/mm/yyyy (el texto que leen la app y la planilla)"""
    if pd.isna(valor):
        return ""

    try:
        # Fecha: pd.Timestamp si toda la columna es de fechas, datetime.datetime
        # si alguna celda no lo es (pandas deja la columna como object). Las dos
        # son datetime: mismo formato
        if isinstance(valor, (datetime, date)):
            return valor.strftime('%d/%m/%Y')
        # Numero: fecha guardada como numero de serie de Excel (celda sin
        # formato de fecha; en esta columna cualquier numero es una fecha)
        if isinstance(valor, numbers.Real) and not isinstance(valor, bool):
            if 1 <= valor <= SERIE_MAX:
                return (EPOCA_EXCEL + timedelta(days=int(valor))).strftime('%d/%m/%Y')
            return ""
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


def avisar_fechas_perdidas(df, clientes):
    """Aviso por la salida de error (no bloquea: la rutina lo muestra en su
    resumen) si una proporcion alta de los clientes con algo en Ult_Operacion
    quedo con ultOperacion vacio: el Excel trae datos que no se entienden como
    fecha. Devuelve el texto del aviso, o None"""
    con_dato = perdidas = 0
    ejemplos = []
    for _, row in df.iterrows():
        if pd.isna(row['Ult_Operacion']):
            continue
        con_dato += 1
        cuenta = str(int(row['Cliente_ID']))
        if clientes[cuenta]['ultOperacion'] == '':
            perdidas += 1
            if len(ejemplos) < 5:
                ejemplos.append(cuenta)
    if not con_dato or perdidas < UMBRAL_FECHAS_PERDIDAS * con_dato:
        return None
    aviso = (f"AVISO: ultOperacion quedó vacío en {perdidas} de {con_dato} clientes que tienen "
             f"Ult_Operacion en el Excel ({perdidas / con_dato:.0%}): esa columna trae datos que no "
             f"se entienden como fecha (la barra de salud financiera muestra --/--/----). Revisá el "
             f"formato de Ult_Operacion en clientes_finanzas.xlsx. Cuentas, por ejemplo: {', '.join(ejemplos)}")
    print(aviso, file=sys.stderr, flush=True)
    return aviso


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
            # Sin nombre: texto vacio (no NaN, que no es texto ni JSON valido)
            "nombre": '' if pd.isna(row['Nombre_Cliente']) else row['Nombre_Cliente'],
            "numero_cuenta": cuenta,
            # Sin vendedor: texto vacio, igual que nombre
            "vendedor": '' if pd.isna(row['Vendedor']) else row['Vendedor'],
            "pgProm3M": limpiar_moneda(row['PG_Prom_3M']),
            "comproMes": limpiar_moneda(row['CP_Este_Mes']),
            "saldoTotal": limpiar_moneda(row['Saldo_Total']),
            "pagoMes": limpiar_moneda(row['PG_Este_Mes']),
            "cupoMes": limpiar_moneda(row['Cupo_Mes']),
            "ultOperacion": formatear_fecha(row['Ult_Operacion'])  # ⭐ NUEVA LÍNEA
        }
    
    # Fechas perdidas en silencio: aviso, no bloqueo
    sys.stdout.flush()
    avisar_fechas_perdidas(df, clientes)

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