/**
 * ToolGroupRegistry — Tiered loading behavior tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ToolGroup } from '@neko/shared';
import { ToolGroupRegistry } from '../tool-group-registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<ToolGroup>): ToolGroup {
  return {
    name: 'test-group',
    description: 'Test group',
    tools: ['ToolA', 'ToolB'],
    source: 'builtin',
    enabled: true,
    ...overrides,
  };
}

describe('ToolGroupRegistry — tiered loading', () => {
  let registry: ToolGroupRegistry;

  beforeEach(() => {
    registry = new ToolGroupRegistry();
  });

  describe('getDefaultTools()', () => {
    it('returns tools from resident-tier groups only', () => {
      registry.register(
        makeGroup({
          name: 'core',
          tools: ['Read', 'Write'],
          loadingTier: 'resident',
        }),
      );
      registry.register(
        makeGroup({
          name: 'timeline',
          tools: ['QueryTimeline', 'GetTrack'],
          loadingTier: 'eager',
        }),
      );
      registry.register(
        makeGroup({
          name: 'effects',
          tools: ['ApplyEffect', 'ListEffects'],
          loadingTier: 'lazy',
        }),
      );

      const defaults = registry.getDefaultTools();

      expect(defaults).toContain('Read');
      expect(defaults).toContain('Write');
      expect(defaults).not.toContain('QueryTimeline');
      expect(defaults).not.toContain('GetTrack');
      expect(defaults).not.toContain('ApplyEffect');
      expect(defaults).not.toContain('ListEffects');
    });

    it('returns empty when no resident groups', () => {
      registry.register(
        makeGroup({
          name: 'lazy-only',
          tools: ['LazyTool'],
          loadingTier: 'lazy',
        }),
      );

      expect(registry.getDefaultTools()).toEqual([]);
    });

    it('fallback: alwaysActive + priority >= 100 → resident', () => {
      registry.register(
        makeGroup({
          name: 'inferred-resident',
          tools: ['InferredTool'],
          alwaysActive: true,
          priority: 100,
          // no explicit loadingTier
        }),
      );

      expect(registry.getDefaultTools()).toContain('InferredTool');
    });

    it('fallback: alwaysActive + priority < 100 → eager (excluded)', () => {
      registry.register(
        makeGroup({
          name: 'inferred-eager',
          tools: ['EagerTool'],
          alwaysActive: true,
          priority: 80,
          // no explicit loadingTier
        }),
      );

      expect(registry.getDefaultTools()).not.toContain('EagerTool');
    });

    it('fallback: not alwaysActive → lazy (excluded)', () => {
      registry.register(
        makeGroup({
          name: 'inferred-lazy',
          tools: ['LazyTool'],
          alwaysActive: false,
          // no explicit loadingTier
        }),
      );

      expect(registry.getDefaultTools()).not.toContain('LazyTool');
    });
  });

  // -------------------------------------------------------------------------
  // listByTier
  // -------------------------------------------------------------------------
  describe('listByTier()', () => {
    it('classifies groups by tier correctly', () => {
      registry.register(makeGroup({ name: 'r1', loadingTier: 'resident' }));
      registry.register(makeGroup({ name: 'e1', loadingTier: 'eager' }));
      registry.register(makeGroup({ name: 'l1', loadingTier: 'lazy' }));
      registry.register(makeGroup({ name: 'l2', loadingTier: 'lazy' }));

      expect(registry.listByTier('resident').map((g) => g.name)).toEqual(['r1']);
      expect(registry.listByTier('eager').map((g) => g.name)).toEqual(['e1']);
      expect(registry.listByTier('lazy').map((g) => g.name)).toEqual(['l1', 'l2']);
    });

    it('excludes disabled groups', () => {
      registry.register(makeGroup({ name: 'disabled', loadingTier: 'resident', enabled: false }));
      expect(registry.listByTier('resident')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getEagerTools
  // -------------------------------------------------------------------------
  describe('getEagerTools()', () => {
    it('returns only eager-tier tools', () => {
      registry.register(
        makeGroup({
          name: 'core',
          tools: ['CoreTool'],
          loadingTier: 'resident',
        }),
      );
      registry.register(
        makeGroup({
          name: 'eager-set',
          tools: ['EagerA', 'EagerB'],
          loadingTier: 'eager',
        }),
      );
      registry.register(
        makeGroup({
          name: 'lazy-set',
          tools: ['LazyTool'],
          loadingTier: 'lazy',
        }),
      );

      const eager = registry.getEagerTools();
      expect(eager).toContain('EagerA');
      expect(eager).toContain('EagerB');
      expect(eager).not.toContain('CoreTool');
      expect(eager).not.toContain('LazyTool');
    });
  });

  // -------------------------------------------------------------------------
  // getActiveTools with tier integration
  // -------------------------------------------------------------------------
  describe('getActiveTools() with tiers', () => {
    it('includes eager/lazy tools when their ToolSet is explicitly activated', () => {
      registry.register(
        makeGroup({
          name: 'core',
          tools: ['Read'],
          loadingTier: 'resident',
        }),
      );
      registry.register(
        makeGroup({
          name: 'timeline',
          tools: ['QueryTimeline'],
          loadingTier: 'eager',
        }),
      );

      // Activate timeline manually
      const tools = registry.getActiveTools(['timeline']);

      expect(tools).toContain('Read'); // from default (resident)
      expect(tools).toContain('QueryTimeline'); // from activated eager set
    });
  });
});
