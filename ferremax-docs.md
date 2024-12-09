# Documentación Sistema de Catálogo Ferremax

## 1. Estructura de Archivos Excel

### PRODUCTOS.xlsx 
Actualización semanal automática del catálogo principal
```
Columnas:
- CODIGO: Identificador único del producto (ej: QUI2700-00100)
- ARTICULO: Nombre/descripción del producto
- RUBRO: Categoría principal (ej: PINTURAS)
  FUNCION: SE PEGA EN EXCEL =SI(O(VALOR(IZQUIERDA(C2;1))=1;VALOR(IZQUIERDA(C2;1))=2;VALOR(IZQUIERDA(C2;1))=3);"SANITARIOS";I(O(VALOR(IZQUIERDA(C2;1))=4;VALOR(IZQUIERDA(C2;1))=5);"REPUESTOS";
  SI(VALOR(IZQUIERDA(C2;1))=6;"BULONERIA";SI(VALOR(IZQUIERDA(C2;1))=7;"PINTURAS";SI(VALOR(IZQUIERDA(C2;1))=8;"FERRETERIA";SI(VALOR(IZQUIERDA(C2;1))=9;"ELECTRICIDAD";""))))))
- BULTO: Cantidad por bulto
- P_LISTA_D: Precio Lista D
- P_LISTA_E: Precio Lista E
- P_LISTA_F: Precio Lista F

```

### CLIENTES_PERMISOS.xlsx
Gestión de accesos y configuración por cliente
```
Columnas:
- CUENTA: Código único del cliente (ej: ACC123)
- NOMBRE: Nombre del cliente
- CATEGORIAS: Categorías permitidas (ej: PINTURAS,HERRAMIENTAS)
- LISTA_PRECIOS: Lista asignada (D, E, F)
```

### GRUPOS_CLIENTES.xlsx
Define grupos para aplicar promociones masivas
```
Columnas:
- NOMBRE_GRUPO: Nombre identificador del grupo (ej: GRUPO PINTURAS)
- CLIENTES: Lista de códigos de clientes separados por coma
```

### PROMOCIONES.xlsx
Gestión de precios especiales por grupos
```
Columnas:
- CODIGO_PRODUCTO: Código del producto en promoción
- TIPO_LISTA: Lista base del precio (D, E, F)
- PRECIO_ESPECIAL: Precio promocional
- VIGENCIA_HASTA: Fecha fin de promoción
- GRUPOS: Grupos a los que aplica, separados por coma
```

## 2. Estructura de JSONs

### products.json
```javascript
{
  "details": {
    "QUI2700-00100": {
      "name": "BARNIZ MARINO BRILLANTE",
      "category": "PINTURAS",
      "bulk": 6,
      "prices": {
        "D": 9846.988,
        "E": 8862.289,
        "F": 7889.590
      }
    }
  }
}
```

### clients.json
```javascript
{
  "ACC123": {
    "name": "Cliente A",
    "categories": ["PINTURAS", "HERRAMIENTAS"],
    "priceList": "D"
  }
}
```

### groups.json
```javascript
{
  "groups": {
    "GRUPO PINTURAS": ["ACC123", "ACC456", "ACC789"],
    "GRUPO PREMIUM": ["ACC123", "ACC789"],
    "GRUPO FERRETES": ["ACC111", "ACC222", "ACC333"]
  }
}
```

### promotions.json
```javascript
{
  "promotions": {
    "QUI2700-00100": {
      "specialPrice": 8500.00,
      "priceList": "E",
      "validUntil": "2024-02-01",
      "availableGroups": ["GRUPO PINTURAS", "GRUPO PREMIUM"]
    }
  }
}
```

## 3. Automatización Server-Side

### GitHub Action
```yaml
name: Update JSONs
on:
  push:
    paths:
      - 'excel/*.xlsx'
    branches:
      - main

jobs:
  convert-excel-to-json:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.x'
          
      - name: Install dependencies
        run: |
          pip install pandas openpyxl
          
      - name: Convert Excel to JSON
        run: python scripts/excel_to_json.py
        
      - name: Commit JSON files
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add json/*.json
          git commit -m "Update JSONs from Excel"
          git push
```

### Script de Conversión (excel_to_json.py)
```python
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
```

## 4. Implementación Client-Side

### Inicialización y Login
```javascript
class CatalogApp {
    constructor() {
        this.initializeCache();
        this.setupServiceWorker();
        this.checkForUpdates();
    }

    async handleLogin(accountCode, password) {
        const clientData = await this.validateClient(accountCode);
        if (!clientData) return false;

        await this.initializeClientData(accountCode);
        return true;
    }

    async initializeClientData(accountCode) {
        const [products, promotions, permissions] = await Promise.all([
            this.fetchAndStoreProducts(),
            this.fetchAndStorePromotions(),
            this.fetchClientPermissions(accountCode)
        ]);

        localStorage.setItem('clientData', JSON.stringify({
            timestamp: Date.now(),
            products,
            promotions,
            permissions
        }));
    }
}
```

### Caché y Actualizaciones
```javascript
class CacheManager {
    constructor() {
        this.version = '1.0';
        this.updateInterval = 1800000; // 30 minutos
    }

    initializeCache() {
        const cacheStructure = {
            version: this.version,
            timestamp: Date.now(),
            clientConfig: null,
            products: null,
            promotions: null
        };
        localStorage.setItem('cacheStructure', JSON.stringify(cacheStructure));
    }

    async checkForUpdates() {
        setInterval(async () => {
            const serverVersion = await this.fetchVersion();
            if (serverVersion !== localStorage.getItem('dataVersion')) {
                await this.updateLocalData();
            }
        }, this.updateInterval);
    }
}
```

### Manejo de Productos y Precios
```javascript
class ProductManager {
    constructor(clientData) {
        this.clientData = clientData;
    }

    getProductPrice(productId) {
        const product = this.clientData.products[productId];
        const basePrice = product.prices[this.clientData.priceList];
        
        // Verificar promociones
        const promotion = this.getProductPromotion(productId);
        return promotion ? promotion.specialPrice : basePrice;
    }

    getProductPromotion(productId) {
        const promotions = this.clientData.promotions;
        return promotions[productId];
    }
}
```

### Optimización de Imágenes
```javascript
class ImageLoader {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.isTablet = window.innerWidth <= 1024;
    }

    getImageUrl(productId) {
        const resolution = this.isMobile ? 'small' : 
                          this.isTablet ? 'medium' : 'large';
        return `img/products/${productId}_${resolution}.jpg`;
    }

    preloadImages(productIds) {
        productIds.forEach(id => {
            const img = new Image();
            img.src = this.getImageUrl(id);
        });
    }
}
```

## 5. Consideraciones Técnicas

### Caching
- Uso de localStorage para datos frecuentes
- Service Worker para funcionamiento offline
- Actualización periódica en background

### Performance
- Carga lazy de imágenes
- Optimización por dispositivo
- Pre-carga de datos críticos

### Seguridad
- Validación de permisos por cliente
- Encriptación de datos sensibles
- Control de versiones de datos

### Escalabilidad
- Estructura modular
- Fácil agregado de nuevas funcionalidades
- Mantenimiento simple vía Excel
