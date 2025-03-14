// test/ImageLoader.performance.test.js
import ImageLoader from '../js/imageLoader.js';

describe('ImageLoader Performance Tests', () => {
    let imageLoader;
    let monitoringSystem;

    beforeEach(() => {
        monitoringSystem = {
            trackPerformance: jest.fn(),
            trackError: jest.fn()
        };
    });

    test('should initialize quickly', async () => {
        const startTime = performance.now();
        
        // Crear instancia
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
        
        const initTime = performance.now() - startTime;
        
        // Verificar que la inicialización sea rápida
        expect(initTime).toBeLessThan(100);
        
        // Verificar que se hayan configurado los sistemas necesarios
        expect(imageLoader.monitor).toBeDefined();
        expect(imageLoader.cache).toBeDefined();
        expect(imageLoader.imageMap.size).toBe(1);
    });

    test('should handle concurrent image loads efficiently', async () => {
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
        
        const startTime = performance.now();
        
        // Cargar múltiples imágenes concurrentemente
        const results = await Promise.all([
            imageLoader.getImageUrl('TEST123', 'desktop'),
            imageLoader.getImageUrl('TEST123', 'mobile'),
            imageLoader.getImageUrl('TEST123', 'tablet')
        ]);
        
        const totalTime = performance.now() - startTime;
        
        expect(results.every(Boolean)).toBe(true);
        expect(totalTime).toBeLessThan(300);
        expect(monitoringSystem.trackPerformance).toHaveBeenCalledWith(
            'imageLoad',
            expect.any(Number),
            expect.any(Object)
        );
    });

    test('should maintain stable memory usage under load', async () => {
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
        
        // Simular carga de múltiples imágenes
        const iterations = 100;
        const startMemory = process.memoryUsage().heapUsed;
        
        for (let i = 0; i < iterations; i++) {
            await imageLoader.getImageUrl('TEST123', 'desktop');
        }
        
        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = endMemory - startMemory;
        
        // Verificar métricas de rendimiento
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
        expect(monitoringSystem.trackPerformance).toHaveBeenCalledTimes(iterations);
    });

    test('should optimize cache performance', async () => {
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
        
        // Primera carga
        const firstCall = await imageLoader.getImageUrl('TEST123', 'desktop');
        
        // Segunda carga (debería ser desde caché)
        const startCacheTime = performance.now();
        const secondCall = await imageLoader.getImageUrl('TEST123', 'desktop');
        const cacheLoadTime = performance.now() - startCacheTime;
        
        // Verificaciones
        expect(secondCall).toBe(firstCall); // Las URLs deben ser idénticas
        expect(cacheLoadTime).toBeLessThan(20); // Menos de 20ms es razonable para una carga de caché
        expect(monitoringSystem.trackPerformance).toHaveBeenCalledWith(
            'cacheHit',
            expect.any(Number)
        );
    });
});