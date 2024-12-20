/**
 * Gestor de carga y optimización de imágenes
 * @module ImageLoader
 */

import CacheManager from '../CacheManager.js';

class ImageLoader {
  /**
   * @param {Object} config - Configuración del loader
   * @param {CacheManager} config.cacheManager - Instancia de CacheManager
   * @param {string} config.sheetId - ID de Google Sheet
   * @param {Object} config.resolutions - Configuración de resoluciones
   */
  constructor(config = {}) {
    this.config = {
      cacheManager: config.cacheManager || new CacheManager(),
      sheetId: config.sheetId || null,
      sheetsUrl: config.apiEndpoints?.sheets || 'https://docs.google.com/spreadsheets/d',
      resolutions: {
        mobile: { width: 320, height: 320 },
        tablet: { width: 640, height: 640 },
        desktop: { width: 1024, height: 1024 },
        ...config.resolutions
      }
    };

    // Mapas de datos
    this.imageMap = new Map();
    this.loadingPromises = new Map();

    // Métricas
    this.metrics = {
      totalImages: 0,
      loadedImages: 0,
      cacheHits: 0,
      errors: 0,
      totalLoadTime: 0
    };
  }

  /**
   * Inicializa el loader con datos
   */
  async initialize() {
    try {
      // Intentar cargar datos desde cache
      const cachedData = await this.config.cacheManager.get('image_data');
      if (cachedData) {
        this.imageMap = new Map(Object.entries(cachedData));
        this.metrics.totalImages = this.imageMap.size;
        console.log('Datos de imágenes cargados desde cache');
        return true;
      }

      // Si no hay cache, cargar datos frescos
      await this.loadImageData();
      return true;
    } catch (error) {
      console.error('Error initializing ImageLoader:', error);
      return false;
    }
  }

  /**
   * Carga datos de imágenes desde Google Sheets
   * @private
   */
  async loadImageData() {
    try {
      if (!this.config.sheetId) {
        throw new Error('SheetId no configurado');
      }

      const sheetUrl = `${this.config.sheetsUrl}/${this.config.sheetId}/gviz/tq?tqx=out:json`;
      const response = await fetch(sheetUrl);
      const text = await response.text();
      const json = JSON.parse(text.substr(47).slice(0, -2));

      // Procesar datos
      json.table.rows.forEach(row => {
        if (row.c[0]?.v && row.c[1]?.v) {
          const nombreArchivo = row.c[0].v;
          const codigo = nombreArchivo.replace(/\.(jpg|webp|png)$/, '');
          const id = row.c[1].v;

          this.imageMap.set(codigo, {
            id,
            formats: ['webp', 'jpg'],
            lastUpdate: Date.now()
          });
        }
      });

      // Guardar en cache
      await this.config.cacheManager.set('image_data', Object.fromEntries(this.imageMap));
      this.metrics.totalImages = this.imageMap.size;

      console.log(`Datos de imágenes cargados: ${this.imageMap.size} imágenes`);
    } catch (error) {
      console.error('Error cargando datos de imágenes:', error);
      throw error;
    }
  }

  /**
   * Obtiene la URL de una imagen
   * @param {string} codigo - Código del producto
   * @param {string} [resolution='desktop'] - Resolución deseada
   * @returns {string} URL de la imagen
   */
  getImageUrl(codigo, resolution = 'desktop') {
    const imageData = this.imageMap.get(codigo);
    if (!imageData) return '';

    const { width, height } = this.config.resolutions[resolution] || 
                            this.config.resolutions.desktop;

    return `https://lh3.googleusercontent.com/d/${imageData.id}=w${width}-h${height}`;
  }

  /**
   * Precarga una imagen
   * @param {string} codigo - Código del producto
   * @param {string} [resolution='desktop'] - Resolución deseada
   * @returns {Promise<boolean>} True si la carga fue exitosa
   */
  async preloadImage(codigo, resolution = 'desktop') {
    try {
      const url = this.getImageUrl(codigo, resolution);
      if (!url) return false;

      const cacheKey = `img_${codigo}_${resolution}`;
      
      // Verificar si ya está en cache
      const cached = await this.config.cacheManager.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return true;
      }

      // Evitar cargas duplicadas
      if (this.loadingPromises.has(cacheKey)) {
        return this.loadingPromises.get(cacheKey);
      }

      // Cargar imagen
      const loadPromise = new Promise((resolve) => {
        const startTime = performance.now();
        const img = new Image();
        
        img.onload = async () => {
          this.metrics.loadedImages++;
          this.metrics.totalLoadTime += performance.now() - startTime;
          await this.config.cacheManager.set(cacheKey, true);
          resolve(true);
        };

        img.onerror = () => {
          this.metrics.errors++;
          resolve(false);
        };

        img.src = url;
      });

      this.loadingPromises.set(cacheKey, loadPromise);
      const result = await loadPromise;
      this.loadingPromises.delete(cacheKey);
      
      return result;
    } catch (error) {
      console.error('Error preloading image:', error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Precarga un conjunto de imágenes
   * @param {Array<string>} codigos - Lista de códigos
   * @param {string} [resolution='desktop'] - Resolución deseada
   * @returns {Promise<Object>} Resultado de la carga
   */
  async preloadImages(codigos, resolution = 'desktop') {
    const results = await Promise.allSettled(
      codigos.map(codigo => this.preloadImage(codigo, resolution))
    );

    return {
      total: codigos.length,
      success: results.filter(r => r.status === 'fulfilled' && r.value).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value).length
    };
  }

  /**
   * Obtiene las dimensiones óptimas para una resolución
   * @param {string} resolution - Nombre de la resolución
   * @returns {Object} Dimensiones en píxeles
   */
  getOptimalDimensions(resolution) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const dimensions = this.config.resolutions[resolution] || 
                      this.config.resolutions.desktop;

    return {
      width: Math.round(dimensions.width * devicePixelRatio),
      height: Math.round(dimensions.height * devicePixelRatio)
    };
  }

  /**
   * Obtiene métricas del loader
   * @returns {Object} Métricas actuales
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageLoadTime: this.metrics.loadedImages ? 
        (this.metrics.totalLoadTime / this.metrics.loadedImages).toFixed(2) : 0,
      cacheHitRate: (this.metrics.cacheHits / 
        (this.metrics.loadedImages + this.metrics.cacheHits)).toFixed(2),
      successRate: (this.metrics.loadedImages / 
        (this.metrics.loadedImages + this.metrics.errors)).toFixed(2)
    };
  }
}

export default ImageLoader;