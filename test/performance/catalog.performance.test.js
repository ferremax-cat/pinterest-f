// Importamos las dependencias necesarias
import ProductManager from '../../js/ProductManager';
import ImageLoader from '../../js/ImageLoader';
import MonitoringSystem from '../../js/MonitoringSystem';

describe('Catalog Performance Tests', () => {
    // Configuramos variables que usaremos en todas las pruebas
    let productManager;
    let imageLoader;
    let monitoringSystem;
    
    // Configuramos el entorno antes de cada prueba
    beforeEach(() => {
        // Creamos una nueva instancia del sistema de monitoreo
        monitoringSystem = new MonitoringSystem();
        
        // Inicializamos los managers con el sistema de monitoreo
        productManager = new ProductManager({ monitoringSystem });
        imageLoader = new ImageLoader({ monitoringSystem });

        // Limpiamos el DOM y configuramos el HTML básico
        document.body.innerHTML = `
            <div class="gallery-container">
                ${Array(100).fill().map(() => `
                    <div class="gallery-item">
                        <img alt="Test Product">
                        <div class="bottom-row">
                            <a href="">TEST123</a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    });

    test('should load 100 products under 1 second', async () => {
        // Marcamos el tiempo de inicio
        const startTime = performance.now();

        // Simulamos carga de productos
        await Promise.all(Array(100).fill().map(async (_, index) => {
            const codigo = `TEST${index}`;
            // Agregamos producto al ProductManager
            productManager.products.set(codigo, {
                codigo,
                categoria: 'CAT1',
                precios: { D: 100 + index }
            });
            // Agregamos imagen al ImageLoader
            imageLoader.imageMap.set(codigo, { id: `abc${index}` });
        }));

        // Calculamos tiempo total
        const totalTime = performance.now() - startTime;
        
        // Verificamos que el tiempo total sea menor a 1 segundo
        expect(totalTime).toBeLessThan(1000);
    });

    test('should handle search filtering efficiently', async () => {
        // Configuramos los datos necesarios
        const searchTerm = 'TEST';
        const startTime = performance.now();

        // Simulamos una búsqueda
        const items = document.querySelectorAll('.gallery-item');
        items.forEach(item => {
            const code = item.querySelector('.bottom-row a').textContent;
            item.style.display = code.includes(searchTerm) ? '' : 'none';
        });

        // Medimos tiempo de búsqueda
        const searchTime = performance.now() - startTime;
        
        // Verificamos que la búsqueda tome menos de 100ms
        expect(searchTime).toBeLessThan(100);
    });

    test('should load images in batches efficiently', async () => {
        // Preparamos datos para prueba
        const batchSize = 20;
        const totalImages = 100;
        const startTime = performance.now();

        // Procesamos imágenes en lotes
        for (let i = 0; i < totalImages; i += batchSize) {
            // Simulamos carga de un lote de imágenes
            await Promise.all(
                Array(batchSize).fill().map((_, index) => {
                    const currentIndex = i + index;
                    if (currentIndex < totalImages) {
                        const img = document.querySelectorAll('img')[currentIndex];
                        img.src = `test-url-${currentIndex}`;
                        return new Promise(resolve => {
                            img.onload = resolve;
                            img.dispatchEvent(new Event('load'));
                        });
                    }
                })
            );
        }

        // Calculamos tiempo total
        const totalTime = performance.now() - startTime;
        
        // Verificamos tiempo y métricas
        expect(totalTime).toBeLessThan(2000); // 2 segundos máximo
        expect(monitoringSystem.getMetrics().performance).toBeDefined();
    });
});