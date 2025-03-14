// test/AdvancedCacheManager.test.js
import AdvancedCacheManager from '../js/AdvancedCacheManager';

describe('AdvancedCacheManager', () => {
    let cacheManager;

    beforeEach(() => {
        localStorage.clear();
        cacheManager = new AdvancedCacheManager();
    });

    // 1. Test básico - funciona
    test('should store and retrieve values from memory cache', async () => {
        await cacheManager.set('key1', 'value1');
        const value = await cacheManager.get('key1');
        expect(value).toBe('value1');
        expect(cacheManager.metrics.hits.memory).toBe(1);
    });

    // 2. Probemos este test modificado
    test('should handle multilevel cache correctly', async () => {
        // Mostrar estado inicial
        console.log('Initial state:', {
            config: cacheManager.config,
            metrics: cacheManager.metrics
        });
    
        // Guardar valor
        await cacheManager.set('key1', 'value1');
        console.log('After set:', {
            memoryCache: Array.from(cacheManager.memoryCache.entries()),
            localStorage: localStorage.getItem('cache_key1')
        });
    
        // Limpiar memoria
        cacheManager.memoryCache.clear();
        console.log('After clear:', {
            memoryCache: Array.from(cacheManager.memoryCache.entries()),
            localStorage: localStorage.getItem('cache_key1')
        });
    
        // Intentar recuperar
        const value = await cacheManager.get('key1');
        console.log('After get:', {
            value,
            metrics: cacheManager.metrics
        });
    
        expect(value).toBe('value1');
        expect(cacheManager.metrics.hits.localStorage).toBe(1);
    });

    test('should handle cache expiration', async () => {
        await cacheManager.set('key1', 'value1', 100); // TTL de 100ms
        
        // Verificar que el valor existe inicialmente
        let value = await cacheManager.get('key1');
        expect(value).toBe('value1');
    
        // Esperar a que expire
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Verificar que el valor expiró
        value = await cacheManager.get('key1');
        expect(value).toBeNull();
    });
    
    test('should handle memory size limits', async () => {
        // Crear una nueva instancia con límites pequeños
        const smallCache = new AdvancedCacheManager({
            levels: {
                memory: {
                    enabled: true,
                    maxSize: 50 // 50 bytes
                }
            }
        });
    
        // Intentar guardar datos que excedan el límite
        const largeValue = 'x'.repeat(100); // 100 bytes
        await smallCache.set('key1', largeValue);
    
        // Verificar que el tamaño en memoria no excede el límite
        expect(smallCache.metrics.size.memory).toBeLessThanOrEqual(50);
    });

    test('should handle localStorage errors gracefully', async () => {
        // Simular error en localStorage
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function() {
            throw new Error('QuotaExceededError');
        };
    
        try {
            // El valor debería guardarse en memoria aunque falle localStorage
            await cacheManager.set('key1', 'value1');
            const value = await cacheManager.get('key1');
    
            // Verificar que el valor está disponible
            expect(value).toBe('value1');
            
            // Verificar que está en memoria
            expect(cacheManager.memoryCache.has('key1')).toBe(true);
        } finally {
            // Restaurar localStorage original
            localStorage.setItem = originalSetItem;
        }
    });
    
    test('should handle multilevel cache comprehensively', async () => {

        console.log('Test start - metrics:', JSON.stringify(cacheManager.metrics));
        // 1. Verificar almacenamiento en ambos niveles
        await cacheManager.set('key1', 'value1');
        expect(cacheManager.memoryCache.has('key1')).toBe(true);
        expect(localStorage.getItem('cache_key1')).toBeTruthy();
    
        // 2. Verificar prioridad de memoria sobre localStorage
        await cacheManager.set('key2', 'valueInBoth');
        localStorage.setItem('cache_key2', JSON.stringify({
            value: 'oldValue',
            timestamp: Date.now(),
            ttl: 1000
        }));
        const valueFromMemory = await cacheManager.get('key2');
        expect(valueFromMemory).toBe('valueInBoth');
    
        // 3. Verificar recuperación desde localStorage cuando memoria falla
        cacheManager.memoryCache.clear();
        const valueFromLocalStorage = await cacheManager.get('key1');
        expect(valueFromLocalStorage).toBe('value1');
        expect(cacheManager.metrics.hits.localStorage).toBe(1);
    
        // 4. Verificar promoción a memoria
        expect(cacheManager.memoryCache.has('key1')).toBe(true);
    
        // 5. Verificar comportamiento cuando no existe en ningún nivel
        console.log('Before nonexistent get:', cacheManager.metrics);
        const nonExistentValue = await cacheManager.get('nonexistent');
        console.log('After nonexistent get:', cacheManager.metrics);
        console.log('After get - metrics:', JSON.stringify(cacheManager.metrics));

        expect(nonExistentValue).toBeNull();
        expect(cacheManager.metrics.misses.memory).toBeGreaterThan(0);
        expect(cacheManager.metrics.misses.localStorage).toBeGreaterThan(0);
    });

    
});