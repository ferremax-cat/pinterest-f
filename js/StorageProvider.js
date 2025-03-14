/**
 * Proveedores de almacenamiento para el sistema de cache
 * @module StorageProvider
 */

/**
 * Interfaz base para proveedores de almacenamiento
 * @interface StorageProvider
 */
class StorageProvider {
    async get(key) { throw new Error('Not implemented'); }
    async set(key, value) { throw new Error('Not implemented'); }
    async delete(key) { throw new Error('Not implemented'); }
    async clear() { throw new Error('Not implemented'); }
  }
  
  /**
   * Proveedor de almacenamiento usando localStorage
   * @implements {StorageProvider}
   */
  class LocalStorageProvider extends StorageProvider {
    async get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
      }
    }
  
    async set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error('Error writing to localStorage:', error);
        return false;
      }
    }
  
    async delete(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error('Error deleting from localStorage:', error);
        return false;
      }
    }
  
    async clear() {
      try {
        localStorage.clear();
        return true;
      } catch (error) {
        console.error('Error clearing localStorage:', error);
        return false;
      }
    }
  }
  
  export { StorageProvider, LocalStorageProvider };