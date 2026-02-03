/**
 * ExecutionGroupManager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionGroupManager, isRoutingError } from '../execution-group-manager';
import type { ExecutionGroup, ExecutionTarget } from '../../types/execution-group';
import type { ConfigManager } from '../../config/config-manager';
import type { ProviderRegistry } from '../provider-registry';

// Mock ConfigManager
function createMockConfigManager(
  groups: ExecutionGroup[] = [],
  options: {
    providers?: Record<string, { enabled: boolean; displayName?: string }>;
    models?: Record<string, { enabled: boolean; providerId: string }>;
  } = {}
): ConfigManager {
  const { providers = {}, models = {} } = options;

  return {
    getExecutionGroup: vi.fn((id: string) => groups.find((g) => g.id === id)),
    getExecutionGroups: vi.fn(() => groups),
    getProvider: vi.fn((id: string) => {
      const p = providers[id];
      return p ? { id, enabled: p.enabled, displayName: p.displayName || id } : undefined;
    }),
    getModel: vi.fn((id: string) => {
      const m = models[id];
      return m ? { id, enabled: m.enabled, providerId: m.providerId } : undefined;
    }),
  } as unknown as ConfigManager;
}

// Mock ProviderRegistry
function createMockProviderRegistry(options: {
  providers?: Record<string, { enabled: boolean; displayName?: string }>;
  models?: Record<string, { enabled: boolean; providerId: string }>;
  availability?: Record<string, boolean>;
} = {}): ProviderRegistry {
  const { providers = {}, models = {}, availability = {} } = options;

  return {
    getProvider: vi.fn((id: string) => {
      const p = providers[id];
      return p ? { id, enabled: p.enabled, displayName: p.displayName || id } : undefined;
    }),
    getModel: vi.fn((id: string) => {
      const m = models[id];
      return m ? { id, enabled: m.enabled, providerId: m.providerId } : undefined;
    }),
    isProviderAvailable: vi.fn((id: string) => availability[id] ?? true),
  } as unknown as ProviderRegistry;
}

// Sample targets
const apiTarget: ExecutionTarget = {
  id: 'openai-dalle3',
  type: 'api',
  providerId: 'openai',
  modelId: 'dall-e-3',
  displayName: 'DALL-E 3',
  capabilities: ['text-to-image'],
  estimatedLatency: 15000,
  estimatedCost: 0.04,
  qualityScore: 0.9,
};

const workflowTarget: ExecutionTarget = {
  id: 'comfyui-sdxl',
  type: 'workflow',
  workflowId: 'comfyui-sdxl-basic',
  displayName: 'ComfyUI SDXL',
  capabilities: ['text-to-image', 'controlnet', 'lora'],
  estimatedLatency: 20000,
  estimatedCost: 0,
  qualityScore: 0.95,
};

const localTarget: ExecutionTarget = {
  id: 'local-sd',
  type: 'local',
  displayName: 'Local SD',
  capabilities: ['text-to-image'],
  estimatedLatency: 10000,
  estimatedCost: 0,
  qualityScore: 0.85,
};

// Sample group
const imageGenerationGroup: ExecutionGroup = {
  id: 'image_generation',
  name: 'Image Generation',
  taskType: 'image_generation',
  targets: [apiTarget, workflowTarget, localTarget],
  strategy: { type: 'priority' },
  fallback: {
    enabled: true,
    maxAttempts: 3,
    triggerOn: ['rate_limit', 'timeout', 'server_error'],
  },
  enabled: true,
};

describe('ExecutionGroupManager', () => {
  describe('getGroup', () => {
    it('should return group by ID', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const group = manager.getGroup('image_generation');
      expect(group).toEqual(imageGenerationGroup);
    });

    it('should return undefined for non-existent group', () => {
      const configManager = createMockConfigManager([]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const group = manager.getGroup('non-existent');
      expect(group).toBeUndefined();
    });
  });

  describe('getGroupByTaskType', () => {
    it('should return group by task type', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const group = manager.getGroupByTaskType('image_generation');
      expect(group).toEqual(imageGenerationGroup);
    });

    it('should return undefined for non-existent task type', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const group = manager.getGroupByTaskType('video_generation');
      expect(group).toBeUndefined();
    });
  });

  describe('route - priority strategy', () => {
    it('should select first available target', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.id).toBe('openai-dalle3');
        expect(result.attempt).toBe(1);
        expect(result.reason).toContain('priority');
      }
    });

    it('should skip disabled providers', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: false } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // Should skip API target and select workflow target
        expect(result.target.id).toBe('comfyui-sdxl');
      }
    });

    it('should return error for disabled group', () => {
      const disabledGroup = { ...imageGenerationGroup, enabled: false };
      const configManager = createMockConfigManager([disabledGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(true);
      if (isRoutingError(result)) {
        expect(result.code).toBe('GROUP_DISABLED');
      }
    });

    it('should return error for non-existent group', () => {
      const configManager = createMockConfigManager([]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('non-existent');
      expect(isRoutingError(result)).toBe(true);
      if (isRoutingError(result)) {
        expect(result.code).toBe('GROUP_NOT_FOUND');
      }
    });
  });

  describe('route - round-robin strategy', () => {
    it('should rotate through targets', () => {
      const rrGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'round-robin' },
      };
      const configManager = createMockConfigManager([rrGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result1 = manager.route('image_generation');
      const result2 = manager.route('image_generation');
      const result3 = manager.route('image_generation');
      const result4 = manager.route('image_generation');

      expect(isRoutingError(result1)).toBe(false);
      expect(isRoutingError(result2)).toBe(false);
      expect(isRoutingError(result3)).toBe(false);
      expect(isRoutingError(result4)).toBe(false);

      if (!isRoutingError(result1) && !isRoutingError(result2) && !isRoutingError(result3) && !isRoutingError(result4)) {
        expect(result1.target.id).toBe('openai-dalle3');
        expect(result2.target.id).toBe('comfyui-sdxl');
        expect(result3.target.id).toBe('local-sd');
        expect(result4.target.id).toBe('openai-dalle3'); // Wraps around
      }
    });
  });

  describe('route - cost-optimal strategy', () => {
    it('should select lowest cost target', () => {
      const costGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'cost-optimal' },
      };
      const configManager = createMockConfigManager([costGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // Local and workflow have cost 0
        expect(result.target.estimatedCost).toBe(0);
      }
    });

    it('should respect maxCost constraint', () => {
      const costGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'cost-optimal', maxCost: 0.01 },
      };
      const configManager = createMockConfigManager([costGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // API target (0.04) exceeds maxCost, should select workflow/local
        expect(result.target.id).not.toBe('openai-dalle3');
      }
    });
  });

  describe('route - quality-optimal strategy', () => {
    it('should select highest quality target', () => {
      const qualityGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'quality-optimal' },
      };
      const configManager = createMockConfigManager([qualityGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // Workflow has highest quality (0.95)
        expect(result.target.id).toBe('comfyui-sdxl');
      }
    });
  });

  describe('route - latency-optimal strategy', () => {
    it('should select lowest latency target', () => {
      const latencyGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'latency-optimal' },
      };
      const configManager = createMockConfigManager([latencyGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // Local has lowest latency (10000)
        expect(result.target.id).toBe('local-sd');
      }
    });
  });

  describe('route - capability-match strategy', () => {
    it('should filter by required capabilities', () => {
      const capGroup: ExecutionGroup = {
        ...imageGenerationGroup,
        strategy: { type: 'capability-match', requiredCapabilities: ['controlnet', 'lora'] },
      };
      const configManager = createMockConfigManager([capGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation');
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        // Only workflow target has both controlnet and lora
        expect(result.target.id).toBe('comfyui-sdxl');
      }
    });
  });

  describe('route - with options', () => {
    it('should exclude specified targets', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation', {
        excludeTargets: ['openai-dalle3'],
      });
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.id).toBe('comfyui-sdxl');
        expect(result.attempt).toBe(2);
      }
    });

    it('should filter by required capabilities', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation', {
        requiredCapabilities: ['lora'],
      });
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.id).toBe('comfyui-sdxl');
      }
    });

    it('should prefer specified execution type', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.route('image_generation', {
        preferredType: 'workflow',
      });
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.type).toBe('workflow');
      }
    });
  });

  describe('routeToTarget', () => {
    it('should route to specified provider/model', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeToTarget({
        provider: 'openai',
        model: 'dall-e-3',
      });
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.providerId).toBe('openai');
        expect(result.reason).toContain('Direct');
      }
    });

    it('should route to specified workflow', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeToTarget({
        workflow: 'comfyui-sdxl-basic',
      });
      expect(isRoutingError(result)).toBe(false);
      if (!isRoutingError(result)) {
        expect(result.target.workflowId).toBe('comfyui-sdxl-basic');
      }
    });

    it('should return error for disabled provider', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: false } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeToTarget({
        provider: 'openai',
      });
      expect(isRoutingError(result)).toBe(true);
      if (isRoutingError(result)) {
        expect(result.code).toBe('PROVIDER_NOT_ENABLED');
      }
    });
  });

  describe('routeFallback', () => {
    it('should route to next target on rate limit', () => {
      const configManager = createMockConfigManager([imageGenerationGroup], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeFallback(
        'image_generation',
        'rate_limit',
        ['openai-dalle3']
      );
      expect(result).not.toBeNull();
      if (result && !isRoutingError(result)) {
        expect(result.target.id).toBe('comfyui-sdxl');
        expect(result.attempt).toBe(2);
      }
    });

    it('should return null when max attempts reached', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeFallback(
        'image_generation',
        'rate_limit',
        ['target1', 'target2', 'target3'] // 3 = maxAttempts
      );
      expect(result).toBeNull();
    });

    it('should return null for non-triggering error', () => {
      const configManager = createMockConfigManager([imageGenerationGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeFallback(
        'image_generation',
        'content_filter', // content_filter not in default triggerOn
        []
      );
      expect(result).toBeNull();
    });

    it('should return null when fallback disabled', () => {
      const noFallbackGroup = {
        ...imageGenerationGroup,
        fallback: { ...imageGenerationGroup.fallback, enabled: false },
      };
      const configManager = createMockConfigManager([noFallbackGroup]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.routeFallback(
        'image_generation',
        'rate_limit',
        []
      );
      expect(result).toBeNull();
    });
  });

  describe('validateTarget', () => {
    it('should validate enabled API target', () => {
      const configManager = createMockConfigManager([], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: true, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.validateTarget(apiTarget);
      expect(result.valid).toBe(true);
    });

    it('should invalidate disabled provider', () => {
      const configManager = createMockConfigManager([], {
        providers: { openai: { enabled: false } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.validateTarget(apiTarget);
      expect(result.valid).toBe(false);
      expect(result.failure?.code).toBe('PROVIDER_NOT_ENABLED');
    });

    it('should invalidate disabled model', () => {
      const configManager = createMockConfigManager([], {
        providers: { openai: { enabled: true } },
        models: { 'dall-e-3': { enabled: false, providerId: 'openai' } },
      });
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.validateTarget(apiTarget);
      expect(result.valid).toBe(false);
      expect(result.failure?.code).toBe('MODEL_NOT_ENABLED');
    });

    it('should validate workflow target', () => {
      const configManager = createMockConfigManager([]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.validateTarget(workflowTarget);
      expect(result.valid).toBe(true);
    });

    it('should validate local target', () => {
      const configManager = createMockConfigManager([]);
      const providerRegistry = createMockProviderRegistry();
      const manager = new ExecutionGroupManager(configManager, providerRegistry);

      const result = manager.validateTarget(localTarget);
      expect(result.valid).toBe(true);
    });
  });

  describe('isRoutingError', () => {
    it('should identify error result', () => {
      expect(isRoutingError({ code: 'GROUP_NOT_FOUND', message: 'test' })).toBe(true);
    });

    it('should identify success result', () => {
      expect(isRoutingError({ target: apiTarget, attempt: 1, reason: 'test' })).toBe(false);
    });
  });
});
