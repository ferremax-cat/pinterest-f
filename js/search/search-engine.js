

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

      // NUEVA FUNCIÓN: Verificar si una consulta parece ser un código de producto
      function looksLikeProductCode(query) {
        // Patrones comunes para códigos de productos (ajustar según tus códigos)
        // Por ejemplo, si tus códigos suelen ser letras seguidas de números
        // Aceptar patrones como "RDTF" (letras) o "RDTF1" (letras+números)
        const codePattern = /^[A-Za-z]{2,}[0-9]*$/;
        return codePattern.test(query.trim());
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
  
  //busqueda por codigo
          // Verificar si la consulta parece ser un código de producto
        if (looksLikeProductCode(query)) {
          // Convertir a mayúsculas para comparar con la base de datos
          const upperCaseQuery = query.toUpperCase();
          console.log(`[search-engine] La consulta "${query}" parece ser un código de producto`);
          
          // 1. Buscar coincidencia exacta de código
          let exactProductFound = false;
          
          // Inicializar scoredResults para almacenar las puntuaciones
          let scoredResults = {};
          
          // Comprobar si hay una coincidencia directa en el índice de códigos
          if (searchIndex.indexes.exact && searchIndex.indexes.exact[upperCaseQuery]) {
            const exactProduct = searchIndex.indexes.exact[upperCaseQuery];
            scoredResults[exactProduct] = 1000; // Puntuación muy alta para coincidencia exacta
            exactProductFound = true;
            console.log(`[search-engine] Coincidencia exacta de código: ${query} -> ${exactProduct}`);
          }
          
          // 2. Buscar productos cuyo código comienza con la consulta
          const prefixMatches = [];
          
          // Recorrer todos los códigos en el índice exact
          if (searchIndex.indexes.exact) {
            Object.keys(searchIndex.indexes.exact).forEach(code => {
              // Verificar si este código comienza con la consulta
              if (code.startsWith(upperCaseQuery) && code !== upperCaseQuery) { // Excluir coincidencia exacta
                const productCode = searchIndex.indexes.exact[code];
                //scoredResults[productCode] = 500; // Puntuación alta para coincidencia de prefijo
                 // Dar puntuación basada en la longitud del prefijo (más largo = mayor puntuación)
                const prefixScore = 400 + (upperCaseQuery.length * 20); // Base 400 + bonus por longitud
                scoredResults[productCode] = prefixScore;
                prefixMatches.push(code);
              }
            });
          }
          
          console.log(`[search-engine] Coincidencias de prefijo para "${upperCaseQuery}": ${prefixMatches.length} productos`);
          
          // Si encontramos coincidencias exactas o por prefijo, no necesitamos buscar por texto
          if (exactProductFound || prefixMatches.length > 0) {
            console.log(`[search-engine] Usando resultados de búsqueda por código de producto`);
            
            // Crear un token con el código completo para que displayResults funcione correctamente
            const queryTokens = [query]; 
            
            // Convertir a array y ordenar por puntuación
            let matchingCodes = Object.entries(scoredResults)
              .map(([code, score]) => ({ code, score }))
              .sort((a, b) => b.score - a.score) // Ordenar de mayor a menor puntuación
              .map(item => item.code);
            
            console.log(`[search-engine] Resultado final: ${matchingCodes.length} productos encontrados`);
            
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
                // Obtener códigos originales para esta página
                const pageOriginalCodes = paginatedCodes.map(code => 
                  searchIndex.codeMap && searchIndex.codeMap[code] ? 
                  searchIndex.codeMap[code] : code
                );
                
                // Obtener todos los datos en una sola llamada
                const productData = await window.productManagerInstance.loadSpecificProducts(pageOriginalCodes);
                
                // Procesar los resultados
                matchingItems = pageOriginalCodes.map(code => {
                  if (productData && productData[code]) {
                    return {
                      id: code,
                      code: code,
                      name: productData[code].name || `Producto ${code}`,
                      category: productData[code].category || '',
                      price: productData[code].selectedPrice || 0,
                      imageId: productData[code].imageId || null
                    };
                  } else {
                    return {
                      id: code,
                      code: code,
                      name: `Producto ${code}`,
                      category: '',
                      price: 0,
                      imageId: null
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
            displayResults(matchingItems, query, queryTokens, {
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
        }
  //fin busqueda por codigo
    

  // Normalizar la consulta
  const normalizedQuery = query.toLowerCase().trim();

      // Dividir la consulta en tokens individuales
    const queryTokens = normalizedQuery.split(/\s+/).filter(token => token.length >= 3);
    console.log(`[search-engine] Tokens de búsqueda: ${queryTokens.join(', ')}`);

    console.log('[search-engine] Tokens disponibles en el índice que incluyen estos términos:');
    queryTokens.forEach(token => {
      const matchingIndexTokens = Object.keys(searchIndex.indexes.tokens)
        .filter(indexToken => 
          indexToken.includes(token) || 
          token.includes(indexToken)
        );
      
      console.log(`[search-engine] Para "${token}": ${matchingIndexTokens.join(', ')}`);
    });

    // Objeto para almacenar todos los resultados con su puntuación
    let scoredResults = {};
  
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
  
      // Si encontramos una coincidencia directa con un código, asignar puntuación alta
    if (normalizedCode) {
      const exactMatch = searchIndex.indexes.exact[normalizedCode];
      if (exactMatch) {
        scoredResults[exactMatch] = 100; // Puntuación máxima para coincidencia exacta de código
        console.log(`[search-engine] Encontrado por coincidencia exacta de código: ${originalCode}`);
      }
    }
  
  // Buscar productos que coincidan con la consulta
  //let matchingCodes = [];
  //let searchSource = '';
  
      // 1. Buscar coincidencias para cada token individual
    queryTokens.forEach(token => {
      if (searchIndex.indexes.tokens && searchIndex.indexes.tokens[token]) {
        const tokenMatches = searchIndex.indexes.tokens[token];
        const matches = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
        
        matches.forEach(code => {
          // Si ya existe, aumentar la puntuación; si no, inicializar
          scoredResults[code] = (scoredResults[code] || 0) + 10;
        });
        
        console.log(`[search-engine] Token "${token}": ${matches.length} productos (score: 10 c/u)`);
      }
    });

    // 2. También buscar la frase completa si tiene más de una palabra
    if (queryTokens.length > 1 && searchIndex.indexes.tokens && searchIndex.indexes.tokens[normalizedQuery]) {
      const phraseMatches = searchIndex.indexes.tokens[normalizedQuery];
      const matches = Array.isArray(phraseMatches) ? phraseMatches : [phraseMatches];
      
      matches.forEach(code => {
        // Puntuación adicional para coincidencia de frase completa
        scoredResults[code] = (scoredResults[code] || 0) + 15;
      });
      
      console.log(`[search-engine] Frase completa "${normalizedQuery}": ${matches.length} productos (score: +15)`);
    }

    // 3. Buscar coincidencias parciales (prefijos/sufijos)
    queryTokens.forEach(token => {
      if (token.length < 3) return; // Ignorar tokens muy cortos
      
      // Contar cuántos productos coinciden parcialmente con cada token
      let partialMatches = 0;
      
      Object.keys(searchIndex.indexes.tokens).forEach(indexToken => {
        // Verificar si el token de búsqueda es prefijo del token indexado
        // o si el token indexado es prefijo del token de búsqueda
        if (indexToken.startsWith(token) || 
            (token.startsWith(indexToken) && indexToken.length >= 4)) {
          
          const tokenMatches = searchIndex.indexes.tokens[indexToken];
          const matches = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
          
          matches.forEach(code => {
            // Puntuación reducida para coincidencias parciales
            scoredResults[code] = (scoredResults[code] || 0) + 5;
            partialMatches++;
          });
        }
      });
      
      if (partialMatches > 0) {
        console.log(`[search-engine] Coincidencias parciales para "${token}": ${partialMatches} productos (score: 5 c/u)`);
      }
    });
  
      // 4. Buscar en n-gramas como último recurso (puntuación más baja)
    if (normalizedQuery.length >= 3) {
      // Generar n-gramas de la consulta
      const queryNgrams = [];
      const ngramSize = 3; // Usar trigramas
      
      for (let i = 0; i <= normalizedQuery.length - ngramSize; i++) {
        queryNgrams.push(normalizedQuery.substring(i, i + ngramSize));
      }
      
      if (queryNgrams.length > 0) {
        const matchedNgrams = [];
        
        queryNgrams.forEach(ngram => {
          if (searchIndex.indexes.ngrams && searchIndex.indexes.ngrams[ngram]) {
            const ngramMatches = searchIndex.indexes.ngrams[ngram];
            const matches = Array.isArray(ngramMatches) ? ngramMatches : [ngramMatches];
            
            matches.forEach(code => {
              // Puntuación baja para coincidencias de n-gramas
              scoredResults[code] = (scoredResults[code] || 0) + 2;
            });
            
            matchedNgrams.push(ngram);
          }
        });
        
        if (matchedNgrams.length > 0) {
          console.log(`[search-engine] Coincidencias por n-gramas: ${matchedNgrams.length} n-gramas utilizados`);
        }
      }
    }
  
 // console.log(`[search-engine] Resultado final: ${matchingCodes.length} productos encontrados (fuente: ${searchSource})`);

    // Bonus por coincidencia múltiple - Versión mejorada
if (queryTokens.length > 1) {
  // Para cada código en scoredResults, verificar cuántos tokens diferentes contribuyeron
  const tokenContributions = {}; // Objeto para registrar qué tokens contribuyeron a cada código
  
  // Para cada token, registrar a qué códigos contribuyó
  queryTokens.forEach(token => {
    if (searchIndex.indexes.tokens && searchIndex.indexes.tokens[token]) {
      const tokenMatches = searchIndex.indexes.tokens[token];
      const matches = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
      
      matches.forEach(code => {
        // Inicializar array de tokens si no existe para este código
        if (!tokenContributions[code]) {
          tokenContributions[code] = [];
        }
        // Añadir este token a la lista de contribuciones si no está ya
        if (!tokenContributions[code].includes(token)) {
          tokenContributions[code].push(token);
        }
      });
    }
  });
  
  // Ahora, para cada código, aplicar un bonus basado en cuántos tokens diferentes contribuyeron
  Object.entries(tokenContributions).forEach(([code, tokens]) => {
    // Si el producto tiene TODOS los tokens de la búsqueda, darle un bonus muy alto
    if (tokens.length === queryTokens.length) {
      const bonus = 50; // Bonus muy alto para coincidencia completa
      
      if (scoredResults[code]) {
        scoredResults[code] += bonus;
        console.log(`[search-engine] BONUS COMPLETO para ${code}: contiene TODOS los ${tokens.length} tokens (+${bonus})`);
      }
    }
    // Para productos que tienen algunos pero no todos los tokens
    else if (tokens.length > 1) {
      // Bonus moderado para coincidencias parciales
      const bonus = tokens.length * 5; // 5 puntos por cada token
      
      if (scoredResults[code]) {
        scoredResults[code] += bonus;
        console.log(`[search-engine] Bonus parcial para ${code}: ${tokens.length} tokens diferentes (+${bonus})`);
      }
    }
  });
}

          // ===== INICIO: SOLUCIÓN ESPECIAL PARA CAÑO+REDECO =====


      // ===== FIN: SOLUCIÓN ESPECIAL PARA CAÑO+REDECO =====

      // Convertir a array y ordenar por puntuación
    let matchingCodes = Object.entries(scoredResults)
    .map(([code, score]) => ({ code, score }))
    .sort((a, b) => b.score - a.score) // Ordenar de mayor a menor puntuación
    .map(item => item.code);

    console.log(`[search-engine] Resultado final: ${matchingCodes.length} productos encontrados`);

    // Para diagnóstico: Mostrar top 5 resultados con puntuación
    console.log('[search-engine] Top 5 resultados con puntuación:');
    Object.entries(scoredResults)
    .map(([code, score]) => ({ code, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .forEach((item, index) => {
      console.log(`   ${index+1}. Código: ${item.code}, Puntuación: ${item.score}`);
    });

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

      // En performSearch, justo después de recibir matchingItems de loadSpecificProducts
        console.log('[search-engine] DIAGNÓSTICO - Datos recibidos de ProductManager:', {
          totalItems: matchingItems.length,
          primerosTresItems: matchingItems.slice(0, 3),
          itemsConImageId: matchingItems.filter(item => item.imageId).length,
          muestraImageIds: matchingItems.slice(0, 3).map(item => ({
            code: item.code,
            imageId: item.imageId
          }))
        });
      
      // Procesar los resultados
      matchingItems = originalCodes.map(code => {
        if (productData && productData[code]) {
          return {
            id: code,
            code: code,
            name: productData[code].name || `Producto ${code}`,
            category: productData[code].category || '',
            price: productData[code].selectedPrice || 0,
            // Añadir la propiedad imageId
            imageId: productData[code].imageId || null
          };
        } else {
          return {
            id: code,
            code: code,
            name: `Producto ${code}`,
            category: '',
            price: 0,
            imageId: null // Añadir también aquí para mantener consistencia
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
  displayResults(matchingItems, normalizedQuery, queryTokens, {
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
      function displayResults(matchingItems, normalizedQuery, queryTokens, pagination = {}) {
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

              // Establecer una bandera en localStorage para que sea más fácil de inspeccionar
              localStorage.setItem('setFocusOnLoad', 'true');
              console.log('Bandera setFocusOnLoad establecida en localStorage', localStorage.getItem('setFocusOnLoad'));
              
              // Pequeña pausa para asegurar que se guarde antes de recargar
              setTimeout(() => {
                // Recargar la página
                window.location.reload();
              }, 50);


              // 1. Limpiar el campo de búsqueda
              const searchInput = document.querySelector('input[type="text"]');
              if (searchInput) {
                searchInput.value = '';
                // NUEVO: Mover el cursor al campo de búsqueda
                searchInput.focus();
              }
              
              // 2. Eliminar el mensaje de resultados de búsqueda
              const mensajeBusqueda = document.getElementById('mensaje-busqueda');
              if (mensajeBusqueda) {
                mensajeBusqueda.remove();
              }
              
              // 3. Limpiar los productos de búsqueda actuales
              const galleryContainer = document.querySelector('.gallery-container');
              if (galleryContainer) {
                galleryContainer.innerHTML = '';
              }
              
              // 4. Cargar el catálogo inicial
              // Enviar un evento personalizado para que catalogo.html lo capture
              const resetEvent = new CustomEvent('resetCatalogo', {
                detail: { triggered: 'searchClear' }
              });
              window.dispatchEvent(resetEvent);
              
              console.log('Búsqueda limpiada, enviado evento resetCatalogo');
              
              console.log('Búsqueda limpiada, cargando catálogo inicial');
              
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
          
          // Preparar texto con resaltado mejorado para múltiples tokens
          let itemName = item.name || '';
          let itemCode = item.code || '';

          // Resaltar cada token individual en lugar de solo la consulta completa
          if (queryTokens && queryTokens.length > 0) {
            // Crear copia para no modificar el original durante resaltado
            let highlightedName = itemName;
            let highlightedCode = itemCode;
            
            // Ordenar tokens por longitud (descendente) para evitar problemas de superposición
            const sortedTokens = [...queryTokens].sort((a, b) => b.length - a.length);
            
            // Resaltar cada token individualmente
            sortedTokens.forEach(token => {
              if (token.length >= 3) { // Ignorar tokens muy cortos
                const regex = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                highlightedName = highlightedName.replace(regex, '<span class="search-highlight">$1</span>');
                highlightedCode = highlightedCode.replace(regex, '<span class="search-highlight">$1</span>');
              }
            });
            
            itemName = highlightedName;
            itemCode = highlightedCode;

            // Al final del bloque de resaltado
            itemName = itemName.toLowerCase(); // Asegurar que esté en minúsculas
          }


          // Añade este log antes de asignar galleryItem.innerHTML
            console.log("[search-engine] Item con imagen:", {
              code: item.code,
              imageId: item.imageId,
              urlGenerada: item.imageId ? `https://lh3.googleusercontent.com/d/${item.imageId}` : 'img/loading-product.gif'
            });  

          // Estructura HTML con elementos en las ubicaciones exactas según tus selectores
          galleryItem.innerHTML = `
            <div class="container-img">
              <img alt="${item.name || ''}" 
              src="${item.imageId ? `https://lh3.googleusercontent.com/d/${item.imageId}` : 'img/loading-product.gif'}"
              onerror="this.onerror=null; this.src='img/no-image-available.png';">

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
          // Crear un elemento oculto en lugar de un botón visible
          const loadMoreButton = document.createElement('div'); // Cambiar a div
          loadMoreButton.id = 'load-more-button';
          loadMoreButton.className = 'load-more-button';
          
          
           // Ocultar el elemento (esto es lo único que realmente necesitas cambiar)
          loadMoreButton.style.display = 'none';
          
          // Mantener el resto de las propiedades (no afectan si está oculto)
          loadMoreButton.dataset.nextOffset = offset + matchingItems.length;
          loadMoreButton.dataset.limit = pagination.limit || 30;
          loadMoreButton.dataset.query = normalizedQuery;
          
          // Mantener el evento de clic para que cargarMasResultadosBusqueda() funcione
          loadMoreButton.addEventListener('click', function() {
            
            
            // Calcular próximo offset
            const nextOffset = offset + matchingItems.length;
            const limit = pagination.limit || 30; // Usar el mismo limit o valor por defecto
            
            // Llamar a performSearch con el nuevo offset
            try {
              performSearch(normalizedQuery, nextOffset, limit);
            } catch (error) {
              console.error('[search-engine] Error al cargar más resultados:', error);
              
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
        
         /* Regla @media para pantallas pequeñas */
          @media (max-width: 768px) {
            .mensaje-busqueda {
              top: 120px !important;
            }
          }
        .boton-limpiar:hover {
          background-color: #3a7cca;
        }
      `;
      
      document.head.appendChild(styles);
    }
    

    



    // Inicializar
    addStyles();
    initSearch();
  });