
// Solución completa con todos los ajustes de estilo requeridos
(function() {
  console.log('Aplicando solución completa con todas las mejoras...');
  
  // 1. Aplicar estilos básicos (con fondo blanco y descripciones multilinea)
  const styleEl = document.createElement('style');
  styleEl.id = 'fix-pinterest-overlap';
  styleEl.textContent = `
    .gallery-container {
      position: relative;
      width: 100%;
      padding: 10px;
      background: white;
    }
    
    .gallery-item {
      position: absolute;
      width: calc(20% - 20px);
      box-sizing: border-box;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
      z-index: 1; /* Base z-index */
    }
    
    .gallery-item.active {
      z-index: 10; /* Mayor z-index para el activo */
    }
    
    .gallery-item .container-img {
      width: 100%;
      overflow: hidden;
      background: white;
    }
    
    /* Corrección del pseudo-elemento ::before */
    .gallery-item .container-img::before,
    .container-img::before,
    div.container-img::before,
    [class*="container-img"]::before {
      background: white !important;
      background-color: white !important;
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      opacity: 0 !important; /* Hacer invisible el elemento */
      border-radius: 15px !important;
      transition: all .3s !important;
    }
    
    .gallery-item .container-img img {
      width: 100%;
      display: block;
      background: white;
    }
    
    .gallery-item .top-row {
      background-color: white;
      padding: 8px;
      padding-left: 5px; /* Nuevo padding-left */
      padding-bottom: 0px; /* Nuevo padding-bottom */
      margin: 5px 0;
      position: relative;
    }
    
    .gallery-item .bottom-row {
      background-color: white;
      padding: 8px;
      margin: 5px 0;
      position: relative;
    }
    
    /* Permitir que el texto ocupe múltiples líneas */
    .gallery-item .top-row a,
    .gallery-item .bottom-row a {
      display: block;
      word-wrap: break-word; /* Permitir romper palabras largas */
      overflow: visible; /* Mostrar todo el texto */
      white-space: normal; /* Permitir saltos de línea */
      line-height: 1.4; /* Espaciado adecuado entre líneas */
      font-size: 14px;
    }
    
    /* Eliminar fondos grises */
    .gallery-item > div,
    .gallery-item > div > div {
      background: white !important;
    }
    
    /* Eliminar fondos grises en áreas específicas */
    .info-img {
      background: white !important;
    }
    
    /* Ajustar posición de bottom-row con margin-left */
    .gallery-item .container-img .bottom-row,
    .gallery-item .bottom-row,
    .container-img .bottom-row {
      bottom: 80px !important;
      position: absolute !important;
      margin-left: 5% !important;
    }
  `;
  document.head.appendChild(styleEl);
  
  // Función para eliminar fondos grises
  function removeGrayBackgrounds() {
    document.querySelectorAll('.gallery-item').forEach(item => {
      item.style.backgroundColor = 'white';
      
      const divs = item.querySelectorAll('div');
      divs.forEach(div => {
        div.style.backgroundColor = 'white';
      });
      
      const imgContainer = item.querySelector('.container-img');
      if (imgContainer) {
        imgContainer.style.backgroundColor = 'white';
      }
      
      const infoArea = item.querySelector('.info-img');
      if (infoArea) {
        infoArea.style.backgroundColor = 'white';
      }
      
      // Aplicar estilos específicos a top-row
      const topRow = item.querySelector('.top-row');
      if (topRow) {
        topRow.style.paddingLeft = '5px';
        topRow.style.paddingBottom = '0px';
      }
    });
  }
  
  // Función para forzar la posición de bottom-row
  function forceBottomRowPosition() {
    // Buscar bottom-rows con diferentes selectores para asegurar que los encontramos
    const bottomRows = [
      ...document.querySelectorAll('.gallery-item .container-img .bottom-row'),
      ...document.querySelectorAll('.gallery-item .bottom-row'),
      ...document.querySelectorAll('.container-img .bottom-row')
    ];
    
    // Eliminar duplicados
    const uniqueBottomRows = [...new Set(bottomRows)];
    
    uniqueBottomRows.forEach(el => {
      // Aplicar varios estilos para asegurar que funciona
      el.style.cssText += 'bottom: 80px !important; position: absolute !important; margin-left: 5% !important;';
      
      // También establecer el atributo directamente
      el.setAttribute('style', el.getAttribute('style') + '; bottom: 80px !important; position: absolute !important; margin-left: 5% !important;');
    });
  }
  
  // 2. Función para posicionar elementos
  function positionItems() {
    const container = document.querySelector('.gallery-container');
    if (!container) return;
    
    // Establecer altura mínima
    container.style.minHeight = '1000px';
    
    const columnCount = 5;
    const gap = 20;
    
    // Obtener todos los elementos visibles
    const items = Array.from(document.querySelectorAll('.gallery-item'))
      .filter(item => item.style.display !== 'none');
    
    console.log(`Posicionando ${items.length} elementos...`);
    
    // Inicializar alturas de columnas
    const columnHeights = Array(columnCount).fill(0);
    
    // Crear un mapa para rastrear elementos por código de producto
    const productCodeMap = new Map();
    
    // Primera pasada: Asignar elementos a columnas y detectar duplicados
    items.forEach((item, index) => {
      // Obtener código de producto
      let productCode = item.getAttribute('data-product-code');
      if (!productCode) {
        const bottomRow = item.querySelector('.bottom-row a');
        productCode = bottomRow ? bottomRow.textContent.trim().replace(/\s+/g, '') : `item-${index}`;
        item.setAttribute('data-product-code', productCode);
      }
      
      // Verificar si ya existe un elemento con este código
      if (productCodeMap.has(productCode)) {
        // Marcar como duplicado para procesamiento especial
        item.dataset.duplicate = 'true';
        
        // Incrementar contador en el elemento original
        const original = productCodeMap.get(productCode);
        const count = parseInt(original.dataset.duplicateCount || '0') + 1;
        original.dataset.duplicateCount = count.toString();
        
        // Agregar clase para destacar
        original.classList.add('has-duplicates');
      } else {
        // Registrar este elemento como el original para este código
        productCodeMap.set(productCode, item);
      }
    });
    
    // Segunda pasada: Posicionar elementos (primero los no duplicados)
    items.filter(item => !item.dataset.duplicate).forEach((item, index) => {
      // Encontrar la columna más corta
      const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
      
      // Calcular posición
      const leftPos = `calc(${shortestColumnIndex * (100 / columnCount)}% + ${gap/2}px)`;
      const topPos = `${columnHeights[shortestColumnIndex]}px`;
      
      // Aplicar posición
      item.style.position = 'absolute';
      item.style.left = leftPos;
      item.style.top = topPos;
      item.style.width = `calc(${100 / columnCount}% - ${gap}px)`;
      
      // Hacer visible
      item.style.opacity = '1';
      
      // Asegurarse de que los textos se muestren correctamente
      const textElements = item.querySelectorAll('a');
      textElements.forEach(el => {
        el.style.whiteSpace = 'normal';
        el.style.overflow = 'visible';
        el.style.textOverflow = 'clip';
      });
      
      // Aplicar estilos específicos al top-row de este elemento
      const topRow = item.querySelector('.top-row');
      if (topRow) {
        topRow.style.paddingLeft = '5px';
        topRow.style.paddingBottom = '0px';
      }
      
      // Obtener altura real o estimada (mayor para acomodar textos multilinea)
      let itemHeight = item.offsetHeight;
      if (!itemHeight || itemHeight < 100) {
        const img = item.querySelector('img');
        itemHeight = img && img.complete ? img.offsetHeight + 180 : 380; // Altura extra para textos
      }
      
      // Actualizar altura de columna
      columnHeights[shortestColumnIndex] += itemHeight + gap;
      
      // Guardar posición para referencia
      item.dataset.column = shortestColumnIndex.toString();
      item.dataset.topPosition = columnHeights[shortestColumnIndex].toString();
    });
    
    // Tercera pasada: Ocultar elementos duplicados
    items.filter(item => item.dataset.duplicate === 'true').forEach(item => {
      // Ocultar duplicados
      item.style.display = 'none';
    });
    
    // Actualizar altura del contenedor
    const maxHeight = Math.max(...columnHeights);
    container.style.height = `${maxHeight + 50}px`;
    
    // Limpiar fondos grises después de posicionar
    removeGrayBackgrounds();
    
    // Forzar posición de bottom-row
    forceBottomRowPosition();
    
    console.log('Posicionamiento completado con todas las mejoras');
  }
  
  // 3. Manejar elementos nuevos durante el scroll
  function setupScrollHandler() {
    if (typeof window.precargarSiguientesPaginas === 'function') {
      const originalFn = window.precargarSiguientesPaginas;
      
      window.precargarSiguientesPaginas = async function() {
        console.log('Interceptando carga por scroll...');
        
        // Ejecutar función original
        await originalFn.apply(this, arguments);
        
        // Reposicionar después de un retraso
        setTimeout(() => {
          positionItems();
          removeGrayBackgrounds();
          forceBottomRowPosition();
        }, 500);
      };
      
      console.log('Handler de scroll configurado');
    }
  }
  
  // 4. Inicializar
  positionItems();
  setupScrollHandler();
  
  // 5. Aplicar posición de bottom-row inmediatamente y con intervalo
  forceBottomRowPosition();
  setInterval(forceBottomRowPosition, 1000);
  
  // 6. Agregar un reposicionamiento periódico 
  setInterval(() => {
    positionItems();
    removeGrayBackgrounds();
  }, 2000);
  
  // Exponer función para uso manual
  window.fixPinterestLayout = positionItems;
  window.removeGrayBackgrounds = removeGrayBackgrounds;
  window.forceBottomRowPosition = forceBottomRowPosition;
  
  console.log('Solución completa aplicada con todos los ajustes de estilo');
})();
