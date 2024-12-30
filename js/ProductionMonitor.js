// js/ProductionMonitor.js

class ProductionMonitor {
        constructor(config = {}) {
            this.config = {
                sampleRate: 0.1, // 10% de las operaciones
                logLevel: 'error', // 'error', 'warn', 'info', 'debug'
                metricsInterval: 60000, // 1 minuto
                ...config
            };

            this.metrics = {
                performance: {
                    loadTimes: [],
                    responseLatency: [],
                    memoryUsage: []
                },
                errors: {
                    count: 0,
                    lastError: null,
                    errorTypes: new Map()
                },
                usage: {
                    pageViews: 0,
                    productViews: new Map(),
                    searchPatterns: [],
                    categoryAccess: new Map()
                }
            };
        }



            /**
         * Monitorear rendimiento de una operación
         * @param {string} operationType - Tipo de operación (ej: 'productLoad', 'imageLoad')
         * @param {number} duration - Duración en milisegundos
         * @param {Object} metadata - Datos adicionales de la operación
         */
        trackPerformance(operationType, duration, metadata = {}) {
            if (Math.random() > this.config.sampleRate) return;

            const performanceData = {
                type: operationType,
                duration,
                timestamp: Date.now(),
                ...metadata
            };

            this.metrics.performance.loadTimes.push(performanceData);

            // Mantener solo últimas 1000 mediciones
            if (this.metrics.performance.loadTimes.length > 1000) {
                this.metrics.performance.loadTimes.shift();
            }
        }

        /**
         * Registrar un error en producción
         * @param {Error} error - Error ocurrido
         * @param {string} context - Contexto donde ocurrió el error
         * @param {Object} metadata - Datos adicionales del error
         */
        trackError(error, context, metadata = {}) {
            const errorData = {
                message: error.message,
                stack: error.stack,
                context,
                timestamp: Date.now(),
                ...metadata
            };

            this.metrics.errors.count++;
            this.metrics.errors.lastError = errorData;

            // Agrupar por tipo de error
            const errorType = error.name || 'Unknown';
            const currentCount = this.metrics.errors.errorTypes.get(errorType) || 0;
            this.metrics.errors.errorTypes.set(errorType, currentCount + 1);

            if (this.config.logLevel === 'error') {
                console.error('Production Error:', errorData);
            }
        }

        /**
         * Registrar uso de características
         * @param {string} featureType - Tipo de característica (ej: 'search', 'filter')
         * @param {Object} data - Datos de uso
         */
        trackUsage(featureType, data = {}) {
            if (Math.random() > this.config.sampleRate) return;

            switch(featureType) {
                case 'pageView':
                    this.metrics.usage.pageViews++;
                    break;

                case 'productView':
                    const { productId } = data;
                    if (productId) {
                        const currentViews = this.metrics.usage.productViews.get(productId) || 0;
                        this.metrics.usage.productViews.set(productId, currentViews + 1);
                    }
                    break;

                case 'search':
                    this.metrics.usage.searchPatterns.push({
                        query: data.query,
                        timestamp: Date.now(),
                        results: data.resultCount
                    });
                    break;

                case 'categoryAccess':
                    const { category } = data;
                    if (category) {
                        const currentAccess = this.metrics.usage.categoryAccess.get(category) || 0;
                        this.metrics.usage.categoryAccess.set(category, currentAccess + 1);
                    }
                    break;
            }
        }

        /**
         * Obtener métricas actuales
         * @returns {Object} Métricas consolidadas
         */
        getMetrics() {
            const now = Date.now();
            const lastMinute = now - 60000;
            const lastHour = now - 3600000;

            return {
                performance: {
                    avgLoadTime: this.calculateAverage(this.metrics.performance.loadTimes),
                    last1Min: this.metrics.performance.loadTimes.filter(m => m.timestamp > lastMinute),
                    last1Hour: this.metrics.performance.loadTimes.filter(m => m.timestamp > lastHour)
                },
                errors: {
                    total: this.metrics.errors.count,
                    byType: Object.fromEntries(this.metrics.errors.errorTypes),
                    lastError: this.metrics.errors.lastError
                },
                usage: {
                    pageViews: this.metrics.usage.pageViews,
                    topProducts: Array.from(this.metrics.usage.productViews.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10),
                    topCategories: Array.from(this.metrics.usage.categoryAccess.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                }
            };
        }

        /**
         * Calcular promedio de tiempos de carga
         * @private
         */
        calculateAverage(metrics) {
            if (!metrics.length) return 0;
            const sum = metrics.reduce((acc, curr) => acc + curr.duration, 0);
            return (sum / metrics.length).toFixed(2);
        }


}
export default ProductionMonitor ;