/**
 * BARRA DE SALUD FINANCIERA
 * Controla la visualización y comportamiento de la barra de salud financiera
 */

// Objeto para gestionar la barra de salud financiera
const BarraSaludFinanciera = {
    // Elementos DOM
    barra: null,
    barraContent: null,
    btnExpandir: null,
    
    // Estado
    visible: false,
    expandida: false,
    
    // Inicializar
    init() {
        console.log('[Salud Financiera] Inicializando...');
        
        // Obtener referencias a elementos
        this.barra = document.getElementById('barra-salud-financiera');
        this.barraContent = this.barra ? this.barra.querySelector('.barra-salud-content') : null;
        this.btnExpandir = document.getElementById('btn-expandir-salud');
        
        if (!this.barra) {
            console.warn('[Salud Financiera] Barra no encontrada en el DOM');
            return;
        }
        
        // Configurar eventos
        this.setupEvents();
        
        console.log('[Salud Financiera] Inicialización completa');
    },
    
    // Configurar eventos
    setupEvents() {
        if (this.btnExpandir) {
            this.btnExpandir.addEventListener('click', () => {
                this.toggleExpandir();
            });
        }
    },
    
    // Mostrar la barra
    mostrar(datosCliente) {
        if (!this.barra) return;
        
        console.log('[Salud Financiera] Mostrando barra con datos:', datosCliente);
        
        // Actualizar datos
        this.actualizarDatos(datosCliente);
        
        // Mostrar barra
        this.barra.style.display = 'block';
        setTimeout(() => {
            this.barra.classList.add('visible');
        }, 10);
        
        // Agregar clase al body para ajustar otras barras
        document.body.classList.add('salud-financiera-activa');
        
        this.visible = true;
    },
    
    // Ocultar la barra
    ocultar() {
        if (!this.barra) return;
        
        console.log('[Salud Financiera] Ocultando barra');
        
        this.barra.classList.remove('visible');
        setTimeout(() => {
            this.barra.style.display = 'none';
        }, 300);
        
        // Quitar clase del body
        document.body.classList.remove('salud-financiera-activa');
        
        this.visible = false;
        
        // Si estaba expandida, colapsar
        if (this.expandida) {
            this.toggleExpandir();
        }
    },
    
    // Toggle expandir/colapsar (móvil)
    toggleExpandir() {
        if (!this.barraContent) return;
        
        this.expandida = !this.expandida;
        
        if (this.expandida) {
            this.barraContent.classList.add('expandido');
            const btnTexto = document.getElementById('btn-expandir-texto');
            if (btnTexto) btnTexto.textContent = '▲';
        } else {
            this.barraContent.classList.remove('expandido');
            const btnTexto = document.getElementById('btn-expandir-texto');
            if (btnTexto) btnTexto.textContent = '▼';
        }
    },
    
    // Actualizar datos en la barra
    actualizarDatos(datos) {
        // Nombre del cliente
        const nombreElem = document.getElementById('cliente-nombre');
        if (nombreElem) {
            nombreElem.textContent = datos.nombre || '---';
        }
        
        // PG Prom 3M
        const pgPromElem = document.getElementById('pg-prom');
        if (pgPromElem) {
            pgPromElem.textContent = this.formatearMoneda(datos.pgProm3M || 0);
        }
        
        // Compró este mes
        const comproElem = document.getElementById('compro');
        if (comproElem) {
            comproElem.textContent = this.formatearMoneda(datos.comproMes || 0);
        }
        
        // Saldo Total
        const saldoTotalElem = document.getElementById('saldo-total');
        if (saldoTotalElem) {
            saldoTotalElem.textContent = this.formatearMoneda(datos.saldoTotal || 0);
        }
        
        // Pago este mes
        const pagoMesElem = document.getElementById('pago-mes');
        if (pagoMesElem) {
            pagoMesElem.textContent = this.formatearMoneda(datos.saldoAnterior || 0);
        }
        
        // Cupo (con cálculo y color)
        this.actualizarCupo(datos);
    },
    
    // Actualizar cupo con color según estado
    actualizarCupo(datos) {
        const cupoElem = document.getElementById('cupo-valor');
        if (!cupoElem) return;
        
        // Calcular cupo disponible
        const pgProm = datos.pgProm3M || 0;
        const compro = datos.comproMes || 0;
        const cupoDisponible = pgProm - compro;
        
        // Determinar color
        let colorClass = 'cupo-verde';
        
        if (cupoDisponible < 0) {
            // Está en negativo (usando flexibilidad)
            const porcentajeFlex = Math.abs(cupoDisponible) / pgProm * 100;
            
            if (porcentajeFlex <= 39) {
                colorClass = 'cupo-amarillo';  // En flexibilidad OK
            } else {
                colorClass = 'cupo-rojo';  // Excedió flexibilidad
            }
        }
        
        // Actualizar elemento
        cupoElem.textContent = this.formatearMoneda(cupoDisponible);
        cupoElem.className = 'cupo-valor ' + colorClass;
    },
    
    // Formatear número como moneda
    formatearMoneda(valor) {
        const numero = parseFloat(valor) || 0;
        const absoluto = Math.abs(numero);
        const signo = numero < 0 ? '-' : '';
        
        // Formatear con separadores de miles
        const formateado = absoluto.toLocaleString('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        return `${signo}$${formateado}`;
    },
    
    // Obtener estado actual
    getEstado() {
        return {
            visible: this.visible,
            expandida: this.expandida
        };
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    BarraSaludFinanciera.init();
});

// Exponer globalmente para uso desde otros scripts
window.BarraSaludFinanciera = BarraSaludFinanciera;

// ============================================
// FUNCIÓN DE PRUEBA (TEMPORAL)
// Para testing, eliminar en producción
// ============================================

window.testSaludFinanciera = function(estado = 'verde') {
    const datosPrueba = {
        verde: {
            nombre: 'FERRETERÍA GOMEZ',
            pgProm3M: 1000000,
            comproMes: 900000,
            saldoTotal: 1100000,
            saldoAnterior: 200000
        },
        amarillo: {
            nombre: 'FERRETERÍA GOMEZ',
            pgProm3M: 100000,
            comproMes: 130000,
            saldoTotal: 150000,
            saldoAnterior: 20000
        },
        rojo: {
            nombre: 'FERRETERÍA GOMEZ',
            pgProm3M: 100000,
            comproMes: 145000,
            saldoTotal: 165000,
            saldoAnterior: 20000
        }
    };
    
    const datos = datosPrueba[estado] || datosPrueba.verde;
    BarraSaludFinanciera.mostrar(datos);
    
    console.log(`[TEST] Mostrando barra en estado: ${estado}`);
};

console.log('[Salud Financiera] Script cargado. Usa testSaludFinanciera("verde|amarillo|rojo") para probar.');