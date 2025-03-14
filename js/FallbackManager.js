// js/FallbackManager.js

class FallbackManager {
    constructor() {
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;
        this.isUsingFallback = false;
    }

    async manageSystems(primaryFunction, fallbackFunction) {
        try {
            await primaryFunction();
            this.isUsingFallback = false;
            this.retryAttempts = 0;
            return true;
        } catch (error) {
            console.error('Error en sistema principal:', error);
            this.isUsingFallback = true;
            await fallbackFunction();
            return this.scheduleRetry(primaryFunction, fallbackFunction);
        }
    }

    async scheduleRetry(primaryFunction, fallbackFunction) {
        if (this.retryAttempts >= this.maxRetries) return false;

        this.retryAttempts++;
        setTimeout(async () => {
            await this.manageSystems(primaryFunction, fallbackFunction);
        }, this.retryDelay * this.retryAttempts);

        return false;
    }

    getStatus() {
        return {
            isUsingFallback: this.isUsingFallback,
            retryAttempts: this.retryAttempts,
            nextRetryIn: this.isUsingFallback ? this.retryDelay * (this.retryAttempts + 1) : 0
        };
    }
}

export default FallbackManager;