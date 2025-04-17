/**
 * Script para optimizar el índice de búsqueda
 * Aplica técnicas de compresión, indexado selectivo y fragmentación
 * 
 * Uso: node optimize-search-index.js
 */

const fs = require('fs');
const path = require('path');

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
    
    // Usar mapeo de arrays para tokens con muchas referencias
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
  console.log('Iniciando optimización del índice de búsqueda...');
  console.time('Tiempo total de optimización');
  
  try {
    // 1. Cargar el índice original
    console.log(`Cargando índice desde: ${CONFIG.indexPath}`);
    const indexData = fs.readFileSync(CONFIG.indexPath, 'utf8');
    const originalIndex = JSON.parse(indexData);
    
    // Calcular tamaño original
    const originalSize = Buffer.byteLength(indexData, 'utf8');
    console.log(`Tamaño original del índice: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);
    
    // 2. Aplicar compresiones y optimizaciones
    console.log('Aplicando técnicas de compresión...');
    const compressedIndex = compressIndex(originalIndex);
    
    // 3. Aplicar indexado selectivo para reducir tamaño
    console.log('Aplicando indexado selectivo...');
    const selectiveIndex = applySelectiveIndexing(compressedIndex);
    
    // 4. Fragmentar el índice según configuración
    console.log(`Fragmentando índice en modo: ${CONFIG.fragmentation.mode}...`);
    const fragments = fragmentIndex(selectiveIndex);
    
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
    console.log('\nOptimización completada con éxito!');
    
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
 * Comprime el índice aplicando varias técnicas
 */
function compressIndex(originalIndex) {
  const index = JSON.parse(JSON.stringify(originalIndex)); // Copia profunda
  
  // 1. Comprimir arrays de longitud 1 a valores directos
  if (CONFIG.compression.compressUniqueValues) {
    Object.keys(index.indexes).forEach(indexType => {
      Object.keys(index.indexes[indexType]).forEach(key => {
        const value = index.indexes[indexType][key];
        if (Array.isArray(value) && value.length === 1) {
          index.indexes[indexType][key] = value[0];
        }
      });
    });
  }
  
  // 2. Usar mapeo de arrays para índices grandes (tokens y ngrams)
  if (CONFIG.compression.useArrayMapping) {
    // Determinar si el índice de tokens es lo suficientemente grande para justificar compresión
    const tokenCount = Object.keys(index.indexes.tokens).length;
    
    if (tokenCount > 1000) {
      // Crear mapa de tokens y productos para compresión
      const tokenMap = Object.keys(index.indexes.tokens);
      const productSet = new Set();
      
      // Recopilar todos los productos referenciados en tokens
      Object.values(index.indexes.tokens).forEach(products => {
        if (Array.isArray(products)) {
          products.forEach(p => productSet.add(p));
        } else {
          productSet.add(products);
        }
      });
      
      const productMap = Array.from(productSet);
      
      // Convertir índice a formato comprimido
      const compressedTokens = {};
      
      tokenMap.forEach((token, tokenIndex) => {
        const products = index.indexes.tokens[token];
        if (Array.isArray(products)) {
          compressedTokens[tokenIndex] = products.map(p => productMap.indexOf(p));
        } else {
          compressedTokens[tokenIndex] = productMap.indexOf(products);
        }
      });
      
      // Añadir índice comprimido a la estructura
      index.compressed = {
        tokenMap,
        productMap,
        tokens: compressedTokens
      };
      
      // Nota: No eliminamos el índice original ya que esto
      // requeriría modificar también la lógica de búsqueda
      console.log(`Índice de tokens comprimido: ${tokenCount} tokens mapeados`);
    }
  }
  
  return index;
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
  Object.keys(optimizedIndex.indexes.ngrams).forEach(ngram => {
    const products = optimizedIndex.indexes.ngrams[ngram];
    if (Array.isArray(products) && products.length > CONFIG.compression.maxProductsPerToken) {
      optimizedIndex.indexes.ngrams[ngram] = products.slice(0, CONFIG.compression.maxProductsPerToken);
    }
  });
  
  return optimizedIndex;
}

/**
 * Fragmenta el índice según la configuración
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
 */
function fragmentByAlphabet(index) {
  const fragments = [];
  const alphabetFragments = CONFIG.fragmentation.alphabetFragments;
  
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
        indexes: {
          exact: {},
          prefix: {},
          tokens: {},
          category: {},
          size: {},
          ngrams: {},
          variants: {}
        }
      }
    };
  });
  
  // Función para determinar a qué fragmento pertenece un código
  function getFragmentForCode(code) {
    if (!code || typeof code !== 'string' || code.length === 0) {
      return null;
    }
    
    const firstChar = code.charAt(0).toUpperCase();
    
    for (const fragment of fragmentBases) {
      if (firstChar >= fragment.start && firstChar <= fragment.end) {
        return fragment;
      }
    }
    
    // Si no corresponde a ningún fragmento, usar el último
    return fragmentBases[fragmentBases.length - 1];
  }
  
  // Distribuir los productos en los fragmentos apropiados
  Object.keys(index.indexes.exact).forEach(code => {
    const fragment = getFragmentForCode(code);
    if (fragment) {
      fragment.data.indexes.exact[code] = index.indexes.exact[code];
    }
  });
  
  // Distribuir prefijos según el fragmento al que pertenecen
  Object.keys(index.indexes.prefix).forEach(prefix => {
    const fragment = getFragmentForCode(prefix);
    if (fragment) {
      fragment.data.indexes.prefix[prefix] = index.indexes.prefix[prefix];
    }
  });
  
  // Para tokens, ngrams, etc. necesitamos examinar los productos referenciados
  // y distribuirlos entre fragmentos
  
  // Procesar tokens
  Object.keys(index.indexes.tokens).forEach(token => {
    const products = index.indexes.tokens[token];
    
    // Mapear productos a fragmentos
    const fragmentProducts = {};
    fragmentBases.forEach(fragment => {
      fragmentProducts[fragment.name] = [];
    });
    
    // Distribuir productos en los fragmentos correspondientes
    if (Array.isArray(products)) {
      products.forEach(product => {
        const fragment = getFragmentForCode(product);
        if (fragment) {
          fragmentProducts[fragment.name].push(product);
        }
      });
    } else {
      // Un solo producto
      const fragment = getFragmentForCode(products);
      if (fragment) {
        fragmentProducts[fragment.name].push(products);
      }
    }
    
    // Añadir el token a cada fragmento que tenga productos
    fragmentBases.forEach(fragment => {
      if (fragmentProducts[fragment.name].length > 0) {
        // Si solo hay un producto, usar valor directo en lugar de array
        if (fragmentProducts[fragment.name].length === 1) {
          fragment.data.indexes.tokens[token] = fragmentProducts[fragment.name][0];
        } else {
          fragment.data.indexes.tokens[token] = fragmentProducts[fragment.name];
        }
      }
    });
  });
  
  // Usar el mismo enfoque para ngrams
  Object.keys(index.indexes.ngrams).forEach(ngram => {
    const products = index.indexes.ngrams[ngram];
    
    // Mapear productos a fragmentos
    const fragmentProducts = {};
    fragmentBases.forEach(fragment => {
      fragmentProducts[fragment.name] = [];
    });
    
    // Distribuir productos
    if (Array.isArray(products)) {
      products.forEach(product => {
        const fragment = getFragmentForCode(product);
        if (fragment) {
          fragmentProducts[fragment.name].push(product);
        }
      });
    } else {
      // Un solo producto
      const fragment = getFragmentForCode(products);
      if (fragment) {
        fragmentProducts[fragment.name].push(products);
      }
    }
    
    // Añadir el ngram a cada fragmento que tenga productos
    fragmentBases.forEach(fragment => {
      if (fragmentProducts[fragment.name].length > 0) {
        if (fragmentProducts[fragment.name].length === 1) {
          fragment.data.indexes.ngrams[ngram] = fragmentProducts[fragment.name][0];
        } else {
          fragment.data.indexes.ngrams[ngram] = fragmentProducts[fragment.name];
        }
      }
    });
  });
  
  // Hacer lo mismo para size, category, variants, etc.
  // Procesar índice size
  Object.keys(index.indexes.size).forEach(size => {
    const products = index.indexes.size[size];
    
    const fragmentProducts = {};
    fragmentBases.forEach(fragment => {
      fragmentProducts[fragment.name] = [];
    });
    
    if (Array.isArray(products)) {
      products.forEach(product => {
        const fragment = getFragmentForCode(product);
        if (fragment) {
          fragmentProducts[fragment.name].push(product);
        }
      });
    } else {
      const fragment = getFragmentForCode(products);
      if (fragment) {
        fragmentProducts[fragment.name].push(products);
      }
    }
    
    fragmentBases.forEach(fragment => {
      if (fragmentProducts[fragment.name].length > 0) {
        if (fragmentProducts[fragment.name].length === 1) {
          fragment.data.indexes.size[size] = fragmentProducts[fragment.name][0];
        } else {
          fragment.data.indexes.size[size] = fragmentProducts[fragment.name];
        }
      }
    });
  });
  
  // Procesar índice category
  Object.keys(index.indexes.category).forEach(category => {
    const products = index.indexes.category[category];
    
    const fragmentProducts = {};
    fragmentBases.forEach(fragment => {
      fragmentProducts[fragment.name] = [];
    });
    
    if (Array.isArray(products)) {
      products.forEach(product => {
        const fragment = getFragmentForCode(product);
        if (fragment) {
          fragmentProducts[fragment.name].push(product);
        }
      });
    } else {
      const fragment = getFragmentForCode(products);
      if (fragment) {
        fragmentProducts[fragment.name].push(products);
      }
    }
    
    fragmentBases.forEach(fragment => {
      if (fragmentProducts[fragment.name].length > 0) {
        if (fragmentProducts[fragment.name].length === 1) {
          fragment.data.indexes.category[category] = fragmentProducts[fragment.name][0];
        } else {
          fragment.data.indexes.category[category] = fragmentProducts[fragment.name];
        }
      }
    });
  });
  
  // Procesar índice variants si existe
  if (index.indexes.variants) {
    Object.keys(index.indexes.variants).forEach(variant => {
      const products = index.indexes.variants[variant];
      
      const fragmentProducts = {};
      fragmentBases.forEach(fragment => {
        fragmentProducts[fragment.name] = [];
      });
      
      if (Array.isArray(products)) {
        products.forEach(product => {
          const fragment = getFragmentForCode(product);
          if (fragment) {
            fragmentProducts[fragment.name].push(product);
          }
        });
      } else {
        const fragment = getFragmentForCode(products);
        if (fragment) {
          fragmentProducts[fragment.name].push(products);
        }
      }
      
      fragmentBases.forEach(fragment => {
        if (fragmentProducts[fragment.name].length > 0) {
          if (fragmentProducts[fragment.name].length === 1) {
            fragment.data.indexes.variants[variant] = fragmentProducts[fragment.name][0];
          } else {
            fragment.data.indexes.variants[variant] = fragmentProducts[fragment.name];
          }
        }
      });
    });
  }
  
  // Crear índice maestro con metadatos y referencias a fragmentos
  const masterIndex = {
    version: index.version,
    metadata: {
      ...index.metadata,
      fragmented: true,
      fragmentationType: 'alphabet'
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
 */
function fragmentByCategory(index) {
  const fragments = [];
  const categoryMappings = {};
  
  // Definir mapeo de categorías a fragmentos
  CONFIG.fragmentation.categoryFragments.forEach(category => {
    categoryMappings[category] = {
      name: category,
      file: `index_${category.toLowerCase()}.json`,
      data: {
        version: index.version,
        metadata: {
          ...index.metadata,
          fragment: category,
          fragmentType: 'category'
        },
        indexes: {
          exact: {},
          prefix: {},
          tokens: {},
          category: {},
          size: {},
          ngrams: {},
          variants: {}
        }
      }
    };
  });
  
  // Añadir fragmento "otros" para categorías no mapeadas
  categoryMappings.otros = {
    name: 'otros',
    file: 'index_otros.json',
    data: {
      version: index.version,
      metadata: {
        ...index.metadata,
        fragment: 'otros',
        fragmentType: 'category'
      },
      indexes: {
        exact: {},
        prefix: {},
        tokens: {},
        category: {},
        size: {},
        ngrams: {},
        variants: {}
      }
    }
  };
  
  // Crear mapeo de productos a categorías primero
  const productCategoryMap = {};
  
  // Esta función requiere información adicional del catálogo original
  // que podría no estar disponible en el índice
  // Implementación simplificada: asignar productos a "otros"
  Object.keys(index.indexes.exact).forEach(code => {
    productCategoryMap[code] = 'otros';
  });
  
  // Aquí necesitaríamos información adicional para mapear productos a categorías
  // Para una implementación real, podríamos cargar el catálogo original
  
  // Distribuir productos en fragmentos basados en sus categorías
  // (implementación simplificada)
  Object.keys(index.indexes.exact).forEach(code => {
    const category = productCategoryMap[code] || 'otros';
    const fragment = categoryMappings[category] || categoryMappings.otros;
    
    fragment.data.indexes.exact[code] = index.indexes.exact[code];
  });
  
  // Para una implementación completa, necesitaríamos procesar todos los índices
  // similarmente a como se hizo en fragmentByAlphabet
  
  // Crear índice maestro
  const masterIndex = {
    version: index.version,
    metadata: {
      ...index.metadata,
      fragmented: true,
      fragmentationType: 'category'
    },
    fragments: Object.values(categoryMappings).map(fragment => ({
      name: fragment.name,
      file: fragment.file
    }))
  };
  
  // Añadir fragmentos y el índice maestro
  fragments.push(...Object.values(categoryMappings));
  fragments.push({
    master: true,
    file: 'master_index.json',
    data: masterIndex
  });
  
  return fragments;
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
        console.log('Proceso de optimización completado exitosamente.');
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
  compressIndex,
  applySelectiveIndexing,
  fragmentIndex
};