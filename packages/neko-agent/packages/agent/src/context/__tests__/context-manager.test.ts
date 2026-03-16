/**
 * LayeredContextManager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayeredContextManager, createLayeredContextManager } from '../context-manager';
import type {
  ContextItem,
  ContextLayer,
  ContextEvent,
  LayeredContextManagerConfig,
} from '@neko/shared';
import { DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function createTestItem(
  overrides: Partial<Omit<ContextItem, 'addedAt' | 'lastAccessedAt'>> = {},
): Omit<ContextItem, 'addedAt' | 'lastAccessedAt'> {
  return {
    id: 'test-item-1',
    layer: 'session',
    type: 'tool',
    content: 'test content',
    tokenCount: 100,
    priority: 5,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('LayeredContextManager', () => {
  let manager: LayeredContextManager;

  beforeEach(() => {
    manager = new LayeredContextManager();
  });

  describe('constructor', () => {
    it('creates with default config', () => {
      const config = manager.getConfig();
      expect(config).toEqual(DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG);
    });

    it('creates with custom config', () => {
      const customConfig: Partial<LayeredContextManagerConfig> = {
        maxActiveSkills: 5,
        compressionThreshold: 0.9,
      };
      const customManager = new LayeredContextManager(customConfig);
      const config = customManager.getConfig();

      expect(config.maxActiveSkills).toBe(5);
      expect(config.compressionThreshold).toBe(0.9);
      expect(config.budget).toEqual(DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG.budget);
    });
  });

  describe('configure', () => {
    it('updates configuration', () => {
      manager.configure({ maxActiveSkills: 10 });
      expect(manager.getConfig().maxActiveSkills).toBe(10);
    });

    it('merges with existing config', () => {
      manager.configure({ maxActiveSkills: 10 });
      manager.configure({ compressionThreshold: 0.7 });

      const config = manager.getConfig();
      expect(config.maxActiveSkills).toBe(10);
      expect(config.compressionThreshold).toBe(0.7);
    });
  });

  describe('getConfig', () => {
    it('returns a copy of config', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('getState', () => {
    it('returns initial state', () => {
      const state = manager.getState();

      expect(state.items.size).toBe(4);
      expect(state.usage.size).toBe(4);
      expect(state.activeSkills).toEqual([]);
      expect(state.activeToolCategories).toEqual([]);
      expect(state.turnCount).toBe(0);
      expect(state.lastCompressionAt).toBeUndefined();
    });

    it('returns a copy of state', () => {
      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1).toEqual(state2);
      expect(state1.items).not.toBe(state2.items);
      expect(state1.activeSkills).not.toBe(state2.activeSkills);
    });
  });

  describe('addItem', () => {
    it('adds item to correct layer', () => {
      const item = createTestItem({ layer: 'session' });
      manager.addItem(item);

      const items = manager.getItemsByLayer('session');
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('test-item-1');
      expect(items[0]?.content).toBe('test content');
    });

    it('sets addedAt and lastAccessedAt timestamps', () => {
      const before = Date.now();
      const item = createTestItem();
      manager.addItem(item);
      const after = Date.now();

      const items = manager.getItemsByLayer('session');
      expect(items[0]?.addedAt).toBeGreaterThanOrEqual(before);
      expect(items[0]?.addedAt).toBeLessThanOrEqual(after);
      expect(items[0]?.lastAccessedAt).toBe(items[0]?.addedAt);
    });

    it('updates layer usage', () => {
      const item = createTestItem({ tokenCount: 500 });
      manager.addItem(item);

      const usage = manager.getUsage();
      const sessionUsage = usage.find((u) => u.layer === 'session');
      expect(sessionUsage?.used).toBe(500);
    });

    it('emits item_added event', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      const item = createTestItem();
      manager.addItem(item);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_added',
          layer: 'session',
          item: expect.objectContaining({ id: 'test-item-1' }),
        }),
      );
    });

    it('emits layer_overflow event when over budget', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      const item = createTestItem({ tokenCount: 25000 });
      manager.addItem(item);

      const overflowEvents = listener.mock.calls
        .map((call) => call[0])
        .filter((event: ContextEvent) => event.type === 'layer_overflow');

      expect(overflowEvents).toHaveLength(1);
      expect(overflowEvents[0]).toMatchObject({
        type: 'layer_overflow',
        layer: 'session',
        data: {
          used: 25000,
          budget: 20000,
        },
      });
    });

    it('adds multiple items to same layer', () => {
      manager.addItem(createTestItem({ id: 'item-1' }));
      manager.addItem(createTestItem({ id: 'item-2' }));

      const items = manager.getItemsByLayer('session');
      expect(items).toHaveLength(2);
    });
  });

  describe('removeItem', () => {
    it('removes item by ID', () => {
      manager.addItem(createTestItem({ id: 'item-1' }));
      manager.addItem(createTestItem({ id: 'item-2' }));

      manager.removeItem('item-1');

      const items = manager.getItemsByLayer('session');
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('item-2');
    });

    it('updates layer usage after removal', () => {
      manager.addItem(createTestItem({ id: 'item-1', tokenCount: 300 }));
      manager.addItem(createTestItem({ id: 'item-2', tokenCount: 200 }));

      manager.removeItem('item-1');

      const usage = manager.getUsage();
      const sessionUsage = usage.find((u) => u.layer === 'session');
      expect(sessionUsage?.used).toBe(200);
    });

    it('emits item_removed event', () => {
      const listener = vi.fn();
      manager.addItem(createTestItem({ id: 'item-1' }));
      manager.addEventListener(listener);

      manager.removeItem('item-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_removed',
          layer: 'session',
          item: expect.objectContaining({ id: 'item-1' }),
        }),
      );
    });

    it('does nothing for unknown ID', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.removeItem('unknown-id');

      expect(listener).not.toHaveBeenCalled();
    });

    it('removes from correct layer', () => {
      manager.addItem(createTestItem({ id: 'session-item', layer: 'session' }));
      manager.addItem(createTestItem({ id: 'turn-item', layer: 'turn' }));

      manager.removeItem('session-item');

      expect(manager.getItemsByLayer('session')).toHaveLength(0);
      expect(manager.getItemsByLayer('turn')).toHaveLength(1);
    });
  });

  describe('accessItem', () => {
    it('returns item and updates lastAccessedAt', async () => {
      manager.addItem(createTestItem({ id: 'item-1' }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const item = manager.accessItem('item-1');

      expect(item).toBeDefined();
      expect(item?.id).toBe('item-1');
      expect(item?.lastAccessedAt).toBeGreaterThan(item?.addedAt ?? 0);
    });

    it('emits item_accessed event', () => {
      const listener = vi.fn();
      manager.addItem(createTestItem({ id: 'item-1' }));
      manager.addEventListener(listener);

      manager.accessItem('item-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_accessed',
          layer: 'session',
          item: expect.objectContaining({ id: 'item-1' }),
        }),
      );
    });

    it('returns undefined for unknown ID', () => {
      const result = manager.accessItem('unknown-id');
      expect(result).toBeUndefined();
    });

    it('finds item across all layers', () => {
      manager.addItem(createTestItem({ id: 'permanent-item', layer: 'permanent' }));
      manager.addItem(createTestItem({ id: 'session-item', layer: 'session' }));
      manager.addItem(createTestItem({ id: 'turn-item', layer: 'turn' }));

      expect(manager.accessItem('permanent-item')).toBeDefined();
      expect(manager.accessItem('session-item')).toBeDefined();
      expect(manager.accessItem('turn-item')).toBeDefined();
    });
  });

  describe('getItemsByLayer', () => {
    it('returns items for specific layer', () => {
      manager.addItem(createTestItem({ id: 'session-1', layer: 'session' }));
      manager.addItem(createTestItem({ id: 'session-2', layer: 'session' }));
      manager.addItem(createTestItem({ id: 'turn-1', layer: 'turn' }));

      const sessionItems = manager.getItemsByLayer('session');
      expect(sessionItems).toHaveLength(2);
      expect(sessionItems.map((i) => i.id)).toEqual(['session-1', 'session-2']);
    });

    it('returns empty array for empty layer', () => {
      const items = manager.getItemsByLayer('permanent');
      expect(items).toEqual([]);
    });

    it('returns a copy of items array', () => {
      manager.addItem(createTestItem({ id: 'item-1' }));

      const items1 = manager.getItemsByLayer('session');
      const items2 = manager.getItemsByLayer('session');

      expect(items1).toEqual(items2);
      expect(items1).not.toBe(items2);
    });
  });

  describe('getUsage', () => {
    it('calculates token usage per layer', () => {
      manager.addItem(createTestItem({ layer: 'permanent', tokenCount: 1000 }));
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 2000 }));
      manager.addItem(createTestItem({ layer: 'turn', tokenCount: 3000 }));

      const usage = manager.getUsage();

      expect(usage).toHaveLength(4);
      expect(usage.find((u) => u.layer === 'permanent')).toMatchObject({
        layer: 'permanent',
        used: 1000,
        budget: 10000,
        percentage: 0.1,
      });
      expect(usage.find((u) => u.layer === 'session')).toMatchObject({
        layer: 'session',
        used: 2000,
        budget: 20000,
        percentage: 0.1,
      });
    });

    it('returns zero usage for empty layers', () => {
      const usage = manager.getUsage();

      expect(usage.every((u) => u.used === 0)).toBe(true);
    });

    it('calculates percentage correctly', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 10000 }));

      const usage = manager.getUsage();
      const sessionUsage = usage.find((u) => u.layer === 'session');

      expect(sessionUsage?.percentage).toBe(0.5);
    });
  });

  describe('getTotalUsage', () => {
    it('calculates total token usage across all layers', () => {
      manager.addItem(createTestItem({ layer: 'permanent', tokenCount: 1000 }));
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 2000 }));
      manager.addItem(createTestItem({ layer: 'turn', tokenCount: 3000 }));
      manager.addItem(createTestItem({ layer: 'conversation', tokenCount: 4000 }));

      expect(manager.getTotalUsage()).toBe(10000);
    });

    it('returns zero for empty manager', () => {
      expect(manager.getTotalUsage()).toBe(0);
    });
  });

  describe('isOverBudget', () => {
    it('returns true when layer exceeds budget', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 25000 }));
      expect(manager.isOverBudget('session')).toBe(true);
    });

    it('returns false when layer is within budget', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 15000 }));
      expect(manager.isOverBudget('session')).toBe(false);
    });

    it('returns false for empty layer', () => {
      expect(manager.isOverBudget('permanent')).toBe(false);
    });

    it('returns false when usage equals budget', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 20000 }));
      expect(manager.isOverBudget('session')).toBe(false);
    });
  });

  describe('shouldCompress', () => {
    it('returns true when total usage exceeds threshold', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 85000 }));
      expect(manager.shouldCompress()).toBe(true);
    });

    it('returns false when total usage is below threshold', () => {
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 50000 }));
      expect(manager.shouldCompress()).toBe(false);
    });

    it('returns true when turn count exceeds threshold', () => {
      for (let i = 0; i < 20; i++) {
        manager.onTurnStart();
      }
      expect(manager.shouldCompress()).toBe(true);
    });

    it('returns false when turn count is below threshold', () => {
      for (let i = 0; i < 10; i++) {
        manager.onTurnStart();
      }
      expect(manager.shouldCompress()).toBe(false);
    });

    it('uses compressionThreshold from config', () => {
      manager.configure({ compressionThreshold: 0.5 });
      manager.addItem(createTestItem({ layer: 'session', tokenCount: 55000 }));
      expect(manager.shouldCompress()).toBe(true);
    });
  });

  describe('compress', () => {
    it('clears turn layer', async () => {
      manager.addItem(createTestItem({ id: 'turn-1', layer: 'turn' }));
      manager.addItem(createTestItem({ id: 'turn-2', layer: 'turn' }));

      await manager.compress();

      expect(manager.getItemsByLayer('turn')).toHaveLength(0);
    });

    it('updates layer usage after clearing turn', async () => {
      manager.addItem(createTestItem({ layer: 'turn', tokenCount: 5000 }));

      await manager.compress();

      const usage = manager.getUsage();
      const turnUsage = usage.find((u) => u.layer === 'turn');
      expect(turnUsage?.used).toBe(0);
    });

    it('deactivates inactive skills', async () => {
      manager.activateSkill('skill-1');
      manager.activateSkill('skill-2');

      for (let i = 0; i < 10; i++) {
        manager.onTurnStart();
      }

      await manager.compress();

      expect(manager.getActiveSkills()).toHaveLength(0);
    });

    it('updates lastCompressionAt timestamp', async () => {
      const before = Date.now();
      await manager.compress();
      const after = Date.now();

      const state = manager.getState();
      expect(state.lastCompressionAt).toBeGreaterThanOrEqual(before);
      expect(state.lastCompressionAt).toBeLessThanOrEqual(after);
    });

    it('emits compression_triggered event', async () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      await manager.compress();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'compression_triggered',
          data: expect.objectContaining({
            totalUsage: expect.any(Number),
            turnCount: expect.any(Number),
          }),
        }),
      );
    });

    it('emits compression_completed event', async () => {
      const listener = vi.fn();
      manager.addItem(createTestItem({ layer: 'turn' }));
      manager.addEventListener(listener);

      await manager.compress();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'compression_completed',
          data: expect.objectContaining({
            itemsRemoved: 1,
            newTotalUsage: expect.any(Number),
          }),
        }),
      );
    });

    it('preserves other layers', async () => {
      manager.addItem(createTestItem({ id: 'permanent-1', layer: 'permanent' }));
      manager.addItem(createTestItem({ id: 'session-1', layer: 'session' }));
      manager.addItem(createTestItem({ id: 'turn-1', layer: 'turn' }));

      await manager.compress();

      expect(manager.getItemsByLayer('permanent')).toHaveLength(1);
      expect(manager.getItemsByLayer('session')).toHaveLength(1);
      expect(manager.getItemsByLayer('turn')).toHaveLength(0);
    });
  });

  describe('onTurnStart', () => {
    it('increments turn count', () => {
      manager.onTurnStart();
      expect(manager.getState().turnCount).toBe(1);

      manager.onTurnStart();
      expect(manager.getState().turnCount).toBe(2);
    });

    it('emits turn_started event', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.onTurnStart();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'turn_started',
          data: { turnCount: 1 },
        }),
      );
    });

    it('auto-compresses when shouldCompress returns true', async () => {
      manager.configure({ autoCompress: true });
      manager.addItem(createTestItem({ layer: 'turn', tokenCount: 1000 }));

      for (let i = 0; i < 20; i++) {
        manager.onTurnStart();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(manager.getItemsByLayer('turn')).toHaveLength(0);
    });

    it('does not auto-compress when autoCompress is false', () => {
      manager.configure({ autoCompress: false });
      manager.addItem(createTestItem({ layer: 'turn', tokenCount: 1000 }));

      for (let i = 0; i < 20; i++) {
        manager.onTurnStart();
      }

      expect(manager.getItemsByLayer('turn')).toHaveLength(1);
    });
  });

  describe('onTurnEnd', () => {
    it('emits turn_ended event', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.onTurnEnd();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'turn_ended',
          data: { turnCount: 0 },
        }),
      );
    });

    it('evaluates turn items and retains high-priority items', () => {
      manager.addItem(createTestItem({ id: 'low-priority', layer: 'turn', priority: 3 }));
      manager.addItem(createTestItem({ id: 'high-priority', layer: 'turn', priority: 7 }));

      manager.onTurnEnd();

      const turnItems = manager.getItemsByLayer('turn');
      expect(turnItems).toHaveLength(1);
      expect(turnItems[0]?.id).toBe('high-priority');
    });

    it('removes items with priority below 5', () => {
      manager.addItem(createTestItem({ id: 'item-1', layer: 'turn', priority: 1 }));
      manager.addItem(createTestItem({ id: 'item-2', layer: 'turn', priority: 4 }));

      manager.onTurnEnd();

      expect(manager.getItemsByLayer('turn')).toHaveLength(0);
    });

    it('retains items with priority exactly 5', () => {
      manager.addItem(createTestItem({ id: 'item-1', layer: 'turn', priority: 5 }));

      manager.onTurnEnd();

      expect(manager.getItemsByLayer('turn')).toHaveLength(1);
    });

    it('updates layer usage after evaluation', () => {
      manager.addItem(createTestItem({ id: 'low', layer: 'turn', priority: 2, tokenCount: 1000 }));
      manager.addItem(createTestItem({ id: 'high', layer: 'turn', priority: 8, tokenCount: 2000 }));

      manager.onTurnEnd();

      const usage = manager.getUsage();
      const turnUsage = usage.find((u) => u.layer === 'turn');
      expect(turnUsage?.used).toBe(2000);
    });
  });

  describe('activateSkill', () => {
    it('adds skill to active skills', () => {
      manager.activateSkill('skill-1');
      expect(manager.getActiveSkills()).toEqual(['skill-1']);
    });

    it('tracks skill usage with current turn', () => {
      manager.onTurnStart();
      manager.onTurnStart();
      manager.activateSkill('skill-1');

      expect(manager.getState().turnCount).toBe(2);
    });

    it('emits skill_activated event', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.activateSkill('skill-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill_activated',
          data: { skillId: 'skill-1' },
        }),
      );
    });

    it('updates usage tracking when skill already active', () => {
      manager.onTurnStart();
      manager.activateSkill('skill-1');

      manager.onTurnStart();
      manager.activateSkill('skill-1');

      expect(manager.getActiveSkills()).toEqual(['skill-1']);
    });

    it('does not emit event when skill already active', () => {
      const listener = vi.fn();
      manager.activateSkill('skill-1');
      manager.addEventListener(listener);

      manager.activateSkill('skill-1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('evicts LRU skill when at max active skills', () => {
      manager.configure({ maxActiveSkills: 2 });

      manager.onTurnStart();
      manager.activateSkill('skill-1');

      manager.onTurnStart();
      manager.activateSkill('skill-2');

      manager.onTurnStart();
      manager.activateSkill('skill-3');

      const activeSkills = manager.getActiveSkills();
      expect(activeSkills).toHaveLength(2);
      expect(activeSkills).toContain('skill-2');
      expect(activeSkills).toContain('skill-3');
      expect(activeSkills).not.toContain('skill-1');
    });
  });

  describe('deactivateSkill', () => {
    it('removes skill from active skills', () => {
      manager.activateSkill('skill-1');
      manager.deactivateSkill('skill-1');

      expect(manager.getActiveSkills()).toEqual([]);
    });

    it('removes skill usage tracking', () => {
      manager.activateSkill('skill-1');
      manager.deactivateSkill('skill-1');

      manager.activateSkill('skill-1');
      expect(manager.getActiveSkills()).toEqual(['skill-1']);
    });

    it('emits skill_deactivated event', () => {
      const listener = vi.fn();
      manager.activateSkill('skill-1');
      manager.addEventListener(listener);

      manager.deactivateSkill('skill-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill_deactivated',
          data: { skillId: 'skill-1' },
        }),
      );
    });

    it('removes session items with matching skillId metadata', () => {
      manager.activateSkill('skill-1');
      manager.addItem(
        createTestItem({
          id: 'skill-item',
          layer: 'session',
          metadata: { skillId: 'skill-1' },
        }),
      );
      manager.addItem(
        createTestItem({
          id: 'other-item',
          layer: 'session',
          metadata: { skillId: 'skill-2' },
        }),
      );

      manager.deactivateSkill('skill-1');

      const sessionItems = manager.getItemsByLayer('session');
      expect(sessionItems).toHaveLength(1);
      expect(sessionItems[0]?.id).toBe('other-item');
    });

    it('updates layer usage after removing skill items', () => {
      manager.activateSkill('skill-1');
      manager.addItem(
        createTestItem({
          layer: 'session',
          tokenCount: 5000,
          metadata: { skillId: 'skill-1' },
        }),
      );

      manager.deactivateSkill('skill-1');

      const usage = manager.getUsage();
      const sessionUsage = usage.find((u) => u.layer === 'session');
      expect(sessionUsage?.used).toBe(0);
    });

    it('does nothing for unknown skill', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.deactivateSkill('unknown-skill');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('deactivateLeastRecentlyUsedSkill', () => {
    it('evicts skill with lowest turn usage', () => {
      manager.onTurnStart();
      manager.activateSkill('skill-1');

      manager.onTurnStart();
      manager.activateSkill('skill-2');

      manager.onTurnStart();
      manager.activateSkill('skill-3');

      manager.configure({ maxActiveSkills: 2 });
      manager.onTurnStart();
      manager.activateSkill('skill-4');

      const activeSkills = manager.getActiveSkills();
      expect(activeSkills).not.toContain('skill-1');
    });

    it('handles maxActiveSkills: 0 by evicting LRU before adding', () => {
      manager.configure({ maxActiveSkills: 0 });
      manager.activateSkill('skill-1');

      // maxActiveSkills: 0 triggers LRU eviction (no-op on empty), then still pushes
      expect(manager.getActiveSkills()).toEqual(['skill-1']);
    });
  });

  describe('deactivateInactiveSkills', () => {
    it('deactivates skills not used within threshold', async () => {
      manager.configure({ skillInactivityThreshold: 3 });

      manager.onTurnStart();
      manager.activateSkill('skill-1');

      manager.onTurnStart();
      manager.activateSkill('skill-2');

      for (let i = 0; i < 5; i++) {
        manager.onTurnStart();
      }

      await manager.compress();

      const activeSkills = manager.getActiveSkills();
      expect(activeSkills).toHaveLength(0);
    });

    it('preserves recently used skills', async () => {
      manager.configure({ skillInactivityThreshold: 5 });

      manager.onTurnStart(); // turn 1
      manager.activateSkill('skill-1'); // lastUsed=1

      manager.onTurnStart(); // turn 2
      manager.activateSkill('skill-2'); // lastUsed=2

      // Advance enough turns so skill-1 becomes inactive (need turnCount - 1 >= 5)
      for (let i = 0; i < 5; i++) {
        manager.onTurnStart(); // turns 3..7
      }
      // turn=7, skill-1 lastUsed=1 → 7-1=6 >= 5 ✓ (inactive)

      manager.activateSkill('skill-2'); // refresh lastUsed=7
      // skill-2 lastUsed=7 → 7-7=0 < 5 (still active)

      await manager.compress();

      const activeSkills = manager.getActiveSkills();
      expect(activeSkills).toContain('skill-2');
      expect(activeSkills).not.toContain('skill-1');
    });
  });

  describe('getActiveSkills', () => {
    it('returns copy of active skills array', () => {
      manager.activateSkill('skill-1');

      const skills1 = manager.getActiveSkills();
      const skills2 = manager.getActiveSkills();

      expect(skills1).toEqual(skills2);
      expect(skills1).not.toBe(skills2);
    });

    it('returns empty array when no skills active', () => {
      expect(manager.getActiveSkills()).toEqual([]);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      manager.addItem(createTestItem({ layer: 'permanent' }));
      manager.addItem(createTestItem({ layer: 'session' }));
      manager.activateSkill('skill-1');
      manager.onTurnStart();

      manager.reset();

      const state = manager.getState();
      expect(state.items.get('permanent')).toEqual([]);
      expect(state.items.get('session')).toEqual([]);
      expect(state.activeSkills).toEqual([]);
      expect(state.turnCount).toBe(0);
      expect(state.lastCompressionAt).toBeUndefined();
    });

    it('clears skill usage tracking', () => {
      manager.activateSkill('skill-1');
      manager.reset();

      expect(manager.getActiveSkills()).toEqual([]);
    });

    it('resets all layer usage to zero', () => {
      manager.addItem(createTestItem({ tokenCount: 5000 }));
      manager.reset();

      expect(manager.getTotalUsage()).toBe(0);
    });

    it('emits state_reset event', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.reset();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'state_reset',
        }),
      );
    });
  });

  describe('addEventListener', () => {
    it('registers listener and receives events', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.addItem(createTestItem());

      expect(listener).toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = manager.addEventListener(listener);

      unsubscribe();
      manager.addItem(createTestItem());

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.addEventListener(listener1);
      manager.addEventListener(listener2);

      manager.addItem(createTestItem());

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('handles listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      manager.addEventListener(errorListener);
      manager.addEventListener(normalListener);

      expect(() => manager.addItem(createTestItem())).not.toThrow();
      expect(normalListener).toHaveBeenCalled();
    });

    it('unsubscribe is idempotent', () => {
      const listener = vi.fn();
      const unsubscribe = manager.addEventListener(listener);

      unsubscribe();
      unsubscribe();

      manager.addItem(createTestItem());
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('createLayeredContextManager', () => {
  it('creates a LayeredContextManager instance', () => {
    const manager = createLayeredContextManager();
    expect(manager).toBeInstanceOf(LayeredContextManager);
  });

  it('passes config to constructor', () => {
    const config: Partial<LayeredContextManagerConfig> = {
      maxActiveSkills: 10,
    };
    const manager = createLayeredContextManager(config);

    expect(manager.getConfig().maxActiveSkills).toBe(10);
  });

  it('creates with default config when no config provided', () => {
    const manager = createLayeredContextManager();
    expect(manager.getConfig()).toEqual(DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG);
  });
});
