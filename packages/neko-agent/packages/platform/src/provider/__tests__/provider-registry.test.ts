/**
 * ProviderRegistry Unit Tests
 *
 * Tests for health monitoring and adapter management functionality.
 * Provider/model data access is now handled by ConfigManager.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProviderRegistry } from '../provider-registry';
import { ConfigManager } from '../../config/config-manager';
import type { Provider, Model } from '../../types/provider';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock config manager
function createMockConfigManager(): ConfigManager {
  const mockProviders: Provider[] = [
    {
      id: 'openai',
      name: 'openai',
      displayName: 'OpenAI',
      type: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      enabled: true,
    },
    {
      id: 'anthropic',
      name: 'anthropic',
      displayName: 'Anthropic',
      type: 'anthropic',
      apiUrl: 'https://api.anthropic.com',
      enabled: true,
    },
    {
      id: 'disabled-provider',
      name: 'disabled-provider',
      displayName: 'Disabled',
      type: 'openai',
      apiUrl: 'https://disabled.com',
      enabled: false,
    },
  ];

  const mockModels: Model[] = [
    {
      id: 'gpt-4',
      name: 'gpt-4',
      displayName: 'GPT-4',
      providerId: 'openai',
      capabilities: ['chat', 'vision', 'function_calling'],
      contextWindow: 128000,
      enabled: true,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'gpt-3.5-turbo',
      displayName: 'GPT-3.5 Turbo',
      providerId: 'openai',
      capabilities: ['chat', 'function_calling'],
      contextWindow: 16000,
      enabled: true,
    },
    {
      id: 'claude-3-opus',
      name: 'claude-3-opus',
      displayName: 'Claude 3 Opus',
      providerId: 'anthropic',
      capabilities: ['chat', 'vision', 'function_calling'],
      contextWindow: 200000,
      enabled: true,
    },
    {
      id: 'disabled-model',
      name: 'disabled-model',
      displayName: 'Disabled Model',
      providerId: 'openai',
      capabilities: ['chat'],
      contextWindow: 4000,
      enabled: false,
    },
  ];

  const manager = {
    getProvider: vi.fn((id: string) => mockProviders.find((p) => p.id === id)),
    getProviders: vi.fn(() => mockProviders),
    getEnabledProviders: vi.fn(() => mockProviders.filter((p) => p.enabled)),
    getModel: vi.fn((id: string) => mockModels.find((m) => m.id === id)),
    getModels: vi.fn(() => mockModels),
    getEnabledModels: vi.fn(() => mockModels.filter((m) => m.enabled)),
    getModelsByProvider: vi.fn((providerId: string) =>
      mockModels.filter((m) => m.providerId === providerId)
    ),
  };

  return manager as unknown as ConfigManager;
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  let configManager: ConfigManager;

  beforeEach(() => {
    mockFetch.mockReset();
    configManager = createMockConfigManager();
    registry = new ProviderRegistry(configManager);
  });

  afterEach(() => {
    registry.dispose();
  });

  describe('getAdapter', () => {
    it('should get adapter for valid provider', () => {
      const adapter = registry.getAdapter('openai');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('openai');
    });

    it('should return undefined for non-existent provider', () => {
      const adapter = registry.getAdapter('non-existent');
      expect(adapter).toBeUndefined();
    });
  });

  describe('getModelsWithCapability', () => {
    it('should get models with specific capability', () => {
      const models = registry.getModelsWithCapability('vision');
      expect(models.length).toBe(2);
      expect(models.every((m) => m.capabilities.includes('vision'))).toBe(true);
    });

    it('should return empty array for unknown capability', () => {
      const models = registry.getModelsWithCapability('unknown-capability');
      expect(models.length).toBe(0);
    });
  });

  describe('checkProviderHealth', () => {
    it('should return healthy status for available provider', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const status = await registry.checkProviderHealth('openai');

      expect(status.providerId).toBe('openai');
      expect(status.available).toBe(true);
      expect(status.lastChecked).toBeInstanceOf(Date);
      expect(status.latency).toBeDefined();
    });

    it('should return healthy status for 405 response (HEAD not allowed)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 405 });

      const status = await registry.checkProviderHealth('openai');

      expect(status.available).toBe(true);
    });

    it('should return unhealthy status for unavailable provider', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const status = await registry.checkProviderHealth('openai');

      expect(status.available).toBe(false);
    });

    it('should return unhealthy status for fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const status = await registry.checkProviderHealth('openai');

      expect(status.available).toBe(false);
      expect(status.error).toBe('Network error');
    });

    it('should return error status for non-existent provider', async () => {
      const status = await registry.checkProviderHealth('non-existent');

      expect(status.available).toBe(false);
      expect(status.error).toBe('Provider not found');
    });
  });

  describe('getProviderStatus', () => {
    it('should return undefined if not checked', () => {
      const status = registry.getProviderStatus('openai');
      expect(status).toBeUndefined();
    });

    it('should return status after health check', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await registry.checkProviderHealth('openai');
      const status = registry.getProviderStatus('openai');

      expect(status).toBeDefined();
      expect(status?.available).toBe(true);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true if not checked (assume available)', () => {
      const available = registry.isProviderAvailable('openai');
      expect(available).toBe(true);
    });

    it('should return actual status after health check', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await registry.checkProviderHealth('openai');
      const available = registry.isProviderAvailable('openai');

      expect(available).toBe(false);
    });
  });

  describe('checkAllProvidersHealth', () => {
    it('should check health of all enabled providers', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const statusMap = await registry.checkAllProvidersHealth();

      expect(statusMap.size).toBe(2); // Only enabled providers
      expect(statusMap.has('openai')).toBe(true);
      expect(statusMap.has('anthropic')).toBe(true);
      expect(statusMap.has('disabled-provider')).toBe(false);
    });
  });

  describe('health check interval', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start periodic health checks', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      registry.startHealthChecks(1000);

      // Initial check
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalled();

      const initialCallCount = mockFetch.mock.calls.length;

      // After interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should stop health checks on dispose', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      registry.startHealthChecks(1000);
      await vi.advanceTimersByTimeAsync(0);

      const callCount = mockFetch.mock.calls.length;
      registry.dispose();

      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch.mock.calls.length).toBe(callCount);
    });

    it('should stop previous interval when starting new one', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      registry.startHealthChecks(1000);
      await vi.advanceTimersByTimeAsync(0);

      registry.startHealthChecks(500);
      await vi.advanceTimersByTimeAsync(0);

      // Should only have one interval running
      const callCount = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(500);

      // Only one set of checks should have run
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(callCount + 2);
    });
  });

  describe('dispose', () => {
    it('should clear provider status', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await registry.checkProviderHealth('openai');
      expect(registry.getProviderStatus('openai')).toBeDefined();

      registry.dispose();
      expect(registry.getProviderStatus('openai')).toBeUndefined();
    });
  });

  describe('circuit breaker', () => {
    it('should start with closed circuit', () => {
      expect(registry.getCircuitState('openai')).toBe('closed');
      expect(registry.isCircuitOpen('openai')).toBe(false);
    });

    it('should record success and failure', () => {
      // Record some successes
      registry.recordSuccess('openai');
      registry.recordSuccess('openai');
      expect(registry.canExecute('openai')).toBe(true);

      // Record failures but not enough to open circuit
      registry.recordFailure('openai', new Error('test error'));
      registry.recordFailure('openai', new Error('test error'));
      expect(registry.canExecute('openai')).toBe(true);
    });

    it('should open circuit after threshold failures', () => {
      // Create registry with low threshold for testing
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 1000,
        },
      });

      // Record failures to open circuit
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));
      testRegistry.recordFailure('openai', new Error('error 3'));

      expect(testRegistry.isCircuitOpen('openai')).toBe(true);
      expect(testRegistry.getCircuitState('openai')).toBe('open');
      expect(testRegistry.canExecute('openai')).toBe(false);

      testRegistry.dispose();
    });

    it('should affect isProviderAvailable when circuit is open', () => {
      // Create registry with low threshold
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 1000,
        },
      });

      expect(testRegistry.isProviderAvailable('openai')).toBe(true);

      // Open circuit
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));

      expect(testRegistry.isProviderAvailable('openai')).toBe(false);

      testRegistry.dispose();
    });

    it('should reset circuit manually', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 60000,
        },
      });

      // Open circuit
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));
      expect(testRegistry.isCircuitOpen('openai')).toBe(true);

      // Reset circuit
      testRegistry.resetCircuit('openai');
      expect(testRegistry.isCircuitOpen('openai')).toBe(false);
      expect(testRegistry.getCircuitState('openai')).toBe('closed');

      testRegistry.dispose();
    });

    it('should execute with circuit breaker protection', async () => {
      const operation = vi.fn().mockResolvedValue('result');

      const result = await registry.executeWithCircuitBreaker('openai', operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalled();
    });

    it('should reject when circuit is open', async () => {
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 60000,
        },
      });

      // Open circuit
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));

      const operation = vi.fn().mockResolvedValue('result');

      await expect(
        testRegistry.executeWithCircuitBreaker('openai', operation)
      ).rejects.toThrow('Circuit breaker is open');

      expect(operation).not.toHaveBeenCalled();

      testRegistry.dispose();
    });

    it('should get extended status with circuit info', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      // Execute operation to increment totalRequests
      await registry.executeWithCircuitBreaker('openai', async () => 'ok');
      registry.recordFailure('openai', new Error('test'));

      await registry.checkProviderHealth('openai');
      const status = registry.getProviderStatus('openai');

      expect(status).toBeDefined();
      expect(status?.circuitState).toBe('closed');
      expect(status?.circuitStats).toBeDefined();
      expect(status?.circuitStats?.totalRequests).toBeGreaterThan(0);
    });

    it('should get all circuit states', () => {
      registry.recordSuccess('openai');
      registry.recordSuccess('anthropic');

      const states = registry.getAllCircuitStates();

      expect(states.get('openai')).toBe('closed');
      expect(states.get('anthropic')).toBe('closed');
    });

    it('should get open circuits list', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 60000,
        },
      });

      // Open one circuit
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));

      // Keep another closed
      testRegistry.recordSuccess('anthropic');

      const openCircuits = testRegistry.getOpenCircuits();

      expect(openCircuits).toContain('openai');
      expect(openCircuits).not.toContain('anthropic');

      testRegistry.dispose();
    });

    it('should reset all circuits', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 60000,
        },
      });

      // Open both circuits
      testRegistry.recordFailure('openai', new Error('error 1'));
      testRegistry.recordFailure('openai', new Error('error 2'));
      testRegistry.recordFailure('anthropic', new Error('error 1'));
      testRegistry.recordFailure('anthropic', new Error('error 2'));

      expect(testRegistry.getOpenCircuits().length).toBe(2);

      testRegistry.resetAllCircuits();

      expect(testRegistry.getOpenCircuits().length).toBe(0);

      testRegistry.dispose();
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', () => {
      const result = registry.tryAcquireRateLimit('openai');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should block requests over rate limit', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        rateLimit: {
          maxRequests: 3,
          windowMs: 60000,
        },
      });

      // Use up rate limit
      testRegistry.tryAcquireRateLimit('openai');
      testRegistry.tryAcquireRateLimit('openai');
      testRegistry.tryAcquireRateLimit('openai');

      const result = testRegistry.tryAcquireRateLimit('openai');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);

      testRegistry.dispose();
    });

    it('should support per-provider rate limits', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        rateLimit: { maxRequests: 100, windowMs: 60000 },
        providerRateLimits: {
          openai: { requestsPerMinute: 50 },
          anthropic: { requestsPerMinute: 30 },
        },
      });

      expect(testRegistry.getRateLimitStats('openai').max).toBe(50);
      expect(testRegistry.getRateLimitStats('anthropic').max).toBe(30);

      testRegistry.dispose();
    });

    it('should update rate limit dynamically', () => {
      registry.updateRateLimit('openai', 100);
      expect(registry.getRateLimitStats('openai').max).toBe(100);
    });

    it('should handle rate limit response headers', () => {
      const retryAfter = registry.handleRateLimitResponse('openai', {
        'retry-after': '10',
        'x-ratelimit-limit': '200',
      });

      expect(retryAfter).toBe(10000);
      expect(registry.getRateLimitStats('openai').max).toBe(200);
    });

    it('should execute with rate limiting', async () => {
      const operation = vi.fn().mockResolvedValue('result');

      const result = await registry.executeWithRateLimit('openai', operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalled();
    });

    it('should execute with full protection (rate limit + circuit breaker)', async () => {
      const operation = vi.fn().mockResolvedValue('result');

      const result = await registry.executeWithProtection('openai', operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalled();
    });

    it('should include rate limit stats in provider status', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      // Make some requests
      registry.tryAcquireRateLimit('openai');
      registry.tryAcquireRateLimit('openai');

      await registry.checkProviderHealth('openai');
      const status = registry.getProviderStatus('openai');

      expect(status).toBeDefined();
      expect(status?.rateLimitStats).toBeDefined();
      expect(status?.rateLimitStats?.totalRequests).toBe(2);
    });

    it('should reset rate limiter', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        rateLimit: { maxRequests: 2, windowMs: 60000 },
      });

      testRegistry.tryAcquireRateLimit('openai');
      testRegistry.tryAcquireRateLimit('openai');
      expect(testRegistry.tryAcquireRateLimit('openai').allowed).toBe(false);

      testRegistry.resetRateLimit('openai');
      expect(testRegistry.tryAcquireRateLimit('openai').allowed).toBe(true);

      testRegistry.dispose();
    });

    it('should reset all rate limiters', () => {
      const testRegistry = new ProviderRegistry(configManager, {
        rateLimit: { maxRequests: 1, windowMs: 60000 },
      });

      testRegistry.tryAcquireRateLimit('openai');
      testRegistry.tryAcquireRateLimit('anthropic');

      expect(testRegistry.tryAcquireRateLimit('openai').allowed).toBe(false);
      expect(testRegistry.tryAcquireRateLimit('anthropic').allowed).toBe(false);

      testRegistry.resetAllRateLimits();

      expect(testRegistry.tryAcquireRateLimit('openai').allowed).toBe(true);
      expect(testRegistry.tryAcquireRateLimit('anthropic').allowed).toBe(true);

      testRegistry.dispose();
    });

    it('should get all rate limit stats', () => {
      registry.tryAcquireRateLimit('openai');
      registry.tryAcquireRateLimit('anthropic');

      const stats = registry.getAllRateLimitStats();

      expect(stats.get('openai')).toBeDefined();
      expect(stats.get('anthropic')).toBeDefined();
    });
  });
});
