/**
 * Token Budget Manager Unit Tests
 *
 * Tests budget tracking, overflow detection, and compression triggers
 * independently from LayeredContextManager.
 */

import { describe, it, expect } from 'vitest';
import { TokenBudgetManager } from '../token-budget-manager';
import { DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function createManager(overrides?: Partial<typeof DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG>) {
  return new TokenBudgetManager({
    ...DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG,
    ...overrides,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('TokenBudgetManager', () => {
  describe('updateLayerUsage / getUsage', () => {
    it('should reflect updated usage for a layer', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [100, 200, 300]);

      const usage = mgr.getUsage();
      const permanent = usage.find((u) => u.layer === 'permanent');
      expect(permanent!.used).toBe(600);
    });

    it('should compute percentage correctly', () => {
      const mgr = createManager();
      // permanent budget = 10000
      mgr.updateLayerUsage('permanent', [5000]);

      const usage = mgr.getUsage();
      const permanent = usage.find((u) => u.layer === 'permanent');
      expect(permanent!.percentage).toBeCloseTo(0.5);
    });

    it('should return zero for unupdated layers', () => {
      const mgr = createManager();
      const usage = mgr.getUsage();
      for (const u of usage) {
        expect(u.used).toBe(0);
      }
    });
  });

  describe('getTotalUsage', () => {
    it('should sum all layer usages', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [100]);
      mgr.updateLayerUsage('session', [200]);
      mgr.updateLayerUsage('turn', [300]);
      mgr.updateLayerUsage('conversation', [400]);

      expect(mgr.getTotalUsage()).toBe(1000);
    });
  });

  describe('isOverBudget', () => {
    it('should return true when usage exceeds budget', () => {
      const mgr = createManager();
      // permanent budget = 10000
      mgr.updateLayerUsage('permanent', [10001]);
      expect(mgr.isOverBudget('permanent')).toBe(true);
    });

    it('should return false when usage is within budget', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [9999]);
      expect(mgr.isOverBudget('permanent')).toBe(false);
    });

    it('should return false when usage equals budget', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [10000]);
      expect(mgr.isOverBudget('permanent')).toBe(false);
    });
  });

  describe('shouldCompress', () => {
    it('should return true when total usage exceeds threshold', () => {
      const mgr = createManager();
      // total budget = 100000, threshold = 0.8 → 80000
      mgr.updateLayerUsage('conversation', [80001]);
      expect(mgr.shouldCompress(0)).toBe(true);
    });

    it('should return true when turn count exceeds threshold', () => {
      const mgr = createManager();
      // turnCompressionThreshold = 20
      expect(mgr.shouldCompress(20)).toBe(true);
    });

    it('should return false when both below thresholds', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('conversation', [10000]);
      expect(mgr.shouldCompress(5)).toBe(false);
    });
  });

  describe('configure', () => {
    it('should update budgets and affect threshold checks', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [5000]);

      // Initially under budget (10000)
      expect(mgr.isOverBudget('permanent')).toBe(false);

      // Reduce budget below current usage
      mgr.configure({
        budget: {
          ...DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG.budget,
          permanent: 4000,
        },
      });

      expect(mgr.isOverBudget('permanent')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all usage to zero', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [1000]);
      mgr.updateLayerUsage('session', [2000]);

      mgr.reset();

      expect(mgr.getTotalUsage()).toBe(0);
      const usage = mgr.getUsage();
      for (const u of usage) {
        expect(u.used).toBe(0);
      }
    });
  });

  describe('getUsageMap', () => {
    it('should return a copy of the usage map', () => {
      const mgr = createManager();
      mgr.updateLayerUsage('permanent', [500]);

      const map = mgr.getUsageMap();
      expect(map.get('permanent')).toBe(500);

      // Modifying the returned map should not affect internal state
      map.set('permanent', 9999);
      expect(mgr.getUsageMap().get('permanent')).toBe(500);
    });
  });
});
