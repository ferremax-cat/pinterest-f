/**
 * Gestor centralizado de productos
 * @module ProductManager
 */

import CacheManager from './cacheManager.js';
import MonitoringSystem from './MonitoringSystem.js';
import { config } from './config.js';
import AdvancedCacheManager from './AdvancedCacheManager.js';

/**
 * Gestor principal de productos y sus relaciones
 */
class ProductManager {
  /**
   * @param {Object} config - Configuración del gestor
   * @param {CacheManager} config.cacheManager - Instancia de CacheManager
   * @param {Object} config.clientData - Datos del cliente actual
   */
  constructor({ monitoringSystem, ...config }) {
    
    this.cache = new AdvancedCacheManager();
    this.monitor = monitoringSystem;
    this.monitoringSystem = config.monitoringSystem || new MonitoringSystem();
    this.cacheManager = config.cacheManager || new CacheManager();
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
  }

  /**
   * Inicializa el gestor con datos
   * @param {Object} clientData - Datos del cliente
   */
  async initialize(clientData) {
    console.log('Iniciando ProductManager...');
    this.clientData = clientData;

    try {
      // Intentar cargar desde cache
      const cachedData = await this.cacheManager.get('products_data');
      if (cachedData) {
        await this.loadFromCache(cachedData);
        return true;
      }

      // Si no hay cache, cargar datos frescos
      await this.loadFreshData();
      return true;
    } catch (error) {
      console.error('Error initializing ProductManager:', error);
      return false;
    }
  }

  /**
   * Carga datos desde el cache
   * @private
   * @param {Object} cachedData - Datos cacheados
   */
      async loadFromCache(cachedData) {
        try {
            console.log('=== Cargando desde caché ===');
            console.log('Datos recibidos:', {
                tieneProducts: !!cachedData.products,
                tipo: typeof cachedData.products,
                esObjeto: typeof cachedData.products === 'object'
            });

            // Convertir a Map y verificar
            this.products = new Map(Object.entries(cachedData.products));
            console.log('Map creado:', {
                size: this.products.size,
                primerasCincoClaves: Array.from(this.products.keys()).slice(0, 5)
            });

            // Verificar algunos productos específicos
            console.log('Verificando productos específicos:');
            ['evol5530', 'evol15co', 'evol3210'].forEach(codigo => {
                const producto = this.products.get(codigo);
                console.log(`Producto ${codigo}:`, producto);
            });

            await this.buildIndices();
            this.updateMetrics();
            console.log('Métricas actualizadas:', this.metrics);
            
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
      const response = await fetch(`${config.apiEndpoints.sheets}/${config.productosId}/gviz/tq?tqx=out:json`);
      const text = await response.text();
      const json = JSON.parse(text.substr(47).slice(0, -2));

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
      await this.cacheManager.set('products_data', {
        products: Object.fromEntries(this.products),
        timestamp: Date.now()
      });

      this.updateMetrics();
      console.log('Datos frescos cargados y cacheados');
    } catch (error) {
      console.error('Error loading fresh data:', error);
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
        console.log('=== getProduct ===');
        console.log('Buscando código:', codigo);
        console.log('Estado de this.products:', {
            exists: !!this.products,
            isMap: this.products instanceof Map,
            size: this.products?.size,
            has: this.products?.has(codigo)
        });

        this.metrics.searchOperations++;
        const product = this.products.get(codigo);

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