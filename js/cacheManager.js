// js/cacheManager.js

// Clase principal para manejar el almacenamiento local
class CacheManager {
    constructor() {
        // Versión del caché para control de actualizaciones
        this.version = '1.0';
        // Intervalo de actualización: 30 minutos
        this.updateInterval = 1800000;
        // Inicializar estructura al crear instancia
        this.initializeCache();
    }

    // Inicializa la estructura básica del caché
    initializeCache() {
        const cacheStructure = {
            version: this.version,
            timestamp: Date.now(),
            clientConfig: null,  // Configuración del cliente
            products: null,      // Productos permitidos
            promotions: null     // Promociones aplicables
        };
        
        // Guardar estructura en localStorage
        localStorage.setItem('cacheStructure', JSON.stringify(cacheStructure));
    }

    // Verifica si hay actualizaciones disponibles
    async checkForUpdates() {
        try {
            // Obtener versión del servidor
            const serverVersion = await this.fetchVersion();
            const localVersion = localStorage.getItem('version');

            // Si hay nueva versión, actualizar datos
            if (serverVersion !== localVersion) {
                await this.updateLocalData();
            }
        } catch (error) {
            console.error('Error checking updates:', error);
        }
    }
}