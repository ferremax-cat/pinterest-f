/**
 * MÓDULO DE BÚSQUEDA DE CLIENTES
 * Permite a vendedores buscar clientes y ver su salud financiera
 */

/**
 * MÓDULO DE BÚSQUEDA DE CLIENTES
 * Permite a vendedores buscar clientes y ver su salud financiera
 */

// --- Finanzas por endpoint (Etapa 2) ---
// Interruptor de convivencia: en false, usa el JSON local como hasta ahora.
const USAR_FINANZAS_ENDPOINT = false; // Cambiar a true para usar el endpoint de finanzas
const URL_API_FIN = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';

async function traerFinanzasDelEndpoint(cuenta) {
    const token = sessionStorage.getItem('authToken');
    if (!token) return null;

    const resp = await fetch(URL_API_FIN, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion: 'finanzas', token, cuenta: String(cuenta) })
    });
    const d = await resp.json();
    return d.ok ? d : null;
}


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

            // Guardar el contenido: al cambiar de cliente la barra se limpia
            // y se pierde el boton Limpiar, que es la salida al estado inicial
            if (this.barraInfo.textContent.trim()) {
                this.barraInfoHTML = this.barraInfo.innerHTML;
            }

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
        
        // ⭐ Obtener código del vendedor logueado
        const codigoVendedor = this.obtenerCodigoVendedor();
        
        // Buscar en todos los clientes
        for (const [cuenta, cliente] of Object.entries(this.clientesData)) {
            // ⭐ Filtrar por vendedor (si es vendedor)
            if (codigoVendedor && cliente.vendedor !== codigoVendedor) {
                continue; // Saltar clientes de otros vendedores
            }
            
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
        
        console.log('[Búsqueda Clientes] Resultados encontrados:', resultados.length, 
            `(vendedor: ${codigoVendedor || 'TODOS'})`);
        
        // Mostrar resultados
        this.mostrarResultados(resultados, termino);
    }

    /**
     * Obtener código del vendedor logueado
     */
    obtenerCodigoVendedor() {
        try {
            // Obtener cuenta del usuario logueado
            const clientDataStr = localStorage.getItem('clientData');
            if (!clientDataStr) return null;
            
            const clientData = JSON.parse(clientDataStr);
            const clave = clientData.account;
            
            // Buscar en funcionalidades_usuarios para obtener el código
            // (asumiendo que ya está cargado en menuFuncionalidades)
            if (window.menuFuncionalidades && window.menuFuncionalidades.usuarioActual) {
                const codigo = window.menuFuncionalidades.usuarioActual.codigo;
                console.log(`[Búsqueda Clientes] Código vendedor: ${codigo || 'sin código (cliente/admin)'}`);
                return codigo || null;
            }
            
            return null;
        } catch (error) {
            console.error('[Búsqueda Clientes] Error obteniendo código vendedor:', error);
            return null;
        }
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
    async seleccionarCliente(cuenta) {
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
            pagoMes: cliente.pagoMes, // Renombrado para claridad en la barra de salud financiera
            cupoMes: cliente.cupoMes,  // ⭐ Agregar cupoMes
            ultOperacion: cliente.ultOperacion  // ⭐ AGREGAR
        };
        
        

        // Aplicar la lista de precios ANTES de mostrar la barra,
        // para que la etiqueta de lista tenga el dato disponible
                const rol = sessionStorage.getItem('authRol')
            || window.menuFuncionalidades?.usuarioActual?.rol
            || '';
        if (window.Precios && rol !== 'cliente_estandar') {
            await window.Precios.setClienteVista(cuenta);
        }


        // Mostrar barra de salud financiera
        if (window.BarraSaludFinanciera) {
            window.BarraSaludFinanciera.mostrar(datosFinancieros);
            console.log('[Búsqueda Clientes] Mostrando salud financiera del cliente');
        } else {
            console.error('[Búsqueda Clientes] BarraSaludFinanciera no disponible');
        }

         // Pedir al endpoint SIN bloquear: la barra ya se mostro con los datos
        // locales y se actualiza sola cuando llega la respuesta del servidor
        if (USAR_FINANZAS_ENDPOINT && sessionStorage.getItem('authToken')) {
            traerFinanzasDelEndpoint(cuenta)
                .then(d => {
                    if (!d) return;

                    const actualizados = {
                        nombre: d.nombre,
                        pgProm3M: d.pgProm3M,
                        comproMes: d.comproMes,
                        saldoTotal: d.saldoTotal,
                        pagoMes: d.pagoMes,
                        cupoMes: d.cupoMes,
                        ultOperacion: d.ultOperacion,
                        disponible: d.disponible,
                        esRevendedor: d.esRevendedor
                    };

                    // Guardar el disponible para el semaforo del carrito
                    sessionStorage.setItem('disponibleCliente', String(d.disponible ?? ''));

                    if (window.BarraSaludFinanciera && window.BarraSaludFinanciera.visible) {
                        window.BarraSaludFinanciera.actualizarDatos(actualizados);
                    }
                    console.log('[Finanzas] Actualizado desde el endpoint, disponible:', d.disponible);
                })
                .catch(err => console.warn('[Finanzas] Endpoint no disponible:', err));
        }

         // Limpiar resultados y restaurar estado previo.
        // Si hay un cliente seleccionado, la barra debe quedar visible
        // aunque el estado capturado diga lo contrario: ese dato queda
        // viejo cuando se cambia de cliente varias veces seguidas.
        const hayClienteSeleccionado = window.Precios && window.Precios.getClienteVista();
        const debeOcultar = !this.barraInfoEstabaVisible && !hayClienteSeleccionado;
        this.limpiarResultados(debeOcultar);
        console.log('[Búsqueda Clientes] Restaurando barra-info, ocultar:', debeOcultar);

        


        // Limpiar input de búsqueda
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        // ⭐ NUEVO: Desactivar modo búsqueda de clientes automáticamente
        // Esto restaura la búsqueda de productos
        this.desactivar();

        // Si hay cliente seleccionado, la barra de resultados debe volver:
        // su boton Limpiar es la unica salida al estado inicial
        if (hayClienteSeleccionado && this.barraInfoHTML) {
            const barraInfo = document.getElementById('barra-info-contextual');
            if (barraInfo && !barraInfo.textContent.trim()) {
                barraInfo.innerHTML = this.barraInfoHTML;
                barraInfo.classList.add('visible');
                console.log('[Búsqueda Clientes] Barra de resultados restaurada');
            }
        }
        
        // Repintar despues de restaurar la galeria: setClienteVista repinta
        // cuando todavia estan en pantalla los resultados de clientes
        if (window.Precios) {
            setTimeout(() => window.Precios.repintarTodos(), 100);
        }

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
