// js/MonitoringSystem.js

class MonitoringSystem {
    constructor() {
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
                searchCount: 0
            }
        };
    }

    trackPerformance(type, value) {
        this.metrics.performance[type].push({
            timestamp: Date.now(),
            value: value
        });
    }

    trackError(error, context) {
        this.metrics.errors.count++;
        this.metrics.errors.lastError = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: Date.now()
        };
    }

    trackUsage(type, data) {
        switch(type) {
            case 'pageView':
                this.metrics.usage.pageViews++;
                break;
            case 'productView':
                const current = this.metrics.usage.productViews.get(data.productId) || 0;
                this.metrics.usage.productViews.set(data.productId, current + 1);
                break;
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            timestamp: Date.now()
        };
    }
}

export default MonitoringSystem;