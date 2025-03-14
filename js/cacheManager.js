/**
 * Gestor de caché genérico y configurable
 * @module CacheManager
 */

import { LocalStorageProvider } from './StorageProvider.js';

/**
 * Gestor principal de caché
 */
class CacheManager {
  /**
   * @param {Object} config - Configuración del cache
   * @param {StorageProvider} config.storage - Proveedor de almacenamiento
   * @param {number} config.defaultTTL - Tiempo de vida por defecto en ms
   * @param {string} config.version - Versión del cache
   * @param {number} config.maxSize - Tamaño máximo en bytes
   */
  constructor(config = {}) {
    this.config = {
      storage: new LocalStorageProvider(),
      defaultTTL: 24 * 60 * 60 * 1000, // 24 horas
      version: '1.0',
      maxSize: 50 * 1024 * 1024, // 50MB
      ...config
    };

    this.metrics = {
      hits: 0,
      misses: 0,
      writes: 0,
      errors: 0
    };
  }

  /**
   * Genera una clave única para el cache
   * @private
   * @param {string} key - Clave base
   * @returns {string} Clave única
   */
  _generateKey(key) {
    return `cache_${this.config.version}_${key}`;
  }

  /**
   * Verifica si un item está expirado
   * @private
   * @param {Object} item - Item del cache
   * @returns {boolean} True si está expirado
   */
  _isExpired(item) {
    if (!item || !item.timestamp || !item.ttl) return true;
    return Date.now() > item.timestamp + item.ttl;
  }

  /**
   * Obtiene un item del cache
   * @param {string} key - Clave a buscar
   * @returns {Promise<*>} Valor almacenado o null
   */
  async get(key) {
    try {
      const cacheKey = this._generateKey(key);
      const cached = await this.config.storage.get(cacheKey);

      if (!cached) {
        this.metrics.misses++;
        return null;
      }

      if (this._isExpired(cached)) {
        await this.delete(key);
        this.metrics.misses++;
        return null;
      }

      this.metrics.hits++;
      return cached.value;
    } catch (error) {
      this.metrics.errors++;
      console.error('Error retrieving from cache:', error);
      return null;
    }
  }

  /**
   * Almacena un item en el cache
   * @param {string} key - Clave para almacenar
   * @param {*} value - Valor a almacenar
   * @param {number} [ttl] - Tiempo de vida en ms
   * @returns {Promise<boolean>} True si se almacenó correctamente
   */
  async set(key, value, ttl = this.config.defaultTTL) {
    try {
      const cacheKey = this._generateKey(key);
      const item = {
        timestamp: Date.now(),
        ttl,
        value
      };

      // Verificar tamaño
      const size = new Blob([JSON.stringify(item)]).size;
      if (size > this.config.maxSize) {
        console.warn('Item too large for cache:', key);
        return false;
      }

      // Intentar liberar espacio si necesario
      await this._ensureSpace(size);

      const success = await this.config.storage.set(cacheKey, item);
      if (success) this.metrics.writes++;
      return success;
    } catch (error) {
      this.metrics.errors++;
      console.error('Error storing in cache:', error);
      return false;
    }
  }

  /**
   * Asegura que hay espacio disponible
   * @private
   * @param {number} requiredSize - Espacio necesario en bytes
   */
  async _ensureSpace(requiredSize) {
    try {
      const items = await this._getAllItems();
      const totalSize = items.reduce((sum, item) => sum + item.size, 0);

      if (totalSize + requiredSize <= this.config.maxSize) return;

      // Ordenar por antigüedad y eliminar hasta tener espacio
      items.sort((a, b) => a.timestamp - b.timestamp);
      
      let freedSpace = 0;
      for (const item of items) {
        if (totalSize - freedSpace + requiredSize <= this.config.maxSize) break;
        await this.delete(item.key);
        freedSpace += item.size;
      }
    } catch (error) {
      console.error('Error ensuring cache space:', error);
    }
  }

  /**
   * Obtiene todos los items del cache
   * @private
   * @returns {Promise<Array>} Lista de items
   */
  async _getAllItems() {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`cache_${this.config.version}`)) {
        try {
          const value = await this.config.storage.get(key);
          items.push({
            key,
            ...value,
            size: new Blob([JSON.stringify(value)]).size
          });
        } catch (error) {
          console.error('Error reading cache item:', error);
        }
      }
    }
    return items;
  }

  /**
   * Elimina un item del cache
   * @param {string} key - Clave a eliminar
   * @returns {Promise<boolean>} True si se eliminó correctamente
   */
  async delete(key) {
    try {
      const cacheKey = this._generateKey(key);
      return await this.config.storage.delete(cacheKey);
    } catch (error) {
      this.metrics.errors++;
      console.error('Error deleting from cache:', error);
      return false;
    }
  }

  /**
   * Limpia todo el cache
   * @returns {Promise<boolean>} True si se limpió correctamente
   */
  async clear() {
    try {
      return await this.config.storage.clear();
    } catch (error) {
      this.metrics.errors++;
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Obtiene métricas del cache
   * @returns {Object} Métricas de uso
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      hitRatio: total ? (this.metrics.hits / total).toFixed(2) : 0,
      totalOperations: total + this.metrics.writes
    };
  }
}

export default CacheManager;