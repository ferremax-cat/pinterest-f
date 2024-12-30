// test/ProductionMonitor.test.js

import ProductionMonitor from '../js/ProductionMonitor';

describe('ProductionMonitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new ProductionMonitor();
    });

    // Test de trackPerformance
    test('should track performance metrics', () => {
        // Forzar sampleRate para testing
        monitor.config.sampleRate = 1;

        monitor.trackPerformance('productLoad', 100, { productId: 'TEST123' });
        monitor.trackPerformance('imageLoad', 50, { imageId: 'IMG123' });

        const metrics = monitor.getMetrics();
        expect(metrics.performance.avgLoadTime).toBeDefined();
        expect(monitor.metrics.performance.loadTimes).toHaveLength(2);
    });

    // Test de trackError
    test('should track errors properly', () => {
        const testError = new Error('Test error');
        monitor.trackError(testError, 'test-context', { userId: 'USER123' });

        const metrics = monitor.getMetrics();
        expect(metrics.errors.total).toBe(1);
        expect(metrics.errors.lastError.context).toBe('test-context');
        expect(monitor.metrics.errors.errorTypes.get('Error')).toBe(1);
    });

    // Test de trackUsage
    test('should track feature usage', () => {
        // Forzar sampleRate para testing
        monitor.config.sampleRate = 1;

        monitor.trackUsage('pageView');
        monitor.trackUsage('productView', { productId: 'PROD123' });
        monitor.trackUsage('search', { query: 'test', resultCount: 5 });
        monitor.trackUsage('categoryAccess', { category: 'CAT1' });

        const metrics = monitor.getMetrics();
        expect(metrics.usage.pageViews).toBe(1);
        expect(monitor.metrics.usage.productViews.get('PROD123')).toBe(1);
    });

    // Test de límites y muestreo
    test('should respect sample rate', () => {
        monitor.config.sampleRate = 0;  // No debería registrar nada
        monitor.trackPerformance('test', 100);
        monitor.trackUsage('pageView');

        expect(monitor.metrics.performance.loadTimes).toHaveLength(0);
        expect(monitor.metrics.usage.pageViews).toBe(0);
    });

    // Test de getMetrics
    test('should return properly formatted metrics', () => {
        monitor.config.sampleRate = 1;
        
        // Generar algunos datos
        monitor.trackPerformance('test', 100);
        monitor.trackError(new Error('Test'), 'context');
        monitor.trackUsage('pageView');

        const metrics = monitor.getMetrics();
        
        expect(metrics).toHaveProperty('performance');
        expect(metrics).toHaveProperty('errors');
        expect(metrics).toHaveProperty('usage');
        expect(metrics.performance.avgLoadTime).toBeDefined();
        expect(metrics.errors.total).toBe(1);
        expect(metrics.usage.pageViews).toBe(1);
    });
});