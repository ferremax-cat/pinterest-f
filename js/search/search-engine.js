// Implementación básica de búsqueda usando archivos JSON fragmentados
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema de búsqueda...');
    
    // Variables para almacenar índices
    let searchIndex = null;
    let masterIndex = null;
    let fragmentIndices = {};
    
    // Elementos DOM
    const searchInput = document.querySelector('input[type="text"]');
    const resultsContainer = document.querySelector('.gallery-container'); // Asegúrate de tener este elemento
    
    // Cargar el índice de búsqueda inicial (ligero)
    
// Cargar el índice de búsqueda inicial
async function initSearch() {
  try {
    console.log('[search-engine] Iniciando carga del índice...');
    
    // Cargar el índice de búsqueda principal
    const searchIndexResponse = await fetch('./json/search/search_index.json');
    const searchIndexData = await searchIndexResponse.json();
    
    // Guardar la estructura completa para tener acceso a todos los índices
    searchIndex = searchIndexData;
    
    console.log('[search-engine] Índice de búsqueda cargado correctamente');
    console.log('[search-engine] Estructura del índice:', Object.keys(searchIndex).join(', '));
    
    if (searchIndex.indexes) {
      console.log('[search-engine] Tipos de índices:', Object.keys(searchIndex.indexes).join(', '));
      
      // Verificar específicamente la existencia de 'disco' en diferentes índices
      if (searchIndex.indexes.tokens && searchIndex.indexes.tokens.disco) {
        console.log('[search-engine] "disco" encontrado en tokens con', 
                    Array.isArray(searchIndex.indexes.tokens.disco) ? 
                    searchIndex.indexes.tokens.disco.length : '1', 'productos');
      } else {
        console.log('[search-engine] "disco" NO encontrado en tokens');
      }
      
      if (searchIndex.indexes.exact && searchIndex.indexes.exact.disco) {
        console.log('[search-engine] "disco" encontrado en exact');
      }
      
      if (searchIndex.indexes.ngrams) {
        const discoNgrams = Object.keys(searchIndex.indexes.ngrams).filter(
          ng => ng.includes('disc') || ng.includes('disk')
        );
        
        if (discoNgrams.length > 0) {
          console.log('[search-engine] N-gramas relacionados con "disco":', discoNgrams.join(', '));
        }
      }
    }
    
    // Configurar el campo de búsqueda
    setupSearchField();
  } catch (error) {
    console.error('[search-engine] Error al cargar el índice de búsqueda:', error);
  }
}
    
    // Configurar campo de búsqueda
    function setupSearchField() {
      if (!searchInput) {
        console.warn('[search-engine] No se encontró el campo de búsqueda');
        return;
      }
      
      // Mejorar el placeholder
      searchInput.placeholder = "Buscar en catálogo de productos...";
      
      // Función debounce para evitar múltiples búsquedas durante escritura
      function debounce(func, wait) {
        let timeout;
        return function(...args) {
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(this, args), wait);
        };
      }
      
      // Añadir el nuevo listener con debounce
      searchInput.addEventListener('input', debounce(function() {
        const termino = this.value.trim();
        performSearch(termino);
      }, 300));
      
      console.log('[search-engine] Campo de búsqueda configurado');
    }
    
    
  // Realizar búsqueda adaptada a la estructura completa
// Realizar búsqueda mejorada con coincidencias parciales
// Realizar búsqueda con coincidencias parciales más precisas
async function performSearch(query) {
  if (!searchIndex || !searchIndex.indexes) {
    console.warn('[search-engine] Índice de búsqueda no disponible o formato incorrecto');
    return;
  }
  
  console.log(`[search-engine] Buscando: "${query}"`);
  
  if (!query) {
    clearResults();
    return;
  }
  
  // Normalizar la consulta
  const normalizedQuery = query.toLowerCase().trim();
  
  // Buscar productos que coincidan con la consulta
  let matchingCodes = [];
  let searchSource = '';
  
  // 1. Buscar coincidencia exacta en tokens
  if (searchIndex.indexes.tokens && searchIndex.indexes.tokens[normalizedQuery]) {
    const tokenMatches = searchIndex.indexes.tokens[normalizedQuery];
    matchingCodes = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
    searchSource = 'tokens (coincidencia exacta)';
    console.log(`[search-engine] Coincidencia exacta en tokens para "${normalizedQuery}": ${matchingCodes.length} productos`);
  }
  
  // 2. Si no hay coincidencia exacta y el término tiene al menos 4 caracteres, 
  // buscar coincidencias de prefijo (términos que comienzan igual)
  if (matchingCodes.length === 0 && searchIndex.indexes.tokens && normalizedQuery.length >= 4) {
    const partialMatches = new Set();
    const matchingTerms = [];
    
    // Buscar solo tokens que COMIENZAN con la consulta, o donde la consulta es un prefijo
    Object.keys(searchIndex.indexes.tokens).forEach(token => {
      // Opción 1: El token comienza con la consulta (ej: 'diamant' encontrará 'diamantado')
      if (token.startsWith(normalizedQuery)) {
        const tokenProducts = searchIndex.indexes.tokens[token];
        const productsArray = Array.isArray(tokenProducts) ? tokenProducts : [tokenProducts];
        
        productsArray.forEach(code => partialMatches.add(code));
        matchingTerms.push(token);
      }
      // Opción 2: La consulta comienza con el token, pero solo si el token tiene al menos 4 caracteres
      // y representa al menos el 70% de la consulta (para evitar coincidencias débiles)
      else if (normalizedQuery.startsWith(token) && 
               token.length >= 4 && 
               token.length >= normalizedQuery.length * 0.7) {
        const tokenProducts = searchIndex.indexes.tokens[token];
        const productsArray = Array.isArray(tokenProducts) ? tokenProducts : [tokenProducts];
        
        productsArray.forEach(code => partialMatches.add(code));
        matchingTerms.push(token);
      }
    });
    
    if (partialMatches.size > 0) {
      matchingCodes = Array.from(partialMatches);
      searchSource = `tokens (coincidencia parcial: ${matchingTerms.length} términos)`;
      console.log(`[search-engine] Coincidencias parciales en tokens para "${normalizedQuery}": ${matchingCodes.length} productos`);
      
      // Listar los primeros términos que coincidieron
      console.log(`[search-engine] Primeros términos coincidentes:`, 
                  matchingTerms.slice(0, 10).join(', '));
    }
  }
  
  // 3. Si aún no hay coincidencias, buscar en códigos exactos
  if (matchingCodes.length === 0 && searchIndex.indexes.exact) {
    if (searchIndex.indexes.exact[normalizedQuery]) {
      const exactMatch = searchIndex.indexes.exact[normalizedQuery];
      matchingCodes = [exactMatch];
      searchSource = 'exact';
      console.log(`[search-engine] Coincidencia exacta para "${normalizedQuery}"`);
    } else if (normalizedQuery.length >= 4) {
      // Buscar coincidencias parciales en códigos, solo prefijos
      const partialCodeMatches = new Set();
      const matchingCodes = [];
      
      Object.keys(searchIndex.indexes.exact).forEach(code => {
        if (code.startsWith(normalizedQuery) || 
            (normalizedQuery.startsWith(code) && code.length >= 4)) {
          partialCodeMatches.add(searchIndex.indexes.exact[code]);
          matchingCodes.push(code);
        }
      });
      
      if (partialCodeMatches.size > 0) {
        matchingCodes = Array.from(partialCodeMatches);
        searchSource = 'exact (coincidencia parcial)';
        console.log(`[search-engine] Coincidencias parciales en códigos para "${normalizedQuery}": ${matchingCodes.length} productos`);
      }
    }
  }
  
  // 4. Si aún no hay coincidencias, intentar con los n-gramas como último recurso
  if (matchingCodes.length === 0 && searchIndex.indexes.ngrams && normalizedQuery.length >= 3) {
    // Generar n-gramas de la consulta (solo si no se encontraron coincidencias antes)
    const queryNgrams = [];
    const ngramSize = 3; // Usar trigramas
    
    for (let i = 0; i <= normalizedQuery.length - ngramSize; i++) {
      queryNgrams.push(normalizedQuery.substring(i, i + ngramSize));
    }
    
    if (queryNgrams.length > 0) {
      const ngramMatches = new Set();
      const matchedNgrams = [];
      
      queryNgrams.forEach(ngram => {
        if (searchIndex.indexes.ngrams[ngram]) {
          const matches = searchIndex.indexes.ngrams[ngram];
          const matchArray = Array.isArray(matches) ? matches : [matches];
          
          matchArray.forEach(code => ngramMatches.add(code));
          matchedNgrams.push(ngram);
        }
      });
      
      if (ngramMatches.size > 0) {
        matchingCodes = Array.from(ngramMatches);
        searchSource = `ngrams (${matchedNgrams.length} n-gramas)`;
        console.log(`[search-engine] Coincidencia en n-gramas para "${normalizedQuery}": ${matchingCodes.length} productos`);
        console.log(`[search-engine] N-gramas coincidentes:`, matchedNgrams.join(', '));
      }
    }
  }
  
  console.log(`[search-engine] Resultado final: ${matchingCodes.length} productos encontrados (fuente: ${searchSource})`);
  
  // Mostrar los códigos encontrados en la consola (limitados a 20 para no saturar)
  if (matchingCodes.length > 0) {
    console.log(`[search-engine] Primeros 20 códigos encontrados:`, 
                matchingCodes.slice(0, 20).join(', '));
  }
  
  if (matchingCodes.length === 0) {
    clearResults();
    displayNoResults(query);
    return;
  }
  
  // Obtener detalles de los productos encontrados
  const matchingItems = matchingCodes.map(code => getProductDetails(code));
  
  // Mostrar resultados
  displayResults(matchingItems, normalizedQuery);
}

// Función para generar n-gramas (necesaria para búsqueda en n-gramas)
function generateNgrams(text, size = 3) {
  if (!text || typeof text !== 'string' || text.length < size) return [];
  
  const normalized = text.toLowerCase()
                         .normalize('NFD')
                         .replace(/[\u0300-\u036f]/g, '')
                         .replace(/[^\w\s]/g, '')
                         .trim();
  
  const ngrams = [];
  for (let i = 0; i <= normalized.length - size; i++) {
    ngrams.push(normalized.substring(i, i + size));
  }
  
  return ngrams;
}

function displayNoResults(query) {
  const resultsContainer = document.querySelector('#results-container');
  if (!resultsContainer) return;
  
  resultsContainer.innerHTML = `
    <div class="no-results">
      <p>No se encontraron resultados para "<strong>${query}</strong>"</p>
      <p>Sugerencias:</p>
      <ul>
        <li>Revisa la ortografía de las palabras</li>
        <li>Usa términos más generales</li>
        <li>Prueba con sinónimos</li>
      </ul>
    </div>
  `;
}

    
    // Identificar qué fragmentos necesitamos cargar
    function identifyNeededFragments(items) {
      // Esta función debería determinar qué fragmentos necesitamos basado en los resultados
      // Por simplicidad, asumimos que los fragmentos están organizados alfabéticamente
      const fragments = new Set();
      
      items.forEach(item => {
        const firstChar = (item.name || item.code || '').charAt(0).toLowerCase();
        if (firstChar >= 'a' && firstChar < 'g') fragments.add('a');
        else if (firstChar >= 'g' && firstChar < 'n') fragments.add('g');
        else if (firstChar >= 'n' && firstChar < 't') fragments.add('n');
        else if (firstChar >= 't') fragments.add('t');
      });
      
      return Array.from(fragments);
    }
    
    // Cargar un fragmento específico
    async function loadFragment(fragment) {
      try {
        console.log(`Cargando fragmento: ${fragment}`);
        const response = await fetch(`./json/search/optimized/index_${fragment}.json`);
        fragmentIndices[fragment] = await response.json();
        console.log(`Fragmento ${fragment} cargado correctamente`);
      } catch (error) {
        console.error(`Error al cargar fragmento ${fragment}:`, error);
      }
    }
    
    // Mostrar resultados de búsqueda
    function displayResults(items, query) {
      if (!resultsContainer) {
        console.warn('Contenedor de resultados no encontrado');
        return;
      }
      
      // Limitar a 50 resultados para rendimiento en móviles
      const limitedItems = items.slice(0, 50);
      
      resultsContainer.innerHTML = '';
      
      if (limitedItems.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No se encontraron resultados</div>';
        return;
      }
      
      // Crear elemento para cantidad de resultados
      const countElement = document.createElement('div');
      countElement.className = 'results-count';
      countElement.textContent = `${items.length} resultados encontrados${items.length > limitedItems.length ? ' (mostrando los primeros 50)' : ''}`;
      resultsContainer.appendChild(countElement);
      
      // Crear lista de resultados
      const listElement = document.createElement('div');
      listElement.className = 'results-list';
      
      limitedItems.forEach(item => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        
        // Destacar el término de búsqueda en el nombre
        let displayName = item.name || item.code || '';
        if (query) {
          const regex = new RegExp(`(${query})`, 'gi');
          displayName = displayName.replace(regex, '<span class="highlight">$1</span>');
        }
        
        resultItem.innerHTML = `
          <div class="item-name">${displayName}</div>
          ${item.code ? `<div class="item-code">Código: ${item.code}</div>` : ''}
        `;
        
        // Añadir evento para cargar detalles completos al hacer clic
        resultItem.addEventListener('click', () => {
          loadItemDetails(item.id);
        });
        
        listElement.appendChild(resultItem);
      });
      
      resultsContainer.appendChild(listElement);
    }
    
    // Cargar detalles completos de un ítem
    async function loadItemDetails(itemId) {
      // Esta función cargaría los detalles completos del ítem desde el master_index
      // o desde el fragmento correspondiente
      console.log(`Cargando detalles para ítem: ${itemId}`);
      
      // Aquí agregarías la lógica para mostrar los detalles
      // Esto es solo un placeholder
      alert(`Cargando detalles del producto ${itemId}`);
    }
    
    // Limpiar resultados
    function clearResults() {
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
      }
    }
    
    // Agregar estilos CSS
    function addStyles() {
      const styles = document.createElement('style');
      styles.textContent = `
        .results-count {
          margin: 10px 0;
          font-weight: bold;
        }
        
        .results-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .result-item {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          cursor: pointer;
        }
        
        .result-item:hover {
          background-color: #f5f5f5;
        }
        
        .item-name {
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .highlight {
          background-color: #ffeb3b;
          font-weight: bold;
        }
        
        .no-results {
          padding: 20px;
          text-align: center;
          color: #666;
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Inicializar
    addStyles();
    initSearch();
  });