/**
 * Gestor centralizado de productos
 * @module ProductManager
 */

import CacheManager from './cacheManager.js';
import MonitoringSystem from './MonitoringSystem.js';
import { config } from './config.js';

/**
 * Gestor principal de productos y sus relaciones
 */
class ProductManager {
  /**
   * @param {Object} config - Configuración del gestor
   * @param {CacheManager} config.cacheManager - Instancia de CacheManager
   * @param {Object} config.clientData - Datos del cliente actual
   */
  constructor(config = {}) {
    
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
      this.products = new Map(Object.entries(cachedData.products));
      await this.buildIndices();
      this.updateMetrics();
      console.log('Datos cargados desde cache');
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
    this.metrics.searchOperations++;
    return this.products.get(codigo) || null;
  }

  /**
   * Calcula el precio final de un producto
   * @param {string} codigo - Código del producto
   * @returns {number|null} Precio calculado o null
   */
  async getPrice(codigo) {
    try {
      
      // Verificar cache de precios
      const cacheKey = `price_${codigo}_${this.clientData.priceList}`;
      const cachedPrice = await this.cacheManager.get(cacheKey);
      if (cachedPrice !== null) return cachedPrice;

      // Obtener producto
      const product = this.getProduct(codigo);
      if (!product) 
        console.log('Producto no encontrado:', codigo);
        return null;

      // Verificar permisos de categoría
      if (!this.hasPermission(product.categoria)) {
        return null;
      }


      console.log('Product found:', product);
      console.log('Client price list:', this.clientData.priceList);

      // Obtener precio base
      const basePrice = product.precios[this.clientData.priceList];
      console.log('Precio encontrado:', precio);
      return precio;

      if (!basePrice) return null;

      // Verificar promociones
      const finalPrice = await this.checkPromotions(codigo, basePrice);

      // Cachear resultado
      await this.cacheManager.set(cacheKey, finalPrice, 3600000); // 1 hora

      this.metrics.priceCalculations++;
      return finalPrice;
    } catch (error) {
      console.error('Error calculating price:', error);
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

    async getPrice(codigo) {
      const product = this.getProduct(codigo);
      if (!product) return null;

      // Verificar permisos de categoría
      if (!this.clientData?.categories?.includes(product.categoria)) return null;

      // Obtener precio base
      const basePrice = product.precios?.[this.clientData.priceList];
      if (!basePrice) return null;

      // Verificar promociones
      const promotion = await this.checkPromotions(codigo);
      return promotion ? promotion.price : basePrice;
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