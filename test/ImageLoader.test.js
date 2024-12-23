// tests/ImageLoader.test.js
import ImageLoader from '../js/ImageLoader';
import CacheManager from '../js/CacheManager';

describe('ImageLoader', () => {
  let imageLoader;
  let mockCacheManager;

  beforeEach(() => {
    mockCacheManager = new CacheManager();
    imageLoader = new ImageLoader({
      cacheManager: mockCacheManager,
      sheetId: 'test-sheet-id'
    });
  });

  test('should initialize properly', () => {
    expect(imageLoader).toBeDefined();
    expect(imageLoader.imageMap).toBeDefined();
  });

  test('getImageUrl returns correct URL', () => {
    imageLoader.imageMap.set('TEST123', { id: 'abc123' });
    const url = imageLoader.getImageUrl('TEST123', 'desktop');
    expect(url).toContain('abc123');
  });

  test('lazy loading setup works', () => {
    const img = document.createElement('img');
    imageLoader.setupLazyImage(img, 'TEST123', 'desktop');
    expect(img.classList.contains('lazy-image')).toBe(true);
  });

  // Más pruebas...
});