// test/integration/MonitoringIntegration.test.js

import ProductManager from '../../js/productManager.js';
import ImageLoader from '../../js/imageLoader.js';
import ProductionMonitor from '../../js/ProductionMonitor.js';
import AdvancedCacheManager from '../../js/AdvancedCacheManager.js';


describe('Monitoring Integration', () => {
   let monitor;
   let productManager;
   let imageLoader;

   beforeEach(() => {
       monitor = new ProductionMonitor({ sampleRate: 1 });
       productManager = new ProductManager({ monitoringSystem: monitor });
       imageLoader = new ImageLoader({ monitoringSystem: monitor });
       
   });

   test('should track product operations', async () => {
       // Simular operaciones de producto
       productManager.products.set('TEST123', {
           codigo: 'TEST123',
           categoria: 'CAT1',
           precios: { D: 100 }
       });
       
       await productManager.getPrice('TEST123');
       const metrics = monitor.getMetrics();

       expect(metrics.performance.avgLoadTime).toBeDefined();
       expect(metrics.usage.pageViews).toBeDefined();
   });

   test('should track image operations', async () => {
    // Configurar ImageLoader con datos necesarios
    imageLoader = new ImageLoader({ 
        monitoringSystem: monitor,
        config: {
            resolutions: {
                desktop: { width: 1024, height: 1024 }
            }
        }
    });
    
    imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
    await imageLoader.getImageUrl('TEST123', 'desktop');

    expect(monitor.metrics.performance.loadTimes.length).toBe(1);
    });
   

    test('should track errors properly', async () => {
        // Crear error manualmente
        const error = new Error('Test error');
        monitor.trackError(error, 'test-context');
    
        // Verificar directamente en monitor
        expect(monitor.metrics.errors.count).toBe(1);
    
        // Verificar a través de getMetrics
        const metrics = monitor.getMetrics();
        expect(metrics.errors.total).toBe(1);
    });
    
    // También probar con ProductManager
    test('should track product manager errors', async () => {
        // Configurar ProductManager
        productManager.clientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    
        // Forzar error
        await productManager.getPrice('NONEXISTENT');
        
        // Verificar error registrado
        console.log('Monitor metrics:', monitor.metrics);
        expect(monitor.metrics.errors.count).toBe(1);
    });
   
    test('should monitor complete flow', async () => {
        productManager.clientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    
        // Configurar datos de prueba
        productManager.products.set('TEST123', {
            codigo: 'TEST123',
            categoria: 'CAT1',
            precios: { D: 100 }
        });
        
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
    
        // Ejecutar operaciones
        await Promise.all([
            productManager.getPrice('TEST123'),
            imageLoader.getImageUrl('TEST123'),
            productManager.getPrice('NONEXISTENT')
        ]);
    
        const metrics = monitor.getMetrics();
    
        // Verificaciones más flexibles
        expect(metrics.performance.last1Min.length).toBeGreaterThan(0);
        expect(metrics.errors.total).toBeGreaterThan(0);
        expect(metrics.usage).toBeDefined();
    });
   
});