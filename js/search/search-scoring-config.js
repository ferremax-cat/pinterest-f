/**
 * Configuración del sistema de relevancia y puntuación para búsqueda
 * Ajustado específicamente para un catálogo de ferretería
 */

const SCORING_CONFIG = {
    // Pesos base por tipo de coincidencia
    FIELD_WEIGHTS: {
      // Coincidencia exacta de código de producto (ej: PERFA0192)
      EXACT_CODE: 100,
      
      // Coincidencia parcial de código (ej: PERFA)
      PARTIAL_CODE: 60,
      
      // Coincidencia de texto en nombre de producto
      NAME: 50,
      
      // Coincidencia en categoría
      CATEGORY: 30,
      
      // Coincidencia en medidas específicas (ej: 10mm, 1/2")
      MEASUREMENT: 80,
      
      // Coincidencia en marca
      BRAND: 40,
      
      // Coincidencia aproximada (fuzzy)
      FUZZY: 10
    },
    
    // Multiplicadores para características específicas de la búsqueda
    MULTIPLIERS: {
      // Coincidencia exacta de palabra completa vs. parcial
      EXACT_WORD: 1.5,
      
      // Coincidencia al inicio de un campo
      START_OF_FIELD: 1.3,
      
      // Coincidencia de múltiples términos de búsqueda
      MULTIPLE_TERMS: 1.2,
      
      // Coincidencia en producto destacado o popular
      FEATURED_PRODUCT: 1.4,
      
      // Coincidencia en términos específicos de ferretería (tornillo, tuerca, etc.)
      HARDWARE_TERM: 1.2,
      
      // Penalización por productos descontinuados o de baja disponibilidad
      DISCONTINUED: 0.5
    },
    
    // Términos de ferretería que reciben tratamiento especial
    HARDWARE_TERMS: [
      'tornillo', 'tuerca', 'clavo', 'abrazadera', 'perno', 'taladro',
      'martillo', 'sierra', 'pinza', 'llave', 'destornillador', 'broca',
      'alicate', 'clavija', 'arandela', 'codo', 'conector', 'manguera',
      'grifo', 'válvula', 'bisagra', 'cerradura', 'manija', 'tubo',
      'cable', 'cinta', 'silicona', 'pegamento', 'sellador'
    ],
    
    // Patrones de medidas comunes en ferretería
    MEASUREMENT_PATTERNS: [
      /(\d+)mm/i,          // 10mm
      /(\d+)cm/i,          // 20cm
      /(\d+)m/i,           // 3m
      /(\d+)x(\d+)/i,      // 10x20
      /(\d+)\/(\d+)["']/i, // 1/2"
      /(\d+)["']/i,        // 3"
      /(\d+)kg/i,          // 5kg
      /(\d+)g/i,           // 250g
      /(\d+)l/i,           // 1l
      /(\d+)w/i,           // 60w
      /(\d+)v/i            // 220v
    ],
    
    // Configuración de procesamiento de consulta
    QUERY_PROCESSING: {
      // Número mínimo de caracteres para búsqueda
      MIN_QUERY_LENGTH: 2,
      
      // Número mínimo de caracteres para búsqueda fuzzy
      MIN_FUZZY_LENGTH: 4,
      
      // Umbral para incluir resultados fuzzy (0-1)
      FUZZY_THRESHOLD: 0.4,
      
      // Número máximo de tokens a considerar
      MAX_TOKENS: 6,
      
      // Stopwords específicas del dominio de ferretería a ignorar
      STOPWORDS: [
        'de', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'en', 'y',
        'a', 'al', 'del', 'un', 'una', 'unos', 'unas'
      ]
    }
  };
  
  // Exportar la configuración
  export default SCORING_CONFIG;