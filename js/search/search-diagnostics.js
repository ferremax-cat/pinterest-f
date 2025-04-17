console.log("=== DIAGNÓSTICO DEL SISTEMA DE BÚSQUEDA ===");
console.log("Script de diagnóstico cargado correctamente");

// Verificar si podemos cargar módulos
try {
  // Intento de importación básica
  import('./normalize-utils.js')
    .then(module => {
      console.log("✅ normalize-utils.js cargado correctamente");
      // Verificar que las funciones estén definidas
      if (typeof module.normalizeText === 'function') {
        console.log("✅ Las funciones de normalización están disponibles");
      } else {
        console.log("❌ Las funciones de normalización no están disponibles");
      }
    })
    .catch(error => {
      console.error("❌ Error al cargar normalize-utils.js:", error);
    });
    
  // Intento de importación del sistema de puntuación
  import('./search-scoring-config.js')
    .then(module => {
      console.log("✅ search-scoring-config.js cargado correctamente");
    })
    .catch(error => {
      console.error("❌ Error al cargar search-scoring-config.js:", error);
    });
    
  // Intento de importación del cliente mejorado
  import('./search-client-enhanced.js')
    .then(module => {
      console.log("✅ search-client-enhanced.js cargado correctamente");
    })
    .catch(error => {
      console.error("❌ Error al cargar search-client-enhanced.js:", error);
    });
} catch (error) {
  console.error("❌ Error general en el sistema de importación de módulos:", error);
}

// Verificar disponibilidad de productManager
window.addEventListener('DOMContentLoaded', () => {
  console.log("=== DOM CARGADO ===");
  
  setTimeout(() => {
    console.log("Verificando productManager...");
    if (window.productManager) {
      console.log("✅ productManager está disponible");
      console.log("Tipo:", typeof window.productManager);
      console.log("Es una instancia:", window.productManager instanceof Object);
      console.log("Tiene método getProduct:", typeof window.productManager.getProduct === 'function');
      console.log("Productos disponibles:", window.productManager.products instanceof Map ? window.productManager.products.size : 'No es un Map');
    } else {
      console.log("❌ productManager NO está disponible");
    }
  }, 2000);
});

console.log("Diagnóstico inicializado");