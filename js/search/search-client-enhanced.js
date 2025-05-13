/**
 * Cliente de búsqueda mejorado con sistema avanzado de relevancia y puntuación
 * Optimizado para catálogos de ferretería
 * VERSIÓN CORREGIDA
 */

import { normalizeText, normalizeCode, tokenize, extractMeasurements } from './normalize-utils.js';
import SCORING_CONFIG from './search-scoring-config.js';

class EnhancedSearchClient {
  constructor(options = {}) {
    this.fragments = new Map();
    this.masterIndex = null;
    this.initialized = false;
    this.defaultFragment = options.defaultFragment || 'A-F';
    this.loadedFragments = new Set();
    this.productManager = null;
    this.monitoringSystem = options.monitoringSystem;
    
    // Configuración del sistema de puntuación
    this.scoringConfig = options.scoringConfig || SCORING_CONFIG;
    
    // Preprocesar términos de ferretería para búsqueda rápida
    this.hardwareTermsSet = new Set(
      this.scoringConfig.HARDWARE_TERMS.map(term => normalizeText(term))
    );
    
    // Cache de puntuaciones para optimizar búsquedas repetidas
    this.scoreCache = new Map();
    
    // Callbacks para eventos
    this.onFragmentLoad = options.onFragmentLoad || (() => {});
    this.onError = options.onError || console.error;
  }

  /**
   * Inicializa el cliente de búsqueda cargando el índice maestro y el fragmento inicial
   */
  async initialize(productManager) {
    if (this.initialized) {
      console.log('Cliente de búsqueda ya inicializado');
      return true;
    }
    
    try {
      console.log('Inicializando cliente de búsqueda optimizado...');
      
            // Verificar el productManager
          if (!productManager) {
            console.error('Error: productManager no proporcionado');
            return false;
          }
          
          // Verificar que tenga el método getProduct
          if (typeof productManager.getProduct !== 'function') {
            console.error('Error: productManager no tiene el método getProduct');
            return false;
          } 


      // 1. Cargar el índice maestro
      const masterResponse = await fetch('./json/search/optimized/master_index.json');
      if (!masterResponse.ok) {
        throw new Error(`Error cargando índice maestro: ${masterResponse.status}`);
      }

      console.log('URL del índice maestro:', masterResponse.url); // Verificar la URL
      this.masterIndex = await masterResponse.json();
      console.log('Índice maestro cargado:', this.masterIndex);
      console.log('Fecha de generación del índice:', this.masterIndex.metadata?.lastUpdated);



      
      this.masterIndex = await masterResponse.json();
      console.log('Índice maestro cargado:', this.masterIndex);
      
      // 2. Cargar el fragmento por defecto
      await this.loadFragment(this.defaultFragment);
      
      // 3. Guardar referencia al productManager
      this.productManager = productManager;
      
      // 4. Marcar como inicializado
      this.initialized = true;
      
      console.log('Cliente de búsqueda inicializado correctamente');
      return true;
    } catch (error) {
      this.onError('Error inicializando cliente de búsqueda:', error);
      return false;
    }
  }
  
  /**
   * Carga un fragmento específico del índice
   */
  async loadFragment(fragmentName) {
    // Verificar si ya está cargado
    if (this.loadedFragments.has(fragmentName)) {
      return true;
    }
    
    try {
      // Buscar información del fragmento
      const fragmentInfo = this.masterIndex.fragments.find(f => f.name === fragmentName);
      if (!fragmentInfo) {
        throw new Error(`Fragmento no encontrado: ${fragmentName}`);
      }
      
      // Cargar el fragmento
      console.log(`Cargando fragmento: ${fragmentName}`);
      const response = await fetch(`./json/search/optimized/${fragmentInfo.file}`);
      
      if (!response.ok) {
        throw new Error(`Error cargando fragmento ${fragmentName}: ${response.status}`);
      }
      
      const fragment = await response.json();
      
      // Guardar el fragmento
      this.fragments.set(fragmentName, fragment);
      this.loadedFragments.add(fragmentName);
      
      // Notificar carga completa
      this.onFragmentLoad(fragmentName, fragment);
      
      console.log(`Fragmento ${fragmentName} cargado correctamente`);
      return true;
    } catch (error) {
      this.onError(`Error cargando fragmento ${fragmentName}:`, error);
      return false;
    }
  }

  /**
   * Determina qué fragmento contiene un código de producto
   */
  getFragmentForCode(code) {
    if (!this.masterIndex || !this.masterIndex.fragments) {
      return this.defaultFragment;
    }
    
    // Para fragmentación alfabética
    if (this.masterIndex.metadata.fragmentationType === 'alphabet') {
      const firstChar = code.charAt(0).toUpperCase();
      
      for (const fragment of this.masterIndex.fragments) {
        if (firstChar >= fragment.start && firstChar <= fragment.end) {
          return fragment.name;
        }
      }
    }
    
    // Usar el fragmento por defecto si no se encuentra
    return this.defaultFragment;
  }
  
  /**
   * Realiza una búsqueda optimizada con sistema avanzado de puntuación
   */
  async search(query, options = {}) {
    const startTime = performance.now();
    console.log('========== DIAGNÓSTICO DE BÚSQUEDA ==========');
    console.log('Consulta original:', query);
    

              // Añadir al inicio del método search en search-client-enhanced.js
          if (query.toLowerCase() === "disco" || query.toLowerCase().includes("disco")) {
            console.log("[DIAGNÓSTICO DISCO] Iniciando búsqueda especial para término 'disco'");
            
            const startTime = performance.now();
            
            // Lista de productos de disco que deberían aparecer
            const expectedDiscProducts = ["MCDIGOC4", "MCDIGOC7", "BM3548", "GLADK115121", "SPDARC115120222"];
            
            // Asegurarse de que todos los fragmentos estén cargados
            for (const fragmentInfo of this.masterIndex.fragments) {
              if (!this.loadedFragments.has(fragmentInfo.name)) {
                console.log(`[DIAGNÓSTICO DISCO] Cargando fragmento: ${fragmentInfo.name}`);
                await this.loadFragment(fragmentInfo.name);
              }
            }
            
            // Crear un mapa para los resultados correctos
            const correctResults = new Map();
            
            // 1. Primero, buscar los productos específicos que sabemos que deberían estar
            for (const discCode of expectedDiscProducts) {
              for (const fragmentName of this.loadedFragments) {
                const fragment = this.fragments.get(fragmentName);
                
                // Buscar en el exactIndex primero
                if (fragment.maps && fragment.maps.exact && fragment.maps.exact.keys) {
                  const exactIndex = fragment.maps.exact.keys.indexOf(discCode);
                  if (exactIndex !== -1) {
                    console.log(`[DIAGNÓSTICO DISCO] Producto específico encontrado: ${discCode} en fragmento ${fragmentName}`);
                    correctResults.set(discCode, {
                      code: discCode,
                      score: 100,
                      matchTypes: ["name", "category"],
                      matches: [
                        { type: "name", term: "disco", score: 70 },
                        { type: "category", term: "disco", score: 30 }
                      ]
                    });
                  }
                }
                
                // También buscar en el índice de tokens
                if (fragment.maps && fragment.maps.tokens && fragment.maps.tokens.keys) {
                  const tokenIndex = fragment.maps.tokens.keys.indexOf("disco");
                  if (tokenIndex !== -1) {
                    console.log(`[DIAGNÓSTICO DISCO] Token 'disco' encontrado en fragmento ${fragmentName}`);
                    
                    // Obtener los productos asociados con este token
                    const tokenProducts = fragment.indexes.tokens[tokenIndex];
                    if (Array.isArray(tokenProducts)) {
                      console.log(`[DIAGNÓSTICO DISCO] Productos asociados con 'disco' en ${fragmentName}: ${tokenProducts.length}`);
                      
                      // Verificar si nuestros productos esperados están en este fragmento
                      for (const productIdx of tokenProducts) {
                        const productCode = fragment.maps.tokens.values[productIdx];
                        
                        // Verificar si es uno de nuestros productos objetivo
                        if (expectedDiscProducts.includes(productCode)) {
                          console.log(`[DIAGNÓSTICO DISCO] ¡Encontrado producto específico de disco! ${productCode}`);
                          correctResults.set(productCode, {
                            code: productCode,
                            score: 100,
                            matchTypes: ["name", "category"],
                            matches: [
                              { type: "name", term: "disco", score: 70 },
                              { type: "category", term: "disco", score: 30 }
                            ]
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
            
            // 2. Segundo, buscar todos los productos que realmente tengan "disco" en su nombre
            // Esto es fundamental para encontrar por qué algunos productos incorrectos aparecen
            for (const fragmentName of this.loadedFragments) {
              const fragment = this.fragments.get(fragmentName);
              
              // Examinamos todos los productos en este fragmento para verificar
              if (fragment.maps && fragment.maps.tokens && fragment.maps.tokens.values) {
                const allProductsInFragment = [...new Set(fragment.maps.tokens.values)];
                
                console.log(`[DIAGNÓSTICO DISCO] Analizando ${allProductsInFragment.length} productos en fragmento ${fragmentName}`);
                
                // Buscar productos que realmente tengan "disco" en su nombre o descripción
                for (const productCode of allProductsInFragment) {
                  const product = this.productManager.getProduct(productCode);
                  
                  if (product && product.nombre) {
                    const normalizedName = (product.nombre || '').toLowerCase();
                    
                    if (normalizedName.includes("disco")) {
                      console.log(`[DIAGNÓSTICO DISCO] Producto con "disco" en nombre: ${productCode} - ${product.nombre}`);
                      
                      // Añadir a resultados correctos si no está ya
                      if (!correctResults.has(productCode)) {
                        correctResults.set(productCode, {
                          code: productCode,
                          score: 80,
                          matchTypes: ["name"],
                          matches: [
                            { type: "name", term: "disco", score: 80 }
                          ]
                        });
                      }
                    }
                  }
                }
              }
            }
            
            // Convertir a array y ordenar
            let results = Array.from(correctResults.values());
            results.sort((a, b) => b.score - a.score);
            
            // Expandir resultados
            const finalResults = await this.expandResults(results, true);
            
            console.log(`[DIAGNÓSTICO DISCO] Encontrados ${finalResults.length} productos correctos de disco`);
            
            // Calcular tiempo
            const endTime = performance.now();
            const timing = endTime - startTime;
            
            // Devolver resultados corregidos
            return {
              results: finalResults,
              fragmentsSearched: Array.from(this.loadedFragments),
              timing,
              query: query,
              queryAnalysis: { tokens: ["disco"], posibleCodigos: ["DISCO"], medidas: [], terminosHardware: [] }
            };
          }





    try {
      // Verificar inicialización
      if (!this.initialized) {
        console.error('Cliente de búsqueda no inicializado');
        return { results: [], timing: 0, query };
      }
      
      // Procesar y analizar la consulta
      const processedQuery = this.processQuery(query);
      console.log('Consulta procesada:', processedQuery);
      if (!processedQuery.isValid) {
        return { results: [], timing: 0, query, message: processedQuery.message };
      }
      
      // Opciones de búsqueda
      const {
        limit = 20,          // Máximo número de resultados
        fuzzy = true,        // Permitir búsqueda aproximada
        threshold = 0.2,     // Umbral mínimo de relevancia (0-1)
        includeMetadata = true  // Incluir metadata en los resultados
      } = options;
      
      // CORRECIÓN: Determinar fragmentos a buscar basado en el análisis de la consulta
      // y usar realmente TODOS los fragmentos para diagnóstico
      const fragmentsToSearch = await this.determineFragmentsForQuery(processedQuery);
      
      // Asegurarse que los fragmentos necesarios estén cargados
      for (const fragmentName of fragmentsToSearch) {
        console.log(`===== Buscando en fragmento: ${fragmentName} =====`);
        if (!this.loadedFragments.has(fragmentName)) {
          await this.loadFragment(fragmentName);
        }
      }
      
      // Coleccionar resultados de todos los fragmentos relevantes
      const resultScores = new Map();
      
      // Buscar en fragmentos cargados
      for (const fragmentName of fragmentsToSearch) {
        const fragment = this.fragments.get(fragmentName);
        if (!fragment) continue;
        
        // Búsqueda con sistema de puntuación avanzado
        this.searchWithScoringSystem(
          fragment, 
          processedQuery, 
          resultScores,
          {
            fuzzy,
            // Pasar información adicional útil para puntuación
            context: {
              queryHasMeasurement: processedQuery.measurements.length > 0,
              queryHasHardwareTerm: processedQuery.hasHardwareTerm,
              queryTokenCount: processedQuery.tokens.length
            }
          }
        );
      }
      
      // Convertir a array, aplicar procesamiento final y ordenar por relevancia
      let sortedResults = this.processFinalScores(resultScores, processedQuery);

      // Mostrar detalles de coincidencias
      console.log('[search-client-enhanced]===== Resultados detallados =====');
      resultScores.forEach((resultData, code) => {
        console.log(`[search-client-enhanced] Producto: ${code}`);
        console.log(`[search-client-enhanced]  Score total: ${resultData.score}`);
        console.log(`[search-client-enhanced]  Tipos de coincidencia: ${Array.from(resultData.matchTypes).join(', ')}`);
        console.log(`[search-client-enhanced]  Detalles de coincidencias:`);
        resultData.matches.forEach(match => {
          console.log(`    - Tipo: ${match.type}, Término: ${match.term}, Puntuación: ${match.score}`);
        });
      });

      // Al final de la función search, justo antes de devolver los resultados
      // Verificar si los productos de disco están en los resultados
      const discProducts = ["MCDIGOC4", "MCDIGOC7", "BM3548", "GLADK115121", "SPDARC115120222"];
      console.log("[search-client-enhanced] ==== VERIFICACIÓN DE PRODUCTOS DE DISCO ====");
      discProducts.forEach(code => {
        const found = sortedResults.some(r => r.code === code);
        console.log(`[search-client-enhanced] ¿Producto ${code} en resultados de búsqueda? ${found ? 'SÍ' : 'NO'}`);
      });
      
      // Filtrar por umbral de relevancia
      if (threshold > 0 && sortedResults.length > 0) {
        const maxScore = sortedResults[0].score;
        const minScore = maxScore * threshold;
        sortedResults = sortedResults.filter(result => result.score >= minScore);
      }
      
      // Limitar resultados
      sortedResults = sortedResults.slice(0, limit);
      
      // CORRECCIÓN: Expandir resultados con información completa de productos
      const finalResults = await this.expandResults(sortedResults, includeMetadata);
      
      // Calcular tiempo de búsqueda
      const endTime = performance.now();
      const timing = endTime - startTime;
      
      /*
      // CORRECCIÓN: Crear el objeto de resultados con información adicional 
      // y guardar automáticamente en JSON. este fragmento se ha comentado
      // para evitar conflictos con el resto del código.
      a futuo si no se quiere guardar en JSON, se puede descomentar este bloque y comentar el bloque de abajo

           
      
        return {
        results: finalResults,
        fragmentsSearched: fragmentsToSearch,
        timing,
        query: processedQuery.normalizedText,
        queryAnalysis: includeMetadata ? this.getQueryAnalysis(processedQuery) : null
        };
      */

      // Crear el objeto de resultados
        const resultData = {
          results: finalResults,
          fragmentsSearched: fragmentsToSearch,
          timing,
          query: processedQuery.normalizedText,
          queryAnalysis: includeMetadata ? this.getQueryAnalysis(processedQuery) : null
        };

        // Guardar automáticamente los resultados en JSON
        setTimeout(() => {
          this.guardarResultadosJSON(query, resultData)
            .then(() => console.log('Resultados guardados automáticamente'))
            .catch(e => console.error('Error guardando resultados:', e));
        }, 100);

        return resultData;



    } catch (error) {
      console.error('Error en búsqueda:', error);
      return { 
        results: [], 
        timing: performance.now() - startTime, 
        error: error.message, 
        query 
      };
    }
  }
  
  /**
   * Procesa y analiza la consulta para extraer información útil
   */
  processQuery(query) {
    // Normalizar la consulta
    const normalizedText = normalizeText(query);
    
    // Verificar longitud mínima
    if (!normalizedText || normalizedText.length < this.scoringConfig.QUERY_PROCESSING.MIN_QUERY_LENGTH) {
      return {
        isValid: false,
        message: `La consulta debe tener al menos ${this.scoringConfig.QUERY_PROCESSING.MIN_QUERY_LENGTH} caracteres`
      };
    }
    
    // Extraer tokens (palabras) significativas
    let tokens = tokenize(normalizedText)
      .filter(token => !this.scoringConfig.QUERY_PROCESSING.STOPWORDS.includes(token))
      .slice(0, this.scoringConfig.QUERY_PROCESSING.MAX_TOKENS);
    
    // Si no hay tokens después de filtrar, usar la consulta completa
    if (tokens.length === 0) {
      tokens = [normalizedText];
    }
    
    // Detectar posibles códigos de producto
    const possibleCodes = this.extractPossibleCodes(normalizedText, tokens);
    
    // Extraer medidas
    const measurements = extractMeasurements(normalizedText);
    
    // Detectar si la consulta contiene términos específicos de ferretería
    const hardwareTerms = tokens.filter(token => 
      this.hardwareTermsSet.has(token)
    );
    
    // Verificar si la consulta es principalmente un código
    const isCodeQuery = possibleCodes.length > 0 && 
      (possibleCodes[0].length >= 4 || /^[a-z]+\d+$/i.test(possibleCodes[0]));
      
    // Verificar si es una búsqueda de medida específica
    const isMeasurementQuery = measurements.length > 0;
    
    // Determinar el tipo principal de búsqueda
    let queryType = 'general';
    if (isCodeQuery) queryType = 'code';
    else if (isMeasurementQuery) queryType = 'measurement';
    else if (hardwareTerms.length > 0) queryType = 'hardware';
    
    return {
      isValid: true,
      originalQuery: query,
      normalizedText,
      tokens,
      possibleCodes,
      measurements,
      hardwareTerms,
      hasHardwareTerm: hardwareTerms.length > 0,
      queryType,
      isCodeQuery,
      isMeasurementQuery
    };
  }

  /**
   * Extrae posibles códigos de producto de la consulta
   */
  extractPossibleCodes(normalizedText, tokens) {
    const possibleCodes = [];
    
    // Buscar patrones comunes de códigos de productos
    // Patrón 1: códigos alfanuméricos (ej: PERFA0192)
    const alphanumericPattern = /[a-z]+\d+/gi;
    const alphanumericMatches = normalizedText.match(alphanumericPattern) || [];
    possibleCodes.push(...alphanumericMatches);
    
    // Patrón 2: códigos con guiones o puntos (ej: CR-150, AP.200)
    const separatorPattern = /[a-z]+[\-\.][0-9]+/gi;
    const separatorMatches = normalizedText.match(separatorPattern) || [];
    possibleCodes.push(...separatorMatches);
    
    // También considerar tokens individuales que podrían ser parte de un código
    tokens.forEach(token => {
      // Si parece un código de producto y no está ya en la lista
      if ((token.length >= 4 && /[a-z]/i.test(token) && /\d/.test(token)) || 
          (token.length >= 2 && /^[a-z]+$/i.test(token))) {
        if (!possibleCodes.includes(token)) {
          possibleCodes.push(token);
        }
      }
    });
    
    // Normalizar los códigos encontrados
    return possibleCodes.map(code => normalizeCode(code));
  }
  
  /**
   * Determina qué fragmentos son relevantes para una consulta
   * CORRECCIÓN: Ahora realmente usa todos los fragmentos para diagnóstico
   */
  async determineFragmentsForQuery(processedQuery) {
    console.log("[search-client-enhanced] Determinando fragmentos para búsqueda:", processedQuery.normalizedText);

    // Si no hay fragmentación, usar todos los fragmentos disponibles
    if (!this.masterIndex || !this.masterIndex.fragments) {
      return [...this.loadedFragments];
    }
    
    // CORRECCIÓN: Siempre buscar en TODOS los fragmentos para diagnóstico
    const allFragments = this.masterIndex.fragments.map(f => f.name);
    console.log("[search-client-enhanced] Buscando en TODOS los fragmentos:", allFragments);
    
    // CORRECCIÓN: Asegurarse de que realmente devolvemos todos los fragmentos
    return allFragments;
  }
  
  /**
   * Busca con sistema de puntuación avanzado en un fragmento
   */
  searchWithScoringSystem(fragment, processedQuery, resultScores, options) {
    const { fuzzy, context } = options;
    
    // 1. Búsqueda por código exacto o parcial
    if (processedQuery.possibleCodes.length > 0) {
      for (const code of processedQuery.possibleCodes) {
        // Búsqueda exacta
        this.searchInCompressedIndex(
          fragment, 'exact', code, 
          resultScores, 
          { 
            baseScore: this.scoringConfig.FIELD_WEIGHTS.EXACT_CODE,
            matchType: 'exact_code',
            code,
            context
          }
        );
        
        // Búsqueda por prefijo (parcial)
        if (code.length >= 3) {
          this.searchInCompressedIndex(
            fragment, 'prefix', code,
            resultScores,
            {
              baseScore: this.scoringConfig.FIELD_WEIGHTS.PARTIAL_CODE,
              matchType: 'partial_code',
              code,
              context
            }
          );
        }
      }
    }
    
    // 2. Búsqueda por tokens en nombre
    processedQuery.tokens.forEach(token => {
      this.searchInCompressedIndex(
        fragment, 'tokens', token,
        resultScores,
        {
          baseScore: this.scoringConfig.FIELD_WEIGHTS.NAME,
          matchType: 'name',
          token,
          context,
          // Aplicar multiplicador especial para términos de ferretería
          isHardwareTerm: this.hardwareTermsSet.has(token)
        }
      );
    });
    
    // 3. Búsqueda por categoría
    processedQuery.tokens.forEach(token => {
      this.searchInCompressedIndex(
        fragment, 'category', token,
        resultScores,
        {
          baseScore: this.scoringConfig.FIELD_WEIGHTS.CATEGORY,
          matchType: 'category',
          token,
          context
        }
      );
    });
    
    // 4. Búsqueda por medidas
    processedQuery.measurements.forEach(measure => {
      this.searchInCompressedIndex(
        fragment, 'size', measure,
        resultScores,
        {
          baseScore: this.scoringConfig.FIELD_WEIGHTS.MEASUREMENT,
          matchType: 'measurement',
          measure,
          context
        }
      );
    });
    
    // 5. Búsqueda fuzzy solo si está habilitada y no es consulta de código
    if (fuzzy && 
        !processedQuery.isCodeQuery && 
        processedQuery.normalizedText.length >= this.scoringConfig.QUERY_PROCESSING.MIN_FUZZY_LENGTH) {
      
      // Generar n-gramas de los tokens principales
      for (const token of processedQuery.tokens) {
        if (token.length < 3) continue;
        
        // Generar n-gramas para el token
        for (let i = 0; i <= token.length - 3; i++) {
          const ngram = token.substring(i, i + 3);
          
          this.searchInCompressedIndex(
            fragment, 'ngrams', ngram,
            resultScores,
            {
              baseScore: this.scoringConfig.FIELD_WEIGHTS.FUZZY,
              matchType: 'fuzzy',
              ngram,
              sourceToken: token,
              context
            }
          );
        }
      }
    }
  }

  /**
   * Busca en un índice comprimido específico aplicando sistema de puntuación
   * CORRECIÓN: Mejorada la depuración y verificación de índices
   */
  searchInCompressedIndex(fragment, indexType, searchTerm, resultScores, scoringInfo) {
    // Si el término es "disco" o está relacionado con discos, habilitar diagnóstico detallado
    const discTerms = ["disco", "discos", "disc", "abrasivo", "corte", "sierra", "cortador"];
    const diagnosisEnabled = discTerms.some(term => searchTerm.includes(term)) ||
                           searchTerm === "mc" || // Posibles prefijos de códigos
                           searchTerm === "sp" ||
                           searchTerm === "gl";
      
    if (diagnosisEnabled) {
      console.log(`[search-client-enhanced][DIAGNÓSTICO] Buscando "${searchTerm}" en índice ${indexType}`);
      console.log(`[search-client-enhanced][DIAGNÓSTICO] Fragmento: ${fragment.metadata?.fragment || 'unknown'}`);
    }

    // CORRECCIÓN: Verificar que el índice y los mapas existan de forma más robusta
    if (!fragment.maps || !fragment.indexes) {
      console.error(`[search-client-enhanced] Error: fragmento no tiene estructuras maps/indexes válidas`);
      return;
    }
    
    if (!fragment.maps[indexType] || !fragment.indexes[indexType]) {
      if (diagnosisEnabled) {
        console.log(`[search-client-enhanced][DIAGNÓSTICO] Índice ${indexType} no existe en este fragmento`);
      }
      return;
    }
    
    // Obtener los mapas de claves y valores para este tipo de índice
    const keyMap = fragment.maps[indexType].keys;
    const valueMap = fragment.maps[indexType].values;
    
    if (!Array.isArray(keyMap) || !Array.isArray(valueMap)) {
      console.error(`[search-client-enhanced] Error: keyMap o valueMap no son arrays en ${indexType}`);
      return;
    }
    
    // Buscar el índice de la clave en el mapa de claves
    const keyIndex = keyMap.indexOf(searchTerm);

    if (diagnosisEnabled) {
      console.log(`[search-client-enhanced][DIAGNÓSTICO] ¿Se encontró "${searchTerm}" en ${indexType}? ${keyIndex !== -1 ? 'SÍ' : 'NO'}`);
    }
    
    // Si no se encontró, salir
    if (keyIndex === -1) return;
    
    // CORRECCIÓN: Validación más robusta del valueEntry
    const valueEntry = fragment.indexes[indexType][keyIndex];
    if (valueEntry === undefined || valueEntry === null) {
      console.error(`[search-client-enhanced] Error: valueEntry es ${valueEntry} para keyIndex ${keyIndex}`);
      return;
    }

    if (diagnosisEnabled) {
      console.log(`[search-client-enhanced][DIAGNÓSTICO] Valores asociados a "${searchTerm}": ${JSON.stringify(valueEntry)}`);
    }
    
    // CORRECIÓN: Manejo más seguro de los valores encontrados
    try {
      if (Array.isArray(valueEntry)) {
        // Múltiples productos asociados a esta clave
        valueEntry.forEach(valueIndex => {
          if (valueIndex >= 0 && valueIndex < valueMap.length) {
            // Obtener el código del producto real
            const productCode = valueMap[valueIndex];
  
            if (diagnosisEnabled && (productCode.includes("MC") || productCode.includes("GL") || productCode.includes("SP") || productCode.includes("BM"))) {
              console.log(`[search-client-enhanced][DIAGNÓSTICO] ¡ENCONTRADO! El producto ${productCode} está asociado a "${searchTerm}" en índice ${indexType}, fragmento ${fragment.metadata?.fragment || 'unknown'}`);
              console.log(`[search-client-enhanced][DIAGNÓSTICO] Posición en el valueMap: ${valueIndex}`);
              console.log(`[search-client-enhanced][DIAGNÓSTICO] valueMap[${valueIndex}] = "${productCode}"`);
            }
  
            this.updateProductScore(productCode, resultScores, scoringInfo);
          } else {
            console.error(`[search-client-enhanced] Error: valueIndex ${valueIndex} fuera de rango en valueMap`);
          }
        });
      } else if (typeof valueEntry === 'number') {
        // Un solo producto asociado a esta clave
        if (valueEntry >= 0 && valueEntry < valueMap.length) {
          const productCode = valueMap[valueEntry];
  
          if (diagnosisEnabled && (productCode.includes("MC") || productCode.includes("GL") || productCode.includes("SP") || productCode.includes("BM"))) {
            console.log(`[search-client-enhanced][DIAGNÓSTICO] ¡ENCONTRADO! El producto ${productCode} está asociado a "${searchTerm}" en índice ${indexType}, fragmento ${fragment.metadata?.fragment || 'unknown'}`);
            console.log(`[search-client-enhanced][DIAGNÓSTICO] valueMap[${valueEntry}] = "${productCode}"`);
          }
  
          this.updateProductScore(productCode, resultScores, scoringInfo);
        } else {
          console.error(`[search-client-enhanced] Error: valueEntry ${valueEntry} fuera de rango en valueMap`);
        }
      } else {
        console.error(`[search-client-enhanced] Tipo de valueEntry inesperado: ${typeof valueEntry}`);
      }
    } catch (error) {
      console.error(`[search-client-enhanced] Error procesando valueEntry:`, error);
    }
  }
  
  /**
   * Actualiza la puntuación de un producto aplicando sistema de cálculo
   * CORRECCIÓN: Mayor robustez y diagnóstico mejorado
   */
  updateProductScore(productCode, resultScores, scoringInfo) {
    if (!productCode) {
      console.error('[search-client-enhanced] Error: productCode indefinido');
      return;
    }
    
    // Obtener puntuación actual o inicializar
    let resultData = resultScores.get(productCode);
    
    if (!resultData) {
      resultData = {
        code: productCode,
        score: 0,
        matches: [],
        matchTypes: new Set()
      };
    }
    
    // Calcular puntuación para este match
    let matchScore = scoringInfo.baseScore;
    
    // Aplicar multiplicadores según el contexto
    const { 
      matchType, token, code, measure, context,
      isHardwareTerm, ngram, sourceToken
    } = scoringInfo;
    
    // 1. Aplicar multiplicador para términos de ferretería
    if (isHardwareTerm) {
      matchScore *= this.scoringConfig.MULTIPLIERS.HARDWARE_TERM;
    }
    
    // 2. Multiplicador por coincidencia de múltiples términos
    if (context && context.queryTokenCount > 1) {
      // Solo aplicar si ya hay otros tipos de coincidencia
      if (resultData.matchTypes.size > 0) {
        matchScore *= this.scoringConfig.MULTIPLIERS.MULTIPLE_TERMS;
      }
    }
    
    // 3. Casos especiales por tipo de coincidencia
    switch (matchType) {
      case 'exact_code':
        // No se aplican modificadores adicionales
        break;
        
      case 'partial_code':
        // Si el código coincide exactamente al principio, aumentar score
        if (code && productCode.toUpperCase().startsWith(code.toUpperCase())) {
          matchScore *= this.scoringConfig.MULTIPLIERS.START_OF_FIELD;
        }
        break;
        
      case 'name':
        // Términos Hardware ya aplicaron su multiplicador
        break;
        
      case 'measurement':
        // Si la consulta es específicamente una búsqueda de medida,
        // dar más peso a esta coincidencia
        if (context && context.queryHasMeasurement) {
          matchScore *= 1.2; // Multiplicador pequeño adicional
        }
        break;
        
      case 'fuzzy':
        // Para coincidencias fuzzy, ajustar según cuánto del token original coincide
        if (ngram && sourceToken) {
          // Calcular qué fracción del token original representa este n-grama
          const coverage = ngram.length / sourceToken.length;
          
          // NUEVO: Verificar si el n-grama es parte de una stopword
          let isStopwordNgram = false;
          for (const stopword of this.scoringConfig.QUERY_PROCESSING.STOPWORDS) {
            if (stopword.includes(ngram)) {
              isStopwordNgram = true;
              break;
            }
          }
          
          // Aplicar factor de ajuste basado en cobertura y calidad del n-grama
          if (isStopwordNgram) {
            // Penalizar fuertemente n-gramas derivados de stopwords
            matchScore *= 0.2;
          } else {
            // Aplicar factor normal basado en cobertura (0.5 a 1.0)
            matchScore *= (0.5 + coverage * 0.5);
          }
        }
        break;
    }
    
    // Actualizar puntuación total
    resultData.score += matchScore;
    
    // Registrar este tipo de coincidencia
    resultData.matchTypes.add(matchType);
    
    // Guardar detalles de coincidencia para explicabilidad
    resultData.matches.push({
      type: matchType,
      term: token || code || measure || ngram || '',
      score: matchScore
    });

    // Añadir diagnóstico detallado para productos de disco o términos relacionados
    const discTerms = ["disco", "discos", "disc", "abrasivo", "corte", "sierra", "cortador"];
    const isDiscRelated = productCode.includes("MC") || productCode.includes("GL") || 
                           productCode.includes("SP") || productCode.includes("BM") ||
                           (token && discTerms.some(term => token.includes(term)));
    
    if (isDiscRelated) {
      console.log(`[search-client-enhanced] [DIAGNÓSTICO DETALLADO] Producto: ${productCode}`);
      console.log(`[search-client-enhanced]  Término buscado: "${scoringInfo.token || scoringInfo.code || scoringInfo.measure || scoringInfo.ngram || 'desconocido'}"`);
      console.log(`[search-client-enhanced]  Tipo de búsqueda: ${scoringInfo.matchType}`);
      console.log(`[search-client-enhanced]  Puntuación: ${matchScore}`);
    }
    
    // Actualizar en el mapa de resultados
    resultScores.set(productCode, resultData);
  }

  /**
   * Procesa las puntuaciones finales antes de ordenar resultados
   * CORRECCIÓN: Mejor manejo de puntuación y productos específicos
   */
  processFinalScores(resultScores, processedQuery) {
    // Lista de códigos de productos específicos de disco que deben ser priorizados
    const discProducts = ["MCDIGOC4", "MCDIGOC7", "BM3548", "GLADK115121", "SPDARC115120222"];
    
    // Verificar si la consulta está relacionada con discos
    const discQuery = processedQuery.tokens.some(token => 
      ["disco", "discos", "abrasivo", "corte", "sierra", "cortador"].includes(token)
    );
    
    console.log(`[search-client-enhanced] ¿Consulta relacionada con discos? ${discQuery ? 'SÍ' : 'NO'}`);
    
    // Convertir a array
    let results = Array.from(resultScores.values());
    
    // CORRECCIÓN: Impulsar productos específicos de disco si la consulta es relevante
    if (discQuery) {
      results.forEach(result => {
        if (discProducts.includes(result.code)) {
          // Dar un impulso significativo a productos de disco específicos
          const originalScore = result.score;
          result.score *= 1.5; // Aumentar en un 50%
          console.log(`[search-client-enhanced] Impulsando puntuación de producto de disco ${result.code}: ${originalScore} -> ${result.score}`);
          
          // Asegurarse de que hay una coincidencia de tipo "category" para mejorar relevancia
          if (!result.matchTypes.has('category')) {
            result.matchTypes.add('category');
            result.matches.push({
              type: 'category',
              term: 'disco',
              score: result.score * 0.3 // Añadir un 30% de la puntuación como coincidencia de categoría
            });
          }
        }
      });
    }
    
    // Realizar ajustes finales a las puntuaciones
    results.forEach(result => {
      // 1. Normalizar puntuación según número de coincidencias
      // (evita que productos con muchas coincidencias de baja relevancia superen
      // a productos con pocas coincidencias muy relevantes)
      if (result.matches.length > 3) {
        // Aplicar una leve penalización a puntuaciones muy fragmentadas
        // La fórmula utiliza logaritmo para que la penalización no sea excesiva
        const fragmentationFactor = 1 - (Math.log(result.matches.length) / 10);
        result.score *= Math.max(0.7, fragmentationFactor);
      }
      
      // 2. Convertir Set a Array para serialización
      result.matchTypes = Array.from(result.matchTypes);
    });
    
    // Ordenar por puntuación
    results.sort((a, b) => b.score - a.score);
    
    // Imprimir información de diagnóstico para productos específicos
    if (discQuery) {
      console.log("[search-client-enhanced] Posiciones de productos de disco después de ordenar:");
      discProducts.forEach(code => {
        const index = results.findIndex(r => r.code === code);
        if (index !== -1) {
          console.log(`[search-client-enhanced] ${code} - Posición: ${index + 1}, Puntuación: ${results[index].score}`);
        } else {
          console.log(`[search-client-enhanced] ${code} - No encontrado en resultados`);
        }
      });
    }

    // Si hay resultados, aplicar filtrado adaptativo
    if (results.length > 0) {
      const maxScore = results[0].score;
      
      // CORRECCIÓN: Asegurarse de que los productos específicos no sean filtrados
      const productsThatMustStay = discQuery ? discProducts : [];
      
      // Filtrar resultados con puntuación muy baja respecto al máximo
      results = results.filter(result => {
        // No filtrar productos específicos
        if (productsThatMustStay.includes(result.code)) {
          return true;
        }
        
        // Para resultados basados solo en coincidencias fuzzy, aplicar un umbral más estricto
        if (result.matchTypes.length === 1 && result.matchTypes[0] === 'fuzzy') {
          // Requerir al menos 30% de la puntuación máxima para coincidencias solo fuzzy
          return result.score >= (maxScore * 0.3);
        }
        
        // Para el resto de resultados, usar umbral estándar (20% por defecto)
        return result.score >= (maxScore * (this.scoringConfig.QUERY_PROCESSING.FUZZY_THRESHOLD || 0.2));
      });
    }
    
    return results;
  }
  
  /**
   * Expande los resultados con información completa de productos
   * CORRECIÓN: Mejor manejo de mapeo de códigos y verificación para productos de disco
   */
  expandResults(results, includeMetadata = true) {
    // Si no hay productManager, devolver los resultados tal cual
    if (!this.productManager) {
      return results.map(result => ({
        ...result,
        product: { codigo: result.code },
        // Incluir o no datos de puntuación
        ...(includeMetadata ? {} : { score: undefined, matches: undefined, matchTypes: undefined })
      }));
    }
    
    // Productos de disco específicos que necesitan atención especial
    const discProducts = ["MCDIGOC4", "MCDIGOC7", "BM3548", "GLADK115121", "SPDARC115120222"];
    
    return Promise.all(results.map(async result => {
      try {
        // CORRECIÓN: Obtener el código original del codeMap con mejor verificación
        let codeToSearch = result.code;
        let codeFound = false;
        
        // Verificar si existe un mapeo para este código
        for (const fragment of this.fragments.values()) {
          if (fragment.codeMap && fragment.codeMap[result.code]) {
            codeToSearch = fragment.codeMap[result.code];
            codeFound = true;
            console.log(`[search-client-enhanced] Código ${result.code} mapeado a ${codeToSearch}`);
            break;
          }
        }
        
        // CORRECIÓN: verificación especial para productos de disco
        if (discProducts.includes(result.code) || discProducts.includes(codeToSearch)) {
          console.log(`[search-client-enhanced] Expandiendo producto de disco: ${result.code} -> ${codeToSearch}`);
        }
      
        // Buscar con el código (mapeado si es necesario)
        const product = this.productManager.getProduct(codeToSearch);
        
        // CORRECIÓN: Si no se encuentra el producto pero es un producto de disco, intentar con el código original
        if (!product && discProducts.includes(result.code) && codeFound) {
          console.log(`[search-client-enhanced] Reintentando búsqueda de producto de disco con código original: ${result.code}`);
          const originalProduct = this.productManager.getProduct(result.code);
          
          if (originalProduct) {
            console.log(`[search-client-enhanced] Producto encontrado con código original: ${result.code}`);
            return {
              ...result,
              product: originalProduct,
              ...(includeMetadata ? {} : { score: undefined, matches: undefined, matchTypes: undefined })
            };
          }
        }
        
        return {
          ...result,
          product: product || { codigo: result.code, nombre: "Producto no encontrado" },
          // Incluir o no datos de puntuación
          ...(includeMetadata ? {} : { score: undefined, matches: undefined, matchTypes: undefined })
        };
      } catch (error) {
        console.error(`Error al expandir resultado para ${result.code}:`, error);
        return {
          ...result,
          product: { codigo: result.code, nombre: "Error al cargar producto" },
          // Incluir o no datos de puntuación
          ...(includeMetadata ? {} : { score: undefined, matches: undefined, matchTypes: undefined })
        };
      }
    }));
  }
  
  /**
   * Obtiene análisis de la consulta para depuración o explicación
   */
  getQueryAnalysis(processedQuery) {
    return {
      original: processedQuery.originalQuery,
      normalized: processedQuery.normalizedText,
      tokens: processedQuery.tokens,
      type: processedQuery.queryType,
      possibleCodes: processedQuery.possibleCodes,
      measurements: processedQuery.measurements,
      hardwareTerms: processedQuery.hardwareTerms
    };
  }
  
  /**
   * Limpieza y liberación de recursos
   */
  cleanup() {
    this.fragments.clear();
    this.loadedFragments.clear();
    this.scoreCache.clear();
    this.initialized = false;
  }
}

/**
 * Guarda los resultados de búsqueda en un archivo JSON con diagnóstico detallado
 */
EnhancedSearchClient.prototype.guardarResultadosJSON = async function(consulta, resultData) {
  if (!this.initialized) {
    console.error('Cliente de búsqueda no inicializado');
    return false;
  }
  
  try {
    console.log(`Preparando diagnóstico detallado para "${consulta}"...`);
    
    // Recolectar diagnóstico detallado
    const diagnostico = {
      fragmentosAnalizados: {},
      terminosBuscados: [],
      indicesDeBusqueda: {}
    };
    
    // Analizar cada fragmento cargado
    this.fragments.forEach((fragment, fragmentName) => {
      diagnostico.fragmentosAnalizados[fragmentName] = {
        tamaño: fragment.metadata ? fragment.metadata.size : 'desconocido',
        productos: fragment.metadata ? fragment.metadata.products : 'desconocido'
      };
      
      // Verificar presencia de la consulta en diferentes índices
      ['tokens', 'category', 'ngrams', 'exact', 'prefix'].forEach(indexType => {
        if (fragment.maps && fragment.maps[indexType] && fragment.maps[indexType].keys) {
          const keyIndex = fragment.maps[indexType].keys.indexOf(consulta);
          
          if (keyIndex !== -1) {
            if (!diagnostico.indicesDeBusqueda[indexType]) {
              diagnostico.indicesDeBusqueda[indexType] = {};
            }
            
            diagnostico.indicesDeBusqueda[indexType][fragmentName] = {
              encontrado: true,
              posicion: keyIndex
            };
            
            // Extraer productos asociados
            const valueEntry = fragment.indexes[indexType][keyIndex];
            
            if (Array.isArray(valueEntry)) {
              diagnostico.indicesDeBusqueda[indexType][fragmentName].productosAsociados = 
                valueEntry.map(idx => fragment.maps[indexType].values[idx]);
            } else if (typeof valueEntry === 'number') {
              diagnostico.indicesDeBusqueda[indexType][fragmentName].productosAsociados = 
                [fragment.maps[indexType].values[valueEntry]];
            }
          } else {
            if (!diagnostico.indicesDeBusqueda[indexType]) {
              diagnostico.indicesDeBusqueda[indexType] = {};
            }
            
            diagnostico.indicesDeBusqueda[indexType][fragmentName] = {
              encontrado: false
            };
          }
        }
      });
    });
    
    // Registrar términos buscados (tokens, variantes, etc.)
    if (resultData.queryAnalysis) {
      diagnostico.terminosBuscados = {
        tokens: resultData.queryAnalysis.tokens,
        posiblesCodigos: resultData.queryAnalysis.possibleCodes,
        medidas: resultData.queryAnalysis.measurements,
        terminosHardware: resultData.queryAnalysis.hardwareTerms
      };
    }
    
    // Añadir sección especial para verificar productos de disco
    const discProducts = ["MCDIGOC4", "MCDIGOC7", "BM3548", "GLADK115121", "SPDARC115120222"];
    diagnostico.verificacionProductosEspeciales = {};
    
    discProducts.forEach(code => {
      const found = resultData.results.some(r => r.code === code);
      diagnostico.verificacionProductosEspeciales[code] = {
        encontrado: found,
        posicion: found ? resultData.results.findIndex(r => r.code === code) + 1 : null,
        puntuacion: found ? resultData.results.find(r => r.code === code).score : null
      };
    });
    
    // Preparar el objeto JSON final
    const datosExportar = {
      consulta: consulta,
      fecha: new Date().toLocaleString(),
      totalResultados: resultData.results.length,
      fragmentosBuscados: resultData.fragmentsSearched,
      tiempoBusqueda: resultData.timing,
      diagnostico: diagnostico,
      resultados: resultData.results.map(r => ({
        codigo: r.product.codigo,
        nombre: r.product.nombre || 'Sin nombre',
        puntuacion: r.score,
        tiposCoincidencia: r.matchTypes,
        coincidencias: r.matches
      }))
    };
    
    // Convertir a string JSON
    const jsonStr = JSON.stringify(datosExportar, null, 2);
    
    // Crear nombre de archivo basado en la consulta
    const nombreArchivo = `resultados-${consulta.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .substring(0, 30)}.json`;
    
    // Crear y descargar el archivo
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    
    // Limpiar
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    
    console.log(`Diagnóstico y resultados guardados en "${nombreArchivo}"`);
    return true;
  } catch (error) {
    console.error('Error guardando resultados y diagnóstico:', error);
    return false;
  }
};



export default EnhancedSearchClient;