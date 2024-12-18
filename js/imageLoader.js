// js/imageLoader.js

// Clase que maneja la carga de imágenes y precios desde Google Sheets
class ImageLoader {
    constructor() {
        // Usar sheetId desde config
        this.sheetId = config.sheetId;
        // URL base de Sheets desde config
        this.sheetsUrl = config.apiEndpoints.sheets;
        
        // Mapas de datos
        this.imageMap = {};      // Mapeo código -> ID de Drive
        this.productsMap = {};   // Datos completos de productos
        this.clientGroups = {};  // Grupos del cliente actual
        this.promotions = {};    // Promociones vigentes
        
        // Cliente actual (se obtiene en initialize)
        this.currentClient = {
            account: '',
            priceList: '',      
            groups: []          
        };
        
        this.initialized = false;
    }
 
    // Inicializar con datos del cliente actual
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Obtener cliente de localStorage (guardado en login)
            const clientData = JSON.parse(localStorage.getItem('clientData'));
            if (!clientData?.account) {
                throw new Error('No hay cliente autenticado');
            }
            
            // Cargar datos del cliente
            await this.loadClientData(clientData);
            // Cargar datos de Drive y precios
            await this.loadDriveData();
            // Cargar promociones
            await this.loadPromotions();
            
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing ImageLoader:', error);
            // Redireccionar a login si no hay datos válidos
            window.location.href = 'login.html';
        }
    }
 
    // Cargar datos del cliente
    async loadClientData(clientData) {
        // Guardar datos del cliente actual
        this.currentClient = {
            account: clientData.account,
            priceList: clientData.priceList,
            groups: clientData.groups
        };
    }
 
    // Cargar datos de Drive y precios
    async loadDriveData() {
        const sheetUrl = `${this.sheetsUrl}/${this.sheetId}/gviz/tq?tqx=out:json`;
        const response = await fetch(sheetUrl);
        const text = await response.text();
        const json = JSON.parse(text.substr(47).slice(0, -2));
 
        // Procesar cada fila del Excel
        json.table.rows.forEach(row => {
            if (row.c[0]?.v && row.c[1]?.v) {
                const nombreArchivo = row.c[0].v;
                const codigo = nombreArchivo.replace(/\.(jpg|webp|png)$/, '');
                const id = row.c[1].v;
                
                // Guardar ID de imagen
                this.imageMap[codigo] = id;
                
                // Guardar datos del producto
                this.productsMap[codigo] = {
                    id: id,
                    prices: {
                        D: row.c[2]?.v,  // Precio lista D
                        E: row.c[3]?.v,  // Precio lista E
                        F: row.c[4]?.v   // Precio lista F
                    }
                };
            }
        });
    }
 
    // Cargar promociones vigentes
    async loadPromotions() {
        try {
            // Verificar si el cliente tiene grupos asignados
            if (!this.currentClient.groups?.length) return;
 
            // TODO: Implementar lógica de carga de promociones
            // Verificar grupos del cliente y fechas de vigencia
        } catch (error) {
            console.error('Error loading promotions:', error);
        }
    }
 
    // Obtener URL de imagen
    getImageUrl(codigo) {
        const id = this.imageMap[codigo];
        return id ? `https://lh3.googleusercontent.com/d/${id}` : '';
    }
 
    // Obtener precio final (considerando lista y promociones)
    getPrice(codigo) {
        const product = this.productsMap[codigo];
        if (!product) return null;
 
        // Obtener precio base según lista asignada
        const basePrice = product.prices[this.currentClient.priceList];
        
        // Verificar si hay promoción vigente
        const promotion = this.getPromotion(codigo);
        
        // Retornar precio promocional o base
        return promotion ? promotion.price : basePrice;
    }
 
    // Verificar si hay promoción vigente
    getPromotion(codigo) {
        // Verificar si el producto tiene promociones
        const promotion = this.promotions[codigo];
        if (!promotion) return null;
 
        // Verificar si la promoción aplica a algún grupo del cliente
        const clientGroups = this.currentClient.groups;
        const hasValidGroup = promotion.groups.some(group => clientGroups.includes(group));
        
        if (!hasValidGroup) return null;
 
        // Verificar vigencia
        const now = new Date();
        const validUntil = new Date(promotion.validUntil);
        
        return now <= validUntil ? promotion : null;
    }
 }