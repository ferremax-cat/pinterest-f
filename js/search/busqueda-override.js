/**
 * Sobrescritura completa del campo de búsqueda
 * Este código reemplaza la funcionalidad de búsqueda existente
 * con una implementación que busca en el texto visible del DOM
 */

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sobrescritura de búsqueda...');
    
    // Agregar estilos CSS
    agregarEstilosBusqueda();
    
    // Sobrescribir el campo de búsqueda
    sobrescribirCampoBusqueda();
    
    console.log('Sobrescritura de búsqueda completada');
  });
  
  /**
   * Sobrescribe completamente el comportamiento del campo de búsqueda
   */
  function sobrescribirCampoBusqueda() {
    // Capturar el campo de búsqueda
    const searchInput = document.querySelector('input[type="text"]');
    if (!searchInput) {
      console.warn('No se encontró el campo de búsqueda para sobrescribir');
      return;
    }
    
    // Clonar el campo para eliminar todos los listeners existentes
    const nuevoInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(nuevoInput, searchInput);
    
    // Mejorar el placeholder
    nuevoInput.placeholder = "Buscar productos por nombre, código o medida...";
    
    // Función de búsqueda directa
    function busquedaDirecta(termino) {
      termino = termino || '';
      const terminoLower = termino.toLowerCase();
      console.log(`Buscando "${termino}" en el texto visible...`);
      
      // Contar resultados primero
      let totalEncontrados = 0;
      document.querySelectorAll('.gallery-item').forEach(item => {
        const textoCompleto = item.textContent.toLowerCase();
        if (!termino || textoCompleto.includes(terminoLower)) {
          totalEncontrados++;
        }
      });
      
      console.log(`Se encontraron ${totalEncontrados} resultados`);
      
      // Aplicar visibilidad
      document.querySelectorAll('.gallery-item').forEach(item => {
        const textoCompleto = item.textContent.toLowerCase();
        
        if (!termino || textoCompleto.includes(terminoLower)) {
          // Mostrar este elemento usando todos los métodos posibles
          item.style.display = 'block'; 
          item.style.visibility = 'visible';
          item.style.opacity = '1';
          item.style.position = ''; // Dejar que el layout lo posicione
            //elimina borde amarillo
          //item.style.border = termino ? '2px solid #ffeb3b' : '';
          
          // Resaltar coincidencias si hay término de búsqueda
          if (termino) {
            resaltarCoincidencias(item, terminoLower);
          }
        } else {
          // Ocultar este elemento
          item.style.display = 'none';
        }
      });
      
      // Mostrar un mensaje con los resultados
      if (termino) {
        mostrarMensajeBusqueda(termino, totalEncontrados);
      } else {
        // Eliminar mensaje existente si lo hay
        const mensajeExistente = document.getElementById('mensaje-busqueda');
        if (mensajeExistente) mensajeExistente.remove();
      }
      
      // Forzar actualización del layout
      if (typeof window.applyPinterestLayout === 'function') {
        setTimeout(() => {
          console.log('Aplicando layout Pinterest después de búsqueda...');
          window.applyPinterestLayout();
          
          // Verificar nuevamente después del layout
          setTimeout(() => {
            const visiblesPostLayout = Array.from(document.querySelectorAll('.gallery-item'))
              .filter(el => el.style.display !== 'none').length;
            console.log(`Elementos visibles después de layout: ${visiblesPostLayout}`);
            
            // Si el layout ocultó elementos, forzar visibilidad nuevamente
            if (visiblesPostLayout < totalEncontrados) {
              document.querySelectorAll('.gallery-item').forEach(item => {
                const textoCompleto = item.textContent.toLowerCase();
                if (!termino || textoCompleto.includes(terminoLower)) {
                  item.style.display = 'block';
                  item.style.visibility = 'visible';
                  item.style.opacity = '1';
                }
              });
            }
          }, 200);
        }, 100);
      }
      
      return totalEncontrados;
    }
    
    // Función para resaltar coincidencias en el texto
    function resaltarCoincidencias(item, terminoLower) {
      try {
        // Buscar en nombre (top-row)
        const nombreElement = item.querySelector('.top-row a');
        if (nombreElement) {
          const nombre = nombreElement.textContent;
          const nombreLower = nombre.toLowerCase();
          
          if (nombreLower.includes(terminoLower)) {
            const regex = new RegExp(`(${terminoLower})`, 'gi');
            const textoResaltado = nombre.replace(regex, '<span class="search-highlight">$1</span>');
            nombreElement.innerHTML = textoResaltado;
          }
        }
      } catch (e) {
        console.warn('Error al resaltar coincidencias:', e);
      }
    }
    
    // Función para mostrar mensaje de resultados
    function mostrarMensajeBusqueda(termino, cantidad) {
      // Eliminar mensaje anterior si existe
      const mensajeAnterior = document.getElementById('mensaje-busqueda');
      if (mensajeAnterior) {
        mensajeAnterior.remove();
      }
      
      // Crear nuevo mensaje
      const mensaje = document.createElement('div');
      mensaje.id = 'mensaje-busqueda';
      mensaje.className = 'mensaje-busqueda';
      
      mensaje.innerHTML = `
        <div class="mensaje-contenido">
          <span class="mensaje-contador">${cantidad}</span> resultados para "<span class="mensaje-termino">${termino}</span>"
        </div>
        <button id="boton-limpiar-busqueda" class="boton-limpiar">Limpiar</button>
      `;
      
      document.body.appendChild(mensaje);
      
      // Agregar funcionalidad para limpiar búsqueda
      document.getElementById('boton-limpiar-busqueda').addEventListener('click', () => {
        nuevoInput.value = '';
        busquedaDirecta('');
      });
    }
    
    // Función debounce para evitar múltiples búsquedas durante escritura
    function debounce(func, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }
    
    // Añadir el nuevo listener con debounce
    nuevoInput.addEventListener('input', debounce(function() {
      const termino = this.value.trim();
      busquedaDirecta(termino);
    }, 300));
    
    // Ejecutar una búsqueda inicial para mostrar todos los productos
    busquedaDirecta('');
    
    console.log('Campo de búsqueda sobrescrito exitosamente');
  }
  
  /**
   * Agrega los estilos CSS necesarios
   */
  function agregarEstilosBusqueda() {
    if (document.getElementById('search-override-styles')) return;
    
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
      
      .boton-limpiar:hover {
        background-color: #3a7cca;
      }
    `;
    
    document.head.appendChild(styles);
  }