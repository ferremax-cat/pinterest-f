

import ProductManager from '../../js/productManager.js';

// Obtener la instancia de ProductManager
let productManagerInstance = null;
try {
  productManagerInstance = ProductManager.getInstance({
    // Pasar los mismos parámetros que usas en catalogo.html
    // Si necesitas acceder a variables como monitoringSystem que no están
    // disponibles en search-engine.js, podrías obtenerlas de window
    clientData: window.clientConfig || {}
  });
  console.log('[search-engine] ProductManager inicializado correctamente');
} catch (error) {
  console.error('[search-engine] Error al inicializar ProductManager:', error);
}



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


        // Verificar si existen los mapeos de códigos
        if (searchIndex.codeMap) {
          console.log('[search-engine] Mapeo de códigos disponible:', 
                      Object.keys(searchIndex.codeMap).length, 'entradas');
        }
        
        if (searchIndex.reverseCodeMap) {
          console.log('[search-engine] Mapeo inverso de códigos disponible:',
                      Object.keys(searchIndex.reverseCodeMap).length, 'entradas');
        }

    
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
// Modificación mínima a tu función performSearch existente
// Solo se añaden los parámetros de paginación y la lógica necesaria

// Añadir parámetros de paginación con valores por defecto
// Función performSearch actualizada con soporte para paginación y carga de productos específicos
async function performSearch(query, offset = 0, limit = 30) {
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
  
  // VERIFICACIÓN DE CÓDIGO EXACTO - Tu código existente
  let originalCode = null;
  let normalizedCode = null;
  
  // Si la consulta tiene formato de código, comprobar el mapeo inverso
  if (searchIndex.reverseCodeMap && searchIndex.reverseCodeMap[query]) {
    normalizedCode = searchIndex.reverseCodeMap[query];
    originalCode = query;
    console.log(`[search-engine] Consulta coincide con código original: ${originalCode} → ${normalizedCode}`);
  }
  // También comprobar si es un código normalizado
  else if (searchIndex.codeMap && searchIndex.codeMap[query]) {
    normalizedCode = query;
    originalCode = searchIndex.codeMap[query];
    console.log(`[search-engine] Consulta coincide con código normalizado: ${normalizedCode} → ${originalCode}`);
  }
  
  // Si encontramos una coincidencia directa con un código, usar eso primero
  if (normalizedCode) {
    const exactMatch = searchIndex.indexes.exact[normalizedCode];
    if (exactMatch) {
      const matchingCodes = [exactMatch];
      const matchingItems = matchingCodes.map(code => getProductDetails(code));
      
      console.log(`[search-engine] Encontrado por coincidencia exacta de código: ${originalCode}`);
      console.log('[search-engine] Primeros 20 códigos encontrados:', matchingCodes.join(', '));
      
      displayResults(matchingItems, normalizedQuery);
      return;
    }
  }
  
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
      const matchingCodeList = [];
      
      Object.keys(searchIndex.indexes.exact).forEach(code => {
        if (code.startsWith(normalizedQuery) || 
            (normalizedQuery.startsWith(code) && code.length >= 4)) {
          partialCodeMatches.add(searchIndex.indexes.exact[code]);
          matchingCodeList.push(code);
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
  
  // Convertir los códigos a su formato original antes de mostrarlos
  const originalCodes = matchingCodes.map(code => 
    searchIndex.codeMap && searchIndex.codeMap[code] ? searchIndex.codeMap[code] : code
  );
  
  console.log(`[search-engine] Primeros 20 códigos encontrados (formato original):`, 
              originalCodes.slice(0, 20).join(', '));
  
  if (matchingCodes.length === 0) {
    clearResults();
    displayNoResults(query);
    return;
  }
  
  // NUEVO: Aplicar paginación a los resultados
  const totalResults = matchingCodes.length;
  const paginatedCodes = matchingCodes.slice(offset, offset + limit);
  
  console.log(`[search-engine] Aplicando paginación: mostrando ${paginatedCodes.length} productos (${offset+1}-${offset+paginatedCodes.length} de ${totalResults})`);
  
  // Obtener productos en lote
  let matchingItems = [];
  
  // Verificar si podemos acceder a productManagerInstance
  if (window.productManagerInstance && typeof window.productManagerInstance.loadSpecificProducts === 'function') {
    try {
      // Obtener códigos originales
      const originalCodes = paginatedCodes.map(code => 
        searchIndex.codeMap && searchIndex.codeMap[code] ? 
        searchIndex.codeMap[code] : code
      );
      
      // Obtener todos los datos en una sola llamada
      const productData = await window.productManagerInstance.loadSpecificProducts(originalCodes);
      
      // Procesar los resultados
      matchingItems = originalCodes.map(code => {
        if (productData && productData[code]) {
          return {
            id: code,
            code: code,
            name: productData[code].name || `Producto ${code}`,
            category: productData[code].category || '',
            price: productData[code].selectedPrice || 0
          };
        } else {
          return {
            id: code,
            code: code,
            name: `Producto ${code}`,
            category: '',
            price: 0
          };
        }
      });
    } catch (error) {
      console.error('[search-engine] Error al obtener productos:', error);
      // Fallback a datos mínimos
      matchingItems = paginatedCodes.map(code => ({
        code: code,
        name: `Producto ${code}`,
        price: 0
      }));
    }
  } else {
    console.warn('[search-engine] Método loadSpecificProducts no disponible, usando datos mínimos');
    // Usar datos mínimos
    matchingItems = paginatedCodes.map(code => ({
      code: code,
      name: `Producto ${code}`,
      price: 0
    }));
  }
  
  // Mostrar resultados con información de paginación
  displayResults(matchingItems, normalizedQuery, {
    offset: offset,
    limit: limit,
    total: totalResults,
    hasMore: offset + limit < totalResults
  });
  
  // Devolver información para uso externo
  return {
    items: matchingItems,
    total: totalResults,
    offset: offset,
    limit: limit,
    hasMore: offset + limit < totalResults
  };
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
    // Función displayResults adaptada para colocar elementos exactamente donde el código existente los espera
      function displayResults(matchingItems, normalizedQuery, pagination = {}) {
        const galleryContainer = document.querySelector('.gallery-container');
        if (!galleryContainer) {
          console.warn('[search-engine] Contenedor de galería no encontrado');
          return;
        }
        
        // Extraer información de paginación
        const { offset = 0, total = matchingItems.length, hasMore = false } = pagination;
        const isInitialLoad = offset === 0;
        
        // Si es carga inicial (offset 0), limpiar el contenedor de galería
        if (isInitialLoad) {
          // Limpiar galería para mostrar nuevos resultados
          galleryContainer.innerHTML = '';
          
          // Mostrar información sobre resultados usando mensaje-busqueda
          // o crearlo si no existe
          let mensajeBusqueda = document.getElementById('mensaje-busqueda');
          if (!mensajeBusqueda) {
            mensajeBusqueda = document.createElement('div');
            mensajeBusqueda.id = 'mensaje-busqueda';
            mensajeBusqueda.className = 'mensaje-busqueda';
            document.body.appendChild(mensajeBusqueda);
          }
          
          mensajeBusqueda.innerHTML = `
            <div class="mensaje-contenido">
              <span class="mensaje-contador">${total}</span> resultados${normalizedQuery ? ` para "<span class="mensaje-termino">${normalizedQuery}</span>"` : ''}
              ${total > matchingItems.length ? `<span class="mensaje-pagina">(Mostrando 1-${matchingItems.length})</span>` : ''}
            </div>
            ${normalizedQuery ? `<button id="boton-limpiar-busqueda" class="boton-limpiar">Limpiar</button>` : ''}
          `;
          
          // Añadir funcionalidad para limpiar búsqueda
          const botonLimpiar = document.getElementById('boton-limpiar-busqueda');
          if (botonLimpiar) {
            botonLimpiar.addEventListener('click', () => {
              const searchInput = document.querySelector('input[type="text"]');
              if (searchInput) {
                searchInput.value = '';
                // Buscar sin término equivale a mostrar todo
                performSearch('');
              }
            });
          }
        }
        
        // Añadir los nuevos items a la galería
        matchingItems.forEach(item => {
          // Crear elemento de galería siguiendo exactamente tu estructura HTML
          const galleryItem = document.createElement('div');
          galleryItem.className = 'gallery-item';
          
          // Agregar el atributo data-product-code según tus ejemplos
          if (item.code) {
            galleryItem.setAttribute('data-product-code', item.code);
          }
          
          // AÑADIR ESTAS LÍNEAS: Preparar texto con resaltado
          let itemName = item.name || '';
          let itemCode = item.code || '';

           // NUEVO: Convertir el nombre a minúsculas
          itemName = itemName.toLowerCase();

          if (normalizedQuery && normalizedQuery.trim()) {
            const searchTerm = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            itemName = itemName.replace(regex, '<span class="search-highlight">$1</span>');
            itemCode = itemCode.replace(regex, '<span class="search-highlight">$1</span>');
          }  



          // Estructura HTML con elementos en las ubicaciones exactas según tus selectores
          galleryItem.innerHTML = `
            <div class="container-img">
              <img alt="${item.name || ''}" src="img/loading-product.gif">

              <div class="top-row">
              <a href="#">${itemName}</a>
              </div>

              <div class="bottom-row">
              <a href="#">${itemCode}</a>
              ${item.price ? `<span class="price-tag">$${formatPrice(item.price)}</span>` : ''}
              </div>
            </div>


            <div class="info-img">
              <div class="info">
              </div>

              <div class="reactions">
              </div>
            </div>
          `;
          
          // Añadir el item a la galería
          galleryContainer.appendChild(galleryItem);
        });
        
        // IMPORTANTE: Actualizar la variable global galleryItems si existe
        try {
          window.galleryItems = document.querySelectorAll('.gallery-item');
          console.log('[search-engine] Variable global galleryItems actualizada con', window.galleryItems.length, 'elementos');
        } catch (e) {
          console.warn('[search-engine] No se pudo actualizar variable global galleryItems:', e);
        }
        
        // Si hay más resultados disponibles, mostrar botón "Cargar más"
        // Primero eliminar el botón existente si lo hay
        const existingLoadMoreButton = document.getElementById('load-more-button');
        if (existingLoadMoreButton) {
          existingLoadMoreButton.remove();
        }
        
        if (hasMore) {
          // Crear botón "Cargar más"
          const loadMoreButton = document.createElement('button');
          loadMoreButton.id = 'load-more-button';
          loadMoreButton.className = 'load-more-button';
          loadMoreButton.textContent = 'Cargar más productos';
          
          // Añadir estilos inline para el botón si no tienes una clase CSS para él
          loadMoreButton.style.display = 'block';
          loadMoreButton.style.width = '100%';
          loadMoreButton.style.maxWidth = '400px';
          loadMoreButton.style.margin = '20px auto';
          loadMoreButton.style.padding = '10px 15px';
          loadMoreButton.style.backgroundColor = '#4a90e2';
          loadMoreButton.style.color = 'white';
          loadMoreButton.style.border = 'none';
          loadMoreButton.style.borderRadius = '4px';
          loadMoreButton.style.cursor = 'pointer';
          
          // Añadir evento al botón
          loadMoreButton.addEventListener('click', function() {
            // Deshabilitar botón mientras carga
            this.disabled = true;
            this.textContent = 'Cargando...';
            this.style.backgroundColor = '#7a7a7a';
            
            // Calcular próximo offset
            const nextOffset = offset + matchingItems.length;
            const limit = pagination.limit || 30; // Usar el mismo limit o valor por defecto
            
            // Llamar a performSearch con el nuevo offset
            try {
              performSearch(normalizedQuery, nextOffset, limit);
            } catch (error) {
              console.error('[search-engine] Error al cargar más resultados:', error);
              // Restaurar botón en caso de error
              this.disabled = false;
              this.textContent = 'Cargar más productos';
              this.style.backgroundColor = '#4a90e2';
            }
          });
          
          // Añadir el botón después de la galería
          galleryContainer.parentNode.insertBefore(loadMoreButton, galleryContainer.nextSibling);
        }
        
        // Actualizar contador si es carga incremental
        if (!isInitialLoad) {
          const mensajePagina = document.querySelector('.mensaje-pagina');
          if (mensajePagina) {
            const currentCount = offset + matchingItems.length;
            mensajePagina.textContent = `(Mostrando 1-${currentCount})`;
          }
          
          // Si usas layout de Pinterest o similar, aplícalo después de añadir nuevos items
          if (typeof window.applyPinterestLayout === 'function') {
            setTimeout(() => {
              window.applyPinterestLayout();
            }, 100);
          }
        }
      }

      // Función auxiliar para formatear precios
      function formatPrice(price) {
        if (typeof price !== 'number') return price;
        return price.toLocaleString('es-AR');
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
    function addStyles() {if (document.getElementById('search-override-styles')) return;
    
      const styles = document.createElement('style');
      styles.id = 'search-override-styles';
      styles.textContent = `
        /* Estilo para resaltado de coincidencias - versión más específica */
          .gallery-item .top-row a .search-highlight,
          .gallery-item .bottom-row a .search-highlight,
          .search-highlight {
          font-weight: bold !important;
          color: #ff4500 !important; /* Naranja más intenso para mayor visibilidad */
          text-decoration: underline !important;
          }
        
        /* Estilo para el mensaje de búsqueda */
        .mensaje-busqueda {
          position: fixed;
          top: 70px;
          right: 20px;
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          border-radius: 4px;
          padding: 10px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 300px;
          z-index: 9999;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        
        .mensaje-contenido {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
        }
        
        .mensaje-contador {
          font-weight: bold;
          margin-right: 5px;
        }
        
        .mensaje-termino {
          font-style: italic;
          font-weight: bold;
        }
        
        .boton-limpiar {
          background-color: #4a90e2;
          color: white;
          border: none;
          border-radius: 3px;
          padding: 5px 10px;
          cursor: pointer;
          font-size: 12px;
          margin-left: 10px;
        }
        
        .boton-limpiar:hover {
          background-color: #3a7cca;
        }
      `;
      
      document.head.appendChild(styles);
    }
    

    // 2. Modifica la función getProductDetails para usar el mapeo
      // Función getProductDetails con diagnóstico completo para encontrar el error
      function getProductDetails(code) {
        console.log(`[DIAGNÓSTICO] getProductDetails recibió código: "${code}"`);
        
        // Diagnosticar searchIndex
        console.log('[DIAGNÓSTICO] ¿searchIndex existe?', !!window.searchIndex);
        console.log('[DIAGNÓSTICO] ¿searchIndex.codeMap existe?', !!(window.searchIndex && window.searchIndex.codeMap));
        
        // Diagnosticar productManager
        console.log('[DIAGNÓSTICO] ¿productManager existe?', !!window.productManager);
        console.log('[DIAGNÓSTICO] ¿productManager.getProduct existe?', !!(window.productManager && typeof window.productManager.getProduct === 'function'));
        console.log('[DIAGNÓSTICO] ¿productManager.getPrecio existe?', !!(window.productManager && typeof window.productManager.getPrecio === 'function'));
        
        let originalCode = code;
        
        try {
          // Intentar obtener código original solo si searchIndex.codeMap existe
          if (window.searchIndex && window.searchIndex.codeMap) {
            const mappedCode = window.searchIndex.codeMap[code];
            if (mappedCode) {
              originalCode = mappedCode;
              console.log(`[DIAGNÓSTICO] Código mapeado: "${code}" -> "${originalCode}"`);
            }
          }
          
          // Variables para almacenar datos
          let productData = null;
          let priceData = null;
          
          // Intentar obtener datos del producto si productManager existe
          if (window.productManager && typeof window.productManager.getProduct === 'function') {
            try {
              console.log(`[DIAGNÓSTICO] Llamando a productManager.getProduct("${originalCode}")`);
              productData = window.productManager.getProduct(originalCode);
              console.log('[DIAGNÓSTICO] Resultado de getProduct:', productData);
            } catch (error) {
              console.error(`[DIAGNÓSTICO] Error en getProduct:`, error);
              productData = null;
            }
          }
          
          // Intentar obtener precio si productManager existe
          if (window.productManager && typeof window.productManager.getPrecio === 'function') {
            try {
              console.log(`[DIAGNÓSTICO] Llamando a productManager.getPrecio("${originalCode}")`);
              priceData = window.productManager.getPrecio(originalCode);
              console.log('[DIAGNÓSTICO] Resultado de getPrecio:', priceData);
            } catch (error) {
              console.error(`[DIAGNÓSTICO] Error en getPrecio:`, error);
              priceData = null;
            }
          }
          
          // Construir objeto de resultado con valores por defecto seguros
          const result = {
            id: originalCode,         // Usar código original como ID
            code: originalCode,       // Mostrar código original en la interfaz
            name: productData && productData.name ? productData.name : `Producto ${originalCode}`,
            category: productData && productData.category ? productData.category : '',
            price: priceData && priceData.D ? priceData.D : 0
          };
          
          console.log('[DIAGNÓSTICO] Objeto final devuelto:', result);
          return result;
          
        } catch (error) {
          console.error(`[DIAGNÓSTICO] Error general:`, error);
          
          // Devolver objeto seguro en caso de error
          return {
            id: code,
            code: code,
            name: `Producto ${code}`,
            category: '',
            price: 0,
            error: true
          };
        }
      }



    // Inicializar
    addStyles();
    initSearch();
  });