/**
 * Script para optimizar el índice de búsqueda con técnicas avanzadas de compresión
 * Implementa transformación de objetos a arrays para máxima eficiencia
 * 
 * Uso: node optimize-search-index-advanced.js
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks'); // Añadido para compatibilidad

// Configuración
const CONFIG = {
  // Ruta al índice de búsqueda generado previamente
  indexPath: path.join(__dirname, '../../json/search/search_index.json'),
  
  // Directorio para guardar los índices optimizados
  outputDir: path.join(__dirname, '../../json/search/optimized/'),
  
  // Configuración de compresión
  compression: {
    // Si un token aparece en más de este porcentaje de productos, es demasiado común
    maxTokenFrequency: 0.25,
    
    // No indexar tokens con frecuencia muy alta (son poco útiles para búsqueda)
    skipHighFrequencyTokens: true,
    
    // Límite de productos por token/ngrama
    maxProductsPerToken: 200,
    
    // Usar mapeo avanzado de arrays para todos los índices
    useArrayMapping: true,
    
    // Comprimir arrays de un solo elemento a valores directos
    compressUniqueValues: true
  },
  
  // Configuración de fragmentación
  fragmentation: {
    // Modo de fragmentación: 'alphabet', 'category' o 'none'
    mode: 'alphabet',
    
    // Fragmentos alfabéticos (para modo 'alphabet')
    alphabetFragments: [
      { name: 'A-F', start: 'A', end: 'F' },
      { name: 'G-M', start: 'G', end: 'M' },
      { name: 'N-S', start: 'N', end: 'S' },
      { name: 'T-Z', start: 'T', end: 'Z' }
    ],
    
    // Categorías principales (para modo 'category')
    categoryFragments: [
      'herramientas',
      'sujetadores',
      'electricos',
      'plomeria',
      'construccion',
      'otros'
    ]
  },
  
  // Lista de "stopwords" a excluir por ser muy comunes y poco útiles para búsqueda
  stopwords: [
    'de', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'sin', 'sobre',
    'del', 'al', 'una', 'uno', 'unos', 'unas'
  ]
};

/**
 * Función principal para optimizar el índice
 */
async function optimizeIndex() {
  console.log('Iniciando optimización avanzada del índice de búsqueda...');
  console.time('Tiempo total de optimización');
  
  try {
    // 1. Cargar el índice original
    console.log(`Cargando índice desde: ${CONFIG.indexPath}`);
    const indexData = fs.readFileSync(CONFIG.indexPath, 'utf8');
    const originalIndex = JSON.parse(indexData);
    
    // Calcular tamaño original
    const originalSize = Buffer.byteLength(indexData, 'utf8');
    console.log(`Tamaño original del índice: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    // 2. Aplicar indexado selectivo para reducir tamaño
    console.log('Aplicando indexado selectivo...');
    const selectiveIndex = applySelectiveIndexing(originalIndex);
    
    // 3. Aplicar compresión avanzada
    console.log('Aplicando compresión avanzada (objetos a arrays)...');
    const compressedIndex = compressIndexAdvanced(selectiveIndex);
    
    // 4. Fragmentar el índice según configuración
    console.log(`Fragmentando índice en modo: ${CONFIG.fragmentation.mode}...`);
    const fragments = fragmentIndex(compressedIndex);
    
    // 5. Crear el directorio de salida si no existe
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    
    // 6. Guardar los fragmentos de índice y el índice maestro
    console.log('Guardando índices optimizados...');
    saveFragments(fragments);
    
    console.timeEnd('Tiempo total de optimización');
    
    // 7. Mostrar estadísticas de optimización
    const masterPath = path.join(CONFIG.outputDir, 'master_index.json');
    const masterData = fs.readFileSync(masterPath, 'utf8');
    const masterSize = Buffer.byteLength(masterData, 'utf8');
    
    let totalFragmentsSize = masterSize;
    const fragmentSizes = {};
    
    // Calcular tamaño total de fragmentos
    fragments.forEach(fragment => {
      if (fragment.file) {
        const fragmentPath = path.join(CONFIG.outputDir, fragment.file);
        const fragmentData = fs.readFileSync(fragmentPath, 'utf8');
        const fragmentSize = Buffer.byteLength(fragmentData, 'utf8');
        fragmentSizes[fragment.file] = (fragmentSize / 1024).toFixed(2) + ' KB';
        totalFragmentsSize += fragmentSize;
      }
    });
    
    // Mostrar resumen de optimización
    console.log('\n========= RESUMEN DE OPTIMIZACIÓN =========');
    console.log(`Tamaño original: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Tamaño después de optimización: ${(totalFragmentsSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Reducción: ${(100 - (totalFragmentsSize / originalSize * 100)).toFixed(2)}%`);
    console.log('\nFragmentos generados:');
    fragments.forEach(fragment => {
      if (fragment.file) {
        console.log(`- ${fragment.file}: ${fragmentSizes[fragment.file]}`);
      }
    });
    console.log(`- master_index.json: ${(masterSize / 1024).toFixed(2)} KB`);
    console.log('\nOptimización avanzada completada con éxito!');
    
    return {
      success: true,
      originalSize,
      optimizedSize: totalFragmentsSize,
      fragments: fragments.length
    };
  } catch (error) {
    console.error('Error optimizando índice:', error);
    console.timeEnd('Tiempo total de optimización');
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Aplica indexado selectivo para reducir tamaño
 */
function applySelectiveIndexing(index) {
  // Crear copia profunda para no modificar el original
  const optimizedIndex = JSON.parse(JSON.stringify(index));
  
  // Calcular frecuencia de cada token y n-grama
  const totalProducts = optimizedIndex.metadata.totalProducts;
  const tokenFrequencies = {};
  const tokensToRemove = [];
  
  // 1. Identificar tokens demasiado comunes (poco útiles para búsqueda)
  Object.entries(optimizedIndex.indexes.tokens).forEach(([token, products]) => {
    const count = Array.isArray(products) ? products.length : 1;
    const frequency = count / totalProducts;
    tokenFrequencies[token] = frequency;
    
    // Si es una stopword o tiene frecuencia muy alta, marcar para eliminar
    if (CONFIG.stopwords.includes(token) || 
        (CONFIG.compression.skipHighFrequencyTokens && 
         frequency > CONFIG.compression.maxTokenFrequency)) {
      tokensToRemove.push(token);
    }
  });
  
  // Eliminar tokens muy comunes
  tokensToRemove.forEach(token => {
    delete optimizedIndex.indexes.tokens[token];
  });
  
  console.log(`Eliminados ${tokensToRemove.length} tokens por ser demasiado comunes`);
  
  // 2. Limitar el número de productos por token/n-grama
  Object.keys(optimizedIndex.indexes.tokens).forEach(token => {
    const products = optimizedIndex.indexes.tokens[token];
    if (Array.isArray(products) && products.length > CONFIG.compression.maxProductsPerToken) {
      // Limitar a los primeros N productos (podría usar una estrategia más sofisticada)
      optimizedIndex.indexes.tokens[token] = products.slice(0, CONFIG.compression.maxProductsPerToken);
      console.log(`Token "${token}" limitado de ${products.length} a ${CONFIG.compression.maxProductsPerToken} productos`);
    }
  });
  
  // Hacer lo mismo para n-gramas
  if (optimizedIndex.indexes.ngrams) {
    Object.keys(optimizedIndex.indexes.ngrams).forEach(ngram => {
      const products = optimizedIndex.indexes.ngrams[ngram];
      if (Array.isArray(products) && products.length > CONFIG.compression.maxProductsPerToken) {
        optimizedIndex.indexes.ngrams[ngram] = products.slice(0, CONFIG.compression.maxProductsPerToken);
      }
    });
  }
  
  return optimizedIndex;
}

/**
 * Comprime el índice con técnicas avanzadas convirtiendo objetos en arrays
 */
function compressIndexAdvanced(index) {
  // Crear una nueva estructura para el índice comprimido
  const compressedIndex = {
    version: index.version,
    metadata: {
      ...index.metadata,
      compressionType: 'arrayMapping',
      compressionVersion: '1.0'
    },
    // Esta propiedad contendrá los mapeos de índices a valores
    maps: {},
    // Esta propiedad contendrá los índices comprimidos
    indexes: {},
    // NUEVO: Incluir el codeMap
    codeMap: index.codeMap || {}
  };
  
  // Función que toma un objeto indexado y lo convierte a estructura comprimida
  function compressSection(section, sectionName) {
    // Si la sección no existe, saltar
    if (!index.indexes[sectionName]) return;
    
    // 1. Crear mapas para claves y valores
    const keyMap = [];
    const valueMap = new Set();
    
    // Recolectar todas las claves
    Object.keys(index.indexes[sectionName]).forEach(key => {
      keyMap.push(key);
      
      // Recolectar todos los valores (productos)
      const values = index.indexes[sectionName][key];
      if (Array.isArray(values)) {
        values.forEach(value => valueMap.add(value));
      } else {
        valueMap.add(values);
      }
    });
    
    // Convertir Set a Array
    const valueArray = Array.from(valueMap);
    
    // 2. Crear índice comprimido
    const compressedData = [];
    
    keyMap.forEach(key => {
      const values = index.indexes[sectionName][key];
      
      // Convertir valores a índices
      if (Array.isArray(values)) {
        const valueIndices = values.map(value => valueArray.indexOf(value));
        compressedData.push(valueIndices);
      } else {
        compressedData.push(valueArray.indexOf(values));
      }
    });
    
    // 3. Almacenar mapas y datos comprimidos
    compressedIndex.maps[sectionName] = {
      keys: keyMap,
      values: valueArray
    };
    
    compressedIndex.indexes[sectionName] = compressedData;
    
    // Estadísticas
    console.log(`Sección ${sectionName} comprimida: ${keyMap.length} claves, ${valueArray.length} valores únicos`);
  }
  
  // Comprimir cada sección del índice
  Object.keys(index.indexes).forEach(sectionName => {
    compressSection(index.indexes[sectionName], sectionName);
  });
  
  return compressedIndex;
}

/**
 * Fragmenta el índice según la configuración
 * Adaptado para trabajar con la estructura comprimida
 */
function fragmentIndex(index) {
  // Si la fragmentación está desactivada, devolver índice completo
  if (CONFIG.fragmentation.mode === 'none') {
    return [{
      full: true,
      file: 'full_index.json',
      data: index
    }];
  }
  
  // Dependiendo del modo, fragmentar de manera diferente
  if (CONFIG.fragmentation.mode === 'alphabet') {
    return fragmentByAlphabet(index);
  } else if (CONFIG.fragmentation.mode === 'category') {
    return fragmentByCategory(index);
  }
  
  // Si llegamos aquí, usar fragmentación alfabética por defecto
  return fragmentByAlphabet(index);
}

/**
 * Fragmenta el índice por rangos alfabéticos
 * Adaptado para trabajar con la estructura comprimida
 */
function fragmentByAlphabet(index) {
  const fragments = [];
  const alphabetFragments = CONFIG.fragmentation.alphabetFragments;
  
  // Extraer los mapas de valores (productos)
  const productsMap = index.maps.exact.values;
  
  // Crear fragmentos vacíos con la misma estructura base
  const fragmentBases = alphabetFragments.map(fragment => {
    return {
      name: fragment.name,
      start: fragment.start,
      end: fragment.end,
      file: `index_${fragment.name.toLowerCase().replace('-', '_')}.json`,
      data: {
        version: index.version,
        metadata: {
          ...index.metadata,
          fragment: fragment.name,
          fragmentType: 'alphabet'
        },
        maps: {},
        indexes: {}
      },
      // Para tracking temporal durante el procesamiento
      productIndices: new Set()
    };
  });


  // Distribuir codeMap entre fragmentos
  if (index.codeMap) {
    fragmentBases.forEach(fragment => {
      fragment.data.codeMap = {};
    });
    
    // Distribuir entradas de codeMap según el fragmento correspondiente
    Object.entries(index.codeMap).forEach(([normalizedCode, originalCode]) => {
      const fragment = getFragmentForProduct(normalizedCode);
      if (fragment) {
        fragment.data.codeMap[normalizedCode] = originalCode;
      }
    });
  }




  
  // Función para determinar a qué fragmento pertenece un producto
  function getFragmentForProduct(productCode) {
    if (!productCode || typeof productCode !== 'string' || productCode.length === 0) {
      return null;
    }
    
    const firstChar = productCode.charAt(0).toUpperCase();
    
    for (const fragment of fragmentBases) {
      if (firstChar >= fragment.start && firstChar <= fragment.end) {
        return fragment;
      }
    }
    
    // Si no corresponde a ningún fragmento, usar el último
    return fragmentBases[fragmentBases.length - 1];
  }
  
  // 1. Distribuir productos en fragmentos según su código
  productsMap.forEach((productCode, productIndex) => {
    const fragment = getFragmentForProduct(productCode);
    if (fragment) {
      fragment.productIndices.add(productIndex);
    }
  });
  
  // Para cada tipo de índice, distribuir las entradas en los fragmentos apropiados
  Object.keys(index.maps).forEach(indexType => {
    // Por cada fragmento
    fragmentBases.forEach(fragment => {
      // Crear mapas para este tipo de índice en este fragmento
      fragment.data.maps[indexType] = {
        keys: [],
        values: []
      };
      
      // Para mapas de valores, solo incluir productos relevantes para este fragmento
      if (indexType === 'exact') {
        // Para exact, los valores son los mismos códigos
        fragment.data.maps[indexType].values = Array.from(fragment.productIndices).map(idx => productsMap[idx]);
      } else {
        // Para otros índices, filtrar valores según los productos de este fragmento
        const relevantProducts = new Set(Array.from(fragment.productIndices).map(idx => productsMap[idx]));
        fragment.data.maps[indexType].values = Array.from(relevantProducts);
      }
      
      // Crear índice para este tipo en este fragmento
      fragment.data.indexes[indexType] = [];
    });
    
    // Procesar cada entrada del índice
    index.maps[indexType].keys.forEach((key, keyIndex) => {
      const valueEntry = index.indexes[indexType][keyIndex];
      
      // Para cada fragmento, determinar si esta entrada es relevante
      fragmentBases.forEach(fragment => {
        let relevantValues;
        
        if (Array.isArray(valueEntry)) {
          // Si es un array de índices, filtrar los relevantes para este fragmento
          relevantValues = valueEntry.filter(valIdx => fragment.productIndices.has(valIdx));
        } else {
          // Si es un único índice, verificar si es relevante para este fragmento
          relevantValues = fragment.productIndices.has(valueEntry) ? [valueEntry] : [];
        }
        
        // Si hay valores relevantes para este fragmento, añadir la entrada
        if (relevantValues.length > 0) {
          // Añadir la clave
          const keyIdx = fragment.data.maps[indexType].keys.push(key) - 1;
          
          // Convertir índices de productos globales a índices locales del fragmento
          if (relevantValues.length === 1) {
            // Si solo hay un valor, guardar como número
            const globalValIdx = relevantValues[0];
            const productCode = productsMap[globalValIdx];
            const localValIdx = fragment.data.maps[indexType].values.indexOf(productCode);
            fragment.data.indexes[indexType].push(localValIdx);
          } else {
            // Si hay múltiples valores, guardar como array
            const localValIndices = relevantValues.map(globalValIdx => {
              const productCode = productsMap[globalValIdx];
              return fragment.data.maps[indexType].values.indexOf(productCode);
            });
            fragment.data.indexes[indexType].push(localValIndices);
          }
        }
      });
    });
  });
  
  // Limpieza: eliminar propiedades temporales
  fragmentBases.forEach(fragment => {
    delete fragment.productIndices;
  });
  
  // Crear índice maestro con metadatos y referencias a fragmentos
  const masterIndex = {
    version: index.version,
    metadata: {
      ...index.metadata,
      fragmented: true,
      fragmentationType: 'alphabet',
      compressionType: 'arrayMapping',
      hasCodeMap: !!index.codeMap // NUEVO: Indicador de codeMap
    },
    fragments: fragmentBases.map(fragment => ({
      name: fragment.name,
      file: fragment.file,
      start: fragment.start,
      end: fragment.end
    }))
  };
  
  // Añadir fragmentos y el índice maestro
  fragments.push(...fragmentBases);
  fragments.push({
    master: true,
    file: 'master_index.json',
    data: masterIndex
  });
  
  return fragments;
}

/**
 * Fragmenta el índice por categorías principales
 * Esta implementación es simplificada y requiere adaptación para la estructura comprimida
 */
function fragmentByCategory(index) {
  // NOTA: Esta función requeriría una implementación personalizada para
  // trabajar con la estructura comprimida. Se omite en esta versión.
  console.warn('Fragmentación por categoría no disponible para estructura comprimida');
  
  return fragmentByAlphabet(index);
}

/**
 * Guarda los fragmentos de índice generados
 */
function saveFragments(fragments) {
  fragments.forEach(fragment => {
    if (fragment.file) {
      const filePath = path.join(CONFIG.outputDir, fragment.file);
      const jsonData = JSON.stringify(fragment.data);
      fs.writeFileSync(filePath, jsonData);
      
      console.log(`Fragmento guardado: ${filePath}`);
    }
  });
}

// Ejecutar la optimización si este script se ejecuta directamente
if (require.main === module) {
  optimizeIndex()
    .then(result => {
      if (result.success) {
        console.log('Proceso de optimización avanzada completado exitosamente.');
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

// Exportar funciones
module.exports = {
  optimizeIndex,
  compressIndexAdvanced,
  applySelectiveIndexing,
  fragmentIndex
};