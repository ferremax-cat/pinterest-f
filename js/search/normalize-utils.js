/**
 * Utilidades de normalización para el sistema de búsqueda
 * 
 * Este módulo contiene funciones para normalizar texto, códigos y medidas,
 * lo que permite búsquedas más robustas y tolerantes a variaciones.
 */

/**
 * Normaliza texto general para búsqueda
 * 
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .toLowerCase()                                    // Convertir a minúsculas
      .normalize('NFD')                                 // Descomponer caracteres acentuados
      .replace(/[\u0300-\u036f]/g, '')                  // Eliminar acentos
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')     // Reemplazar puntuación con espacios
      .replace(/\s+/g, ' ')                             // Normalizar espacios múltiples
      .trim();                                          // Eliminar espacios al inicio/fin
  }
  
  /**
   * Normaliza códigos de producto
   * 
   * @param {string} code - Código a normalizar
   * @returns {string} - Código normalizado
   */
  export function normalizeCode(code) {
    if (!code || typeof code !== 'string') return '';
    
    return code
      .toUpperCase()                                   // Códigos en mayúsculas
      .replace(/[\s\-_.\/]/g, '')                      // Eliminar espacios, guiones, puntos y barras
      .trim();                                         // Eliminar espacios sobrantes
  }
  
  /**
   * Genera variantes de un código para búsqueda
   * 
   * @param {string} code - Código original
   * @returns {string[]} - Array con variantes del código
   */
  export function generateCodeVariants(code) {
    if (!code || typeof code !== 'string') return [];
    
    const normalized = normalizeCode(code);
    const variants = [normalized];
    
    // Variante sin ceros a la izquierda en secciones numéricas
    // Ej: PERFA08 -> PERFA8
    const withoutLeadingZeros = normalized.replace(/(\D)0+(\d)/g, '$1$2');
    if (withoutLeadingZeros !== normalized) {
      variants.push(withoutLeadingZeros);
    }
    
    // Variante con separación entre letras y números
    // Ej: PERFA192 -> PERFA 192
    const withSpaces = normalized.replace(/([A-Z]+)(\d+)/g, '$1 $2');
    if (withSpaces !== normalized) {
      variants.push(withSpaces);
    }
    
    // Variante con guiones entre letras y números
    // Ej: PERFA192 -> PERFA-192
    const withHyphens = normalized.replace(/([A-Z]+)(\d+)/g, '$1-$2');
    if (withHyphens !== normalized) {
      variants.push(withHyphens);
    }
    
    return variants;
  }
  
  /**
   * Normaliza medidas y dimensiones
   * 
   * @param {string} measure - Medida a normalizar
   * @returns {string} - Medida normalizada
   */
  export function normalizeMeasurement(measure) {
    if (!measure || typeof measure !== 'string') return '';
    
    return measure
      .toLowerCase()
      .replace(/\s+/g, '')                           // Eliminar espacios
      .replace(/^0+(\d)/g, '$1')                      // 08mm -> 8mm
      .replace(/x0+(\d)/g, 'x$1')                     // 8x05mm -> 8x5mm
      .replace(/(\d)\/(\d)/g, '$1/$2')                // Normalizar fracciones
      .replace(/(\d)[,.](\d)/g, '$1.$2')              // Normalizar punto decimal
      .replace(/pulg(?:ada)?s?/gi, '"')               // pulgadas -> "
      .replace(/milimetros?/gi, 'mm')                 // milimetros -> mm
      .replace(/centimetros?/gi, 'cm')                // centimetros -> cm
      .replace(/metros?/gi, 'm')                      // metros -> m
      .replace(/kilogramos?/gi, 'kg')                 // kilogramos -> kg
      .replace(/gramos?/gi, 'g')                      // gramos -> g
      .replace(/litros?/gi, 'l')                      // litros -> l
      .replace(/mililitros?/gi, 'ml');                // mililitros -> ml
  }
  
  /**
   * Genera variantes de una medida para búsqueda
   * 
   * @param {string} measure - Medida original
   * @returns {string[]} - Array con variantes de la medida
   */
  export function generateMeasurementVariants(measure) {
    if (!measure || typeof measure !== 'string') return [];
    
    const normalized = normalizeMeasurement(measure);
    const variants = [normalized];
    
    // Variante con cero en medidas menores a 10
    // 8mm -> 08mm
    if (/^[1-9]([^0-9]|$)/.test(normalized)) {
      variants.push('0' + normalized);
    }
    
    // Variante con espacios en dimensiones
    // 8x10mm -> 8 x 10 mm
    const withSpaces = normalized
      .replace(/(\d+)x(\d+)(\w+)/, '$1 x $2 $3')
      .replace(/(\d+)(\w+)/, '$1 $2');
    
    if (withSpaces !== normalized) {
      variants.push(withSpaces);
    }
    
    // Variantes de unidades
    if (normalized.includes('"')) {
      variants.push(normalized.replace('"', 'pulg'));
      variants.push(normalized.replace('"', 'pulgadas'));
    }
    
    if (normalized.includes('mm')) {
      variants.push(normalized.replace('mm', 'milimetros'));
    }
    
    if (normalized.includes('cm')) {
      variants.push(normalized.replace('cm', 'centimetros'));
    }
    
    return variants;
  }
  
  /**
   * Detecta y extrae posibles medidas de un texto
   * 
   * @param {string} text - Texto del que extraer medidas
   * @returns {string[]} - Array de medidas encontradas
   */
  export function extractMeasurements(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Patrones de búsqueda de medidas comunes
    const patterns = [
      /(\d+)\s*x\s*(\d+)\s*(mm|cm|m|pulg|pulgadas|")/gi,  // 10x20mm, 10 x 20 mm
      /(\d+[.,]?\d*)\s*(mm|cm|m|pulg|pulgadas|")/gi,      // 10mm, 10.5 mm
      /(\d+)\s*\/\s*(\d+)\s*(mm|cm|m|pulg|pulgadas|")/gi, // 1/2", 1/2 pulg
      /(\d+[.,]?\d*)\s*(kg|g|kgrs|gr|l|lt|litros?|ml)/gi, // 1kg, 1.5 litros
      /(\d+[.,]?\d*)\s*(kgrs)/gi,                         // 1kgrs
      /(\d+[.,]?\d*)\s*(grs)/gi                           // 500grs
    ];
    
    // Buscar todas las coincidencias usando los patrones
    let measures = [];
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        measures = measures.concat(matches);
      }
    });
    
    // Normalizar las medidas encontradas
    return [...new Set(measures)].map(m => normalizeMeasurement(m));
  }
  
  /**
   * Tokeniza un texto en palabras significativas para búsqueda
   * 
   * @param {string} text - Texto a tokenizar
   * @param {number} minLength - Longitud mínima de los tokens (default: 3)
   * @returns {string[]} - Array de tokens
   */
  export function tokenize(text, minLength = 3) {
    if (!text || typeof text !== 'string') return [];
    
    const normalized = normalizeText(text);
    
    // Dividir en palabras y filtrar por longitud mínima
    return normalized
      .split(/\s+/)
      .filter(token => token.length >= minLength);
  }
  
  /**
   * Genera n-gramas a partir de un texto
   * 
   * @param {string} text - Texto del que generar n-gramas
   * @param {number} size - Tamaño de los n-gramas (default: 3)
   * @returns {string[]} - Array de n-gramas
   */
  export function generateNgrams(text, size = 3) {
    if (!text || typeof text !== 'string' || text.length < size) return [];
    
    const normalized = normalizeText(text);
    const ngrams = [];
    
    for (let i = 0; i <= normalized.length - size; i++) {
      ngrams.push(normalized.substring(i, i + size));
    }
    
    return ngrams;
  }
  
  /**
   * Normaliza una categoría para búsqueda
   * 
   * @param {string} category - Categoría a normalizar
   * @returns {string} - Categoría normalizada
   */
  export function normalizeCategory(category) {
    if (!category || typeof category !== 'string') return '';
    
    // Normalizar texto base
    const normalized = normalizeText(category);
    
    // Reemplazar caracteres específicos de categorías
    return normalized
      .replace(/[.\-_/\\]/g, ' ')  // Convertir separadores en espacios
      .replace(/\s+/g, '_');       // Convertir espacios en guiones bajos
  }