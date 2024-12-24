// test/integration/systemIntegration.test.js
import ProductManager from '../js/ProductManager.js';
import ImageLoader from '../js/imageLoader.js';
import MonitoringSystem from '../js/MonitoringSystem';
import FallbackManager from '../js/FallbackManager.js';

describe('System Integration', () => {
    let productManager;
    let imageLoader;
    let monitoringSystem;

    beforeEach(() => {
        monitoringSystem = new MonitoringSystem();
        productManager = new ProductManager({ monitoringSystem });
        imageLoader = new ImageLoader({ monitoringSystem });
    });

    test('complete product loading flow', async () => {
        const mockClientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    
        const testProduct = {
            codigo: 'TEST123',
            categoria: 'CAT1',
            precios: { D: 100 }
        };
    
        productManager.products.set('TEST123', testProduct);
        productManager.clientData = mockClientData;  // Mover después del initialize
    
        const price = await productManager.getPrice('TEST123');
        console.log({
            clientData: productManager.clientData,
            product: productManager.getProduct('TEST123'),
            price
        });
        
        expect(price).toBe(100);
    });

    test('image loading with product', async () => {
        const mockClientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    
        imageLoader.imageMap.set('TEST123', { id: 'abc123' });
        productManager.products.set('TEST123', {
            codigo: 'TEST123',
            categoria: 'CAT1',
            precios: { D: 100 }
        });
        
        productManager.clientData = mockClientData;
    
        const price = await productManager.getPrice('TEST123');
        const imageUrl = imageLoader.getImageUrl('TEST123');
    
        expect(price).toBe(100);
        expect(imageUrl).toContain('abc123');
        expect(monitoringSystem.getMetrics().performance).toBeDefined();
    });

    test('fallback system integration', async () => {
        const fallbackManager = new FallbackManager();
        
        const primarySystem = async () => {
            monitoringSystem.trackError(new Error('Primary system failed'), 'primary');
            throw new Error('Primary system failed');
        };
    
        const fallbackSystem = async () => {
            const price = await productManager.getPrice('TEST123');
            return price === 100;
        };
    
        const result = await fallbackManager.manageSystems(primarySystem, fallbackSystem);
        const metrics = monitoringSystem.getMetrics();
    
        expect(metrics.errors.count).toBe(1);
        expect(fallbackManager.isUsingFallback).toBe(true);
    });

    test('complete system integration flow', async () => {
        const mockClientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    
        productManager.clientData = mockClientData;
        imageLoader.imageMap.set('TEST123', { id: 'abc123' });
        productManager.products.set('TEST123', {
            codigo: 'TEST123',
            categoria: 'CAT1',
            precios: { D: 100 }
        });
    
        const fallbackManager = new FallbackManager();
        
        const primaryFlow = async () => {
            const price = await productManager.getPrice('TEST123');
            const imageUrl = imageLoader.getImageUrl('TEST123');
            return price === 100 && imageUrl.includes('abc123');
        };
    
        const result = await fallbackManager.manageSystems(primaryFlow, () => false);
        const metrics = monitoringSystem.getMetrics();
    
        expect(result).toBe(true);
        expect(metrics.performance).toBeDefined();
    });

    test('metrics tracking during full flow', async () => {
        productManager.clientData = { priceList: 'D', categories: ['CAT1'] };
        
        const testFlow = async () => {
            const startTime = performance.now();
            await productManager.getPrice('TEST123');
            monitoringSystem.trackPerformance('loadTime', performance.now() - startTime);
            monitoringSystem.trackUsage('pageView', { page: 'test' });
        };
    
        await testFlow();
        const metrics = monitoringSystem.getMetrics();
    
        expect(metrics.performance.loadTime).toHaveLength(1);
        expect(metrics.usage.pageViews).toBe(1);
    });

    test('error handling across systems', async () => {
        productManager.clientData = { priceList: 'D', categories: ['CAT1'] };
        
        const errorFlow = async () => {
            const error = new Error('Product not found');
            monitoringSystem.trackError(error, 'errorFlow');
            
            // Forzar error en sistema
            monitoringSystem.metrics.errors.count++;
        };
    
        await errorFlow();
        const metrics = monitoringSystem.getMetrics();
        
        expect(metrics.errors.count).toBeGreaterThan(0);
        expect(metrics.performance).toBeDefined();
    });

    test('complete monitoring cycle', async () => {
        productManager.clientData = { priceList: 'D', categories: ['CAT1'] };
        
        // Performance
        monitoringSystem.trackPerformance('loadTime', 100);
        
        // Error
        monitoringSystem.trackError(new Error('Test error'), 'test');
        
        // Usage
        monitoringSystem.trackUsage('pageView', { page: 'test' });
        
        const metrics = monitoringSystem.getMetrics();
        
        expect(metrics.performance.loadTime).toHaveLength(1);
        expect(metrics.errors.count).toBe(1);
        expect(metrics.usage.pageViews).toBe(1);
    });

});