

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
        
        // Verificar si estamos en modo búsqueda de clientes
        if (document.body.classList.contains('modo-busqueda-clientes')) {
            console.log('[Search Engine] Modo clientes activo - búsqueda de productos pausada');
            return; // No ejecutar búsqueda de productos
        }
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


      //8-5-25
      // NUEVA FUNCIÓN: Verificar proximidad de términos en descripción de producto
        // Esta función debe ir fuera de performSearch
        function checkTermProximity(productName, terms) {
          if (!productName || !terms || terms.length < 2) return 0;
          
          const normalizedName = productName.toLowerCase();
          let proximityScore = 0;
          
          // 1. Verificar si todos los términos están presentes
          const allTermsPresent = terms.every(term => normalizedName.includes(term));
          if (!allTermsPresent) return 0;
          
          // 2. Verificar si los términos aparecen en el mismo orden que en la búsqueda
          let lastFoundIndex = -1;
          let termsInOrder = true;
          
          for (const term of terms) {
            const termIndex = normalizedName.indexOf(term, lastFoundIndex + 1);
            if (termIndex > lastFoundIndex) {
              lastFoundIndex = termIndex;
            } else {
              termsInOrder = false;
              break;
            }
          }
          
          if (termsInOrder) {
            proximityScore += 30; // Bonus alto si aparecen en el mismo orden
          }
          
          // 3. Calcular distancia entre términos (menor distancia = mayor proximidad)
          const termPositions = [];
          for (const term of terms) {
            const index = normalizedName.indexOf(term);
            if (index !== -1) {
              termPositions.push(index);
            }
          }
          
          if (termPositions.length > 1) {
            // Ordenar posiciones para calcular la distancia entre términos adyacentes
            termPositions.sort((a, b) => a - b);
            
            // Calcular distancia total entre términos adyacentes
            let totalDistance = 0;
            for (let i = 0; i < termPositions.length - 1; i++) {
              totalDistance += termPositions[i+1] - termPositions[i];
            }
            
            // Menor distancia = mayor puntuación
            const avgDistance = totalDistance / (termPositions.length - 1);
            if (avgDistance < 5) proximityScore += 20;
            else if (avgDistance < 10) proximityScore += 15;
            else if (avgDistance < 20) proximityScore += 10;
            else proximityScore += 5;
          }
          
          return proximityScore;
        }


        //8-5-25
        // SOLUCIÓN GENERAL PARA CONSULTAS MULTI-PALABRA
        // Reemplazar el bloque de análisis de proximidad con esta versión mejorada

        // Función mejorada de análisis de proximidad y relevancia
        function analyzeProductRelevance(productName, queryTokens) {
          if (!productName || !queryTokens || queryTokens.length < 2) return 0;
          
          const normalizedName = productName.toLowerCase();
          let relevanceScore = 0;
          
          // 1. Verificar si todos los tokens están presentes
          const presentTokens = queryTokens.filter(token => normalizedName.includes(token));
          const allTokensPresent = presentTokens.length === queryTokens.length;
          
          if (presentTokens.length === 0) return 0;
          
          // Bonus por porcentaje de tokens presentes
          const presenceRatio = presentTokens.length / queryTokens.length;
          relevanceScore += Math.round(presenceRatio * 50);
          
          // 2. Si todos los tokens están presentes, analizar orden y proximidad
          if (allTokensPresent) {
            // 2.1 Verificar si aparecen en el mismo orden que en la consulta
            const positions = [];
            for (const token of queryTokens) {
              positions.push({
                token: token,
                position: normalizedName.indexOf(token)
              });
            }
            
            // Ordenar por posición en el nombre
            positions.sort((a, b) => a.position - b.position);
            
            // Obtener el orden actual de los tokens
            const currentOrder = positions.map(p => p.token);
            
            // Verificar si el orden coincide con la consulta
            let orderMatches = true;
            for (let i = 0; i < queryTokens.length; i++) {
              if (queryTokens[i] !== currentOrder[i]) {
                orderMatches = false;
                break;
              }
            }
            
            if (orderMatches) {
              // Bonus MUY ALTO si aparecen en el orden exacto de la consulta
              relevanceScore += 150;
              
              // 2.2 Calcular proximidad entre tokens consecutivos
              let totalDistance = 0;
              let immediatelyAdjacent = true;
              
              for (let i = 0; i < positions.length - 1; i++) {
                const currentTokenEnd = positions[i].position + positions[i].token.length;
                const nextTokenStart = positions[i + 1].position;
                const distance = nextTokenStart - currentTokenEnd;
                
                totalDistance += distance;
                
                // Verificar si hay más de 3 caracteres entre tokens
                if (distance > 3) {
                  immediatelyAdjacent = false;
                }
              }
              
              // Bonus adicional si los tokens están muy cerca o adyacentes
              if (immediatelyAdjacent) {
                relevanceScore += 350; // Bonus extremadamente alto para tokens adyacentes
              } else {
                // Bonus inversamente proporcional a la distancia
                const avgDistance = totalDistance / (positions.length - 1);
                if (avgDistance < 5) relevanceScore += 250;
                else if (avgDistance < 10) relevanceScore += 150;
                else if (avgDistance < 20) relevanceScore += 75;
                else relevanceScore += 30;
              }
            } else {
              // Bonus menor si todos los tokens están presentes pero en orden diferente
              relevanceScore += 40;
            }
          }
          
          return relevanceScore;
        }
        //fin 8-5-25




  // Realizar búsqueda adaptada a la estructura completa
// Realizar búsqueda mejorada con coincidencias parciales
// Realizar búsqueda con coincidencias parciales más precisas
// Modificación mínima a tu función performSearch existente
// Solo se añaden los parámetros de paginación y la lógica necesaria

// Añadir parámetros de paginación con valores por defecto
// Función performSearch actualizada con soporte para paginación y carga de productos específicos
async function performSearch(query, offset = 0, limit = 30) {
  
  // ⭐ VERIFICACIÓN CRÍTICA: No buscar si estamos en modo clientes
  if (document.body.classList.contains('modo-busqueda-clientes')) {
    console.log('[search-engine performSearch] Modo clientes activo - búsqueda bloqueada');
    return;
  }
  
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
            

            //8-5-25
            // Dentro de performSearch, añadir este bloque antes de ordenar resultados
            if (queryTokens.length > 1) {
              console.log('[search-engine] Analizando relevancia detallada para consulta multi-palabra...');
              
              // Obtener productos candidatos con alguna puntuación
              const candidateCodes = Object.keys(scoredResults);
              
              // Limitar análisis a los 150 productos mejor puntuados para optimizar rendimiento
              const topCandidates = candidateCodes
                .map(code => ({ code, score: scoredResults[code] }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 150)
                .map(item => item.code);
              
              console.log(`[search-engine] Analizando relevancia en ${topCandidates.length} productos mejor puntuados`);
              
              // Contador para productos analizados con éxito
              let productsWithRelevanceBonus = 0;
              
              // Analizar cada producto candidato
              topCandidates.forEach(code => {
                try {
                  // Obtener código original
                  const originalCode = searchIndex.codeMap && searchIndex.codeMap[code] ? 
                                      searchIndex.codeMap[code] : code;
                  
                  // Intentar obtener datos del producto
                  let productName = '';
                  
                  try {
                    if (window.productManagerInstance && typeof window.productManagerInstance.getProduct === 'function') {
                      const productData = window.productManagerInstance.getProduct(originalCode);
                      if (productData && productData.name) {
                        productName = productData.name;
                      }
                    }
                  } catch (error) {
                    // Ignorar errores al obtener el producto
                  }
                  
                  // Si no pudimos obtener el nombre, omitir este producto
                  if (!productName) return;
                  
                  // Calcular puntuación de relevancia
                  const relevanceScore = analyzeProductRelevance(productName, queryTokens);
                  
                  // Aplicar bonus de relevancia
                  if (relevanceScore > 0) {
                    const originalScore = scoredResults[code] || 0;
                    scoredResults[code] = originalScore + relevanceScore;
                    
                    // Mostrar información detallada para diagnóstico
                    if (relevanceScore >= 300) {
                      console.log(`[search-engine] 🌟 ALTA RELEVANCIA para "${productName}": +${relevanceScore} (total: ${scoredResults[code]})`);
                    } else if (relevanceScore >= 150) {
                      console.log(`[search-engine] ⭐ BUENA RELEVANCIA para "${productName}": +${relevanceScore} (total: ${scoredResults[code]})`);
                    }
                    
                    productsWithRelevanceBonus++;
                  }
                } catch (error) {
                  // Ignorar errores silenciosamente
                }
              });
              
              console.log(`[search-engine] Bonus de relevancia aplicado a ${productsWithRelevanceBonus} productos`);
            }
            //fin 8-5-25

            //8-5-25
            // SOLUCIÓN SIMPLE Y DIRECTA PARA "CAÑO PVC"
            // Colocar justo antes de convertir y ordenar los resultados

            // Verificar directamente si la búsqueda está relacionada con "caño pvc"
            const isCañoPvcSearch = query.toLowerCase().includes('caño') && 
            query.toLowerCase().includes('pvc');

            if (isCañoPvcSearch) {
            console.log(`[search-engine] ⚡ Detectada búsqueda específica de "caño pvc": "${query}"`);

            // Recorrer todos los productos con puntuación
            let productsAnalyzed = 0;
            let productsWithCañoPvc = 0;

            Object.keys(scoredResults).forEach(code => {
            try {
            // Obtener código original
            const originalCode = searchIndex.codeMap && searchIndex.codeMap[code] ? 
              searchIndex.codeMap[code] : code;

            // Intentar obtener nombre del producto
            let productName = '';

            try {
            if (window.productManagerInstance && typeof window.productManagerInstance.getProduct === 'function') {
            const productData = window.productManagerInstance.getProduct(originalCode);
            if (productData && productData.name) {
            productName = productData.name.toLowerCase();
            }
            }
            } catch (error) {
            // Ignorar errores
            }

            // Si no pudimos obtener el nombre, saltar este producto
            if (!productName) return;

            productsAnalyzed++;

            // Verificar si el producto contiene "caño" y "pvc"
            const hasCano = productName.includes('caño');
            const hasPvc = productName.includes('pvc');

            if (hasCano && hasPvc) {
            productsWithCañoPvc++;

            // Asignar puntuación extremadamente alta a productos con ambos términos
            scoredResults[code] = 10000;

            // Bonus adicional si "caño" aparece antes que "pvc"
            const canoIndex = productName.indexOf('caño');
            const pvcIndex = productName.indexOf('pvc');

            if (canoIndex < pvcIndex) {
            scoredResults[code] += 5000;
            }

            console.log(`[search-engine] ⭐ Producto "${productName}" contiene "caño" y "pvc" - Puntuación: ${scoredResults[code]}`);
            }
            // Para productos que solo contienen "caño", dar una puntuación alta pero menor
            else if (hasCano) {
            scoredResults[code] = 5000;
            }
            // Para productos que solo contienen "pvc", dar una puntuación menor
            else if (hasPvc) {
            // Mantener la puntuación actual o asignar una baja si está demasiado alta
            if (scoredResults[code] > 1000) {
            scoredResults[code] = 1000;
            }
            }
            } catch (error) {
            // Ignorar errores
            }
            });

            console.log(`[search-engine] Análisis completado: ${productsWithCañoPvc} productos con "caño pvc" de ${productsAnalyzed} analizados`);
            }
            //fin 8-5-25
            

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


    //8-5-25
          // NUEVO: Crear variantes combinadas para consultas multi-palabra
      let combinedTokens = [];
      if (queryTokens.length > 1) {
        // Combinar tokens adyacentes
        for (let i = 0; i < queryTokens.length - 1; i++) {
          combinedTokens.push(queryTokens[i] + queryTokens[i + 1]);
        }
        
        // Combinar todos los tokens en orden
        if (queryTokens.length > 2) {
          combinedTokens.push(queryTokens.join(''));
        }
        
        console.log(`[search-engine] Variantes combinadas: ${combinedTokens.join(', ')}`);
      }

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
  
    //8-5-25
    // Buscar coincidencias para las variantes combinadas (después de buscar tokens individuales)
    combinedTokens.forEach(combinedToken => {
      // Buscar coincidencia exacta con el token combinado
      if (searchIndex.indexes.tokens && searchIndex.indexes.tokens[combinedToken]) {
        const tokenMatches = searchIndex.indexes.tokens[combinedToken];
        const matches = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
        
        matches.forEach(code => {
          // Puntuación alta para coincidencias con tokens combinados
          scoredResults[code] = (scoredResults[code] || 0) + 25; // Mayor que tokens individuales
          console.log(`[search-engine] Token combinado "${combinedToken}": coincidencia exacta para ${code} (+25)`);
        });
      }
      
      // Buscar coincidencias parciales con el token combinado
      Object.keys(searchIndex.indexes.tokens).forEach(indexToken => {
        if (indexToken.includes(combinedToken) || 
            (combinedToken.length > 5 && combinedToken.includes(indexToken) && indexToken.length >= 5)) {
          const tokenMatches = searchIndex.indexes.tokens[indexToken];
          const matches = Array.isArray(tokenMatches) ? tokenMatches : [tokenMatches];
          
          matches.forEach(code => {
            // Puntuación menor para coincidencias parciales con tokens combinados
            scoredResults[code] = (scoredResults[code] || 0) + 15;
            console.log(`[search-engine] Token combinado "${combinedToken}": coincidencia parcial con "${indexToken}" para ${code} (+15)`);
          });
        }
      });
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


    //8-5-25
          // SOLUCIÓN GENERAL PARA MEJORAR LA RELEVANCIA DE BÚSQUEDA
      // Colocar antes de convertir y ordenar los resultados

      // Solo aplicar para consultas con múltiples palabras
      if (queryTokens.length > 1) {
        console.log(`[search-engine] Aplicando análisis de relevancia avanzado para consulta multi-palabra: "${normalizedQuery}"`);
        
        // Crear versión de términos con palabras completas (no solo tokens)
        const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length >= 2);
        
        // Procesar solo los primeros 200 productos mejor puntuados para optimizar rendimiento
        const topCandidates = Object.keys(scoredResults)
          .map(code => ({ code, score: scoredResults[code] }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 200)
          .map(item => item.code);
        
        console.log(`[search-engine] Analizando relevancia en ${topCandidates.length} productos con mayor puntuación base`);
        
        // Contador para estadísticas
        let exactMatchesFound = 0;
        let wordOrderMatchesFound = 0;
        let allWordsMatchesFound = 0;
        
        // Crear expresiones regulares para verificar patrones
        const termsAsWords = searchTerms.map(term => `\\b${term}\\b`);
        
        // Expresión para detectar todas las palabras en cualquier orden
        const allWordsRegex = new RegExp(termsAsWords.map(term => `(?=.*${term})`).join(''), 'i');
        
        // Expresión para detectar todas las palabras en el orden exacto
        const exactOrderRegex = new RegExp(termsAsWords.join('.*?'), 'i');
        
        // Analizar cada candidato
        topCandidates.forEach(code => {
          try {
            // Obtener código original
            const originalCode = searchIndex.codeMap && searchIndex.codeMap[code] ? 
                                searchIndex.codeMap[code] : code;
            
            // Obtener nombre del producto
            let productName = '';
            try {
              if (window.productManagerInstance && typeof window.productManagerInstance.getProduct === 'function') {
                const productData = window.productManagerInstance.getProduct(originalCode);
                if (productData && productData.name) {
                  productName = productData.name.toLowerCase();
                }
              }
            } catch (error) {
              // Ignorar errores al obtener el producto
            }
            
            // Si no tenemos nombre, no podemos analizar
            if (!productName) return;
            
            let relevanceBonus = 0;
            let matchType = '';
            
            // CASO 1: COINCIDENCIA EXACTA - Producto contiene exactamente la frase buscada
            if (productName.includes(normalizedQuery)) {
              relevanceBonus = 100000;
              matchType = "COINCIDENCIA EXACTA DE FRASE";
              exactMatchesFound++;
            } 
            // CASO 2: PALABRAS EN MISMO ORDEN - Contiene todas las palabras en el mismo orden
            else if (exactOrderRegex.test(productName)) {
              relevanceBonus = 50000;
              matchType = "PALABRAS EN MISMO ORDEN";
              wordOrderMatchesFound++;
            }
            // CASO 3: CONTIENE TODAS LAS PALABRAS - En cualquier orden
            else if (allWordsRegex.test(productName)) {
              relevanceBonus = 10000;
              matchType = "TODAS LAS PALABRAS";
              allWordsMatchesFound++;
            }
            // CASO 4: COMIENZA CON LA PRIMERA PALABRA DE LA BÚSQUEDA
            else if (new RegExp(`^\\b${searchTerms[0]}\\b`, 'i').test(productName)) {
              relevanceBonus = 5000;
              matchType = "COMIENZA CON PRIMERA PALABRA";
            }
            
            // Aplicar bonificación de relevancia si corresponde
            if (relevanceBonus > 0) {
              // Guardar puntuación original para logging
              const originalScore = scoredResults[code] || 0;
              
              // Aplicar bonificación
              scoredResults[code] = originalScore + relevanceBonus;
              
              // Logging detallado para palabras clave importantes
              if (relevanceBonus >= 10000) {
                console.log(`[search-engine] ⭐ ${matchType} para "${productName}": +${relevanceBonus} (total: ${scoredResults[code]})`);
              }
            }
          } catch (error) {
            // Ignorar errores silenciosamente
          }
        });
        
        console.log(`[search-engine] Análisis completo: ${exactMatchesFound} coincidencias exactas, ` +
                    `${wordOrderMatchesFound} coincidencias en orden, ${allWordsMatchesFound} coincidencias de todas las palabras`);
      }
    //fin 8-5-25


    
       
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
          
          // NUEVO: Mostrar información en la barra contextual
          const barraInfo = document.getElementById('barra-info-contextual');
          const barraContent = barraInfo ? barraInfo.querySelector('.barra-info-content') : null;
          
          if (barraInfo && barraContent) {
            // Limpiar contenido previo
            barraContent.innerHTML = '';
            
            // Crear mensaje usando TUS clases existentes
            const mensajeBusqueda = document.createElement('div');
            mensajeBusqueda.id = 'mensaje-busqueda';
            mensajeBusqueda.className = 'mensaje-busqueda';
            // Detectar si es móvil
            const isMobile = window.innerWidth <= 768;
            
            // Mensaje simplificado para móvil
            mensajeBusqueda.innerHTML = isMobile ? `
              <div class="mensaje-contenido">
                <span class="mensaje-contador">${total}</span> resultados
              </div>
              ${normalizedQuery ? `<button id="boton-limpiar-busqueda" class="boton-limpiar">Limpiar</button>` : ''}
            ` : `
              <div class="mensaje-contenido">
                <span class="mensaje-contador">${total}</span> resultados${normalizedQuery ? ` para "<span class="mensaje-termino">${normalizedQuery}</span>"` : ''}
                ${total > matchingItems.length ? `<span class="mensaje-pagina">(Mostrando 1-${matchingItems.length})</span>` : ''}
              </div>
              ${normalizedQuery ? `<button id="boton-limpiar-busqueda" class="boton-limpiar">Limpiar</button>` : ''}
            `;
            
            // Agregar a la barra
            barraContent.appendChild(mensajeBusqueda);
            
            // Mostrar la barra
            barraInfo.classList.add('visible');
            document.body.classList.add('barra-visible');  // ← Esta línea
            
            console.log('[search-engine] Mensaje de búsqueda mostrado en barra contextual');
          }
          
          // Añadir funcionalidad para limpiar búsqueda
          const botonLimpiar = document.getElementById('boton-limpiar-busqueda');
          if (botonLimpiar) {
            botonLimpiar.addEventListener('click', () => {

              // NUEVO: Ocultar la barra contextual
              const barraInfo = document.getElementById('barra-info-contextual');
              if (barraInfo) {
                barraInfo.classList.remove('visible');
                document.body.classList.remove('barra-visible');  // ← Esta línea
              }



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
              src="${item.imageId ? `https://lh3.googleusercontent.com/d/${item.imageId}` : 'img/no-img.png'}"
              onerror="this.onerror=null; this.src='img/no-imag.png';">

              <div class="top-row">
              <a href="#">${itemName}</a>
              </div>

              <div class="bottom-row">
              <a href="#" style="font-weight: 400 !important;">${itemCode}</a>
              <span class="price-tag" data-sku="${item.code}"></span>
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

                    // Precio unificado: se resuelve segun la lista vigente (cliente
          // logueado, o el que el vendedor tenga seleccionado)
          if (window.Precios) {
            const tagPrecio = galleryItem.querySelector('.price-tag');
            if (tagPrecio) window.Precios.pintarPrecio(tagPrecio, item.code);
          }  

          // Procesar el precio del nuevo elemento si existe
          const priceTag = galleryItem.querySelector('.price-tag');
          console.log('[DEBUG] priceTag encontrado:', !!priceTag);
          console.log('[DEBUG] window.processNewPriceElements disponible:', !!window.processNewPriceElements);
          
          if (priceTag && window.processNewPriceElements) {
            console.log('[DEBUG] Llamando a processNewPriceElements para:', priceTag.textContent);
            console.log('[DEBUG] Estado del toggle antes de procesar:', localStorage.getItem('precioModo'));
     
            window.processNewPriceElements([priceTag]);
           

            console.log('[DEBUG] Precio después de procesar:', priceTag.textContent);
            console.log('[DEBUG] Clase después de procesar:', priceTag.className);
          }   else {
                    console.log('[DEBUG] No se pudo procesar - priceTag:', !!priceTag, 'función:', !!window.processNewPriceElements);
                  }     



        });
        
        // IMPORTANTE: Actualizar la variable global galleryItems si existe
        try {
              window.galleryItems = document.querySelectorAll('.gallery-item');
              console.log('[search-engine] Variable global galleryItems actualizada con', window.galleryItems.length, 'elementos');
              

              // AGREGAR ESTO: Aplicar configuración de márgenes a los nuevos elementos
                setTimeout(() => {
                    if (typeof window.recalculateAllVisiblePrices === 'function') {
                        console.log('[search-engine] Aplicando configuración de márgenes a resultados de búsqueda...');
                        window.recalculateAllVisiblePrices();
                    } else {
                        console.warn('[search-engine] Función recalculateAllVisiblePrices no disponible');
                    }
                }, 200);
              
              // AGREGAR AQUÍ - Disparar evento para ajustar posiciones
              setTimeout(() => {
                  const event = new CustomEvent('searchResultsDisplayed');
                  window.dispatchEvent(event);
              }, 100);
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
          color: #dc2626 !important; /* Rojo corporativo */
          text-decoration: underline !important;
          }
        
        /* Estilo para el mensaje de búsqueda DENTRO de la barra contextual */
        .barra-info-content .mensaje-busqueda {
          position: relative;  /* ← CAMBIAR de fixed a relative */
          top: auto;
          right: auto;
          background-color: transparent;  /* ← Sin fondo, usa el de la barra */
          color: white;
          border-radius: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          z-index: auto;
          box-shadow: none;
        }
        
        .mensaje-contenido {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
        }
        
        .mensaje-contador {
          font-weight: bold;
          margin-right: 5px;
          color: #dc2626;
        }
        
        .mensaje-termino {
          font-style: italic;
          font-weight: bold;
          color: #dc2626;
        }
        
        .boton-limpiar {
          background-color: #dc2626;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          margin-left: 10px;
          transition: all 0.3s ease;
        }
        
         /* Regla @media para pantallas pequeñas */
        @media (max-width: 768px) {
          .barra-info-content .mensaje-busqueda {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            z-index: auto !important;
            flex-direction: row;
            gap: 5px;
          }
          
          .barra-info-content .mensaje-contenido {
            width: 100%;
            justify-content: center;
            text-align: center;
          }
          
          .barra-info-content .boton-limpiar {
            width: auto;
          }
        }


        .boton-limpiar:hover {
          background-color: #ef4444;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.5);
        }
       /* AGREGAR AQUÍ - Estilos optimizados para bottom-row */
        .container-img .bottom-row {
            width: 240px !important;
            max-width: 92% !important;
            margin-left: 1% !important;
            padding: 0 4px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            align-items: flex-start !important;    /* MANTENER: flex-start */
            gap: 0px !important;              /* CAMBIAR: era 2px, ahora 0px */
            min-height: 35px !important;
            height: auto !important;
        }
        
        .gallery-container .container-img .bottom-row a:nth-child(1),
        .gallery-item .container-img .bottom-row a:nth-child(1) {
            width: 140px !important;
            padding-left: 2px !important;
            margin: 0px !important;           /* AGREGAR: eliminar todos los margins */
            margin-right: 0px !important;    /* AGREGAR: específicamente margin-right */
            font-weight: 400 !important;     /* AGREGAR: el valor que elegiste */
            margin-top: 12px !important;      /* AGREGAR: bajar código 8px */
            font-size: 0.7em !important;     /* AGREGAR: tamaño muy pequeño */
            align-self: flex-start !important;    /* AGREGAR: alineación flex-start */
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            flex-shrink: 0 !important;
        }
        
        .container-img .bottom-row .price-tag {
            min-width: 70px !important;
            max-width: 70px !important;
            margin-left: 5px !important;
            font-size: 0.99em !important;
            flex-shrink: 0 !important;
            white-space: nowrap !important;
            align-self: center !important;        /* AGREGAR: precio centrado */
        }
    `;
    
    document.head.appendChild(styles);
    }
    

    



    // Inicializar
    addStyles();
    initSearch();

    
    // AGREGAR AQUÍ - // Función mejorada para ajustar posición del bottom-row basada en patrones
    // Función mejorada que usa datos del JSON catalogo_dimensiones.json
    async function adjustBottomRowPositions() {
    try {
        console.log('🔧 EJECUTANDO adjustBottomRowPositions...');
        
        // 1. Cargar JSON
        const response = await fetch('./json/catalogo_dimensiones.json');
        const catalogoDimensiones = await response.json();
        console.log('✅ JSON cargado en adjustBottomRowPositions');
        
        // 2. Detectar breakpoint
        const screenWidth = window.innerWidth;
        const currentBreakpoint = screenWidth <= 768 ? 'mobile' : 
                                screenWidth <= 1200 ? 'tablet' : 'desktop';
        console.log(`📱 Breakpoint: ${currentBreakpoint} (${screenWidth}px)`);
        
        // 3. Aplicar a todos los elementos
        const elementosBottomRow = document.querySelectorAll('.container-img .bottom-row');
        console.log(`🔍 Encontrados ${elementosBottomRow.length} elementos bottom-row`);
        
        elementosBottomRow.forEach(bottomRow => {
            const galleryItem = bottomRow.closest('.gallery-item');
            if (!galleryItem) return;
            
            const codigo = galleryItem.getAttribute('data-product-code');
            if (!codigo) return;
            
            const dimensiones = catalogoDimensiones.images_dimensions[codigo];
            if (dimensiones && dimensiones.bottomPosition) {
                const nuevoValor = dimensiones.bottomPosition[currentBreakpoint];
                bottomRow.style.setProperty('bottom', nuevoValor + 'px', 'important');
                console.log(`✅ ${codigo}: ${nuevoValor}px aplicado`);
            }
        });
        
        console.log('🎉 adjustBottomRowPositions COMPLETADO');
        
    } catch (error) {
        console.error('❌ Error en adjustBottomRowPositions:', error);
    }
}

    // Función de respaldo (la anterior simplificada)
    function adjustBottomRowPositionsFallback() {
        console.log('[adjustBottomRow] Usando método de respaldo');
        
        const screenWidth = window.innerWidth;
        const fallbackValue = screenWidth <= 768 ? 55 : 
                            screenWidth <= 1200 ? 65 : 75;
        
        document.querySelectorAll('.container-img .bottom-row').forEach(row => {
            row.style.setProperty('bottom', fallbackValue + 'px', 'important');
        });
    }

    // Ejecutar al cargar la página
    adjustBottomRowPositions();

    // También ejecutar cuando se muestren nuevos resultados de búsqueda
    window.addEventListener('searchResultsDisplayed', adjustBottomRowPositions);
  });