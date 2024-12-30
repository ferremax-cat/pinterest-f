// test/AdvancedCacheManager.comprehensive.test.js

import AdvancedCacheManager from '../js/AdvancedCacheManager';

describe('AdvancedCacheManager Comprehensive Tests', () => {
    let cacheManager;

    beforeEach(() => {
        localStorage.clear();
        cacheManager = new AdvancedCacheManager();
    });

    test('should handle set operations comprehensively', async () => {
        // Test valor básico
        await cacheManager.set('key1', 'value1');
        expect(cacheManager.memoryCache.has('key1')).toBe(true);
        expect(localStorage.getItem('cache_key1')).toBeTruthy();

        // Test con TTL personalizado
        await cacheManager.set('key2', 'value2', 100);
        const item = cacheManager.memoryCache.get('key2');
        expect(item.ttl).toBe(100);

        // Test con valor grande
        const largeValue = 'x'.repeat(1024 * 1024); // 1MB
        await cacheManager.set('key3', largeValue);
        expect(cacheManager.metrics.size.memory).toBeDefined();

        // Test sobrescritura
        await cacheManager.set('key1', 'newValue');
        const value = await cacheManager.get('key1');
        expect(value).toBe('newValue');

        // Test valores especiales
        await cacheManager.set('key4', null);
        await cacheManager.set('key5', undefined);
        await cacheManager.set('key6', { complex: 'object' });
        await cacheManager.set('key7', [1, 2, 3]);
        
        // Verificar métricas después de operaciones
        expect(cacheManager.metrics.size.memory).toBeGreaterThan(0);
    });

    test('should handle get operations comprehensively', async () => {
        // Preparar datos
        await cacheManager.set('valid', 'value1');
        await cacheManager.set('expire', 'value2', 100);
        await cacheManager.set('large', 'x'.repeat(1000));

        // Test valor existente
        let value = await cacheManager.get('valid');
        expect(value).toBe('value1');

        // Test valor expirado
        await new Promise(resolve => setTimeout(resolve, 150));
        value = await cacheManager.get('expire');
        expect(value).toBeNull();

        // Test valor inexistente
        value = await cacheManager.get('nonexistent');
        expect(value).toBeNull();

        // Test valor en localStorage (limpiar memoria primero)
        cacheManager.memoryCache.clear();
        value = await cacheManager.get('valid');
        expect(value).toBe('value1');
        
        // Test promoción a memoria
        expect(cacheManager.memoryCache.has('valid')).toBe(true);

        // Verificar métricas
        expect(cacheManager.metrics.hits.memory).toBeGreaterThan(0);
        expect(cacheManager.metrics.hits.localStorage).toBeGreaterThan(0);
        expect(cacheManager.metrics.misses.memory).toBeGreaterThan(0);
        expect(cacheManager.metrics.misses.localStorage).toBeGreaterThan(0);
    });
});