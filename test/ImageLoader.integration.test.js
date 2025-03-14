// test/ImageLoader.integration.test.js
import ImageLoader from '../js/imageLoader.js';

describe('ImageLoader Integration Tests', () => {
    let imageLoader;
    let monitoringSystem;
    let mockCache;

    beforeEach(() => {
        mockCache = {
            get: jest.fn(),
            set: jest.fn()
        };
        
        monitoringSystem = {
            trackPerformance: jest.fn(),
            trackError: jest.fn()
        };
        
        imageLoader = new ImageLoader({ monitoringSystem });
        imageLoader.cache = mockCache;
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
    });

    test('should integrate correctly with cache system', async () => {
        mockCache.get.mockResolvedValue(null);
        const result = await imageLoader.getImageUrl('TEST123');
        
        expect(mockCache.get).toHaveBeenCalled();
        expect(mockCache.set).toHaveBeenCalled();
        expect(result).toMatch(/^https:\/\//);
    });

    test('should handle integration errors gracefully', async () => {
        // Simular error en el cache
        mockCache.get.mockRejectedValue(new Error('Cache error'));
        
        const result = await imageLoader.getImageUrl('TEST123');
        
        // Verificar que el error fue registrado
        expect(monitoringSystem.trackError).toHaveBeenCalledWith(
            expect.any(Error),
            'getImageUrl',
            expect.objectContaining({
                codigo: 'TEST123',
                format: expect.any(String)
            })
        );
        
        // Según tu implementación, debería retornar cadena vacía
        expect(result).toBe('');
    });

    test('should maintain functionality with missing cache', async () => {
        imageLoader.cache = null;
        const result = await imageLoader.getImageUrl('TEST123');
        
        expect(result).toBe('');
        expect(monitoringSystem.trackError).toHaveBeenCalled();
    });

    test('should handle monitoring system failure', async () => {
        // Simular que no hay sistema de monitoreo
        imageLoader.monitor = null;
        
        // Debería seguir funcionando y generar URL
        const result = await imageLoader.getImageUrl('TEST123');
        expect(result).toMatch(/^https:\/\//);
    });

    test('should track performance metrics correctly', async () => {
        await imageLoader.getImageUrl('TEST123');
        
        expect(monitoringSystem.trackPerformance).toHaveBeenCalledWith(
            'imageLoad',
            expect.any(Number),
            expect.objectContaining({
                format: expect.any(String),
                resolution: 'desktop',
                width: expect.any(Number),
                height: expect.any(Number),
                quality: expect.any(Number)
            })
        );
    });
});