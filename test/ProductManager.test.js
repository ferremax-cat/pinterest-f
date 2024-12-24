// test/ProductManager.test.js
import ProductManager from '../js/ProductManager';
import CacheManager from '../js/cacheManager';

describe('ProductManager', () => {
  let productManager;
  let mockCacheManager;

  beforeEach(() => {
    mockCacheManager = new CacheManager();
    productManager = new ProductManager({ 
      cacheManager: mockCacheManager,
      clientData: {
        account: 'TEST',
        priceList: 'D',
        categories: ['CAT1']
      }
    });
  });

  test('should initialize correctly', () => {
    expect(productManager.products).toBeDefined();
    expect(productManager.categoryIndex).toBeDefined();
  });

  test('getProduct returns correct product', () => {
   
   
    const testProduct = { codigo: 'TEST123', nombre: 'Test Product' };
    productManager.products.set('TEST123', testProduct);
    expect(productManager.getProduct('TEST123')).toEqual(testProduct);
  });

  test('getPrice returns correct price for product', async () => {
    // Mock cliente y producto
    productManager.clientData = {
        priceList: 'D',
        categories: ['CAT1']
    };

    const testProduct = {
        codigo: 'TEST123',
        categoria: 'CAT1',
        precios: { D: 100 }
    };
    
    productManager.products.set('TEST123', testProduct);

    const price = await productManager.getPrice('TEST123');
    expect(price).toBe(100);
  });


});