/**
 * Script mejorado para generar el índice de búsqueda
 * con técnicas avanzadas de normalización
 * 
 * Usa: node generate-search-index-enhanced.js
 */

const fs = require('fs');
const path = require('path');

// Configuración del script
const CONFIG = {
  // Ruta al archivo del catálogo de productos
  catalogPath: path.join(__dirname, '../../json/productos.json'),
  
  // Ruta donde se guardará el índice generado
  outputPath: path.join(__dirname, '../../json/search/search_index.json'),
  
  // Versión del índice (YYYYMMDD-X)
  version: `${new Date().toISOString().split('T')[0]}-1`,
  
  // Rangos de precios para clasificación
  priceRanges: [
    { name: 'menos1000', min: 0, max: 1000 },
    { name: '10005000', min: 1000, max: 5000 },
    { name: 'mas5000', min: 5000, max: Infinity }
  ],
  
  // Abreviaturas comunes para expandir
  abbreviations: {
    'fte': 'fuerte',
    'gde': 'grande',
    'pqño': 'pequeño',
    'med': 'mediano',
    'c/': 'con ',
    's/': 'sin ',
    'autom': 'automatico',
    'nac': 'nacional',
    'imp': 'importado',
    'std': 'estandar',
    'mm': 'milimetros',
    'cm': 'centimetros',
    'kg': 'kilogramos',
    'lt': 'litros',
    'ml': 'mililitros',
    'gr': 'gramos',
    'pulg': 'pulgadas',
    'kgrs': 'kilogramos'
  }
};

/**
 * Normaliza texto general para búsqueda
 */
function normalizeText(text) {
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
 */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  
  return code
    .toUpperCase()                                   // Códigos en mayúsculas
    .replace(/[\s\-_.\/]/g, '')                      // Eliminar espacios, guiones, puntos y barras
    .trim();                                         // Eliminar espacios sobrantes
}

/**
 * Genera variantes de un código para búsqueda
 */
function generateCodeVariants(code) {
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
 */
function normalizeMeasurement(measure) {
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
 */
function generateMeasurementVariants(measure) {
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
 */
function extractMeasurements(text) {
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
 */
function tokenize(text, minLength = 3) {
  if (!text || typeof text !== 'string') return [];
  
  const normalized = normalizeText(text);
  
  // Dividir en palabras y filtrar por longitud mínima
  return normalized
    .split(/\s+/)
    .filter(token => token.length >= minLength);
}

/**
 * Genera n-gramas a partir de un texto
 */
function generateNgrams(text, size = 3) {
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
 */
function normalizeCategory(category) {
  if (!category || typeof category !== 'string') return '';
  
  // Normalizar texto base
  const normalized = normalizeText(category);
  
  // Reemplazar caracteres específicos de categorías
  return normalized
    .replace(/[.\-_/\\]/g, ' ')  // Convertir separadores en espacios
    .replace(/\s+/g, '_');       // Convertir espacios en guiones bajos
}

/**
 * Expande abreviaturas comunes en el texto
 */
function expandAbbreviations(text) {
  if (!text || typeof text !== 'string') return '';
  
  let expanded = normalizeText(text);
  
  // Reemplazar abreviaturas conocidas
  Object.entries(CONFIG.abbreviations).forEach(([abbr, full]) => {
    // Usar límites de palabra para evitar reemplazos parciales
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  });
  
  return expanded;
}

/**
 * Función principal para generar el índice de búsqueda
 */
async function generateSearchIndex() {
  console.log('Iniciando generación del índice de búsqueda mejorado...');
  console.time('Tiempo total');
  
  try {
    // 1. Cargar el catálogo de productos
    console.log(`Cargando catálogo desde: ${CONFIG.catalogPath}`);
    const catalogData = fs.readFileSync(CONFIG.catalogPath, 'utf8');
    const catalog = JSON.parse(catalogData);
    
    const productCount = Object.keys(catalog).length;
    console.log(`Catálogo cargado: ${productCount} productos`);
    
    // 2. Crear estructura base del índice
    const searchIndex = {
      version: CONFIG.version,
      metadata: {
        totalProducts: productCount,
        lastUpdated: new Date().toISOString(),
        generationTime: null, // Se actualizará al final
        enhancedNormalization: true // Marcador para indicar uso de normalización mejorada
      },
      indexes: {
        exact: {},    // Códigos exactos para búsqueda precisa
        prefix: {},   // Búsqueda por prefijos de código (3+ caracteres)
        tokens: {},   // Palabras individuales de nombres/descripciones
        category: {}, // Categorías normalizadas
        size: {},     // Dimensiones extraídas
        ngrams: {},   // Para búsqueda parcial y tolerancia a errores
        variants: {}  // Variantes de códigos y medidas
      }
    };
    
    // 3. Procesar cada producto e indexar
    console.log('Procesando productos con normalización avanzada...');
    let processedCount = 0;
    
    // Recorrer el catálogo aplicando normalizaciones mejoradas
    Object.entries(catalog).forEach(([code, product]) => {
      // Aplicar normalizaciones avanzadas
      const originalCode = code;
      const normalizedCode = normalizeCode(code);
      const codeVariants = generateCodeVariants(code);
      
      const originalName = product.name || '';
      const normalizedName = normalizeText(originalName);
      const expandedName = expandAbbreviations(normalizedName);
      
      const originalCategory = product.category || '';
      const normalizedCategory = normalizeCategory(originalCategory);
      
      const measures = extractMeasurements(originalName);
      const measureVariants = measures.flatMap(m => generateMeasurementVariants(m));
      
      // Indexar el producto con todas las normalizaciones
      indexEnhancedProduct(
        originalCode, normalizedCode, codeVariants,
        originalName, normalizedName, expandedName,
        originalCategory, normalizedCategory,
        measures, measureVariants,
        product, searchIndex
      );
      
      // Mostrar progreso cada 1000 productos
      processedCount++;
      if (processedCount % 1000 === 0) {
        console.log(`Procesados ${processedCount}/${productCount} productos`);
      }
    });
    
    // 4. Optimizar el índice para reducir su tamaño
    console.log('Optimizando índice...');
    optimizeIndex(searchIndex);
    
    // 5. Asegurar que exista el directorio para guardar el índice
    const outputDir = path.dirname(CONFIG.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 6. Guardar el índice generado en un archivo JSON
    console.log(`Guardando índice en: ${CONFIG.outputPath}`);
    const endTime = performance.now();
    searchIndex.metadata.generationTime = `${(endTime / 1000).toFixed(2)}s`;
    
    const jsonOutput = JSON.stringify(searchIndex);
    fs.writeFileSync(CONFIG.outputPath, jsonOutput);
    
    // Calcular estadísticas del índice generado
    const sizeInMB = (jsonOutput.length / (1024 * 1024)).toFixed(2);
    
    console.log(`Índice mejorado generado y guardado (${sizeInMB} MB)`);
    console.log('Estadísticas del índice:');
    console.log(` - Total productos: ${productCount}`);
    console.log(` - Entradas en exact: ${Object.keys(searchIndex.indexes.exact).length}`);
    console.log(` - Entradas en prefix: ${Object.keys(searchIndex.indexes.prefix).length}`);
    console.log(` - Entradas en tokens: ${Object.keys(searchIndex.indexes.tokens).length}`);
    console.log(` - Entradas en category: ${Object.keys(searchIndex.indexes.category).length}`);
    console.log(` - Entradas en size: ${Object.keys(searchIndex.indexes.size).length}`);
    console.log(` - Entradas en ngrams: ${Object.keys(searchIndex.indexes.ngrams).length}`);
    console.log(` - Entradas en variants: ${Object.keys(searchIndex.indexes.variants).length}`);
    
    // Verificar la estructura del índice generado
    console.log('\nEstructura del índice:');
    console.log(Object.keys(searchIndex).join(', '));
    console.log('Subestructura de indexes:', Object.keys(searchIndex.indexes).join(', '));

    // Mostrar algunas entradas de ejemplo para verificar el contenido
    console.log('\nEjemplos de entradas:');
    if (searchIndex.indexes.exact) console.log('- exact ejemplo:', Object.keys(searchIndex.indexes.exact).slice(0, 3));
    if (searchIndex.indexes.tokens) console.log('- tokens ejemplo:', Object.keys(searchIndex.indexes.tokens).slice(0, 3));
    if (searchIndex.indexes.category) console.log('- category ejemplo:', Object.keys(searchIndex.indexes.category).slice(0, 3));
    if (searchIndex.indexes.size) console.log('- size ejemplo:', Object.keys(searchIndex.indexes.size).slice(0, 3));
    if (searchIndex.indexes.ngrams) console.log('- ngrams ejemplo:', Object.keys(searchIndex.indexes.ngrams).slice(0, 3));
    if (searchIndex.indexes.variants) console.log('- variants ejemplo:', Object.keys(searchIndex.indexes.variants).slice(0, 3));
    
    console.timeEnd('Tiempo total');
    
    return {
      success: true,
      path: CONFIG.outputPath,
      size: sizeInMB,
      productCount
    };
  } catch (error) {
    console.error('Error generando índice:', error);
    console.timeEnd('Tiempo total');
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Indexa un producto con normalización avanzada
 */
function indexEnhancedProduct(
  originalCode, normalizedCode, codeVariants,
  originalName, normalizedName, expandedName,
  originalCategory, normalizedCategory,
  measures, measureVariants,
  product, searchIndex
) {
  // 1. INDEXACIÓN EXACTA POR CÓDIGO
  searchIndex.indexes.exact[normalizedCode] = normalizedCode;
  
  // También indexar variantes de código para búsqueda exacta
  codeVariants.forEach(variant => {
    if (variant !== normalizedCode) {
      searchIndex.indexes.exact[variant] = normalizedCode;
    }
  });
  
  // 2. INDEXACIÓN POR PREFIJO DE CÓDIGO
  // Añadir prefijos del código para autocompletado
  for (let i = 1; i <= normalizedCode.length; i++) {
    const prefix = normalizedCode.substring(0, i);
    
    // Solo añadir prefijos de 3+ caracteres para reducir tamaño
    if (prefix.length >= 3) {
      if (!searchIndex.indexes.prefix[prefix]) {
        searchIndex.indexes.prefix[prefix] = [];
      }
      
      if (Array.isArray(searchIndex.indexes.prefix[prefix]) && 
          !searchIndex.indexes.prefix[prefix].includes(normalizedCode)) {
        searchIndex.indexes.prefix[prefix].push(normalizedCode);
      }
    }
  }
  
  // También indexar variantes de código para prefijos
  codeVariants.forEach(variant => {
    if (variant !== normalizedCode && variant.length >= 3) {
      for (let i = 3; i <= variant.length; i++) {
        const prefix = variant.substring(0, i);
        
        if (!searchIndex.indexes.prefix[prefix]) {
          searchIndex.indexes.prefix[prefix] = [];
        }
        
        if (Array.isArray(searchIndex.indexes.prefix[prefix]) && 
            !searchIndex.indexes.prefix[prefix].includes(normalizedCode)) {
          searchIndex.indexes.prefix[prefix].push(normalizedCode);
        }
      }
    }
  });
  
  // 3. INDEXACIÓN POR TOKENS (PALABRAS) DEL NOMBRE
  // Usar tanto el nombre normalizado como el expandido
  const allNameTokens = new Set([
    ...tokenize(normalizedName),
    ...tokenize(expandedName)
  ]);
  
  allNameTokens.forEach(token => {
    if (!searchIndex.indexes.tokens[token]) {
      searchIndex.indexes.tokens[token] = [];
    }
    
    if (!searchIndex.indexes.tokens[token].includes(normalizedCode)) {
      searchIndex.indexes.tokens[token].push(normalizedCode);
    }
  });
  
  // 4. INDEXACIÓN POR CATEGORÍA
  if (originalCategory) {
    // Categoría normalizada principal
    if (!searchIndex.indexes.category[normalizedCategory]) {
      searchIndex.indexes.category[normalizedCategory] = [];
    }
    
    if (!searchIndex.indexes.category[normalizedCategory].includes(normalizedCode)) {
      searchIndex.indexes.category[normalizedCategory].push(normalizedCode);
    }
    
    // También indexar por tokens de la categoría
    const categoryTokens = tokenize(originalCategory);
    
    categoryTokens.forEach(token => {
      if (!searchIndex.indexes.category[token]) {
        searchIndex.indexes.category[token] = [];
      }
      
      if (!searchIndex.indexes.category[token].includes(normalizedCode)) {
        searchIndex.indexes.category[token].push(normalizedCode);
      }
    });
  }
  
  // 5. INDEXACIÓN POR MEDIDAS (TAMAÑOS)
  // Tanto las medidas directas como sus variantes
  const allMeasures = new Set([...measures, ...measureVariants]);
  
  allMeasures.forEach(measure => {
    if (!searchIndex.indexes.size[measure]) {
      searchIndex.indexes.size[measure] = [];
    }
    
    if (!searchIndex.indexes.size[measure].includes(normalizedCode)) {
      searchIndex.indexes.size[measure].push(normalizedCode);
    }
  });
  
  // 6. INDEXACIÓN POR N-GRAMAS (PARA BÚSQUEDA FUZZY)
  // Generar n-gramas del nombre y sus expansiones
  const ngrams = new Set([
    ...generateNgrams(normalizedName, 3),
    ...generateNgrams(expandedName, 3)
  ]);
  
  ngrams.forEach(ngram => {
    if (!searchIndex.indexes.ngrams[ngram]) {
      searchIndex.indexes.ngrams[ngram] = [];
    }
    
    if (!searchIndex.indexes.ngrams[ngram].includes(normalizedCode)) {
      searchIndex.indexes.ngrams[ngram].push(normalizedCode);
    }
  });
  
  // 7. NUEVA SECCIÓN: VARIANTES 
  // Almacenar todas las variantes del código para búsqueda
  codeVariants.forEach(variant => {
    searchIndex.indexes.variants[variant] = normalizedCode;
  });
  
  // Almacenar todas las variantes de medidas para búsqueda
  measureVariants.forEach(variant => {
    if (!searchIndex.indexes.variants[variant]) {
      searchIndex.indexes.variants[variant] = [];
    }
    
    if (!searchIndex.indexes.variants[variant].includes(normalizedCode)) {
      searchIndex.indexes.variants[variant].push(normalizedCode);
    }
  });
}

/**
 * Optimiza el índice para reducir su tamaño
 */
function optimizeIndex(searchIndex) {
  // Recorrer todas las secciones del índice
  Object.keys(searchIndex.indexes).forEach(section => {
    // Recorrer todas las entradas de esta sección
    Object.keys(searchIndex.indexes[section]).forEach(key => {
      const value = searchIndex.indexes[section][key];
      
      // Si es un array con un solo elemento, convertirlo a string directo
      if (Array.isArray(value) && value.length === 1) {
        searchIndex.indexes[section][key] = value[0];
      }
    });
  });
}

// Ejecutar la generación del índice si este script se ejecuta directamente
if (require.main === module) {
  generateSearchIndex()
    .then(result => {
      if (result.success) {
        console.log('Proceso completado exitosamente.');
        process.exit(0);
      } else {
        console.error('El proceso falló:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error crítico:', error);
      process.exit(1);
    });
}

// Exportar funciones para uso en otros scripts
module.exports = {
  generateSearchIndex,
  normalizeText,
  normalizeCode,
  normalizeCategory,
  normalizeMeasurement,
  expandAbbreviations,
  extractMeasurements,
  generateCodeVariants,
  generateMeasurementVariants
};