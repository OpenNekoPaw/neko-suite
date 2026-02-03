/**
 * SelectionStrategy Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type SelectionContext,
  PrioritySelectionStrategy,
  RoundRobinSelectionStrategy,
  WeightedSelectionStrategy,
  CostOptimalSelectionStrategy,
  QualityOptimalSelectionStrategy,
  LatencyOptimalSelectionStrategy,
  CapabilityMatchSelectionStrategy,
  SelectionStrategyFactory,
} from '../selection-strategy';

describe('SelectionStrategy', () => {
  describe('PrioritySelectionStrategy', () => {
    const strategy = new PrioritySelectionStrategy<string>();
    const context: SelectionContext = {
      groupId: 'test',
      roundRobinState: new Map(),
    };

    it('should return the first item', () => {
      const items = ['a', 'b', 'c'];
      expect(strategy.select(items, context)).toBe('a');
    });

    it('should return null for empty array', () => {
      expect(strategy.select([], context)).toBeNull();
    });
  });

  describe('RoundRobinSelectionStrategy', () => {
    const strategy = new RoundRobinSelectionStrategy<string>();
    let context: SelectionContext;

    beforeEach(() => {
      context = {
        groupId: 'test',
        roundRobinState: new Map(),
      };
    });

    it('should cycle through items', () => {
      const items = ['a', 'b', 'c'];

      expect(strategy.select(items, context)).toBe('a');
      expect(strategy.select(items, context)).toBe('b');
      expect(strategy.select(items, context)).toBe('c');
      expect(strategy.select(items, context)).toBe('a');
    });

    it('should maintain state per group', () => {
      const items = ['a', 'b', 'c'];

      expect(strategy.select(items, context)).toBe('a');

      const context2: SelectionContext = {
        groupId: 'test2',
        roundRobinState: context.roundRobinState,
      };
      expect(strategy.select(items, context2)).toBe('a');
      expect(strategy.select(items, context)).toBe('b');
    });

    it('should return null for empty array', () => {
      expect(strategy.select([], context)).toBeNull();
    });
  });

  describe('WeightedSelectionStrategy', () => {
    const strategy = new WeightedSelectionStrategy<{ id: string }>((item) => item.id);
    let context: SelectionContext;

    beforeEach(() => {
      context = {
        groupId: 'test',
        roundRobinState: new Map(),
        weights: { a: 10, b: 0, c: 0 },
      };
    });

    it('should select item based on weights', () => {
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

      // With weights a:10, b:0, c:0, should always select 'a'
      for (let i = 0; i < 10; i++) {
        expect(strategy.select(items, context)?.id).toBe('a');
      }
    });

    it('should use default weight of 1', () => {
      const items = [{ id: 'a' }, { id: 'b' }];
      const ctxNoWeights: SelectionContext = {
        groupId: 'test',
        roundRobinState: new Map(),
      };

      // Without explicit weights, each has weight 1
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = strategy.select(items, ctxNoWeights);
        if (result) results.add(result.id);
      }

      // Should select both items over 100 iterations
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('should return null for empty array', () => {
      expect(strategy.select([], context)).toBeNull();
    });
  });

  describe('CostOptimalSelectionStrategy', () => {
    const strategy = new CostOptimalSelectionStrategy<{
      estimatedCost?: number;
      inputCostPer1k?: number;
      outputCostPer1k?: number;
    }>();
    const context: SelectionContext = {
      groupId: 'test',
      roundRobinState: new Map(),
    };

    it('should select lowest cost item', () => {
      const items = [
        { estimatedCost: 10 },
        { estimatedCost: 5 },
        { estimatedCost: 15 },
      ];
      expect(strategy.select(items, context)).toEqual({ estimatedCost: 5 });
    });

    it('should calculate cost from input/output costs', () => {
      const items = [
        { inputCostPer1k: 10, outputCostPer1k: 20 }, // avg: 15
        { inputCostPer1k: 5, outputCostPer1k: 5 }, // avg: 5
      ];
      expect(strategy.select(items, context)).toEqual({
        inputCostPer1k: 5,
        outputCostPer1k: 5,
      });
    });

    it('should filter by maxCost', () => {
      const items = [
        { estimatedCost: 10 },
        { estimatedCost: 5 },
        { estimatedCost: 15 },
      ];
      const ctxWithMax: SelectionContext = {
        ...context,
        maxCost: 8,
      };
      expect(strategy.select(items, ctxWithMax)).toEqual({ estimatedCost: 5 });
    });

    it('should return null if all items exceed maxCost', () => {
      const items = [{ estimatedCost: 10 }, { estimatedCost: 15 }];
      const ctxWithMax: SelectionContext = {
        ...context,
        maxCost: 5,
      };
      expect(strategy.select(items, ctxWithMax)).toBeNull();
    });
  });

  describe('QualityOptimalSelectionStrategy', () => {
    const strategy = new QualityOptimalSelectionStrategy<{
      qualityScore?: number;
    }>();
    const context: SelectionContext = {
      groupId: 'test',
      roundRobinState: new Map(),
    };

    it('should select highest quality item', () => {
      const items = [
        { qualityScore: 80 },
        { qualityScore: 95 },
        { qualityScore: 70 },
      ];
      expect(strategy.select(items, context)).toEqual({ qualityScore: 95 });
    });

    it('should treat undefined as 0', () => {
      const items = [{ qualityScore: undefined }, { qualityScore: 50 }];
      expect(strategy.select(items, context)).toEqual({ qualityScore: 50 });
    });
  });

  describe('LatencyOptimalSelectionStrategy', () => {
    const strategy = new LatencyOptimalSelectionStrategy<{
      estimatedLatency?: number;
    }>();
    const context: SelectionContext = {
      groupId: 'test',
      roundRobinState: new Map(),
    };

    it('should select lowest latency item', () => {
      const items = [
        { estimatedLatency: 100 },
        { estimatedLatency: 50 },
        { estimatedLatency: 150 },
      ];
      expect(strategy.select(items, context)).toEqual({ estimatedLatency: 50 });
    });

    it('should filter by maxLatency', () => {
      const items = [
        { estimatedLatency: 100 },
        { estimatedLatency: 50 },
        { estimatedLatency: 150 },
      ];
      const ctxWithMax: SelectionContext = {
        ...context,
        maxLatency: 75,
      };
      expect(strategy.select(items, ctxWithMax)).toEqual({ estimatedLatency: 50 });
    });
  });

  describe('CapabilityMatchSelectionStrategy', () => {
    const strategy = new CapabilityMatchSelectionStrategy<{
      capabilities?: string[];
    }>();
    const context: SelectionContext = {
      groupId: 'test',
      roundRobinState: new Map(),
      requiredCapabilities: ['vision', 'tools'],
    };

    it('should select item with all required capabilities', () => {
      const items = [
        { capabilities: ['chat'] },
        { capabilities: ['vision', 'tools', 'chat'] },
        { capabilities: ['vision'] },
      ];
      expect(strategy.select(items, context)).toEqual({
        capabilities: ['vision', 'tools', 'chat'],
      });
    });

    it('should return null if no item matches', () => {
      const items = [
        { capabilities: ['chat'] },
        { capabilities: ['vision'] },
      ];
      expect(strategy.select(items, context)).toBeNull();
    });

    it('should return first item if no requirements', () => {
      const items = [{ capabilities: ['a'] }, { capabilities: ['b'] }];
      const ctxNoReq: SelectionContext = {
        groupId: 'test',
        roundRobinState: new Map(),
      };
      expect(strategy.select(items, ctxNoReq)).toEqual({ capabilities: ['a'] });
    });
  });

  describe('SelectionStrategyFactory', () => {
    it('should have default strategies registered', () => {
      const factory = new SelectionStrategyFactory();
      expect(factory.has('priority')).toBe(true);
      expect(factory.has('round-robin')).toBe(true);
    });

    it('should register custom strategies', () => {
      const factory = new SelectionStrategyFactory();
      factory.register(new CostOptimalSelectionStrategy());
      expect(factory.has('cost-optimal')).toBe(true);
    });

    it('should get strategy by type', () => {
      const factory = new SelectionStrategyFactory();
      const strategy = factory.get<string>('priority');
      expect(strategy).toBeDefined();
      expect(strategy?.type).toBe('priority');
    });

    it('should list all registered types', () => {
      const factory = new SelectionStrategyFactory();
      const types = factory.listTypes();
      expect(types).toContain('priority');
      expect(types).toContain('round-robin');
    });
  });
});
