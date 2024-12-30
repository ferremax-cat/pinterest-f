// js/AdvancedCacheManager.js

/**
 * Sistema de caché multinivel con estrategias avanzadas de gestión
 */
class AdvancedCacheManager {
    constructor(config = {}) {
        // Configuración simplificada
        this.config = {
            maxSize: config.maxSize || 50 * 1024 * 1024,
            maxAge: config.maxAge || 24 * 60 * 60 * 1000,
            levels: {
                memory: {
                    enabled: config.levels?.memory?.enabled ?? true,
                    maxSize: config.levels?.memory?.maxSize || 10 * 1024 * 1024
                },
                localStorage: {
                    enabled: config.levels?.localStorage?.enabled ?? true,
                    maxSize: config.levels?.localStorage?.maxSize || 40 * 1024 * 1024
                }
            }
            
        };

          

        // Inicializar caches
        this.memoryCache = new Map();
        this.metrics = {
            hits: { memory: 0, localStorage: 0 },
            misses: { memory: 0, localStorage: 0 },
            size: { memory: 0, localStorage: 0 }
        };
        console.log('Constructor - Initial metrics:', JSON.stringify(this.metrics));
    }

    // Método auxiliar para merge profundo de configuración
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };
        
        for (const [key, value] of Object.entries(userConfig)) {
            if (value && typeof value === 'object') {
                merged[key] = this.mergeConfig(defaultConfig[key] || {}, value);
            } else {
                merged[key] = value;
            }
        }
        
        return merged;
    }




    /**
     * Obtiene un valor del caché, intentando primero memoria, luego localStorage
     */
    async get(key) {
        // 1. Intentar memoria primero
        const memoryResult = this.memoryCache.get(key);
        if (memoryResult) {
            if (this.isValid(memoryResult)) {
                this.metrics.hits.memory++;
                return memoryResult.value;
            }
            // Si está expirado
            this.memoryCache.delete(key);
            this.metrics.misses.memory++;
        } else {
            this.metrics.misses.memory++;
        }
    
        // 2. Si no se encontró en memoria o expiró, intentar localStorage
        try {
            const stored = localStorage.getItem(`cache_${key}`);
            if (!stored) {
                // No existe en localStorage
                this.metrics.misses.localStorage++;
                return null;
            }
    
            const item = JSON.parse(stored);
            if (this.isValid(item)) {
                // Encontrado y válido en localStorage
                await this.setInMemory(key, item.value);
                this.metrics.hits.localStorage++;
                return item.value;
            } else {
                // Existe pero expirado
                localStorage.removeItem(`cache_${key}`);
                this.metrics.misses.localStorage++;
            }
        } catch (error) {
            console.error('Error accessing localStorage:', error);
            this.metrics.misses.localStorage++;
        }
    
        return null;
    }

    /**
     * Almacena un valor en todos los niveles de caché disponibles
     */
        async set(key, value, ttl = this.config.maxAge) {
            const item = {
            value,
            timestamp: Date.now(),
            ttl
            };

            // Guardar en memoria
            await this.setInMemory(key, value, ttl);

            // Siempre intentar guardar en localStorage
            if (this.config.levels.localStorage.enabled) {
                try {
                    localStorage.setItem(`cache_${key}`, JSON.stringify(item));
                    this.updateMetrics('localStorage', key, item);
                } catch (error) {
                    console.error('Error writing to localStorage:', error);
                }
            }
        }
    

    /**
     * Guarda en caché de memoria con control de tamaño
     */
    // En AdvancedCacheManager.js, modificar setInMemory
async setInMemory(key, value, ttl = this.config.maxAge) {
    const item = {
        value,
        timestamp: Date.now(),
        ttl
    };

    // Calcular tamaño antes de guardar
    const itemSize = new Blob([JSON.stringify(item)]).size;

    // Si el item es más grande que el límite, no guardarlo en memoria
    if (itemSize > this.config.levels.memory.maxSize) {
        console.warn('Item too large for memory cache');
        return;
    }

    // Liberar espacio si es necesario
    while (this.metrics.size.memory + itemSize > this.config.levels.memory.maxSize) {
        await this.evictFromMemory();
    }

    this.memoryCache.set(key, item);
    this.metrics.size.memory += itemSize;
    }

    /**
     * Verifica si un item de caché sigue válido
     */
    isValid(item) {
        return item && 
               item.timestamp && 
               (Date.now() - item.timestamp) < item.ttl;
    }

    /**
     * Actualiza métricas de uso
     */
    updateMetrics(level, key, item) {
        const size = new Blob([JSON.stringify(item)]).size;
        this.metrics.size[level] += size;
    }

    /**
     * Libera espacio en memoria usando LRU
     */
    async evictFromMemory() {
        const entries = Array.from(this.memoryCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        for (const [key] of entries) {
            this.memoryCache.delete(key);
            if (this.metrics.size.memory < this.config.levels.memory.maxSize * 0.8) {
                break;
            }
        }
    }

    /**
     * Libera espacio en localStorage
     */
    async evictFromLocalStorage() {
        const keys = Object.keys(localStorage)
            .filter(key => key.startsWith('cache_'));

        const items = keys.map(key => ({
            key,
            data: JSON.parse(localStorage.getItem(key))
        }))
        .sort((a, b) => a.data.timestamp - b.data.timestamp);

        for (const {key} of items) {
            localStorage.removeItem(key);
            if (this.getTotalLocalStorageSize() < this.config.levels.localStorage.maxSize * 0.8) {
                break;
            }
        }
    }

    /**
     * Calcula tamaño total en localStorage
     */
    getTotalLocalStorageSize() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('cache_')) {
                total += localStorage.getItem(key).length * 2; // UTF-16
            }
        }
        return total;
    }

    /**
     * Obtiene métricas de uso del caché
     */
    getMetrics() {
        return {
            ...this.metrics,
            hitRate: {
                memory: this.metrics.hits.memory / (this.metrics.hits.memory + this.metrics.misses.memory),
                localStorage: this.metrics.hits.localStorage / (this.metrics.hits.localStorage + this.metrics.misses.localStorage)
            }
        };
    }
}

export default AdvancedCacheManager;