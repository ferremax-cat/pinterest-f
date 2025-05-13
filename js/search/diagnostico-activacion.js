console.log("=== DIAGNÓSTICO DE ACTIVACIÓN DE BÚSQUEDA AVANZADA ===");

import { normalizeText } from './normalize-utils.js';
import SCORING_CONFIG from './search-scoring-config.js';
import EnhancedSearchClient from './search-client-enhanced.js';

// Verificar que los componentes necesarios están disponibles
console.log("Componentes importados correctamente");
console.log("- normalizeText disponible:", typeof normalizeText === 'function');
console.log("- SCORING_CONFIG disponible:", !!SCORING_CONFIG);
console.log("- EnhancedSearchClient disponible:", typeof EnhancedSearchClient === 'function');

// Intentar crear una instancia del cliente
let searchClient = null;
try {
  searchClient = new EnhancedSearchClient({
    onError: (msg) => console.error("Error en cliente:", msg)
  });
  console.log("✅ Cliente de búsqueda creado correctamente");
} catch (error) {
  console.error("❌ Error al crear cliente de búsqueda:", error);
}

// Comprobar si podemos activar la búsqueda directamente
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM cargado, esperando productManager...");
  
  // Esperar a que productManager esté disponible
  const checkProductManager = setInterval(() => {
    if (window.productManager) {
      clearInterval(checkProductManager);
      console.log("productManager encontrado, intentando inicializar búsqueda...");
      
      // Intentar inicializar
      if (searchClient) {
        searchClient.initialize(window.productManager)
          .then(initialized => {
            console.log("Resultado de inicialización:", initialized);
            if (initialized) {
              console.log("✅ Sistema de búsqueda inicializado correctamente");
              activateSearch();
            } else {
              console.error("❌ La inicialización falló");
            }
          })
          .catch(error => {
            console.error("❌ Error durante la inicialización:", error);
          });
      }
    }
  }, 500);
  
  // Comprobar por 10 segundos
  setTimeout(() => {
    clearInterval(checkProductManager);
    if (!window.productManager) {
      console.error("❌ productManager no encontrado después de 10 segundos");
    }
  }, 10000);
});

// Función para activar la búsqueda
function activateSearch() {
  console.log("Intentando activar la búsqueda en el campo de entrada...");
  
  const searchInput = document.querySelector('input[type="text"]');
  if (!searchInput) {
    console.error("❌ No se encontró el campo de búsqueda");
    return;
  }
  
  console.log("Campo de búsqueda encontrado");
  
  // Crear función de búsqueda
  const searchHandler = async (e) => {
    const query = e.target.value.trim();
    console.log(`Búsqueda ejecutada: "${query}"`);
    
    if (!query || query.length < 2) {
      console.log("Consulta demasiado corta, no se realiza búsqueda");
      return;
    }
    
    try {
      const results = await searchClient.search(query);
      console.log(`Resultados de búsqueda para "${query}":`, results);
      console.log(`Encontrados ${results.results.length} resultados en ${results.timing.toFixed(2)}ms`);
      
      // Mostrar resultados (simplemente loguear los primeros 3)
      if (results.results.length > 0) {
        console.log("Primeros 3 resultados:");
        results.results.slice(0, 3).forEach((result, index) => {
          console.log(`${index + 1}. ${result.product.nombre || result.code} (Score: ${result.score})`);
        });
      }
    } catch (error) {
      console.error("Error en búsqueda:", error);
    }
  };
  
  // Añadir event listener para prueba
  const testButton = document.createElement('button');
  testButton.textContent = "Probar Búsqueda Avanzada";
  testButton.style.position = "fixed";
  testButton.style.top = "10px";
  testButton.style.right = "10px";
  testButton.style.zIndex = "9999";
  testButton.style.padding = "5px 10px";
  testButton.style.backgroundColor = "#4285f4";
  testButton.style.color = "white";
  testButton.style.border = "none";
  testButton.style.borderRadius = "4px";
  testButton.style.cursor = "pointer";
  
  testButton.addEventListener('click', () => {
    const testQuery = "tornillo 10mm";
    console.log(`Prueba de búsqueda con "${testQuery}"`);
    searchHandler({ target: { value: testQuery } });
  });
  
  document.body.appendChild(testButton);
  console.log("✅ Botón de prueba añadido - haz clic para probar la búsqueda avanzada");
}

console.log("Diagnóstico de activación completado");