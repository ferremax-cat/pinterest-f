// js/imageLoader.js

// Clase que maneja la carga de imágenes y precios desde Google Sheets
class ImageLoader {
    constructor() {
        // Usar sheetId desde config
        this.sheetId = config.sheetId;
        // Usar productosId desde config
        this.productosId = config.productosId;
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
        try {
            // Cargar datos de imágenes
            console.log('Cargando datos de imágenes...');
            const imageUrl = `${this.sheetsUrl}/${this.sheetId}/gviz/tq?tqx=out:json`;
            const imageResponse = await fetch(imageUrl);
            const imageText = await imageResponse.text();
            const imageJson = JSON.parse(imageText.substr(47).slice(0, -2));
            
            // Procesar datos de imágenes
            imageJson.table.rows.forEach(row => {
                if (row.c[0]?.v && row.c[1]?.v) {
                    const nombreArchivo = row.c[0].v;
                    const codigo = nombreArchivo.replace(/\.(jpg|webp|png)$/, '');
                    const id = row.c[1].v;
                    this.imageMap[codigo] = id;
                }
            });
            console.log(`Imágenes cargadas: ${Object.keys(this.imageMap).length}`);

            // Cargar datos de productos
            console.log('Cargando datos de productos...');
            const productsUrl = `${this.sheetsUrl}/${this.productosId}/gviz/tq?tqx=out:json`;
            const productsResponse = await fetch(productsUrl);
            const productsText = await productsResponse.text();
            const productsJson = JSON.parse(productsText.substr(47).slice(0, -2));
            
            // Procesar datos de productos
            productsJson.table.rows.forEach(row => {
                if (row.c[0]?.v) {
                    const codigo = row.c[0].v.toString();
                    this.productsMap[codigo] = {
                        nombre: row.c[1]?.v,
                        rubro: row.c[2]?.v,
                        bulto: row.c[3]?.v,
                        precios: {
                            D: row.c[4]?.v,
                            E: row.c[5]?.v,
                            F: row.c[6]?.v
                        }
                    };
                }
            });
            console.log(`Productos cargados: ${Object.keys(this.productsMap).length}`);

        } catch (error) {
            console.error('Error cargando datos:', error);
            throw new Error('Error al cargar datos de Drive');
        }
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
        if (!product) {
            console.log(`Producto no encontrado: ${codigo}`);
            return null;
        }

        // Obtener el precio base según la lista del cliente
        const basePrice = product.precios[this.currentClient.priceList];
        if (!basePrice) {
            console.log(`Precio no encontrado para lista ${this.currentClient.priceList}`);
            return null;
        }

        
        
        // Verificar si hay promoción vigente
        const promotion = this.getPromotion(codigo);
        
        // Retornar precio promocional o base
        const finalPrice = promotion ? promotion.price : basePrice;
        console.log(`Precio final para ${codigo}: ${finalPrice} (Lista ${this.currentClient.priceList})`);
        return finalPrice;
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