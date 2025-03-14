// test/FallbackManager.test.js
import FallbackManager from '../js/FallbackManager';

describe('FallbackManager', () => {
    let fallbackManager;
    
    beforeEach(() => {
        fallbackManager = new FallbackManager();
    });

    test('should handle primary system success', async () => {
        const primary = jest.fn().mockResolvedValue(true);
        const fallback = jest.fn();
        
        const result = await fallbackManager.manageSystems(primary, fallback);
        
        expect(result).toBe(true);
        expect(primary).toHaveBeenCalled();
        expect(fallback).not.toHaveBeenCalled();
    });

    test('should use fallback when primary fails', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
        const fallback = jest.fn().mockResolvedValue(true);
        
        await fallbackManager.manageSystems(primary, fallback);
        
        expect(fallback).toHaveBeenCalled();
    });
});