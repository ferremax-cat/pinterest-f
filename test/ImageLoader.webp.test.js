// test/ImageLoader.webp.test.js
import ImageLoader from '../js/imageLoader.js';
import MonitoringSystem from '../js/MonitoringSystem.js';

describe('ImageLoader WebP Support', () => {
    let imageLoader;
    let monitoringSystem;

    beforeEach(() => {
        console.log('Iniciando setup de prueba');
        monitoringSystem = {
            trackPerformance: jest.fn(),
            trackError: jest.fn()
        };
        
        // Crear instancia de ImageLoader con configuración completa
        imageLoader = new ImageLoader({ monitoringSystem });


        // Configuración base necesaria
        imageLoader.config = {
            resolutions: {
                desktop: {
                    width: 1920,
                    height: 1080,
                    quality: 80
                }
            },
            formats: {
                webp: {
                    quality: 80
                },
                fallback: {
                    format: 'jpeg',
                    quality: 80
                }
            },
            // Agregar configuración inicial de lazyLoading
            lazyLoading: {
                enabled: false,
                placeholderImage: ''
            }
        };
        
        // Configurar el mapa de imágenes
        imageLoader.imageMap.set('TEST123', { id: 'IMG123' });
        
        // Configurar cache mock si es necesario
        imageLoader.cache = {
            get: jest.fn(),
            set: jest.fn()
        };
    });

    test('should generate WebP URL when supported', async () => {


        imageLoader.supportsWebP = true;
        imageLoader.config = {
            ...imageLoader.config,
            formats: {
                webp: { quality: 80 },
                fallback: { format: 'jpeg', quality: 85 }
            },
            resolutions: {
                desktop: { width: 1024, height: 1024 }
            }
        };

        const result = await imageLoader.getImageUrl('TEST123', 'desktop');
        console.log('URL generada:', result);
        
        expect(result).toBeTruthy();
        expect(result).toContain('IMG123');
        expect(result).toContain('w1024');
        expect(result).toContain('fwebp');
    });

    test('should fallback to JPEG when WebP not supported', async () => {
        imageLoader.supportsWebP = false;
        imageLoader.config = {
            ...imageLoader.config,
            formats: {
                webp: { quality: 80 },
                fallback: { format: 'jpeg', quality: 85 }
            }
        };

        const result = await imageLoader.getImageUrl('TEST123');
        expect(result).not.toContain('fwebp');
        expect(result).toContain('q85');
    });

    test('should handle cache with format-specific keys', async () => {
        // Configuración inicial
    imageLoader.supportsWebP = true;
    
    // Mock más específico del cache
    const mockCache = {
        set: jest.fn(() => Promise.resolve()),
        get: jest.fn(() => Promise.resolve(null))
    };
    imageLoader.cache = mockCache;
    
    // Primera llamada
    console.log('--- Primera llamada ---');
    const firstCall = await imageLoader.getImageUrl('TEST123');
    console.log('Primera URL:', firstCall);
    console.log('Cache set llamado con:', mockCache.set.mock.calls);
    
    // Configurar el mock para la segunda llamada
    mockCache.get = jest.fn(() => Promise.resolve(firstCall));
    
    // Segunda llamada
    console.log('--- Segunda llamada ---');
    const secondCall = await imageLoader.getImageUrl('TEST123');
    console.log('Segunda URL:', secondCall);
    console.log('Cache get llamado con:', mockCache.get.mock.calls);

    // Verificar las llamadas
    console.log('Llamadas a trackPerformance:', monitoringSystem.trackPerformance.mock.calls);
    
    // Las URLs deben ser iguales
    expect(firstCall).toBe(secondCall);
    
    // Debe haber un cache hit
    expect(monitoringSystem.trackPerformance).toHaveBeenCalledWith(
        'cacheHit',
        expect.any(Number)
        );
    });

    test('should respect quality settings per format', async () => {

        // El propósito de esta prueba es verificar que la función getImageUrl 
        // respete las configuraciones de calidad específicas para cada formato de imagen (WebP y JPEG).

        // Configurar sin depender del caché
        imageLoader.config = {
            formats: {
                webp: { quality: 75 },
                fallback: { format: 'jpeg', quality: 90 }
            },
            resolutions: {
                desktop: { width: 1024, height: 1024 }
            }
        };

        // 2. Debug: Verificar configuración
        console.log('Config actual:', JSON.stringify(imageLoader.config, null, 2));

        // Verificar WebP:
        //Se establece imageLoader.supportsWebP en true, simulando que el navegador soporta el formato WebP.
        imageLoader.supportsWebP = true;

        //Se llama a getImageUrl con el código 'TEST123' y se guarda el resultado en webpResult.
        const webpResult = await imageLoader.getImageUrl('TEST123', 'desktop');
        console.log('URL WebP generada:', webpResult);


        // 4. Verificación
        expect(webpResult).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\/IMG123/);
        expect(webpResult).toContain('w1024-h1024');
        expect(webpResult).toContain('fwebp');

        // Se utiliza expect(webpResult).toContain('q75') para asegurarse de que la URL generada contenga 'q75',
        //  que es la calidad definida para WebP.
        expect(webpResult).toContain('q75');



        // Verificar JPEG
        // Se establece imageLoader.supportsWebP en false, simulando que el navegador no soporta el formato WebP.
        imageLoader.supportsWebP = false;

        // Se llama a getImageUrl nuevamente con el mismo código 'TEST123' y se guarda el resultado en jpegResult.
        const jpegResult = await imageLoader.getImageUrl('TEST123','desktop');

        console.log('URL JPEG generada:', jpegResult);
        // Se utiliza expect(jpegResult).toContain('q90') para asegurarse de que la URL generada contenga 'q90', que es la calidad definida para JPEG.
        expect(jpegResult).toContain('q90');
    });

    test('should handle different resolutions with formats', async () => {
        imageLoader.supportsWebP = true;
        imageLoader.config = {
            ...imageLoader.config,
            formats: {
                webp: { quality: 80 }
            },
            resolutions: {
                mobile: { width: 320, height: 320 },
                desktop: { width: 1024, height: 1024 }
            }
        };

        const mobileUrl = await imageLoader.getImageUrl('TEST123', 'mobile');
        const desktopUrl = await imageLoader.getImageUrl('TEST123', 'desktop');

        expect(mobileUrl).toContain('w320');
        expect(desktopUrl).toContain('w1024');
    });

    test('should maintain lazy loading compatibility', async () => {
        // Log del estado inicial
        console.log('Estado inicial:', {
            config: imageLoader.config,
            lazyLoading: imageLoader.config.lazyLoading
        });

        // Configurar lazy loading
        imageLoader.config = {
            ...imageLoader.config,
            lazyLoading: {
                enabled: true,
                placeholderImage: 'placeholder.jpg'
            }
        };

        // Log después de configurar
        console.log('Estado después de configurar:', {
            config: imageLoader.config,
            lazyLoading: imageLoader.config.lazyLoading
        });

        const imgElement = document.createElement('img');
        
        // Log antes de getImageUrl
        console.log('Elemento antes:', {
            classList: Array.from(imgElement.classList),
            attributes: Object.keys(imgElement.attributes)
        });

        const result = await imageLoader.getImageUrl('TEST123', 'desktop', imgElement);

        // Log después de getImageUrl
        console.log('Resultado:', {
            classList: Array.from(imgElement.classList),
            result: result,
            lazyLoadingEnabled: imageLoader.config.lazyLoading.enabled
        });

        expect(imgElement.classList.contains('lazy-image')).toBe(true);
        expect(result).toBe(imageLoader.config.lazyLoading.placeholderImage);
        expect(result).toBe('placeholder.jpg');
    });

    test('should handle errors gracefully', async () => {
        // Asegurarnos que el código no existe en el imageMap
        expect(imageLoader.imageMap.has('NONEXISTENT')).toBe(false);
        
        // Llamar al método
        const result = await imageLoader.getImageUrl('NONEXISTENT');
        
        // Verificar el resultado
        expect(result).toBe('');
        
        // Verificar que se registró el error
        expect(monitoringSystem.trackError).toHaveBeenCalledWith(
            expect.any(Error),
            'getImageUrl',
            expect.objectContaining({
                codigo: 'NONEXISTENT',
                format: expect.any(String)
            })
        );
        
        // Verificar el mensaje del error
        const [error] = monitoringSystem.trackError.mock.calls[0];
        expect(error.message).toContain('NONEXISTENT');
    });
    

    test('should track metrics with format info', async () => {

        
        // Crear nueva instancia para métricas limpias
        imageLoader.supportsWebP = true;

        // Forzar una nueva carga
        await imageLoader.getImageUrl('TEST123', 'desktop');

        expect(monitoringSystem.trackPerformance).toHaveBeenCalledWith(
            'imageLoad',
            expect.any(Number),
            expect.objectContaining({
                format: 'webp',
                resolution: 'desktop'
            })
        );
    });
});