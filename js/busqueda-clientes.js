/**
 * MÓDULO DE BÚSQUEDA DE CLIENTES
 * Permite a vendedores buscar clientes y ver su salud financiera
 */

class BusquedaClientes {
    constructor() {
        this.clientesData = null;
        this.activa = false;
        this.searchInput = null;
        this.barraInfo = null;
        this.iconoBusqueda = null;
        this.iconoOriginal = 'fa-search';
        this.iconoClientes = 'fa-users'; // Ícono de estado de cuentas
    }

    /**
     * Inicializar el módulo
     */
    async init() {
        console.log('[Búsqueda Clientes] Inicializando...');
        
        // Obtener referencias DOM
        this.searchInput = document.querySelector('nav input[type="text"]');
        this.barraInfo = document.getElementById('barra-info-contextual');
        this.iconoBusqueda = document.querySelector('.input-container .fa-search');
        
        if (!this.searchInput || !this.barraInfo) {
            console.error('[Búsqueda Clientes] Elementos DOM no encontrados');
            return false;
        }

        // Cargar datos de clientes
        await this.cargarClientes();
        
        console.log('[Búsqueda Clientes] Inicialización completa');
        return true;
    }

    /**
     * Cargar datos de clientes desde JSON
     */
    async cargarClientes() {
        try {
            console.log('[Búsqueda Clientes] Cargando datos...');
            const response = await fetch('./json/clientes_finanzas.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.clientesData = data.clientes;
            
            console.log('[Búsqueda Clientes] Datos cargados:', 
                Object.keys(this.clientesData).length, 'clientes');
            
            return true;
        } catch (error) {
            console.error('[Búsqueda Clientes] Error cargando datos:', error);
            return false;
        }
    }

    /**
     * Activar modo búsqueda de clientes
     */
    activar() {
        if (this.activa) return;
        
        console.log('[Búsqueda Clientes] Activando modo búsqueda de clientes');

        // ⭐ GUARDAR estado REAL de la barra (si está visible en pantalla)
        if (this.barraInfo) {
            const estiloActual = window.getComputedStyle(this.barraInfo);
            this.barraInfoEstabaVisible = estiloActual.display !== 'none';
            console.log('[Búsqueda Clientes] Estado previo barra-info visible:', this.barraInfoEstabaVisible);
        }

        // ⭐ BLOQUEAR precarga INMEDIATAMENTE
        window.scrollPreloadBlocked = true;
        console.log('[Búsqueda Clientes] ⚠️ Precarga por scroll BLOQUEADA');
        
        // ⭐ Guardar y VACIAR galería
        const galleryContainer = document.querySelector('.gallery-container');
        if (galleryContainer) {
            this.galleryBackupHTML = galleryContainer.innerHTML;
            galleryContainer.innerHTML = '';
            galleryContainer.style.display = 'none';
            console.log('[Búsqueda Clientes] ⚠️ Galería vaciada - 25+ productos eliminados');
        }
        
        // Cambiar ícono
        if (this.iconoBusqueda) {
            this.iconoBusqueda.classList.remove(this.iconoOriginal);
            this.iconoBusqueda.classList.add(this.iconoClientes);
            // Asegurar que el ícono sea visible - forzar con !important
            this.iconoBusqueda.style.setProperty('opacity', '1', 'important');
            this.iconoBusqueda.style.setProperty('width', '48px', 'important');
            this.iconoBusqueda.style.setProperty('display', 'flex', 'important');
            console.log('[Búsqueda Clientes] Ícono cambiado a fa-people-group');
        }
        
        // Cambiar placeholder
        if (this.searchInput) {
            this.searchInput.dataset.originalPlaceholder = this.searchInput.placeholder;
            this.searchInput.placeholder = 'Buscar cliente por nombre o cuenta...';
            this.searchInput.value = '';
            this.searchInput.focus();
            
        }
        
        // Limpiar galería de productos
        this.ocultarProductos();
        
        // Configurar listener
        this.setupSearchListener();

        // Agregar botón X para cancelar búsqueda de clientes
        this.agregarBotonCancelar();
        
        this.activa = true;
        
        // Agregar clase al body para identificar el modo
        document.body.classList.add('modo-busqueda-clientes');
        
        console.log('[Búsqueda Clientes] ✅ Modo activado - Búsqueda de productos pausada');
    }

    /**
     * Desactivar modo búsqueda de clientes
     */
    desactivar() {
        if (!this.activa) return;
        
        console.log('[Búsqueda Clientes] Desactivando modo búsqueda de clientes');
        
        // Restaurar ícono
        if (this.iconoBusqueda) {
            this.iconoBusqueda.classList.remove(this.iconoClientes);
            this.iconoBusqueda.classList.add(this.iconoOriginal);
        }
        
        // Restaurar placeholder
        if (this.searchInput && this.searchInput.dataset.originalPlaceholder) {
            this.searchInput.placeholder = this.searchInput.dataset.originalPlaceholder;
            this.searchInput.value = '';
        }
        
        // Limpiar barra de resultados
        this.limpiarResultados();
        
        // Remover listener
        if (this.searchListener) {
            this.searchInput.removeEventListener('input', this.searchListener);
        }
        
        // Remover listener de ESC
        if (this.escListener) {
            document.removeEventListener('keydown', this.escListener);
        }
        
        this.activa = false;
        
        // Quitar clase del body (esto reactiva búsqueda de productos automáticamente)
        document.body.classList.remove('modo-busqueda-clientes');
        // Remover botón X
        this.removerBotonCancelar();

        // ⭐ DESBLOQUEAR precarga
        window.scrollPreloadBlocked = false;
        
        // ⭐ Restaurar galería
        if (this.galleryBackupHTML) {
            const galleryContainer = document.querySelector('.gallery-container');
            if (galleryContainer) {
                galleryContainer.innerHTML = this.galleryBackupHTML;
                galleryContainer.style.display = '';
                this.galleryBackupHTML = null;
                console.log('[Búsqueda Clientes] ✅ Galería restaurada');
                
                // Reposicionar
                setTimeout(() => {
                    if (typeof positionPinterestLayout === 'function') {
                        positionPinterestLayout();
                    }
                }, 200);
            }
        }
        console.log('[Búsqueda Clientes] ✅ Modo desactivado - Búsqueda de productos restaurada');
    }

    /**
     * Ocultar galería de productos
     */
    ocultarProductos() {
        const galleryContainer = document.querySelector('.gallery-container');
        if (galleryContainer) {
            const galleryItems = galleryContainer.querySelectorAll('.gallery-item');
            galleryItems.forEach(item => {
                item.style.display = 'none';
            });
            console.log('[Búsqueda Clientes] Galería de productos ocultada');
        }
    }

    /**
     * Configurar listener de búsqueda
     */
    setupSearchListener() {
        // Función debounce
        const debounce = (func, wait) => {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        };
        
        // Guardar referencia al listener
        this.searchListener = (e) => {
            // NUEVO: Ocultar productos INMEDIATAMENTE sin esperar debounce
            this.ocultarProductos();
            
            const termino = e.target.value.trim();
            
            if (termino.length === 0) {
                this.limpiarResultados();
                return;
            }
            
            // Buscar con debounce
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.buscarClientes(termino);
            }, 300);
        };
        
        this.searchInput.addEventListener('input', this.searchListener);
        
        // Listener para ESC - cerrar modo búsqueda de clientes
        this.escListener = (e) => {
            if (e.key === 'Escape' && this.activa) {
                console.log('[Búsqueda Clientes] ESC presionado - desactivando modo');
                this.desactivar();
            }
        };
        
        document.addEventListener('keydown', this.escListener);
        
        console.log('[Búsqueda Clientes] Listeners configurados (input + ESC)');
    }

    /**
     * Buscar clientes por nombre o número de cuenta
     */
    buscarClientes(termino) {
        if (!this.clientesData) {
            console.warn('[Búsqueda Clientes] Datos no cargados');
            return;
        }
        
        console.log('[Búsqueda Clientes] Buscando:', termino);
        
        const terminoLower = termino.toLowerCase();
        const resultados = [];
        
        // Buscar en todos los clientes
        for (const [cuenta, cliente] of Object.entries(this.clientesData)) {
            const nombreLower = cliente.nombre.toLowerCase();
            const cuentaStr = cuenta.toString();
            
            // Buscar por número de cuenta o nombre
            if (cuentaStr.includes(termino) || nombreLower.includes(terminoLower)) {
                resultados.push({
                    cuenta: cuenta,
                    ...cliente
                });
            }
        }
        
        console.log('[Búsqueda Clientes] Resultados encontrados:', resultados.length);
        
        // Mostrar resultados
        this.mostrarResultados(resultados, termino);
    }

    /**
     * Mostrar resultados en la barra contextual
     */
    mostrarResultados(resultados, termino) {
        if (!this.barraInfo) return;
        
        const barraContent = this.barraInfo.querySelector('.barra-info-content');
        if (!barraContent) return;
        
        // Limpiar contenido anterior
        barraContent.innerHTML = '';
        
        if (resultados.length === 0) {
            barraContent.innerHTML = `
                <div class="mensaje-sin-resultados">
                    <span class="icono-sin-resultados">🔍</span>
                    <span class="texto-sin-resultados">
                        No se encontraron clientes para "<strong>${termino}</strong>"
                    </span>
                </div>
            `;
            this.barraInfo.style.display = 'block';
            this.barraInfo.classList.add('visible');
            return;
        }
        
        // Crear lista de resultados
        const listaHTML = `
            <div class="resultados-clientes">
                <div class="header-resultados">
                    <span class="contador-resultados">
                        ${resultados.length} cliente${resultados.length !== 1 ? 's' : ''} encontrado${resultados.length !== 1 ? 's' : ''}
                    </span>
                    <button class="btn-cerrar-resultados" onclick="window.busquedaClientes.limpiarResultados()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="lista-clientes">
                    ${resultados.map(cliente => this.crearItemCliente(cliente)).join('')}
                </div>
            </div>
        `;
        
        barraContent.innerHTML = listaHTML;
        
        // Mostrar barra
        this.barraInfo.style.display = 'block';
        this.barraInfo.classList.add('visible');
        document.body.classList.add('barra-visible');
        
        // Agregar eventos de click a cada cliente
        this.configurarClicksClientes();
    }

    /**
     * Crear HTML para un item de cliente
     */
    crearItemCliente(cliente) {
        // Calcular cupo y color
        const cupo = cliente.pgProm3M - cliente.comproMes;
        let colorCupo = 'verde';
        
        if (cupo < 0) {
            const porcentajeFlex = Math.abs(cupo) / cliente.pgProm3M * 100;
            colorCupo = porcentajeFlex <= 39 ? 'amarillo' : 'rojo';
        }
        
        return `
            <div class="item-cliente" data-cuenta="${cliente.numero_cuenta}">
                <div class="cliente-principal">
                    <div class="cliente-icono">
                        <i class="fas fa-store"></i>
                    </div>
                    <div class="cliente-datos">
                        <div class="cliente-nombre-cuenta">
                            <span class="cliente-nombre">${cliente.nombre}</span>
                            <span class="cliente-cuenta">#${cliente.numero_cuenta}</span>
                        </div>
                        <div class="cliente-cupo">
                            <span class="label-cupo">Cupo disponible:</span>
                            <span class="valor-cupo cupo-${colorCupo}">${this.formatearMoneda(cupo)}</span>
                        </div>
                    </div>
                </div>
                <div class="cliente-accion">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `;
    }

    /**
     * Configurar eventos click en los clientes
     */
    configurarClicksClientes() {
        const items = document.querySelectorAll('.item-cliente');
        
        items.forEach(item => {
            item.addEventListener('click', () => {
                const cuenta = item.dataset.cuenta;
                this.seleccionarCliente(cuenta);
            });
        });
    }

    /**
     * Seleccionar un cliente y mostrar su salud financiera
     */
    seleccionarCliente(cuenta) {
        console.log('[Búsqueda Clientes] Cliente seleccionado:', cuenta);
        
        const cliente = this.clientesData[cuenta];
        
        if (!cliente) {
            console.error('[Búsqueda Clientes] Cliente no encontrado:', cuenta);
            return;
        }
        
        // Preparar datos para la barra de salud financiera
        const datosFinancieros = {
            nombre: cliente.nombre,
            pgProm3M: cliente.pgProm3M,
            comproMes: cliente.comproMes,
            saldoTotal: cliente.saldoTotal,
            saldoAnterior: cliente.saldoAnterior
        };
        
        // Mostrar barra de salud financiera
        if (window.BarraSaludFinanciera) {
            window.BarraSaludFinanciera.mostrar(datosFinancieros);
            console.log('[Búsqueda Clientes] Mostrando salud financiera del cliente');
        } else {
            console.error('[Búsqueda Clientes] BarraSaludFinanciera no disponible');
        }

        // Limpiar resultados y restaurar estado previo
        const debeOcultar = !this.barraInfoEstabaVisible;
        this.limpiarResultados(debeOcultar);
        console.log('[Búsqueda Clientes] Restaurando barra-info, ocultar:', debeOcultar);


        // Limpiar input de búsqueda
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        // ⭐ NUEVO: Desactivar modo búsqueda de clientes automáticamente
        // Esto restaura la búsqueda de productos
        this.desactivar();
        
        // ⭐ NUEVO: Dar foco al input para buscar productos inmediatamente
        if (this.searchInput) {
            this.searchInput.focus();
            console.log('[Búsqueda Clientes] Foco en input - listo para buscar productos');
        }
    }

    /**
     * Limpiar resultados de la barra
     */
    limpiarResultados(ocultarCompletamente = false) {
        if (!this.barraInfo) return;
        
        const barraContent = this.barraInfo.querySelector('.barra-info-content');
        if (barraContent) {
            barraContent.innerHTML = '';
        }
        
        // Siempre quitar clases
        this.barraInfo.classList.remove('visible');
        document.body.classList.remove('barra-visible');

        if (ocultarCompletamente) {
            this.barraInfo.style.display = 'none';
            console.log('[Búsqueda Clientes] Barra-info ocultada completamente');
        } else {
            // ⭐ Asegurar que NO esté forzada a oculta
            this.barraInfo.style.display = '';
            console.log('[Búsqueda Clientes] Barra-info lista para usar');
        }
    }

    /**
     * Formatear número como moneda
     */
    formatearMoneda(valor) {
        const numero = parseFloat(valor) || 0;
        const absoluto = Math.abs(numero);
        const signo = numero < 0 ? '-' : '';
        
        const formateado = absoluto.toLocaleString('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        return `${signo}$${formateado}`;
    }

    /**
     * Obtener estado actual
     */
    getEstado() {
        return {
            activa: this.activa,
            clientesCargados: this.clientesData ? Object.keys(this.clientesData).length : 0
        };
    }

     /**
     * Agregar botón X para cancelar búsqueda de clientes
     */
    agregarBotonCancelar() {
        // Verificar si ya existe
        if (document.querySelector('.btn-cancelar-clientes')) return;
        
        const inputContainer = document.querySelector('.input-container');
        if (!inputContainer) return;
        
        // NUEVO: Ocultar el botón X original del sistema de productos
        const clearBtnOriginal = document.querySelector('.search-clear-btn');
        if (clearBtnOriginal) {
            clearBtnOriginal.style.display = 'none';
            console.log('[Búsqueda Clientes] X original ocultado');
        }
        
        // Crear botón X
        const btnCancelar = document.createElement('span');
        btnCancelar.className = 'fas fa-times btn-cancelar-clientes';
        btnCancelar.title = 'Cancelar búsqueda de clientes';
        
        // Click en X → desactivar modo clientes
        btnCancelar.addEventListener('click', () => {
            console.log('[Búsqueda Clientes] Botón X clickeado - cancelando búsqueda');
            this.desactivar();

            // ⭐ Dar foco al input para buscar productos
            if (this.searchInput) {
                // Pequeño delay para que se complete la desactivación
                setTimeout(() => {
                    this.searchInput.focus();
                    console.log('[Búsqueda Clientes] Foco en input - listo para buscar productos');
                }, 100);
            }
        });
        
        // Insertar en el contenedor
        inputContainer.appendChild(btnCancelar);
        
        console.log('[Búsqueda Clientes] Botón X agregado');
    }

    /**
     * Remover botón X
     */
    removerBotonCancelar() {
        const btnCancelar = document.querySelector('.btn-cancelar-clientes');
        if (btnCancelar) {
            btnCancelar.remove();
            console.log('[Búsqueda Clientes] Botón X removido');
        }

        // NUEVO: Restaurar el botón X original del sistema de productos
        const clearBtnOriginal = document.querySelector('.search-clear-btn');
        if (clearBtnOriginal) {
            clearBtnOriginal.style.display = '';
            console.log('[Búsqueda Clientes] X original restaurado');
        }
    }
}

// Crear instancia global
window.busquedaClientes = new BusquedaClientes();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.busquedaClientes.init();
});

console.log('[Búsqueda Clientes] Módulo cargado');
