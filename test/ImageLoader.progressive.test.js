// test/ImageLoader.progressive.test.js

import ImageLoader from '../js/imageLoader.js';
import MonitoringSystem from '../js/MonitoringSystem.js';

describe('ImageLoader Progressive Loading', () => {
   let imageLoader;
   let monitoringSystem;

   beforeEach(() => {
       monitoringSystem = new MonitoringSystem();
       imageLoader = new ImageLoader({ monitoringSystem });
       
       // Configurar datos de prueba
       imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
   });

   test('should load images progressively', async () => {
       const result = await imageLoader.loadProgressively('TEST123');

       // Verificar que devuelve todas las versiones
       expect(result.thumbnail).toBeDefined();
       expect(result.preview).toBeDefined();
       expect(result.full).toBeDefined();

       // Verificar que las URLs son diferentes para cada calidad
       expect(result.thumbnail).not.toBe(result.preview);
       expect(result.preview).not.toBe(result.full);
   });



   test('should use cache for progressive loading', async () => {
       // Primera carga
       await imageLoader.loadProgressively('TEST123');
       
       // Segunda carga - debería venir de caché
       const startTime = performance.now();
       const result = await imageLoader.loadProgressively('TEST123');
       const loadTime = performance.now() - startTime;

       // Verificar que la carga desde caché es rápida
       expect(loadTime).toBeLessThan(50); // menos de 50ms
   });



   test('should handle progressive load errors', async () => {
        
       //* agregue 
       const imageLoader = new ImageLoader({ monitoringSystem });

       const result = await imageLoader.loadProgressively('NONEXISTENT');
       expect(result).toBeNull();

       // Verificar que se registró el error
       expect(monitoringSystem.metrics.errors.count).toBeGreaterThan(0);
   });




   test('should generate correct quality URLs', async () => {
       const result = await imageLoader.loadProgressively('TEST123');

       // Verificar que las URLs incluyen los parámetros de calidad correctos
       expect(result.thumbnail).toContain('w20');
       expect(result.preview).toContain('w100');
       expect(result.full).toContain('w800');
   });

   // test/ImageLoader.progressive.test.js
describe('ImageLoader Progressive Loading', () => {
    let imageLoader;
    let monitoringSystem;

    beforeEach(() => {
        // Crear MonitoringSystem con funciones mock
        monitoringSystem = {
            trackPerformance: jest.fn(),
            trackError: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({
                performance: { last1Min: [] }
            })
        };

        // Inicializar ImageLoader con el monitor mockeado
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
    });

    test('should track performance metrics for progressive loading', async () => {
        // Realizar carga
        await imageLoader.loadProgressively('TEST123');
    
        // Verificar que se llamó a trackPerformance
        expect(monitoringSystem.trackPerformance).toHaveBeenCalled();
        
        // Verificar todas las llamadas
        const calls = monitoringSystem.trackPerformance.mock.calls;
        
        // Debería haber al menos una llamada con alguno de estos tipos
        const validTypes = ['progressiveLoad', 'imageLoad', 'cacheHit'];
        const hasValidCall = calls.some(([type]) => validTypes.includes(type));
        
        expect(hasValidCall).toBe(true);
        
        // Verificar estructura de las llamadas
        calls.forEach(call => {
            expect(call).toHaveLength(2); // tipo y duración
            expect(typeof call[0]).toBe('string'); // tipo es string
            expect(typeof call[1]).toBe('number'); // duración es número
        });
    });

    
});
   
   
});