/**
 * Integración del sistema de búsqueda mejorado con puntuación avanzada
 * para el catálogo de ferretería
 */


import EnhancedSearchClient from './search-client-enhanced.js';

// Variables globales para el sistema de búsqueda
let searchClient = null;
let searchInitialized = false;

// Elementos UI - Ajustar a tu estructura HTML
const searchInput = document.querySelector('input[type="text"]');
const resultsContainer = document.querySelector('.gallery-container'); // Ajustar según tu estructura

// Elemento para mostrar estado (opcional)
const statusIndicator = document.createElement('div');
statusIndicator.className = 'search-status-indicator';
statusIndicator.style.display = 'none';
document.body.appendChild(statusIndicator);

/**
 * Inicializa el sistema de búsqueda mejorado
 */
async function initializeEnhancedSearch() {
  if (searchInitialized) {
    console.log('Sistema de búsqueda ya inicializado');
    return true;
  }
  
  try {
    showStatus('Inicializando sistema de búsqueda avanzado...');
    
    // Crear cliente de búsqueda mejorado
    searchClient = new EnhancedSearchClient({
      defaultFragment: 'A-F',
      monitoringSystem: window.monitoringSystem,
      onFragmentLoad: (fragmentName) => {
        console.log(`Fragmento cargado: ${fragmentName}`);
        showStatus(`Fragmento de datos cargado: ${fragmentName}`, 1000);
      },
      onError: (message) => {
        console.error(message);
        showStatus(`Error: ${message}`, 3000, true);
      }
    });
    
    // Inicializar con el productManager existente
    const initialized = await searchClient.initialize(window.productManager);
    
    if (!initialized) {
      throw new Error('Error inicializando sistema de búsqueda');
    }
    
    // Mejorar el campo de búsqueda
    enhanceSearchInput();
    
    // Añadir estilos y elementos UI
    addEnhancedSearchStyles();
    
    // Marcar como inicializado
    searchInitialized = true;
    
    showStatus('Búsqueda avanzada activada', 2000);
    console.log('Sistema de búsqueda mejorado inicializado correctamente');
    
    return true;
  } catch (error) {
    console.error('Error inicializando sistema de búsqueda:', error);
    showStatus('Error al inicializar búsqueda avanzada', 5000, true);
    return false;
  }
}

/**
 * Mejora el campo de búsqueda con funcionalidad avanzada
 */
function enhanceSearchInput() {
  if (!searchInput) {
    console.warn('No se encontró el campo de búsqueda para mejorar');
    return;
  }
  
  // Función debounce para evitar muchas búsquedas durante escritura
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  // Crear función de búsqueda debounced
  const performSearch = debounce(async function(e) {
    const searchTerm = e.target.value.trim();
    
    // Si la búsqueda está vacía, mostrar todos los productos
    if (!searchTerm || searchTerm.length < 2) {
      document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.display = '';
      });
      
      // Reorganizar la galería si tenemos un layout Pinterest
      if (typeof window.applyPinterestLayout === 'function') {
        setTimeout(window.applyPinterestLayout, 100);
      }
      
      clearSearchIndicators();
      return;
    }
    
    // Mostrar indicador de búsqueda
    showStatus(`Buscando "${searchTerm}"...`);
    
    try {
      // Realizar búsqueda avanzada
      const searchResults = await executeSearch(searchTerm);
      
      if (searchResults && searchResults.results.length > 0) {
        displayEnhancedSearchResults(searchResults);
      } else {
        showNoResultsMessage(searchTerm);
      }
    } catch (error) {
      console.error('Error al buscar:', error);
      showStatus('Error en la búsqueda', 3000, true);
    }
  }, 300);
  
  // Remover listeners anteriores si existen
  const oldListeners = searchInput._searchListeners || [];
  oldListeners.forEach(listener => {
    searchInput.removeEventListener('input', listener);
  });
  
  // Guardar referencia al nuevo listener y añadirlo
  searchInput._searchListeners = [performSearch];
  searchInput.addEventListener('input', performSearch);
  
  // Añadir placeholder mejorado
  searchInput.placeholder = "Buscar productos por nombre, código o medida...";
  
  console.log('Campo de búsqueda mejorado activado');
}

/**
 * Ejecuta una búsqueda con el sistema mejorado
 */
async function executeSearch(query) {
  if (!searchInitialized) {
    console.warn('Sistema de búsqueda no inicializado');
    return null;
  }
  
  try {
    // Registrar búsqueda en sistema de monitoreo si existe
    if (window.monitoringSystem) {
      window.monitoringSystem.trackEvent('search', { query });
    }
    
    // Realizar búsqueda con opciones avanzadas
    const searchResults = await searchClient.search(query, {
      limit: 50,          // Número máximo de resultados
      fuzzy: true,        // Permitir búsqueda aproximada
      threshold: 0.15,    // Umbral mínimo de relevancia (15% del score máximo)
      includeMetadata: true  // Incluir información de puntuación
    });
    
    console.log(`Búsqueda "${query}" completada en ${searchResults.timing.toFixed(2)}ms, ${searchResults.results.length} resultados`);
    
    // Registrar estadísticas de la búsqueda
    if (window.monitoringSystem) {
      window.monitoringSystem.trackEvent('search_results', { 
        query, 
        count: searchResults.results.length,
        timing: searchResults.timing,
        fragments: searchResults.fragmentsSearched.join(',')
      });
    }
    
    return searchResults;
  } catch (error) {
    console.error('Error ejecutando búsqueda:', error);
    return null;
  }
}

/**
 * Muestra los resultados de búsqueda mejorados en la interfaz
 */
function displayEnhancedSearchResults(searchResults) {
  const { results, query, timing } = searchResults;
  
  // Ocultar todos los elementos y mostrar solo los que coinciden
  const items = document.querySelectorAll('.gallery-item');
  const matchedCodes = new Set(results.map(r => r.code));
  
  let matchCount = 0;
  
  items.forEach(item => {
    const bottomRow = item.querySelector('.bottom-row a');
    if (!bottomRow) {
      item.style.display = 'none';
      return;
    }
    
    const codigo = bottomRow.textContent.trim().replace(/\s+/g, '');
    
    // Si el código está en los resultados, mostrar el elemento
    if (matchedCodes.has(codigo)) {
      item.style.display = '';
      matchCount++;
      
      // Buscar el resultado correspondiente para obtener el score
      const resultData = results.find(r => r.code === codigo);
      
      // Resaltar coincidencias en el nombre si está disponible
      const topRowLink = item.querySelector('.top-row a');
      if (topRowLink && resultData) {
        topRowLink.innerHTML = highlightMatchesEnhanced(
          topRowLink.textContent, 
          resultData.matches
        );
        
        // Opcional: Añadir indicador de relevancia
        if (resultData.score > 0) {
          // Remover indicador anterior si existe
          const oldIndicator = item.querySelector('.relevance-indicator');
          if (oldIndicator) oldIndicator.remove();
          
          // Crear indicador de relevancia
          const relevanceIndicator = document.createElement('span');
          relevanceIndicator.className = 'relevance-indicator';
          
          // Calcular nivel de relevancia (1-5)
          const maxScore = results[0].score;
          const relativeScore = resultData.score / maxScore;
          const relevanceLevel = Math.ceil(relativeScore * 5);
          
          relevanceIndicator.dataset.level = relevanceLevel;
          relevanceIndicator.title = `Relevancia: ${relevanceLevel}/5`;
          
          // Añadir el indicador al elemento
          const infoContainer = item.querySelector('.top-row') || item.querySelector('.info-img');
          if (infoContainer) {
            infoContainer.appendChild(relevanceIndicator);
          }
        }
      }
      
      // Opcional: ordenar visualmente los elementos según relevancia
      if (resultData) {
        // Guardar el score para ordenamiento visual
        item.dataset.relevanceScore = resultData.score;
      }
    } else {
      item.style.display = 'none';
    }
  });
  
  // Mostrar resumen de resultados
  showResultsSummary(matchCount, query, timing);
  
  // Reorganizar la galería si tenemos un layout Pinterest
  if (typeof window.applyPinterestLayout === 'function') {
    setTimeout(window.applyPinterestLayout, 100);
  }
  
  // Ocultar indicador de estado
  hideStatus();
}

/**
 * Resalta coincidencias en el texto de forma mejorada
 */
function highlightMatchesEnhanced(text, matches) {
  if (!text || !matches || matches.length === 0) return text;
  
  let result = text;
  
  // Recopilar términos únicos a resaltar
  const termsToHighlight = new Set();
  
  matches.forEach(match => {
    const term = match.term;
    if (term && term.length > 1) {
      termsToHighlight.add(term);
    }
  });
  
  // Ordenar términos por longitud (de más largo a más corto)
  // Esto evita que se resalten partes de palabras ya resaltadas
  const sortedTerms = Array.from(termsToHighlight)
    .sort((a, b) => b.length - a.length);
  
  // Resaltar cada término
  sortedTerms.forEach(term => {
    // Ignorar términos demasiado cortos
    if (term.length < 2) return;
    
    // Crear una expresión regular con límites de palabra cuando sea apropiado
    let regex;
    if (term.length > 3) {
      // Para términos más largos, usar límites de palabra
      regex = new RegExp(`\\b(${term})\\b`, 'gi');
    } else {
      // Para términos cortos, buscar coincidencias exactas
      regex = new RegExp(`(${term})`, 'gi');
    }
    
    // Reemplazar con etiqueta de resaltado
    result = result.replace(regex, '<span class="highlight">$1</span>');
  });
  
  return result;
}

/**
 * Muestra resumen de resultados de búsqueda
 */
function showResultsSummary(count, query, timing) {
  // Remover resumen anterior si existe
  const existingSummary = document.querySelector('.search-results-summary');
  if (existingSummary) {
    existingSummary.remove();
  }
  
  // Crear elemento de resumen
  const summary = document.createElement('div');
  summary.className = 'search-results-summary';
  
  // Formatear tiempo
  const formattedTiming = timing ? ` en ${timing.toFixed(2)}ms` : '';
  
  // Establecer texto
  summary.innerHTML = `
    <span class="count">${count}</span> resultado${count !== 1 ? 's' : ''} 
    para "<span class="query">${query}</span>"${formattedTiming}
    <button class="clear-search">✕</button>
  `;
  
  // Añadir al DOM
  document.body.appendChild(summary);
  
  // Añadir funcionalidad al botón de limpiar
  const clearButton = summary.querySelector('.clear-search');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        // Disparar evento para limpiar resultados
        searchInput.dispatchEvent(new Event('input'));
      }
    });
  }
  
  // Mostrar durante 10 segundos y luego minimizar
  setTimeout(() => {
    summary.classList.add('minimized');
  }, 10000);
}

/**
 * Muestra mensaje de no resultados
 */
function showNoResultsMessage(query) {
  // Ocultar todos los elementos
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.style.display = 'none';
  });
  
  // Crear mensaje de no resultados
  let noResultsElement = document.querySelector('.no-results-message');
  
  if (!noResultsElement) {
    noResultsElement = document.createElement('div');
    noResultsElement.className = 'no-results-message';
    resultsContainer.appendChild(noResultsElement);
  }
  
  // Actualizar mensaje
  noResultsElement.innerHTML = `
    <div class="no-results-icon">🔍</div>
    <h3>No se encontraron resultados para "${query}"</h3>
    <p>Prueba con diferentes términos o revisa la ortografía.</p>
    <p>Sugerencias:</p>
    <ul>
      <li>Usa términos más generales</li>
      <li>Busca por categoría de producto</li>
      <li>Prueba con un código de producto</li>
    </ul>
    <button class="clear-search">Limpiar búsqueda</button>
  `;
  
  // Mostrar el mensaje
  noResultsElement.style.display = 'block';
  
  // Añadir funcionalidad al botón de limpiar
  const clearButton = noResultsElement.querySelector('.clear-search');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        // Disparar evento para limpiar resultados
        searchInput.dispatchEvent(new Event('input'));
        // Ocultar mensaje
        noResultsElement.style.display = 'none';
      }
    });
  }
  
  // Ocultar indicador de estado
  hideStatus();
}

/**
 * Limpia todos los indicadores de búsqueda
 */
function clearSearchIndicators() {
  // Ocultar resumen de resultados
  const resultsSummary = document.querySelector('.search-results-summary');
  if (resultsSummary) {
    resultsSummary.remove();
  }
  
  // Ocultar mensaje de no resultados
  const noResultsMessage = document.querySelector('.no-results-message');
  if (noResultsMessage) {
    noResultsMessage.style.display = 'none';
  }
  
  // Limpiar destacados e indicadores de relevancia
  document.querySelectorAll('.highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.textContent = parent.textContent; // Truco para eliminar HTML interno
    }
  });
  
  document.querySelectorAll('.relevance-indicator').forEach(el => {
    el.remove();
  });
  
  // Ocultar indicador de estado
  hideStatus();
}

/**
 * Muestra mensajes de estado al usuario
 */
function showStatus(message, duration = 0, isError = false) {
  statusIndicator.textContent = message;
  statusIndicator.className = isError 
    ? 'search-status-indicator error' 
    : 'search-status-indicator';
  statusIndicator.style.display = 'block';
  
  if (duration > 0) {
    setTimeout(hideStatus, duration);
  }
}

/**
 * Oculta el indicador de estado
 */
function hideStatus() {
  statusIndicator.style.display = 'none';
}

/**
 * Añade estilos CSS para el sistema de búsqueda mejorado
 */
function addEnhancedSearchStyles() {
  if (document.getElementById('enhanced-search-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'enhanced-search-styles';
  styles.textContent = `
    /* Estilos para destacar coincidencias */
    .highlight {
      background-color: #ffeb3b;
      padding: 0 2px;
      border-radius: 2px;
      font-weight: bold;
    }
    
    /* Indicador de relevancia */
    .relevance-indicator {
      display: inline-block;
      margin-left: 5px;
      position: relative;
    }
    
    .relevance-indicator::before {
      content: "★★★★★";
      letter-spacing: -2px;
      background: linear-gradient(90deg, #ffcc00 0%, #ffcc00 var(--percent, 100%), #ccc var(--percent, 100%), #ccc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-size: 12px;
    }
    
    .relevance-indicator[data-level="1"]::before { --percent: 20%; }
    .relevance-indicator[data-level="2"]::before { --percent: 40%; }
    .relevance-indicator[data-level="3"]::before { --percent: 60%; }
    .relevance-indicator[data-level="4"]::before { --percent: 80%; }
    .relevance-indicator[data-level="5"]::before { --percent: 100%; }
    
    /* Resumen de resultados */
    .search-results-summary {
      position: fixed;
      top: 70px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
      max-width: 90%;
      z-index: 1000;
      transition: transform 0.3s, opacity 0.3s;
      display: flex;
      align-items: center;
    }
    
    .search-results-summary.minimized {
      transform: translateX(calc(100% - 40px));
      opacity: 0.7;
    }
    
    .search-results-summary:hover {
      transform: translateX(0);
      opacity: 1;
    }
    
    .search-results-summary .count {
      font-weight: bold;
      margin-right: 3px;
    }
    
    .search-results-summary .query {
      font-style: italic;
      font-weight: bold;
    }
    
    .search-results-summary .clear-search {
      margin-left: 10px;
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 16px;
      padding: 0 5px;
    }
    
    .search-results-summary .clear-search:hover {
      color: #ffeb3b;
    }
    
    /* Mensaje de no resultados */
    .no-results-message {
      text-align: center;
      padding: 40px 20px;
      margin: 20px auto;
      max-width: 600px;
      background: #f9f9f9;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .no-results-message .no-results-icon {
      font-size: 40px;
      margin-bottom: 20px;
    }
    
    .no-results-message h3 {
      margin-bottom: 15px;
    }
    
    .no-results-message ul {
      text-align: left;
      display: inline-block;
      margin: 10px 0;
    }
    
    .no-results-message .clear-search {
      margin-top: 20px;
      padding: 8px 16px;
      background: #4a90e2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .no-results-message .clear-search:hover {
      background: #3a7cca;
    }
    
    /* Indicador de estado */
    .search-status-indicator {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 1001;
      display: none;
    }
    
    .search-status-indicator.error {
      background: rgba(220, 53, 69, 0.9);
    }
  `;
  
  document.head.appendChild(styles);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async function() {
  // Añadir estilos
  addEnhancedSearchStyles();
  
  // Esperar a que productManager esté inicializado
  setTimeout(async () => {
    if (window.productManager) {
      await initializeEnhancedSearch();
    } else {
      console.warn('productManager no disponible, retrasando inicialización');
      
      // Intentar de nuevo en 2 segundos
      setTimeout(async () => {
        if (window.productManager) {
          await initializeEnhancedSearch();
        } else {
          console.error('productManager no disponible, no se puede inicializar búsqueda avanzada');
        }
      }, 2000);
    }
  }, 1000);
});