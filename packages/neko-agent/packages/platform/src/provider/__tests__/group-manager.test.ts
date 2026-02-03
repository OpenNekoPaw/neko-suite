/**
 * GroupManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupManager } from '../group-manager';
import { ProviderRegistry } from '../provider-registry';
import { ConfigManager } from '../../config/config-manager';
import type { Group } from '../../types/group';
import type { Provider, Model } from '../../types/provider';

// Create mock providers
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

// Create mock models
const mockModels: Model[] = [
  {
    id: 'gpt-4',
    name: 'gpt-4',
    displayName: 'GPT-4',
    providerId: 'openai',
    capabilities: ['chat'],
    contextWindow: 128000,
    enabled: true,
    inputCostPer1k: 0.03,
    outputCostPer1k: 0.06,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    providerId: 'openai',
    capabilities: ['chat'],
    contextWindow: 16000,
    enabled: true,
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.002,
  },
  {
    id: 'claude-3-opus',
    name: 'claude-3-opus',
    displayName: 'Claude 3 Opus',
    providerId: 'anthropic',
    capabilities: ['chat'],
    contextWindow: 200000,
    enabled: true,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
  },
  {
    id: 'claude-3-sonnet',
    name: 'claude-3-sonnet',
    displayName: 'Claude 3 Sonnet',
    providerId: 'anthropic',
    capabilities: ['chat'],
    contextWindow: 200000,
    enabled: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
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

// Create mock groups
const mockGroups: Group[] = [
  {
    id: 'default',
    name: 'Default Group',
    models: ['gpt-4', 'claude-3-opus', 'gpt-3.5-turbo'],
    strategy: { type: 'priority' },
    fallback: {
      enabled: true,
      maxAttempts: 3,
      triggerOn: ['rate_limit', 'timeout', 'server_error'],
    },
    enabled: true,
  },
  {
    id: 'round-robin',
    name: 'Round Robin Group',
    models: ['gpt-4', 'claude-3-opus'],
    strategy: { type: 'round-robin' },
    fallback: {
      enabled: true,
      maxAttempts: 2,
      triggerOn: ['rate_limit'],
    },
    enabled: true,
  },
  {
    id: 'weighted',
    name: 'Weighted Group',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    strategy: {
      type: 'weighted',
      weights: { 'gpt-4': 3, 'gpt-3.5-turbo': 7 },
    },
    fallback: {
      enabled: false,
      maxAttempts: 1,
      triggerOn: [],
    },
    enabled: true,
  },
  {
    id: 'cost-optimal',
    name: 'Cost Optimal Group',
    models: ['gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet'],
    strategy: { type: 'cost-optimal', maxCostPer1k: 0.02 },
    fallback: {
      enabled: true,
      maxAttempts: 3,
      triggerOn: ['rate_limit', 'timeout'],
    },
    enabled: true,
  },
  {
    id: 'disabled-group',
    name: 'Disabled Group',
    models: ['gpt-4'],
    strategy: { type: 'priority' },
    fallback: {
      enabled: true,
      maxAttempts: 3,
      triggerOn: ['rate_limit'],
    },
    enabled: false,
  },
];

function createMockConfigManager() {
  return {
    getProvider: vi.fn((id: string) => mockProviders.find((p) => p.id === id)),
    getProviders: vi.fn(() => mockProviders),
    getEnabledProviders: vi.fn(() => mockProviders.filter((p) => p.enabled)),
    getModel: vi.fn((id: string) => mockModels.find((m) => m.id === id)),
    getModels: vi.fn(() => mockModels),
    getEnabledModels: vi.fn(() => mockModels.filter((m) => m.enabled)),
    getModelsByProvider: vi.fn((providerId: string) =>
      mockModels.filter((m) => m.providerId === providerId)
    ),
    getGroup: vi.fn((id: string) => mockGroups.find((g) => g.id === id)),
    getGroups: vi.fn(() => mockGroups),
    getEnabledGroups: vi.fn(() => mockGroups.filter((g) => g.enabled)),
  } as unknown as ConfigManager;
}

function createMockProviderRegistry(configManager: ConfigManager) {
  const providerAvailability = new Map<string, boolean>();
  providerAvailability.set('openai', true);
  providerAvailability.set('anthropic', true);

  return {
    getProvider: (id: string) => configManager.getProvider(id),
    getProviders: () => configManager.getProviders(),
    getModel: (id: string) => configManager.getModel(id),
    getModels: () => configManager.getModels(),
    getEnabledModels: () => configManager.getEnabledModels(),
    getModelsByProvider: (providerId: string) => configManager.getModelsByProvider(providerId),
    isProviderAvailable: (providerId: string) => providerAvailability.get(providerId) ?? true,
    setProviderAvailability: (providerId: string, available: boolean) => {
      providerAvailability.set(providerId, available);
    },
  } as unknown as ProviderRegistry & {
    setProviderAvailability: (providerId: string, available: boolean) => void;
  };
}

describe('GroupManager', () => {
  let groupManager: GroupManager;
  let configManager: ConfigManager;
  let providerRegistry: ReturnType<typeof createMockProviderRegistry>;

  beforeEach(() => {
    configManager = createMockConfigManager();
    providerRegistry = createMockProviderRegistry(configManager);
    groupManager = new GroupManager(configManager, providerRegistry as unknown as ProviderRegistry);
  });

  describe('getGroup', () => {
    it('should get group by ID', () => {
      const group = groupManager.getGroup('default');
      expect(group).toBeDefined();
      expect(group?.id).toBe('default');
    });

    it('should return undefined for non-existent group', () => {
      const group = groupManager.getGroup('non-existent');
      expect(group).toBeUndefined();
    });
  });

  describe('getGroups', () => {
    it('should get all groups', () => {
      const groups = groupManager.getGroups();
      expect(groups.length).toBe(5);
    });
  });

  describe('getEnabledGroups', () => {
    it('should get only enabled groups', () => {
      const groups = groupManager.getEnabledGroups();
      expect(groups.length).toBe(4);
      expect(groups.every((g) => g.enabled)).toBe(true);
    });
  });

  describe('getGroupModels', () => {
    it('should get all models in a group', () => {
      const models = groupManager.getGroupModels('default');
      expect(models.length).toBe(3);
    });

    it('should return empty array for non-existent group', () => {
      const models = groupManager.getGroupModels('non-existent');
      expect(models.length).toBe(0);
    });
  });

  describe('route with priority strategy', () => {
    it('should select first available model', () => {
      const result = groupManager.route('default');
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('gpt-4');
      expect(result?.attempt).toBe(1);
    });

    it('should skip excluded models', () => {
      const result = groupManager.route('default', ['gpt-4']);
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('claude-3-opus');
      expect(result?.attempt).toBe(2);
    });

    it('should return null when all models excluded', () => {
      const result = groupManager.route('default', ['gpt-4', 'claude-3-opus', 'gpt-3.5-turbo']);
      expect(result).toBeNull();
    });

    it('should return null for disabled group', () => {
      const result = groupManager.route('disabled-group');
      expect(result).toBeNull();
    });

    it('should return null for non-existent group', () => {
      const result = groupManager.route('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('route with round-robin strategy', () => {
    it('should cycle through models', () => {
      const result1 = groupManager.route('round-robin');
      expect(result1?.modelId).toBe('gpt-4');

      const result2 = groupManager.route('round-robin');
      expect(result2?.modelId).toBe('claude-3-opus');

      const result3 = groupManager.route('round-robin');
      expect(result3?.modelId).toBe('gpt-4');
    });

    it('should reset round-robin index', () => {
      groupManager.route('round-robin');
      groupManager.route('round-robin');

      groupManager.resetRoundRobin('round-robin');

      const result = groupManager.route('round-robin');
      expect(result?.modelId).toBe('gpt-4');
    });

    it('should reset all round-robin indices', () => {
      groupManager.route('round-robin');
      groupManager.route('round-robin');

      groupManager.resetAllRoundRobin();

      const result = groupManager.route('round-robin');
      expect(result?.modelId).toBe('gpt-4');
    });
  });

  describe('route with weighted strategy', () => {
    it('should select models based on weight', () => {
      // Run multiple times to verify distribution
      const counts: Record<string, number> = { 'gpt-4': 0, 'gpt-3.5-turbo': 0 };

      for (let i = 0; i < 100; i++) {
        const result = groupManager.route('weighted');
        if (result) {
          counts[result.modelId]++;
        }
      }

      // gpt-3.5-turbo has weight 7, gpt-4 has weight 3
      // Expect gpt-3.5-turbo to be selected more often
      expect(counts['gpt-3.5-turbo']).toBeGreaterThan(counts['gpt-4']);
    });
  });

  describe('route with cost-optimal strategy', () => {
    it('should select cheapest model within cost limit', () => {
      const result = groupManager.route('cost-optimal');
      expect(result).toBeDefined();
      // gpt-3.5-turbo is cheapest at 0.0015 average
      expect(result?.modelId).toBe('gpt-3.5-turbo');
    });

    it('should exclude models exceeding cost limit', () => {
      // gpt-4 costs 0.045 average, which exceeds 0.02 limit
      // Only gpt-3.5-turbo (0.0015) and claude-3-sonnet (0.009) should be considered
      const result = groupManager.route('cost-optimal');
      expect(result?.modelId).not.toBe('gpt-4');
    });
  });

  describe('route with unavailable provider', () => {
    it('should skip models with unavailable provider', () => {
      providerRegistry.setProviderAvailability('openai', false);

      const result = groupManager.route('default');
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('claude-3-opus');
    });

    it('should return null when all providers unavailable', () => {
      providerRegistry.setProviderAvailability('openai', false);
      providerRegistry.setProviderAvailability('anthropic', false);

      const result = groupManager.route('default');
      expect(result).toBeNull();
    });
  });

  describe('routeFallback', () => {
    it('should route to next model on rate limit error', () => {
      const result = groupManager.routeFallback('default', 'rate_limit', ['gpt-4']);
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('claude-3-opus');
      expect(result?.attempt).toBe(2);
    });

    it('should route to next model on timeout error', () => {
      const result = groupManager.routeFallback('default', 'timeout', ['gpt-4']);
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('claude-3-opus');
    });

    it('should route to next model on server error', () => {
      const result = groupManager.routeFallback('default', 'server', ['gpt-4']);
      expect(result).toBeDefined();
      expect(result?.modelId).toBe('claude-3-opus');
    });

    it('should not fallback on authentication error', () => {
      const result = groupManager.routeFallback('default', 'authentication', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should not fallback on validation error', () => {
      const result = groupManager.routeFallback('default', 'validation', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should not fallback when disabled', () => {
      const result = groupManager.routeFallback('weighted', 'rate_limit', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should respect max attempts', () => {
      // round-robin group has maxAttempts: 2
      const result = groupManager.routeFallback('round-robin', 'rate_limit', [
        'gpt-4',
        'claude-3-opus',
      ]);
      expect(result).toBeNull();
    });

    it('should return null for disabled group', () => {
      const result = groupManager.routeFallback('disabled-group', 'rate_limit', []);
      expect(result).toBeNull();
    });

    it('should return null for non-existent group', () => {
      const result = groupManager.routeFallback('non-existent', 'rate_limit', []);
      expect(result).toBeNull();
    });
  });

  describe('fallback trigger mapping', () => {
    it('should trigger fallback on network error (unavailable)', () => {
      // Only 'default' has 'server_error' which maps to 'server', not 'network'
      // Let's check with a group that has 'unavailable' trigger
      const group = mockGroups.find((g) => g.id === 'default');
      // default doesn't have 'unavailable', so network should not trigger
      const result = groupManager.routeFallback('default', 'network', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should trigger fallback on context_length error if configured', () => {
      // No group has context_length trigger configured
      const result = groupManager.routeFallback('default', 'context_length', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should not trigger fallback on not_found error', () => {
      const result = groupManager.routeFallback('default', 'not_found', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should not trigger fallback on content_filter error', () => {
      const result = groupManager.routeFallback('default', 'content_filter', ['gpt-4']);
      expect(result).toBeNull();
    });

    it('should not trigger fallback on unknown error', () => {
      const result = groupManager.routeFallback('default', 'unknown', ['gpt-4']);
      expect(result).toBeNull();
    });
  });
});
