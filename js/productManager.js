// js/productManager.js

// Clase para gestionar los productos y sus precios
class ProductManager {
    // Constructor recibe los datos del cliente actual
    constructor(clientData) {
        // Almacena configuración del cliente
        this.clientData = clientData;
    }

    // Obtiene el precio final de un producto
    getProductPrice(productId) {
        // Obtener el producto del cache
        const product = this.clientData.products[productId];
        
        // Obtener precio base según lista del cliente
        const basePrice = product.prices[this.clientData.priceList];
        
        // Verificar si hay promoción vigente
        const promotion = this.getProductPromotion(productId);
        
        // Retornar precio promocional o base según corresponda
        return promotion ? promotion.specialPrice : basePrice;
    }

    // Verifica si hay promoción vigente para el producto
    getProductPromotion(productId) {
        // Obtener todas las promociones del cliente
        const promotions = this.clientData.promotions;
        
        // Verificar si existe promoción para este producto
        if (!promotions[productId]) return null;
        
        // Verificar si la promoción está vigente
        const promotion = promotions[productId];
        const today = new Date();
        const validUntil = new Date(promotion.validUntil);
        
        // Retornar promoción si está vigente
        return today <= validUntil ? promotion : null;
    }
}