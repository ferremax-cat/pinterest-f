// Importamos las dependencias necesarias
import ProductManager from '../../js/productManager.js';
import ImageLoader from '../../js/imageLoader.js';
import MonitoringSystem from '../../js/MonitoringSystem.js';

describe('Catalog Load Tests', () => {
    // Variables que necesitaremos en todas las pruebas
    let productManager;
    let imageLoader;
    let monitoringSystem;
    let initialMemory;

    // Configuración antes de cada prueba
    beforeEach(() => {
        // Guardamos el uso de memoria inicial
        initialMemory = process.memoryUsage().heapUsed;
        
        // Inicializamos los sistemas
        monitoringSystem = new MonitoringSystem();
        productManager = new ProductManager({ monitoringSystem });
        imageLoader = new ImageLoader({ monitoringSystem });

        // Simulamos datos del cliente
        productManager.clientData = {
            priceList: 'D',
            categories: ['CAT1']
        };
    });

    test('should handle loading 1000+ products efficiently', async () => {
        // Marcamos tiempo inicial
        const startTime = performance.now();
        
        // Generamos 1000 productos de prueba
        const products = Array(1000).fill().map((_, index) => ({
            codigo: `PROD${index}`,
            categoria: 'CAT1',
            precios: { D: 100 + index },
            nombre: `Producto ${index}`
        }));

        // Los cargamos en el ProductManager
        products.forEach((product, index) => {
            productManager.products.set(product.codigo, product);
            imageLoader.imageMap.set(product.codigo, { 
                id: `img${index}` 
            });
        });

        // Calculamos tiempo total de carga
        const loadTime = performance.now() - startTime;
        
        // Calculamos uso de memoria
        const memoryUsed = process.memoryUsage().heapUsed - initialMemory;

        // Verificamos rendimiento
        expect(loadTime).toBeLessThan(1000); // Menos de 1 segundo
        expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // Menos de 50MB
        expect(productManager.products.size).toBe(1000);
    });

    test('should handle multiple concurrent requests', async () => {
        // Simulamos múltiples peticiones concurrentes
        const concurrentRequests = 50;
        const startTime = performance.now();

        // Creamos array de promesas de peticiones
        const requests = Array(concurrentRequests).fill().map(async (_, index) => {
            const codigo = `PROD${index}`;
            // Simulamos carga de producto e imagen
            await Promise.all([
                productManager.getPrice(codigo),
                imageLoader.getImageUrl(codigo)
            ]);
        });

        // Esperamos que todas las peticiones terminen
        await Promise.all(requests);
        const totalTime = performance.now() - startTime;

        // Verificamos tiempo de respuesta
        expect(totalTime).toBeLessThan(2000); // Menos de 2 segundos
    });

    test('should handle slow network conditions', async () => {
        // Simulamos conexión lenta
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockImplementation(() => 
            new Promise(resolve => 
                setTimeout(() => resolve({
                    ok: true,
                    text: () => Promise.resolve('{"data": []}')
                }), 100) // 100ms de latencia
            )
        );

        const startTime = performance.now();
        
        // Intentamos cargar datos
        await productManager.initialize();
        
        const loadTime = performance.now() - startTime;

        // Restauramos fetch original
        global.fetch = originalFetch;

        // Verificamos manejo de latencia
        expect(loadTime).toBeLessThan(3000); // Menos de 3 segundos
        expect(monitoringSystem.metrics.errors.count).toBe(0);
    });

    test('should maintain performance with large DOM', async () => {
        // Creamos un DOM grande
        document.body.innerHTML = `
            <div class="gallery-container">
                ${Array(500).fill().map((_, i) => `
                    <div class="gallery-item">
                        <img alt="Product ${i}">
                        <div class="bottom-row">
                            <a href="">PROD${i}</a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        const startTime = performance.now();

        // Intentamos actualizar todo el DOM
        const items = document.querySelectorAll('.gallery-item');
        items.forEach(async (item, index) => {
            const codigo = `PROD${index}`;
            const img = item.querySelector('img');
            const price = await productManager.getPrice(codigo);
            
            if (img) img.src = imageLoader.getImageUrl(codigo);
            if (price) {
                const priceEl = document.createElement('span');
                priceEl.textContent = `$${price}`;
                item.appendChild(priceEl);
            }
        });

        const updateTime = performance.now() - startTime;

        // Verificamos rendimiento de DOM
        expect(updateTime).toBeLessThan(1000); // Menos de 1 segundo
        expect(document.querySelectorAll('.gallery-item').length).toBe(500);
    });
});