// test/MonitoringSystem.test.js
import MonitoringSystem from '../js/MonitoringSystem';

describe('MonitoringSystem', () => {
    let monitoringSystem;
    
    beforeEach(() => {
        monitoringSystem = new MonitoringSystem();
    });

    test('should track performance metrics', () => {
        monitoringSystem.trackPerformance('loadTimes', 100);
        expect(monitoringSystem.metrics.performance.loadTimes).toHaveLength(1);
    });

    test('should track errors', () => {
        const error = new Error('Test error');
        monitoringSystem.trackError(error, 'test');
        expect(monitoringSystem.metrics.errors.count).toBe(1);
    });

    test('should track usage', () => {
        monitoringSystem.trackUsage('pageView', { page: 'test' });
        expect(monitoringSystem.metrics.usage.pageViews).toBe(1);
    });
});