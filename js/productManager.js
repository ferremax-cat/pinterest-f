/**
 * Gestor centralizado de productos
 * @module ProductManager
 */

// ELIMINAR esta importación ya que no la usaremos más
// import CacheManager from './cacheManager.js';
import MonitoringSystem from './MonitoringSystem.js';
import { config } from './config.js';
import AdvancedCacheManager from './AdvancedCacheManager.js';

/**
 * Gestor principal de productos y sus relaciones
 */
class ProductManager {

  // Propiedad estática privada para la instancia única
  static #instance = null;
    
  // Propiedad privada para control de inicialización
  #initialized = false;

  /**
     * Obtiene la instancia única de ProductManager
     * @param {Object} config Configuración opcional
     * @returns {ProductManager}
     */
  static getInstance(config = {}) {
    if (!ProductManager.#instance) {
        ProductManager.#instance = new ProductManager(config);
    }
    return ProductManager.#instance;
  }

  /**
   * @param {Object} config - Configuración del gestor
   * @param {CacheManager} config.cacheManager - Instancia de CacheManager
   * @param {Object} config.clientData - Datos del cliente actual
   */



  constructor({ monitoringSystem, ...config }= {}) {
    
    // Si ya existe una instancia, devolver la existente
    if (ProductManager.#instance) {
      console.log('[ProductManager] Retornando instancia existente');
      return ProductManager.#instance;
    }


    // Verificar estado guardado
    const savedInitialized = sessionStorage.getItem('productManager_initialized');
    if (savedInitialized === 'true') {
        this.#initialized = true;
    }
   
    // Inicializar dependencias core
    this.cache = AdvancedCacheManager.getInstance();
    //this.monitor = monitoringSystem;
    this.monitor= monitoringSystem || new MonitoringSystem();
    this.clientData = config.clientData || null;

    // Estructuras de datos principales
    this.products = new Map();
    this.categoryIndex = new Map();
    this.priceCache = new Map();

    // Métricas
    this.metrics = {
      totalProducts: 0,
      totalCategories: 0,
      priceCalculations: 0,
      searchOperations: 0
    };
    // Verificar estado previo en sessionStorage
    const savedState = sessionStorage.getItem('productManager_state');

    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            this.#initialized = state.initialized;
            this.metrics = state.metrics;

            // Restaurar productos si existen
            if (state.products) {
                this.products = new Map(state.products);
            }
        } catch (error) {
            console.error('[ProductManager] Error restaurando estado:', error);
            this.#initialized = false;
        }
    }

    ProductManager.#instance = this;
  } 

  /**
   * Inicializa el gestor con datos
   * @param {Object} clientData - Datos del cliente
   * @returns {Promise<boolean>}
   */

  // En el método initialize, cambiar el uso de cacheManager por cache
  async initialize(clientData) {

    console.log('[ProductManager] initialize llamado con:', {
      clientData,
      tieneProductos: this.products?.size,
      initialized: this.#initialized,
      sessionStorageInitialized: sessionStorage.getItem('productManager_initialized'),
      sessionStorageState: sessionStorage.getItem('productManager_state')
      });


    // Verificación de inicialización previa
    if (this.#initialized) {

      console.log('[ProductManager] Estado al iniciar initialize:', {
        initialized: this.#initialized,
        hasSessionStorage: !!sessionStorage.getItem('productManager_initialized')
      });

      console.log('[ProductManager] Ya inicializado, omitiendo...');
      return true;
    }


    console.log('[ProductManager] 🚀 Iniciando inicialización...');
   // this.clientData = clientData;

    console.log('[ProductManager] Inicio initialize:', {
      yaInicializado: this.#initialized,
      tieneClientData: !!clientData,
      tieneCache: !!this.cache
      }); 

     


    try {
          console.log('[ProductManager] 🚀 Paso 1: Verificando clientData...');
          const startTime = performance.now();
          this.clientData = clientData;

          // Verificar el cache antes de usarlo
          if (!this.cache || typeof this.cache.get !== 'function') {
          console.log('[ProductManager] ❌ Error: Cache no inicializado correctamente');
          throw new Error('Cache no inicializado correctamente');
          }
      
          console.log('[ProductManager] ✅ Cache verificado correctamente');
          // Intentar cargar desde cache
          const cachedData = await this.cache.get('products_data');
          console.log('[ProductManager] Datos de caché:', {
            tieneDatos: !!cachedData,
            contenido: cachedData
          });
          
          if (cachedData) {
            console.log('[ProductManager] 📦 Intentando cargar desde caché...');
            const resultado = await this.loadFromCache(cachedData);
            console.log('[ProductManager] Resultado loadFromCache:', {
              resultado,
              productosEnMap: this.products?.size || 0,
              tieneProductos: this.products && this.products.size > 0
            });

            // Si loadFromCache falla o no carga productos, cargar datos frescos
            if (!resultado || this.products.size === 0) {
              console.log('[ProductManager] Caché inválido o sin productos, cargando datos frescos...');
              await this.loadFreshData();
            }


            } else {
                console.log('[ProductManager] 🔄 No hay caché, cargando datos frescos...');
                await this.loadFreshData();
            }
        

          // Guardar estado en sessionStorage
            this.#saveState();
            
            // Registrar métricas
            const loadTime = performance.now() - startTime;
            this.monitor.trackPerformance('productManagerInit', loadTime);
            
            this.#initialized = true;
            return true;


        } catch (error) {

          console.error('[ProductManager] ❌ Error en inicialización:', error);
          // Registrar el error en el sistema de monitoreo si está disponible
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
            metrics: this.metrics,
            products: Array.from(this.products.entries())
          };
          sessionStorage.setItem('productManager_state', JSON.stringify(state));
        } catch (error) {
          console.error('[ProductManager] Error guardando estado:', error);
          this.monitor.trackError(error, 'saveState');
        }
    }

  /**
   * Carga datos desde el cache
   * @private
   * @param {Object} cachedData - Datos cacheados
   */
      async loadFromCache(cachedData) {
        try {

          // Al inicio de loadFromCache
          if (!cachedData.version || cachedData.version !== '1.0') {
            console.log('[ProductManager] Caché obsoleto o sin versión, recargando datos');
            return false;  // Esto forzará la carga de datos frescos
          }


          console.log('[ProductManager] Inicio loadFreshData:', {
            tieneProductos: this.products.size,
            initialized: this.#initialized
          });


            console.log('=== Cargando desde caché ===');
            console.log('Datos recibidos:', {
                tieneProducts: !!cachedData.products,
                tipo: typeof cachedData.products,
                esObjeto: typeof cachedData.products === 'object'
            });

            /*  console.log('[ProductManager] Iniciando carga de datos frescos...');
            const response = await fetch(`${config.apiEndpoints.sheets}/${config.productosId}/gviz/tq?tqx=out:json`);
            const text = await response.text();
            const json = JSON.parse(text.substr(47).slice(0, -2));  */

            console.log('[ProductManager] Datos recibidos:', {
                tieneTabla: !!json.table,
                cantidadFilas: json.table?.rows?.length,
                primerasFila: json.table?.rows?.[0]
            });

            // 1. Obtener lista de productos permitidos
            const productosPermitidos = new Set(this.clientData?.productCodes?.map(code => code.toUpperCase()) || []);
            console.log('Productos permitidos:', Array.from(productosPermitidos));

            // 2. Crear Map solo con los productos permitidos
            const productosFiltrados = {};
            for (const codigo of productosPermitidos) {
                if (cachedData.products[codigo]) {
                    productosFiltrados[codigo] = cachedData.products[codigo];
                }
            }

            // 3. Convertir a Map
            this.products = new Map(Object.entries(productosFiltrados));
            console.log('Map creado:', {
                size: this.products.size,
                productosFinales: Array.from(this.products.keys())
            });

            // Verificar algunos productos específicos
            /* console.log('Verificando productos específicos:');
            ['evol5530', 'evol15co', 'evol3210'].forEach(codigo => {
                const producto = this.products.get(codigo);
                console.log(`Producto ${codigo}:`, producto);
            });
            */

            await this.buildIndices();
            await this.cache.set('products_data', {
              products: Object.fromEntries(this.products),
              timestamp: Date.now()
              });

            this.updateMetrics();
            console.log('[ProductManager] Datos frescos cargados y cacheados');

            console.log('Métricas actualizadas:', this.metrics);
            
            // Guardar estado actualizado
            this.#saveState();
             // Agregar esta línea:
            this.#initialized = true;


              // En loadFromCache, justo antes de guardar en caché
              await this.cache.set('products_data', {
                version: '1.0',  // Agregamos versión
                products: Object.fromEntries(this.products),
                timestamp: Date.now()
              });

            // Guardar en sessionStorage
            sessionStorage.setItem('productManager_initialized', 'true');
            console.log('[ProductManager] Estado después de cargar:', {
              initialized: this.#initialized,
              hasProducts: this.products.size > 0
            });
            return true;
        } catch (error) {
            console.error('Error loading from cache:', error);
            throw error;
        }
    }

  /**
   * Carga datos frescos desde la fuente
   * @private
   */
  async loadFreshData() {
    try {

      console.log('[ProductManager] Estado antes de cargar:', {
        initialized: this.#initialized,
        hasProducts: this.products.size > 0
      });
      
      
      console.log('[ProductManager] Iniciando carga de datos...');
      const response = await fetch(`${config.apiEndpoints.sheets}/${config.productosId}/gviz/tq?tqx=out:json`);
      const text = await response.text();

      console.log('[ProductManager] Respuesta recibida:', {
        tieneTexto: !!text,
        longitudTexto: text.length
      });

      const json = JSON.parse(text.substr(47).slice(0, -2));
      console.log('[ProductManager] Datos parseados:', {
        tieneTabla: !!json.table,
        filas: json.table?.rows?.length
      });

      


      // Procesar datos
      json.table.rows.forEach(row => {
        if (row.c[0]?.v) {
          const codigo = row.c[0].v.toString();
          const product = {
            codigo,
            nombre: row.c[1]?.v,
            categoria: row.c[2]?.v,
            bulto: row.c[3]?.v,
            precios: {
              D: row.c[4]?.v,
              E: row.c[5]?.v,
              F: row.c[6]?.v
            },
            metadata: {
              lastUpdate: Date.now(),
              estado: 'activo'
            }
          };
          this.products.set(codigo, product);
        }
      });

      await this.buildIndices();
      // Usar this.cache en lugar de this.cacheManager
      await this.cache.set('products_data', {
        products: Object.fromEntries(this.products),
        timestamp: Date.now()
      });

      this.updateMetrics();
      console.log('Datos frescos cargados y cacheados');
    } catch (error) {
      console.error('[ProductManager] Error cargando datos:', error);
      throw error;
    }
  }

  /**
   * Construye índices para búsqueda eficiente
   * @private
   */
  async buildIndices() {
    // Índice por categoría
    this.categoryIndex.clear();
    for (const [codigo, product] of this.products) {
      const category = product.categoria;
      if (!this.categoryIndex.has(category)) {
        this.categoryIndex.set(category, new Set());
      }
      this.categoryIndex.get(category).add(codigo);
    }
  }

  /**
   * Actualiza métricas del sistema
   * @private
   */
  updateMetrics() {
    this.metrics.totalProducts = this.products.size;
    this.metrics.totalCategories = this.categoryIndex.size;
  }

  /**
   * Obtiene un producto por su código
   * @param {string} codigo - Código del producto
   * @returns {Object|null} Producto encontrado o null
   */
      getProduct(codigo) {

        console.log('[ProductManager] Búsqueda de producto:', {
          codigoBuscado: codigo,
          estadoProductos: {
              size: this.products.size,
              tieneProductos: this.products.size > 0,
              initialized: this.#initialized
          }
        });


        console.log('[ProductManager] getProduct llamado desde:', {
          codigo,
          stack: new Error().stack
        });

        const codigoMayusculas = codigo.toUpperCase();
        console.log('[ProductManager] Búsqueda:', {
            original: codigo,
            convertido: codigoMayusculas
        });  

        console.log('[ProductManager] Intentando encontrar producto:', {
          codigoBuscado: codigoMayusculas,
          primerosProductos: Array.from(this.products.keys()).slice(0, 3),
          existeEnMap: this.products.has(codigoMayusculas)
        });

        console.log('=== getProduct ===');
        console.log('[ProductManager] 🔍 Detalles de búsqueda:', {
          codigoBuscado: codigoMayusculas,  // Cambiado a codigoMayusculas
          // Mostrar algunos códigos similares
          codigosSimilares: Array.from(this.products.keys())
              .filter(k => k.includes(codigoMayusculas) || codigoMayusculas.includes(k))
              .slice(0, 5),
          // Mostrar diferentes formatos de códigos
          ejemplosFormatos: Array.from(this.products.keys())
              .slice(0, 10)
              .map(k => ({codigo: k, longitud: k.length}))
        });

        // Agregar inspección de datos
        console.log('Muestra de claves en this.products:', {
          primeras5Claves: Array.from(this.products.keys()).slice(0, 5),
          formatoCodigoBuscado: typeof codigoMayusculas,  // Cambiado a codigoMayusculas
          ejemploClaveMap: Array.from(this.products.keys())[0]
        });

        console.log('[ProductManager] 📂 Primeros 10 productos:', {
          keys: Array.from(this.products.keys()).slice(0, 10),
          source: 'Desde caché/Excel'
        });


        console.log('Estado de this.products:', {
            exists: !!this.products,
            isMap: this.products instanceof Map,
            size: this.products?.size,
            has: this.products?.has(codigoMayusculas)  // Cambiado a codigoMayusculas
        });


        console.log('[ProductManager] Estado de productos:', {
          size: this.products.size,
          initialized: this.#initialized,
          tieneProductos: this.products.size > 0,
          buscandoCodigo: codigoMayusculas  // Cambiado a codigoMayusculas
        });

         /* console.log('[ProductManager] Comparación de códigos:', {
          buscado: {
              codigo,
              tipo: typeof codigo,
              longitud: codigo.length,
              espacios: codigo.includes(' '),
              caracteresEspeciales: codigo.match(/[^a-zA-Z0-9]/g)
          },
          ejemplo: {
              codigo: Array.from(this.products.keys())[0],
              tipo: typeof Array.from(this.products.keys())[0],
              longitud: Array.from(this.products.keys())[0]?.length,
              espacios: Array.from(this.products.keys())[0]?.includes(' ')
          }
          });  */

        this.metrics.searchOperations++;
        const product = this.products.get(codigoMayusculas);  // Cambiado a codigoMayusculas

        console.log('Producto encontrado:', product);
        return product || null;
      }

  /**
   * Calcula el precio final de un producto
   * @param {string} codigo - Código del producto
   * @returns {number|null} Precio calculado o null
   */
      async getPrice(codigo) {
        const startTime = performance.now();
        try {
            // Log inicial
            console.log('=== Inicio getPrice ===');
            console.log('Código:', codigo);
            console.log('Estado de clientData:', {
                exists: !!this.clientData,
                priceList: this.clientData?.priceList,
                categories: this.clientData?.categories
            });

            // Obtener producto
            const product = this.getProduct(codigo);
            console.log('Producto encontrado:', product);

            if (!product) {
                console.log('❌ Producto no encontrado');
                return null;
            }

            // Verificar lista de precios
            if (!this.clientData?.priceList) {
                console.log('❌ No hay lista de precios definida');
                return null;
            }

            // Obtener precio
            const price = product.precios?.[this.clientData.priceList];
            console.log('Precio encontrado:', {
                listaPrecio: this.clientData.priceList,
                precio: price,
                preciosDisponibles: product.precios ? Object.keys(product.precios) : []
            });

            if (price === undefined || price === null) {
                console.log('❌ Precio no encontrado en la lista:', this.clientData.priceList);
                return null;
            }

            console.log('✅ Precio final:', price);
            return price;

        } catch (error) {
            console.error('❌ Error en getPrice:', error);
            return null;
        }
    }  
  /**
   * Verifica si hay promociones aplicables
   * @private
   * @param {string} codigo - Código del producto
   * @param {number} basePrice - Precio base
   * @returns {Promise<number>} Precio final
   */
  async checkPromotions(codigo, basePrice) {
    // TODO: Implementar lógica de promociones
    return basePrice;
  }

  /**
   * Verifica permisos sobre una categoría
   * @private
   * @param {string} category - Categoría a verificar
   * @returns {boolean} True si tiene permiso
   */
  hasPermission(category) {
    return this.clientData?.categories?.includes(category) || false;
  }

  /**
   * Obtiene productos por categoría
   * @param {string} category - Categoría a buscar
   * @returns {Array} Lista de productos
   */
  getProductsByCategory(category) {
    const codes = this.categoryIndex.get(category);
    if (!codes) return [];

    return Array.from(codes)
      .map(code => this.getProduct(code))
      .filter(product => product !== null);
  }

 

  /**
   * Busca productos por criterios
   * @param {Object} criteria - Criterios de búsqueda
   * @returns {Array} Productos encontrados
   */
  searchProducts(criteria = {}) {
    this.monitoringSystem.trackUsage('search', { criteria });

    try {
      let results = Array.from(this.products.values());

      // Filtrar por categoría
      if (criteria.categoria) {
        results = results.filter(p => p.categoria === criteria.categoria);
      }

      // Filtrar por texto
      if (criteria.texto) {
        const searchText = criteria.texto.toLowerCase();
        results = results.filter(p => 
          p.codigo.toLowerCase().includes(searchText) ||
          p.nombre.toLowerCase().includes(searchText)
        );
      }

      // Filtrar por rango de precio
      if (criteria.precioMin || criteria.precioMax) {
        results = results.filter(p => {
          const precio = p.precios[this.clientData.priceList];
          if (!precio) return false;
          if (criteria.precioMin && precio < criteria.precioMin) return false;
          if (criteria.precioMax && precio > criteria.precioMax) return false;
          return true;
        });
      }

      this.metrics.searchOperations++;
      return results;
    } catch (error) {
      console.error('Error searching products:', error);
      return [];
    }
  }

  /**
   * Obtiene métricas del sistema
   * @returns {Object} Métricas actuales
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage().heapUsed
    };
  }
}

export default ProductManager;