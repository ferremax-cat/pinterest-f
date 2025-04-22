/**
 * Cliente de búsqueda mejorado con sistema avanzado de relevancia y puntuación
 * Optimizado para catálogos de ferretería
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
      
      // 1. Cargar el índice maestro
      const masterResponse = await fetch('./json/search/optimized/master_index.json');
      if (!masterResponse.ok) {
        throw new Error(`Error cargando índice maestro: ${masterResponse.status}`);
      }
      
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
    
    try {
      // Verificar inicialización
      if (!this.initialized) {
        console.error('Cliente de búsqueda no inicializado');
        return { results: [], timing: 0, query };
      }
      
      // Procesar y analizar la consulta
      const processedQuery = this.processQuery(query);
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
      
      // Determinar fragmentos a buscar basado en el análisis de la consulta
      const fragmentsToSearch = await this.determineFragmentsForQuery(processedQuery);
      
      // Asegurarse que los fragmentos necesarios estén cargados
      for (const fragmentName of fragmentsToSearch) {
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
      
      // Filtrar por umbral de relevancia
      if (threshold > 0 && sortedResults.length > 0) {
        const maxScore = sortedResults[0].score;
        const minScore = maxScore * threshold;
        sortedResults = sortedResults.filter(result => result.score >= minScore);
      }
      
      // Limitar resultados
      sortedResults = sortedResults.slice(0, limit);
      
      // Expandir resultados con información completa de productos
      const finalResults = await this.expandResults(sortedResults, includeMetadata);
      
      // Calcular tiempo de búsqueda
      const endTime = performance.now();
      const timing = endTime - startTime;
      
      return {
        results: finalResults,
        fragmentsSearched: fragmentsToSearch,
        timing,
        query: processedQuery.normalizedText,
        queryAnalysis: includeMetadata ? this.getQueryAnalysis(processedQuery) : null
      };
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
   */
  async determineFragmentsForQuery(processedQuery) {
    // Si no hay fragmentación, usar todos los fragmentos disponibles
    if (!this.masterIndex || !this.masterIndex.fragments) {
      return [...this.loadedFragments];
    }
    
    const fragments = new Set();
    
    // Estrategia basada en el tipo de consulta
    switch (processedQuery.queryType) {
      case 'code':
        // Para búsqueda por código, cargar solo el fragmento específico
        for (const code of processedQuery.possibleCodes) {
          fragments.add(this.getFragmentForCode(code));
        }
        break;
        
      case 'measurement':
        // Para búsqueda por medida, necesitamos más cobertura
        // Añadir al menos 2 fragmentos, empezando por el predeterminado
        fragments.add(this.defaultFragment);
        
        // Añadir otro fragmento popular para este tipo de productos
        const secondFragment = this.masterIndex.fragments.find(f => 
          f.name !== this.defaultFragment
        )?.name;
        
        if (secondFragment) fragments.add(secondFragment);
        break;
        
      case 'hardware':
        // Para términos de ferretería específicos, usar solo el fragmento predeterminado
        // inicialmente para respuesta rápida
        fragments.add(this.defaultFragment);
        break;
        
      case 'general':
      default:
        // Para búsquedas generales, usar estrategia basada en tokens
        fragments.add(this.defaultFragment);
        
        // Si la consulta es compleja (muchos tokens), considerar cargar más fragmentos
        if (processedQuery.tokens.length >= 3) {
          // Añadir fragmentos adicionales
          this.masterIndex.fragments.forEach(fragment => {
            if (fragments.size < 2) { // Limitar a 2 fragmentos inicialmente
              fragments.add(fragment.name);
            }
          });
        }
    }
    
    return [...fragments];
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
   */
  searchInCompressedIndex(fragment, indexType, searchTerm, resultScores, scoringInfo) {
    // Verificar que el índice y los mapas existan
    if (!fragment.maps[indexType] || !fragment.indexes[indexType]) return;
    
    // Obtener los mapas de claves y valores para este tipo de índice
    const keyMap = fragment.maps[indexType].keys;
    const valueMap = fragment.maps[indexType].values;
    
    // Buscar el índice de la clave en el mapa de claves
    const keyIndex = keyMap.indexOf(searchTerm);
    
    // Si no se encontró, salir
    if (keyIndex === -1) return;
    
    // Obtener los valores (índices de productos) asociados a esta clave
    const valueEntry = fragment.indexes[indexType][keyIndex];
    
    // Procesar los valores encontrados
    if (Array.isArray(valueEntry)) {
      // Múltiples productos asociados a esta clave
      valueEntry.forEach(valueIndex => {
        // Obtener el código del producto real
        const productCode = valueMap[valueIndex];
        this.updateProductScore(productCode, resultScores, scoringInfo);
      });
    } else {
      // Un solo producto asociado a esta clave
      const productCode = valueMap[valueEntry];
      this.updateProductScore(productCode, resultScores, scoringInfo);
    }
  }
  
  /**
   * Actualiza la puntuación de un producto aplicando sistema de cálculo
   */
  updateProductScore(productCode, resultScores, scoringInfo) {
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
          // Aplicar factor de ajuste basado en cobertura (0.5 a 1.0)
          matchScore *= (0.5 + coverage * 0.5);
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
    
    // Actualizar en el mapa de resultados
    resultScores.set(productCode, resultData);
  }
  
  /**
   * Procesa las puntuaciones finales antes de ordenar resultados
   */
  processFinalScores(resultScores, processedQuery) {
    // Convertir a array
    let results = Array.from(resultScores.values());
    
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
    
    return results;
  }
  
  /**
   * Expande los resultados con información completa de productos
   */
  async expandResults(results, includeMetadata = true) {
    // Si no hay productManager, devolver los resultados tal cual
    if (!this.productManager) {
      return results.map(result => ({
        ...result,
        product: { codigo: result.code },
        // Incluir o no datos de puntuación
        ...(includeMetadata ? {} : { score: undefined, matches: undefined, matchTypes: undefined })
      }));
    }
    
    return Promise.all(results.map(async result => {
      try {
              // NUEVO: Obtener el código original del codeMap
            let codeToSearch = result.code;
            
            // Verificar si existe un mapeo para este código
            for (const fragment of this.fragments.values()) {
              if (fragment.codeMap && fragment.codeMap[result.code]) {
                codeToSearch = fragment.codeMap[result.code];
                break;
              }
            }
      
      // Buscar con el código original
      const product = this.productManager.getProduct(codeToSearch);
        
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

export default EnhancedSearchClient;