/**
 * Sistema de Menú de Funcionalidades
 * Muestra funcionalidades disponibles según el rol del usuario
 * MODIFICADO: Integración con búsqueda de clientes
 */

class FuncionalidadesMenu {
    constructor() {
        this.menu = null;
        this.trigger = null;
        this.usuarioActual = null;
        this.funcionalidadesDisponibles = [];
        this.isOpen = false;
    }

    /**
     * Inicializar el sistema
     */
    async init() {
        console.log('🎯 Inicializando menú de funcionalidades...');
        
        try {
            // 1. Obtener elementos del DOM
            this.menu = document.getElementById('menu-funcionalidades');
            this.trigger = document.getElementById('menu-funcionalidades-trigger');
            
            if (!this.menu || !this.trigger) {
                console.error('❌ No se encontraron elementos del menú');
                return;
            }
            
            // 2. Cargar datos del usuario
            await this.cargarDatosUsuario();
            
            // 3. Cargar funcionalidades disponibles
            await this.cargarFuncionalidades();
            
            // 4. Generar menú
            this.generarMenu();
            
            // 5. Configurar eventos
            this.configurarEventos();
            
            console.log('✅ Menú de funcionalidades inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando menú:', error);
        }
    }

    /**
     * Cargar datos del usuario desde localStorage
     */
    async cargarDatosUsuario() {
        try {
            const clientDataStr = localStorage.getItem('clientData');
            
            if (!clientDataStr) {
                console.error('❌ No hay datos de cliente en localStorage');
                return;
            }
            
            const clientData = JSON.parse(clientDataStr);
            const clave = clientData.account;
            
            console.log(`👤 Usuario actual: ${clave} - ${clientData.name}`);
            
            // Cargar datos del usuario desde JSON
            const response = await fetch('./json/funcionalidades_usuarios.json');
            const usuariosData = await response.json();
            
            this.usuarioActual = usuariosData.usuarios[clave];
            
            if (!this.usuarioActual) {
                console.warn(`⚠️ Usuario ${clave} no encontrado en funcionalidades_usuarios.json`);
                // Usar datos básicos del clientData
                this.usuarioActual = {
                    clave: clave,
                    nombre: clientData.name,
                    rol: 'cliente_estandar' // Por defecto
                };
            }
            
            console.log('✅ Datos de usuario cargados:', this.usuarioActual);
            
        } catch (error) {
            console.error('❌ Error cargando datos de usuario:', error);
            throw error;
        }
    }

    /**
     * Cargar funcionalidades disponibles según el rol
     */
    async cargarFuncionalidades() {
        try {
            // Cargar JSON de funcionalidades
            const response = await fetch('./json/funcionalidades.json');
            const funcData = await response.json();
            
            // Obtener rol del usuario
            const rol = this.usuarioActual.rol;
            
            console.log(`🔍 Buscando funcionalidades para rol: ${rol}`);
            
            // Obtener funcionalidades del rol
            const funcionesRol = funcData.roles[rol];
            
            if (!funcionesRol) {
                console.warn(`⚠️ Rol ${rol} no encontrado en funcionalidades.json`);
                this.funcionalidadesDisponibles = [];
                return;
            }
            
            // Manejar rol admin con "all" o roles normales
            if (funcionesRol.funcionalidades.includes('all')) {
                // Si es admin con "all", mostrar TODAS las funcionalidades activas
                this.funcionalidadesDisponibles = Object.values(funcData.funcionalidades)
                    .filter(func => func && func.activa === true);
                
                console.log('✅ Usuario admin: mostrando todas las funcionalidades activas');
            } else {
                // Filtrar solo funcionalidades activas para roles normales
                this.funcionalidadesDisponibles = funcionesRol.funcionalidades
                    .map(funcId => funcData.funcionalidades[funcId])
                    .filter(func => func && func.activa === true);
            }
            
            // Agregar funcionalidades extra si existen
            if (this.usuarioActual.funcionalidades_extra) {
                this.usuarioActual.funcionalidades_extra.forEach(funcId => {
                    const func = funcData.funcionalidades[funcId];
                    if (func && func.activa) {
                        this.funcionalidadesDisponibles.push(func);
                    }
                });
            }
            
            // Remover funcionalidades bloqueadas si existen
            if (this.usuarioActual.funcionalidades_bloqueadas) {
                this.funcionalidadesDisponibles = this.funcionalidadesDisponibles
                    .filter(func => !this.usuarioActual.funcionalidades_bloqueadas.includes(func.id));
            }
            
            console.log(`✅ ${this.funcionalidadesDisponibles.length} funcionalidades disponibles:`, 
                this.funcionalidadesDisponibles.map(f => f.nombre));
            
        } catch (error) {
            console.error('❌ Error cargando funcionalidades:', error);
            throw error;
        }
    }

    /**
     * Generar el HTML del menú
     */
    generarMenu() {
        const menuContent = this.menu.querySelector('.menu-funcionalidades-content');
        
        if (!menuContent) {
            console.error('❌ No se encontró contenedor del menú');
            return;
        }
        
        // Limpiar contenido previo
        menuContent.innerHTML = '';
        
        // Si no hay funcionalidades, mostrar mensaje
        if (this.funcionalidadesDisponibles.length === 0) {
            menuContent.innerHTML = `
                <div class="menu-item-empty">
                    <p>No hay funcionalidades disponibles</p>
                </div>
            `;
            return;
        }
        
        // Generar items del menú
        this.funcionalidadesDisponibles.forEach(func => {
            const item = document.createElement('div');
            item.className = 'menu-funcionalidad-item';
            item.dataset.funcId = func.id;
            
            item.innerHTML = `
                <span class="menu-item-icon">${func.icono}</span>
                <span class="menu-item-text">${func.nombre}</span>
            `;
            
            // Agregar evento click
            item.addEventListener('click', () => this.onFuncionalidadClick(func));
            
            menuContent.appendChild(item);
        });
        
        console.log('✅ Menú generado con', this.funcionalidadesDisponibles.length, 'items');
    }

    /**
     * Configurar eventos del menú
     */
    configurarEventos() {
        // Click en el trigger (flecha)
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Click fuera del menú para cerrarlo
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.menu.contains(e.target) && 
                e.target !== this.trigger) {
                this.close();
            }
        });
        
        // ESC para cerrar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
        
        console.log('✅ Eventos configurados');
    }

    /**
     * Abrir/cerrar menú
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Abrir menú
     */
    open() {
        this.menu.style.display = 'block';
        // Pequeño delay para activar la transición CSS
        setTimeout(() => {
            this.menu.classList.add('active');
        }, 10);
        this.isOpen = true;
        console.log('📂 Menú abierto');
    }

    /**
     * Cerrar menú
     */
    close() {
        this.menu.classList.remove('active');
        // Esperar a que termine la transición antes de ocultar
        setTimeout(() => {
            this.menu.style.display = 'none';
        }, 300);
        this.isOpen = false;
        console.log('📁 Menú cerrado');
    }

    /**
     * Manejar click en una funcionalidad
     */
    onFuncionalidadClick(funcionalidad) {
        console.log('🎯 Click en funcionalidad:', funcionalidad.nombre);
        
        // Cerrar menú
        this.close();
        
        // Aquí agregaremos la lógica específica según la funcionalidad
        switch(funcionalidad.id) {
            case 'estado_de_cuentas':
                this.abrirEstadoDeCuentas();
                break;
            case 'mi_cuenta':
                this.abrirMiCuenta();
                break;
            case 'catalogo_completo':
                console.log('📦 Abrir catálogo completo');
                // TODO: Implementar
                break;
            case 'hacer_pedido':
                console.log('🛒 Hacer pedido');
                // TODO: Implementar
                break;
            default:
                console.log(`ℹ️ Funcionalidad ${funcionalidad.id} aún no implementada`);
        }
    }

    /**
     * Abrir Estado de Cuentas (para vendedores)
     * MODIFICADO: Integración con búsqueda de clientes
     */
    abrirEstadoDeCuentas() {
        console.log('💰 Abriendo Estado de Cuentas (búsqueda de clientes)...');
        
        // Verificar que el módulo de búsqueda esté disponible
        if (!window.busquedaClientes) {
            console.error('❌ Módulo de búsqueda de clientes no disponible');
            alert('Error: Sistema de búsqueda no disponible. Por favor recarga la página.');
            return;
        }
        
        // Verificar que el usuario tenga permiso (es vendedor o admin)
        const rolesPermitidos = ['vendedor_estandar', 'admin'];
        if (!rolesPermitidos.includes(this.usuarioActual.rol)) {
            console.warn('⚠️ Usuario no tiene permiso para Estado de Cuentas');
            alert('Esta funcionalidad está disponible solo para vendedores.');
            return;
        }
        
        // Ocultar barra de salud financiera si estaba visible
        if (window.BarraSaludFinanciera && window.BarraSaludFinanciera.visible) {
            window.BarraSaludFinanciera.ocultar();
        }
        
        // Activar modo búsqueda de clientes
        window.busquedaClientes.activar();
        
        console.log('✅ Modo búsqueda de clientes activado');
    }

    /**
     * Abrir Mi Cuenta (para clientes)
     * NUEVO: Mostrar salud financiera del cliente logueado
     */
    abrirMiCuenta() {
        console.log('👤 Abriendo Mi Cuenta...');
        
        // Verificar que sea un cliente
        if (!this.usuarioActual.numero_cuenta) {
            console.warn('⚠️ Usuario no tiene número de cuenta');
            alert('Esta funcionalidad está disponible solo para clientes.');
            return;
        }
        
        // Verificar que el módulo de búsqueda esté disponible
        if (!window.busquedaClientes || !window.busquedaClientes.clientesData) {
            console.error('❌ Datos de clientes no disponibles');
            alert('Error: No se pudieron cargar los datos. Por favor recarga la página.');
            return;
        }
        
        // Buscar datos del cliente actual
        const numeroCuenta = this.usuarioActual.numero_cuenta;
        const datosCliente = window.busquedaClientes.clientesData[numeroCuenta];
        
        if (!datosCliente) {
            console.warn('⚠️ Datos financieros no encontrados para cuenta:', numeroCuenta);
            alert('No se encontraron datos financieros para tu cuenta.');
            return;
        }
        
        // Preparar datos para la barra de salud financiera
        const datosFinancieros = {
            nombre: this.usuarioActual.nombre,
            pgProm3M: datosCliente.pgProm3M,
            comproMes: datosCliente.comproMes,
            saldoTotal: datosCliente.saldoTotal,
            saldoAnterior: datosCliente.saldoAnterior
        };
        
        // Mostrar barra de salud financiera
        if (window.BarraSaludFinanciera) {
            window.BarraSaludFinanciera.mostrar(datosFinancieros);
            console.log('✅ Mostrando salud financiera del cliente');
        } else {
            console.error('❌ BarraSaludFinanciera no disponible');
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    // Esperar un momento para asegurar que otros scripts se carguen
    setTimeout(async () => {
        const menuFuncionalidades = new FuncionalidadesMenu();
        await menuFuncionalidades.init();
        
        // Exponer globalmente para debug
        window.menuFuncionalidades = menuFuncionalidades;
    }, 1000);
});
