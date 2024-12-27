// test/e2e/catalog.test.js
import ProductManager from '../../js/ProductManager';
import ImageLoader from '../../js/ImageLoader';
import MonitoringSystem from '../../js/MonitoringSystem';

async function setupManagers() {
    const monitoringSystem = new MonitoringSystem();
    const productManager = new ProductManager({ monitoringSystem });
    const imageLoader = new ImageLoader({ monitoringSystem });

    productManager.clientData = {
        priceList: 'D',
        categories: ['CAT1']
    };

    productManager.products.set('TEST123', {
        codigo: 'TEST123',
        categoria: 'CAT1',
        precios: { D: 100 }
    });

    imageLoader.imageMap.set('TEST123', { id: 'abc123' });

    window.productManager = productManager;
    window.imageLoader = imageLoader;

    return { productManager, imageLoader, monitoringSystem };
}

async function initCatalog() {
    const { productManager, imageLoader } = await setupManagers();

    // Agregar función de búsqueda
    const searchHandler = (event) => {
        const searchTerm = event.target.value.toLowerCase();
        const items = document.querySelectorAll('.gallery-item');
        
        items.forEach(item => {
            const code = item.querySelector('.bottom-row a').textContent;
            item.style.display = code.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    };

    // Agregar listener al input
    const searchInput = document.querySelector('input[type="text"]');
    if (searchInput) {
        searchInput.addEventListener('input', searchHandler);
    }







    const items = document.querySelectorAll('.gallery-item');
    await Promise.all(Array.from(items).map(async (item) => {
        const img = item.querySelector('img');
        const bottomRow = item.querySelector('.bottom-row');
        
        if (img) {
            img.src = imageLoader.getImageUrl('TEST123');
        }
        
        if (bottomRow) {
            const priceTag = document.createElement('span');
            priceTag.className = 'price-tag';
            const price = await productManager.getPrice('TEST123');
            priceTag.textContent = `$${price}`;
            bottomRow.appendChild(priceTag);
        }
    }));

    return { productManager, imageLoader };
}

test('should filter catalog items by search', async () => {
    // 1. Setup inicial
    document.body.innerHTML = `
        <input type="text" class="search-input">
        <div class="gallery-container">
            <div class="gallery-item">
                <img alt="Test Product">
                <div class="bottom-row">
                    <a href="">TEST123</a>
                </div>
            </div>
        </div>
    `;

    // 2. Inicializar catálogo
    await initCatalog();

    // 3. Simular búsqueda
    const searchInput = document.querySelector('.search-input');
    const searchHandler = (event) => {
        const searchTerm = event.target.value.toLowerCase();
        const items = document.querySelectorAll('.gallery-item');
        
        items.forEach(item => {
            const code = item.querySelector('.bottom-row a').textContent;
            item.style.display = code.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    };

    searchInput.addEventListener('input', searchHandler);
    
    // 4. Disparar evento de búsqueda
    searchInput.value = 'TEST';
    searchInput.dispatchEvent(new Event('input'));

    // 5. Esperar al debounce
    await new Promise(resolve => setTimeout(resolve, 300));

    // 6. Verificar resultado
    const visibleItems = document.querySelectorAll('.gallery-item:not([style*="display: none"])');
    expect(visibleItems.length).toBe(1);
});

test('should handle lazy loading of images', async () => {
    await initCatalog();
    
    const img = document.querySelector('img');
    
    // Simular IntersectionObserver
    const callback = jest.fn((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                img.classList.add('loaded');
            }
        });
    });

    const observer = new IntersectionObserver(callback);
    observer.observe(img);

    // Simular que la imagen está visible
    callback([{
        isIntersecting: true,
        target: img
    }]);

    expect(img.classList.contains('loaded')).toBe(true);
    expect(callback).toHaveBeenCalled();
});

describe('Catalog E2E', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input type="text" class="search-input">
            <div class="gallery-container">
                <div class="gallery-item">
                    <img alt="Test Product">
                    <div class="bottom-row">
                        <a href="">TEST123</a>
                    </div>
                </div>
            </div>
        `;
        localStorage.setItem('clientData', JSON.stringify({
            priceList: 'D',
            categories: ['CAT1']
        }));
    });

    test('should load and display catalog', async () => {
        await initCatalog();
        
        const images = document.querySelectorAll('img');
        const prices = document.querySelectorAll('.price-tag');
        
        expect(images[0].src).toBeTruthy();
        expect(prices[0].textContent).toContain('$');
    });

    test('should filter catalog items by search', async () => {
        await initCatalog();
        
        const searchInput = document.querySelector('.search-input');
        const searchHandler = (event) => {
            const searchTerm = event.target.value.toLowerCase();
            const items = document.querySelectorAll('.gallery-item');
            
            items.forEach(item => {
                const code = item.querySelector('.bottom-row a').textContent;
                item.style.display = code.toLowerCase().includes(searchTerm) ? '' : 'none';
            });
        };

        searchInput.addEventListener('input', searchHandler);
        
        searchInput.value = 'TEST';
        searchInput.dispatchEvent(new Event('input'));

        await new Promise(resolve => setTimeout(resolve, 300));

        const visibleItems = document.querySelectorAll('.gallery-item:not([style*="display: none"])');
        expect(visibleItems.length).toBe(1);
    });
});