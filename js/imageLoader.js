/**
 * Gestor de carga y optimización de imágenes
 * @module ImageLoader
 */

// ELIMINAR esta importación ya que no la usaremos más
// import CacheManager from './cacheManager.js';
import MonitoringSystem from './MonitoringSystem.js';
import AdvancedCacheManager from './AdvancedCacheManager.js';


class ImageLoader {
  /**
   * @param {Object} config - Configuración del loader
   * @param {CacheManager} config.cacheManager - Instancia de CacheManager
   * @param {string} config.sheetId - ID de Google Sheet
   * @param {Object} config.resolutions - Configuración de resoluciones
   */

  // Propiedad estática privada para la instancia única
  static #instance = null;
    
  // Propiedad privada para control de inicialización
  #initialized = false;

  /**
   * Obtiene la instancia única de ImageLoader
   * @param {Object} config Configuración opcional
   * @returns {ImageLoader}
   */
  static getInstance(config = {}) {
      if (!ImageLoader.#instance) {
          ImageLoader.#instance = new ImageLoader(config);
      }
      return ImageLoader.#instance;
  }

  /**
   * Constructor privado
   * @param {Object} param0 Configuración del loader
   */

  // Usa la desestructuración para extraer monitoringSystem y cualquier otra configuración adicional (...config)
  constructor({ monitoringSystem, ...config }= {}) {

      // Si ya existe una instancia, devolver la existente
      if (ImageLoader.#instance) {
        console.log('[ImageLoader] Retornando instancia existente');
        return ImageLoader.#instance;
    }    

      // 1. Inicialización por defecto de métricas (siempre asegura que exista)
      this.metrics = {
          totalImages: 0,
          loadedImages: 0,
          cacheHits: 0,
          lazyLoaded: 0,
          errors: 0,
          totalLoadTime: 0,
          preloadedImages: 0
      };

      // Asegurarnos de que AdvancedCacheManager está disponible
      if (typeof AdvancedCacheManager !== 'function') {
        console.error('AdvancedCacheManager no está disponible:', AdvancedCacheManager);
        throw new Error('AdvancedCacheManager no está disponible');
      }


      //Inicializa una instancia de AdvancedCacheManager y la asigna a this.cache.
      // Verificar la instanciación del cache
      console.log('[ImageLoader] Inicializando AdvancedCacheManager');
      this.cache = AdvancedCacheManager.getInstance();
      // Asigna el parámetro monitoringSystem al atributo monitor.
      this.monitor = monitoringSystem;
      // Verificar que el monitor se creó correctamente
      console.log('[ImageLoader] Monitor inicializado:', {
        hasTrackPerformance: typeof this.monitor?.trackPerformance === 'function',
        hasTrackError: typeof this.monitor?.trackError === 'function'
      });

      // Verificar que el cache se creó correctamente
      console.log('[ImageLoader] Cache inicializado:', {
          hasGet: typeof this.cache.get === 'function',
          hasSet: typeof this.cache.set === 'function',
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.cache))
      });

      // Verificar dependencias
      if (!this.cache) {
        throw new Error('AdvancedCacheManager no está disponible');
      }



      
       this.config = {
      // Incluye configuraciones para monitoringSystem, cacheManager, sheetId, sheetsUrl, resolutions, lazyLoading, formats, y fallback.  
      monitoringSystem : config.monitoringSystem || new MonitoringSystem(),
      // Ya no necesitamos cacheManager aquí
      // cacheManager: config.cacheManager || new CacheManager(),
      sheetId: config.sheetId || null,
      sheetsUrl: config.apiEndpoints?.sheets || 'https://docs.google.com/spreadsheets/d',

      resolutions: {
            mobile: { width: 320, height: 320, quality: 60 },
            tablet: { width: 640, height: 640, quality: 80 },
            desktop: { width: 1024, height: 1024, quality: 100 },
            // Agregar nuevas calidades progresivas
            thumbnail: { width: 20, height: 20, quality: 10 },
            preview: { width: 100, height: 100, quality: 50 },
            full: { width: 800, height: 800, quality: 100 },
            ...config.resolutions 
      },
        lazyLoading: {
            enabled: true,
            rootMargin: '50px 0px',
            threshold: 0.1,
            placeholderImage: '/img/placeholder.jpg',
            useProgressiveLoad: true, // Nueva opción
            ...config.lazyLoading
      },
        formats: {
          webp: {quality: 80 },
          fallback: {format: 'jpeg', quality: 85},
          enabled: true,
          quality: 80,
          ...config.formats?.webp
      },
        fallback: {
            format: 'jpeg',
            quality: 85,
            ...config.formats?.fallback
      }
    };

      // Mapas de datos
      // Inicializa imageMap como una nueva instancia de Map para almacenar los datos de las imágenes.
      this.imageMap = new Map();
      // Inicializa loadingPromises como una nueva instancia de Map para rastrear las promesas de carga.
      this.loadingPromises = new Map();
      // Lazy loading
      // Inicializa imageObserver como null y observedImages como un nuevo Set.
      this.imageObserver = null;
      this.observedImages = new Set();


        // Restaurar estado de sessionStorage si existe
        const savedState = sessionStorage.getItem('imageLoader_state');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.#initialized = state.initialized;
                if (state.imageMap) {
                    this.imageMap = new Map(state.imageMap);
                }
                // Métricas
                // Define el objeto metrics para rastrear varias métricas relacionadas con la carga de imágenes.
                this.metrics = state.metrics || {
                  totalImages: 0,
                  loadedImages: 0,
                  cacheHits: 0,
                  lazyLoaded: 0,
                  errors: 0,
                  totalLoadTime: 0,
                  preloadedImages: 0
                };
              } catch (error) {
                console.error('[ImageLoader] Error restaurando estado:', error);
                this.#initialized = false;
              }
      ImageLoader.#instance = this;
      console.log('[ImageLoader] Constructor - Fin');
  }

      // Detectar soporte de WebP
      // Llama al método checkWebPSupport para detectar si el navegador soporta WebP y asigna el resultado a supportsWebP.
      this.supportsWebP = this.checkWebPSupport();

      // Asignar la instancia
      ImageLoader.#instance = this;

      // Lazy loading
      this.observedImages = new Set();
    
    // Inicializar IntersectionObserver si está disponible en el navegador
    if (typeof IntersectionObserver !== 'undefined') {
        this.imageObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const realSrc = img.dataset.src;
                        if (realSrc) {
                            img.src = realSrc;
                            img.classList.remove('lazy-image');
                            this.imageObserver.unobserve(img);
                            this.observedImages.delete(img);
                            this.metrics.lazyLoaded++;
                        }
                    }
                });
            },
            {
                rootMargin: this.config.lazyLoading.rootMargin,
                threshold: this.config.lazyLoading.threshold
            }
        );
      }
  
    console.log('[ImageLoader] Constructor - Fin');

  }

    // Método para detectar soporte de WebP
    checkWebPSupport() {
      // En un entorno de pruebas, usar valor por defecto
      /* if (process.env.NODE_ENV === 'test') {
          return true;
      } */
      
      // En entorno real, hacer la detección
      try {
          const elem = document.createElement('canvas');
          return !!(elem.getContext && elem.getContext('2d')) &&
              elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      } catch (e) {
          return false;
      }
  }

  /**
   * Inicializa el loader con datos
   */
  async initialize() {
   
     // Verificar si ya está inicializado (nuevo)
     if (this.#initialized) {
        console.log('[ImageLoader] Ya inicializado, omitiendo...');
        return true;
    }
    
    try {
      console.log('[ImageLoader] 🚀 Iniciando inicialización...');
      const startTime = performance.now();

      // 1. Configurar lazy loading si está habilitado
      if (this.config.lazyLoading.enabled) {
        console.log('[ImageLoader] 🔄 Configurando lazy loading...');
        this._initializeLazyLoading();
    }

      //2. Verificar el cache antes de usarlo
      if (!this.cache || typeof this.cache.get !== 'function') {
        throw new Error('Cache no inicializado correctamente');
    }

      // 3. Intentar cargar datos desde caché
      const cachedData = await this.cache.get('image_data');
      console.log('[ImageLoader] Cache check:', cachedData ? 'Hit' : 'Miss');


      if (cachedData) {
        console.log('[ImageLoader] 📦 Cargando imágenes desde caché...');
        this.imageMap = new Map(Object.entries(cachedData));
        console.log(`[ImageLoader] ✅ ${this.imageMap.size} imágenes cargadas desde caché`);
        this.metrics.totalImages = this.imageMap.size;

        // Marcar como inicializado antes de retornar (nuevo)
        this.#initialized = true;
        return true;

      } else {
        // Si no hay cache, cargar datos frescos
        console.log('[ImageLoader] 🔄 No hay caché, cargando datos frescos...');
        await this.loadImageData();

        }

        // Guardar estado
        this.#saveState();
            
        // Registrar métricas
        const loadTime = performance.now() - startTime;
        this.monitor?.trackPerformance('imageLoaderInit', loadTime);

        this.#initialized = true;
        return true;

    } catch (error) {
        // Log más detallado del error (mejorado)
        console.error('[ImageLoader] ❌ Error en inicialización:', error);
        this.monitor?.trackError(error, 'initialize');
        return false;
    }
  }

   /**
     * Guarda el estado actual en sessionStorage
     * @private
     */
   #saveState() {
    try {
        const state = {
            initialized: this.#initialized,
            imageMap: Array.from(this.imageMap.entries()),
            metrics: this.metrics
        };
        sessionStorage.setItem('imageLoader_state', JSON.stringify(state));
    } catch (error) {
        console.error('[ImageLoader] Error guardando estado:', error);
        this.monitor.trackError(error, 'saveState');
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
      await this.cache.set('image_data', Object.fromEntries(this.imageMap));
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
  _initializeLazyLoading() {
    if (!('IntersectionObserver' in window)) {
        console.warn('Lazy loading no soportado, usando carga inmediata');
        this.config.lazyLoading.enabled = false;
        return;
    }

    this.imageObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this._loadLazyImage(entry.target);
                    observer.unobserve(entry.target);
                    this.observedImages.delete(entry.target);
                }
            });
        },
        {
            rootMargin: this.config.lazyLoading.rootMargin,
            threshold: this.config.lazyLoading.threshold
        }
    );
}

  _getUrl(codigo) {

    const imageData = this.imageMap.get(codigo);
    if (!imageData) return '';

    const { width, height } = this.config.resolutions['desktop'];
    //return `https://lh3.googleusercontent.com/d/${imageData.id}=w${width}-h${height}`;
    return `https://drive.google.com/uc?export=view&id=${imageData.id}`;
  }

  async getImageUrl(codigo, resolution = 'desktop', imgElement = null) {
    const startTime = performance.now();
    
    try {

        const imageData = this.imageMap.get(codigo);

        console.log('Generando URL para código:', codigo);
        console.log('Datos de imagen encontrados:', imageData);

        // 1. Sistema de caché simple
        const cacheKey = `img_${codigo}`;
        const cachedUrl = await this.cache.get(cacheKey);
        
        if (cachedUrl) {
            this.monitor?.trackPerformance('cacheHit', performance.now() - startTime);
            return cachedUrl;
        }

        // 2. Obtener datos de la imagen
        //const imageData = this.imageMap.get(codigo);
        if (!imageData) {
            this.monitor?.trackError(new Error(`Image data not found for codigo: ${codigo}`), 
                'getImageUrl', { codigo });
            return '';
        }

        // 3. Generar URL exactamente en el formato que funciona
        //const generatedUrl = `https://lh3.googleusercontent.com/d/${imageData.id}`;
        const generatedUrl = `https://drive.google.com/uc?export=view&id=${imageData.id}`;
        console.log('URL generada:', generatedUrl); // Debug log

        // 4. Lazy loading
        if (imgElement && this.config.lazyLoading.enabled) {
            imgElement.classList.add('lazy-image');
            imgElement.setAttribute('data-src', generatedUrl);
            this.setupLazyImage(imgElement, codigo, resolution);
            return this.config.lazyLoading.placeholderImage;
        }
        
        // 5. Caché
        await this.cache.set(cacheKey, generatedUrl);

        return generatedUrl;
    } catch (error) {
        console.error('Error en getImageUrl:', error);
        return '';
    }
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
      const cached = await this.cache.get(cacheKey);
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
          this.metrics.preloadedImages++;
          this.metrics.totalLoadTime += performance.now() - startTime;
          await this.config.cache.set(cacheKey, true);
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
  setupLazyImage(img, codigo, resolution) {

    // Asegurarnos de que img es válido
    if (!img || !(img instanceof HTMLImageElement)) {
      console.error('setupLazyImage: Invalid image element');
      return;
    }

    // Guardar la URL real en data-src
    this.getImageUrl(codigo, resolution)
        .then(url => {
            img.setAttribute('data-src', url);
        })
        .catch(error => {
            console.error('Error getting image URL:', error);
        });

    if (!this.config.lazyLoading.enabled || !this.imageObserver)
      console.log('Lazy loading no habilitado o observer no disponible');
      return;

     // Configurar la imagen para lazy loading
    img.src = this.config.lazyLoading.placeholderImage;
    img.dataset.codigo = codigo;
    img.dataset.resolution = resolution;
    img.classList.add('lazy-image'); // Asegurarnos que esta línea se ejecuta

    if (!this.observedImages.has(img)) {
        this.imageObserver.observe(img);
        this.observedImages.add(img);
    }
}

async _loadLazyImage(img) {

    //El método es asincrónico (async) y usa un bloque try-catch para manejar posibles errores.
    try {
        
        //Obtiene el codigo y la resolution de los atributos dataset del elemento img.
        const codigo = img.dataset.codigo;
        // Si codigo no está definido, el método retorna inmediatamente y no hace nada más.
        const resolution = img.dataset.resolution;
        if (!codigo) return;

        // Guarda el tiempo actual para medir cuánto tiempo toma cargar la imagen.
        const startTime = performance.now();
        // Llama al método getImageUrl para obtener la URL de la imagen basada en el codigo y resolution.
        const imageUrl = this.getImageUrl(codigo, resolution);

        // Llama al método _loadLazyImage de la clase padre (superclase) para realizar cualquier carga necesaria definida en la superclase.
        await super._loadLazyImage(img);
        // Registra el tiempo tomado para cargar la imagen utilizando performance.now() y la diferencia con startTime.
        this.monitoringSystem.trackPerformance('imageLoad', 
        performance.now() - startTime);
        // Llama al método _loadImageWithPromise para cargar la imagen utilizando la URL obtenida y espera a que la carga finalice.
        await this._loadImageWithPromise(img, imageUrl);
        // Incrementa el contador de lazyLoaded en metrics.  
        this.metrics.lazyLoaded++;
        // Agrega el tiempo total de carga al contador totalLoadTime.
        this.metrics.totalLoadTime += performance.now() - startTime;
    } catch (error) {

        // Si ocurre un error durante el proceso de carga:
        // Imprime un mensaje de error en la consola.
        // Registra el error en monitoringSystem.
        // Incrementa el contador de errors en metrics.
        // Añade la clase 'error' al elemento img.
        // Establece la imagen placeholder como el src del elemento img.

        console.error('Error en lazy loading:', error);
        this.monitoringSystem.trackError(error, 'lazyLoad');
        this.metrics.errors++;
        img.classList.add('error');
        img.src = this.config.lazyLoading.placeholderImage;
    }
}

async _loadImageWithPromise(img, url) {
    return new Promise((resolve, reject) => {
        const tempImage = new Image();
        tempImage.onload = () => {
            img.src = url;
            img.classList.add('loaded');
            resolve();
        };
        tempImage.onerror = reject;
        tempImage.src = url;
    });
}

  getMetrics() {
    return {
      ...this.metrics,
      averageLoadTime: this.metrics.loadedImages ? 
        (this.metrics.totalLoadTime / this.metrics.loadedImages).toFixed(2) : 0,
      cacheHitRate: (this.metrics.cacheHits / 
        (this.metrics.loadedImages + this.metrics.cacheHits)).toFixed(2),
      successRate: (this.metrics.loadedImages / 
        (this.metrics.loadedImages + this.metrics.errors)).toFixed(2),
        lazyLoadRate: (this.metrics.lazyLoaded / this.metrics.totalImages).toFixed(2)
    };
}

  cleanup() {
      if (this.imageObserver) {
          this.imageObserver.disconnect();
          this.observedImages.clear();
      }
  }

    async loadProgressively(codigo) {
      const startTime = performance.now();
      try {

           // Verificar si existe la imagen
            const imageData = this.imageMap.get(codigo);
            if (!imageData) {
                this.monitor?.trackError(
                    new Error(`Image not found: ${codigo}`),
                    'loadProgressively'
                );
                return null;
            }

          // Intentar obtener de caché primero
          const cachedUrls = await this.cache.get(`progressive_${codigo}`);
          if (cachedUrls) {
              this.monitor?.trackPerformance('cacheHit', performance.now() - startTime);
              return cachedUrls;
          }

          // Generar URLs para diferentes calidades
          const urls = {
              thumbnail: await this.getImageUrl(codigo, 'thumbnail'),
              preview: await this.getImageUrl(codigo, 'preview'),
              full: await this.getImageUrl(codigo, 'full')
          };

          // Verificar que al menos una URL se generó correctamente
            if (!urls.thumbnail && !urls.preview && !urls.full) {
              return null;
            }

          // Guardar en caché
          await this.cache.set(`progressive_${codigo}`, urls);
          this.monitor?.trackPerformance('progressiveLoad', performance.now() - startTime);

          // Registrar métrica al final
          const duration = performance.now() - startTime;
          this.monitor?.trackPerformance('progressiveLoad', duration, {
            codigo,
            success: true
          });



          return urls;
      } catch (error) {
        const duration = performance.now() - startTime;
        this.monitor?.trackPerformance('progressiveLoad', duration, {
            codigo,
            success: false,
            error: error.message
        });
        this.monitor?.trackError(error, 'loadProgressively', { codigo });
        return null;
      }
  }




}

export default ImageLoader;