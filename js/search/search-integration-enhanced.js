/**
 * Integración del sistema de búsqueda mejorado con puntuación avanzada
 * para el catálogo de ferretería - VERSIÓN CORREGIDA
 */

import EnhancedSearchClient from './search-client-enhanced.js';


// Mensaje inmediato
console.log("INICIO DEL ARCHIVO");

// Mensaje diferido para ver si hay un retraso en la ejecución
Promise.resolve().then(() => {
  console.log("DESPUÉS DE MICROTASK");
});

// Mensaje con timeout para ver si hay un problema de timing
setTimeout(() => {
  console.log("DESPUÉS DE TIMEOUT");
}, 0);






// Mensajes simples de log al inicio
console.log("LOG NORMAL");
console.warn("ADVERTENCIA");
console.error("ERROR DE PRUEBA");

// Guardar una referencia al search-integration-enhanced.js en window
window.searchIntegration = {
  initialized: false,
  init: function() {
    console.log("INICIALIZACIÓN MANUAL");
    this.initialized = true;
  }
};







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

  console.log("[Test] Entrando en executeSearch, query:", query);
  if (!searchInitialized) {
    console.warn('Sistema de búsqueda no inicializado');
    return null;
  }
  
  try {
    // Registrar búsqueda en sistema de monitoreo si existe
    if (window.monitoringSystem) {
      window.monitoringSystem.trackEvent('search', { query });
    }
    
    // Normalizar la consulta
    const normalizedQuery = normalizeText(query);
    
    // Términos clave de la consulta (para validación posterior)
    const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 1);
    
    console.log("Términos de búsqueda:", queryTerms);
    
    // Realizar búsqueda con opciones avanzadas
    const searchResults = await searchClient.search(query, {
      limit: 100,         // Aumentar el límite para luego filtrar mejor
      fuzzy: true,        // Permitir búsqueda aproximada pero con control
      threshold: 0.3,     // Umbral moderado de relevancia
      maxFuzzyDistance: 0, // Distancia fuzzy 0 para evitar coincidencias lejanas
      includeMetadata: true  // Incluir información de puntuación
    });
    
    console.log(`Búsqueda "${query}" completada en ${searchResults.timing.toFixed(2)}ms, ${searchResults.results.length} resultados sin filtrar`);
    console.log("Resultados originales:", searchResults.results.map(r => ({
      nombre: r.product.nombre,
      descripcion: r.product.descripcion,
      code: r.code,
      score: r.score
    })));
    
    // Filtrado adicional de resultados para mejorar precisión
    const filteredResults = {
      ...searchResults,
      results: filterResultsByRelevance(searchResults.results, normalizedQuery, queryTerms, query)
    };
    
    console.log(`Filtrado completado: ${filteredResults.results.length} resultados relevantes`);
    console.log("Resultados filtrados:", filteredResults.results.map(r => ({
      nombre: r.product.nombre,
      descripcion: r.product.descripcion,
      code: r.code,
      score: r.score,
      reason: r.matchReason
    })));
    
    // Registrar estadísticas de la búsqueda
    if (window.monitoringSystem) {
      window.monitoringSystem.trackEvent('search_results', { 
        query, 
        count: filteredResults.results.length,
        timing: searchResults.timing,
        fragments: searchResults.fragmentsSearched.join(',')
      });
    }
    
    return filteredResults;
  } catch (error) {
    console.error('Error ejecutando búsqueda:', error);
    return null;
  }
}

/**
 * NUEVO: Normaliza texto para comparaciones consistentes
 */
function normalizeText(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
    .replace(/[^\w\s]/g, ''); // Eliminar signos de puntuación
}

/**
 * NUEVO: Filtra resultados para asegurar que sean realmente relevantes
 */
function filterResultsByRelevance(results, normalizedQuery, queryTerms, originalQuery) {
  if (!results || results.length === 0) return [];
  
  // Extraer términos de búsqueda originales para comparaciones exactas
  const originalTerms = originalQuery.toLowerCase().split(/\s+/).filter(term => term.length > 1);
  
  // Si no hay términos significativos en la consulta, usar solo el score
  if (queryTerms.length === 0 && originalTerms.length === 0) {
    // Filtrar por score mínimo
    return results.filter(result => result.score > 0.3);
  }
  
  // Obtener score máximo para relativizar
  const maxScore = results.length > 0 ? results[0].score : 1;
  
  // Preparar el resultado filtrado
  const filteredResults = [];
  
  // Función auxiliar para verificar coincidencias exactas
  function checkExactMatches(result) {
    // Verificar coincidencia exacta con alguno de los términos originales
    for (const term of originalTerms) {
      const lowercaseTerm = term.toLowerCase();
      
      // Verificar coincidencia exacta en nombre
      if (result.product.nombre && result.product.nombre.toLowerCase().includes(lowercaseTerm)) {
        result.matchReason = `Coincidencia exacta con "${term}" en el nombre`;
        return true;
      }
      
      // Verificar coincidencia exacta en descripción
      const descripcion = result.product.descripcion || 
                         (result.product.metadata ? result.product.metadata.descripcion : '');
      if (descripcion && descripcion.toLowerCase().includes(lowercaseTerm)) {
        result.matchReason = `Coincidencia exacta con "${term}" en la descripción`;
        return true;
      }
      
      // Verificar coincidencia exacta en código
      if (result.code && result.code.toLowerCase().includes(lowercaseTerm)) {
        result.matchReason = `Coincidencia exacta con "${term}" en el código`;
        return true;
      }
    }
    
    return false;
  }
  
  // Buscar coincidencias exactas primero
  for (const result of results) {
    if (checkExactMatches(result)) {
      filteredResults.push(result);
    }
  }
  
  // Si encontramos coincidencias exactas, devolver solo esos resultados
  if (filteredResults.length > 0) {
    console.log(`Encontradas ${filteredResults.length} coincidencias exactas`);
    return filteredResults;
  }
  
  // Si no hay coincidencias exactas, usar el filtrado por score
  return results.filter(result => {
    // Obtener datos normalizados del producto
    const productName = normalizeText(result.product.nombre || '');
    const productDescription = normalizeText(
      result.product.descripcion || 
      (result.product.metadata ? result.product.metadata.descripcion : '') || 
      ''
    );
    const productCode = normalizeText(result.code || '');
    
    // Score alto - aceptar directamente
    if (result.score > maxScore * 0.5) {
      result.matchReason = "Coincidencia de alta relevancia";
      return true;
    }
    
    // Score medio - verificar términos
    if (result.score > maxScore * 0.3) {
      for (const term of queryTerms) {
        if (productName.includes(term)) {
          result.matchReason = `Contiene "${term}" en el nombre`;
          return true;
        }
        if (productDescription.includes(term)) {
          result.matchReason = `Contiene "${term}" en la descripción`;
          return true;
        }
        if (productCode.includes(term)) {
          result.matchReason = `Contiene "${term}" en el código`;
          return true;
        }
      }
    }
    
    return false;
  });
}

/**
 * Muestra los resultados de búsqueda mejorados en la interfaz
 */
function displayEnhancedSearchResults(searchResults) {


  console.log("[Test] Entrando en displayEnhancedSearchResults");
  const { results, query, timing } = searchResults;
  
  // Limpiar el contenedor de resultados
  clearResultsContainer();
  
  // Si no hay resultados después del filtrado
  if (!results || results.length === 0) {
    showNoResultsMessage(query);
    return;
  }
  
  // Console log para depuración
  console.log("Mostrando resultados:", results);
  
  // Extraer términos de búsqueda para resaltado
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  console.log("[Display] Términos de búsqueda para resaltado:", searchTerms);
  
  // Crear los elementos para cada resultado
  results.forEach((result, index) => {
    // Obtener la descripción del producto (puede estar en campos diferentes según la estructura)
    const descripcion = result.product.descripcion || 
                       (result.product.metadata ? result.product.metadata.descripcion : null) || 
                       null;
    
    console.log(`[Display] Procesando resultado ${index+1}:`, { 
      nombre: result.product.nombre, 
      descripcion: descripcion,
      code: result.code 
    });
    
    // Crear un nuevo elemento de galería
    const galleryItem = document.createElement('div');
    galleryItem.className = 'gallery-item';
    
    // Estructura básica del elemento
    galleryItem.innerHTML = `
      <div class="container-img">
        <img alt="${result.product.nombre || 'Producto'}">
        <div class="top-row">
          <a href="">${result.product.nombre || 'Producto'}</a>
        </div>
        <div class="bottom-row">
          <a href=""><span class="icon fas fa-arrow-up"></span>${result.code}</a>
          ${result.product.precio ? `<span class="price-tag">$${result.product.precio.toLocaleString('es-AR')}</span>` : ''}
        </div>
      </div>
      <div class="info-img">
        <div class="info">
          ${descripcion ? `<div class="product-description">${descripcion}</div>` : ''}
        </div>
        <div class="reactions"></div>
      </div>
    `;
    
    // Resaltar coincidencias en el nombre
    const topRowLink = galleryItem.querySelector('.top-row a');
    if (topRowLink && result.product.nombre) {
      console.log(`[Display] Resaltando nombre: "${result.product.nombre}"`);
      // Resaltar directamente con términos de búsqueda
      const nombreResaltado = highlightTermsInText(result.product.nombre, searchTerms);
      console.log(`[Display] Nombre con resaltado: "${nombreResaltado}"`);
      topRowLink.innerHTML = nombreResaltado;
    }
    
    // Resaltar coincidencias en la descripción si existe
    const descriptionElement = galleryItem.querySelector('.product-description');
    if (descriptionElement && descripcion) {
      console.log(`[Display] Resaltando descripción: "${descripcion}"`);
      // Resaltar directamente con términos de búsqueda
      const descripcionResaltada = highlightTermsInText(descripcion, searchTerms);
      console.log(`[Display] Descripción con resaltado: "${descripcionResaltada}"`);
      descriptionElement.innerHTML = descripcionResaltada;
    }
    
    // Añadir indicador de relevancia si corresponde
    if (result.score > 0) {
      const relevanceIndicator = document.createElement('span');
      relevanceIndicator.className = 'relevance-indicator';
      
      // Calcular nivel de relevancia (1-5)
      const maxScore = results[0].score;
      const relativeScore = result.score / maxScore;
      const relevanceLevel = Math.ceil(relativeScore * 5);
      
      relevanceIndicator.dataset.level = relevanceLevel;
      relevanceIndicator.title = `Relevancia: ${relevanceLevel}/5`;
      
      // Añadir el indicador al elemento
      const infoContainer = galleryItem.querySelector('.top-row');
      if (infoContainer) {
        infoContainer.appendChild(relevanceIndicator);
      }
    }
    
    // Añadir informacion sobre por qué se mostró este resultado
    if (result.matchReason) {
      const matchReasonElement = document.createElement('div');
      matchReasonElement.className = 'match-reason';
      matchReasonElement.textContent = result.matchReason;
      
      const infoContainer = galleryItem.querySelector('.info');
      if (infoContainer) {
        infoContainer.appendChild(matchReasonElement);
      }
    }
    
    // Cargar la imagen del producto
    const imgElement = galleryItem.querySelector('img');
    if (imgElement) {
      // Intentar cargar la imagen usando el código del producto
      loadProductImage(imgElement, result.code);
    }
    
    // Añadir el elemento al contenedor
    resultsContainer.appendChild(galleryItem);
    
    // Log para ver HTML resultante
    console.log("[Display] HTML del elemento agregado:", galleryItem.outerHTML);
  });
  
  // Función para cargar la imagen del producto
  function loadProductImage(imgElement, code) {
    // 1. Intentar usar imageLoader si está disponible
    if (window.imageLoader) {
      window.imageLoader.getImageUrl(code, 'desktop')
        .then(url => {
          if (url) imgElement.src = url;
        })
        .catch(() => {
          // Intentar con la segunda opción si falla
          tryLoadFromCatalog();
        });
    } else {
      tryLoadFromCatalog();
    }
    
    // 2. Intentar cargar desde catálogo de imágenes
    function tryLoadFromCatalog() {
      fetch('./json/catalogo_imagenes.json')
        .then(response => response.json())
        .then(catalogoImagenes => {
          if (catalogoImagenes.images && catalogoImagenes.images[code]) {
            imgElement.src = `https://lh3.googleusercontent.com/d/${catalogoImagenes.images[code]}`;
          }
        })
        .catch(error => {
          console.warn(`No se pudo cargar imagen para ${code}:`, error);
        });
    }
  }
  
  // Asegurarse de que los estilos estén aplicados
  if (!document.getElementById('enhanced-search-styles')) {
    console.log("[Display] ADVERTENCIA: Los estilos de búsqueda no están presentes, añadiéndolos ahora");
    addEnhancedSearchStyles();
  }
  
  // Mostrar resumen de resultados
  showResultsSummary(results.length, query, timing);
  
  // Reorganizar la galería si tenemos un layout Pinterest
  if (typeof window.applyPinterestLayout === 'function') {
    setTimeout(window.applyPinterestLayout, 100);
  }
  
  // Ocultar indicador de estado
  hideStatus();
}

/**
 * NUEVA: Función simplificada para resaltar términos en texto
 */
function highlightTermsInText(text, terms) {
  if (!text || !terms || terms.length === 0) return text;
  
  console.log("[Resaltado] Texto original:", text);
  console.log("[Resaltado] Términos a resaltar:", terms);
  
  // Crear una copia para trabajar
  let result = text;
  
  // Para cada término de búsqueda
  for (const term of terms) {
    if (term.length < 2) continue;
    
    try {
      // Escapar caracteres especiales en el término
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      console.log(`[Resaltado] Buscando término escapado: "${escapedTerm}"`);
      
      // Crear regex para buscar el término (insensible a mayúsculas/minúsculas)
      const regex = new RegExp(escapedTerm, 'gi');
      
      // Verificar si hay coincidencias
      const coincidencias = (result.match(regex) || []).length;
      console.log(`[Resaltado] Encontradas ${coincidencias} coincidencias para "${term}"`);
      
      // Reemplazar todas las ocurrencias con la versión resaltada
      const resultadoAnterior = result;
      result = result.replace(regex, match => {
        console.log(`[Resaltado] Reemplazando "${match}" con versión resaltada`);
        return `<span class="search-highlight">${match}</span>`;
      });
      
      // Verificar si hubo cambios
      if (resultadoAnterior === result) {
        console.log(`[Resaltado] ADVERTENCIA: No se realizaron cambios para el término "${term}"`);
      } else {
        console.log(`[Resaltado] Texto con resaltado aplicado: "${result}"`);
      }
    } catch (e) {
      console.error(`[Resaltado] Error al resaltar "${term}":`, e);
    }
  }
  
  return result;
}

/**
 * NUEVO: Función auxiliar para limpiar el contenedor
 */
function clearResultsContainer() {
  // Limpiar el contenedor de resultados
  while (resultsContainer.firstChild) {
    resultsContainer.removeChild(resultsContainer.firstChild);
  }
  
  // Ocultar mensaje de no resultados si estaba visible
  const noResultsMessage = document.querySelector('.no-results-message');
  if (noResultsMessage) {
    noResultsMessage.style.display = 'none';
  }
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
  const formattedTiming = timing ? ` (${timing.toFixed(2)}ms)` : '';
  
  // Establecer texto
  summary.innerHTML = `
    <div class="mensaje-contenido">
      <span class="count">${count}</span> resultado${count !== 1 ? 's' : ''} 
      para "<span class="query">${query}</span>"${formattedTiming}
    </div>
    <button class="clear-search">Limpiar</button>
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
  document.querySelectorAll('.search-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // Preservar texto sin el resaltado
      const textoOriginal = el.textContent;
      const nodoTexto = document.createTextNode(textoOriginal);
      parent.replaceChild(nodoTexto, el);
    }
  });
  
  document.querySelectorAll('.relevance-indicator').forEach(el => {
    el.remove();
  });
  
  document.querySelectorAll('.match-reason').forEach(el => {
    el.remove();
  });
  
  // Ocultar indicador de estado
  hideStatus();
  
  console.log("[Clear] Indicadores de búsqueda limpiados");
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
  if (document.getElementById('enhanced-search-styles')) {
    console.log("[Estilos] Los estilos ya existen, no se agregarán nuevamente");
    return;
  }
  
  console.log("[Estilos] Añadiendo estilos de búsqueda mejorada");
  
  const styles = document.createElement('style');
  styles.id = 'enhanced-search-styles';
  styles.textContent = `
    /* Estilos para destacar coincidencias */
    .gallery-item .top-row a .search-highlight,
    .gallery-item .bottom-row a .search-highlight,
    .product-description .search-highlight,
    .search-highlight {
      font-weight: bold !important;
      color: #ff4500 !important; /* Naranja más intenso para mayor visibilidad */
      text-decoration: underline !important;
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
    
    /* Información de coincidencia */
    .match-reason {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
      font-style: italic;
    }
    
    /* Descripción del producto */
    .product-description {
      font-size: 14px;
      margin-top: 8px;
      color: #333;
      line-height: 1.4;
    }
    
    /* Contenedor de información */
    .info-img .info {
      padding: 5px 0;
    }
    
    /* Resumen de resultados */
    .search-results-summary {
      position: fixed;
      top: 70px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      font-size: 14px;
      max-width: 300px;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
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
      background-color: #4a90e2;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      margin-left: 10px;
    }
    
    .search-results-summary .clear-search:hover {
      background-color: #3a7cca;
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
      background-color: #3a7cca;
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
  
  console.log("[Estilos] Estilos añadidos correctamente:", styles.id);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async function() {
  console.log("[Init] Inicializando el sistema de búsqueda mejorado");
  
  // Añadir estilos - IMPORTANTE: asegurarse de que se ejecute primero
  addEnhancedSearchStyles();
  console.log("[Init] Estilos añadidos correctamente");
  
  // Para depuración: verificar que el CSS se haya aplicado correctamente
  const styleTags = document.querySelectorAll('style');
  console.log("[Init] Elementos de estilo en el documento:", styleTags.length);
  styleTags.forEach((style, index) => {
    console.log(`[Init] Estilo #${index + 1} ID:`, style.id);
    if (style.id === 'enhanced-search-styles') {
      console.log("[Init] Contenido del estilo de búsqueda:", 
        style.textContent.substring(0, 100) + "...");
    }
  });
  
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