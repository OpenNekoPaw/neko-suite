/**
 * Creative Permission System Tests
 *
 * Tests for ToolTraits, ToolTraitsRegistry,
 * and the upgraded auto/plan mode decision logic.
 *
 * Auto mode logic (simplified):
 *   - Reversible OR local → auto-allow
 *   - Network + irreversible → ask (user confirms expensive operations)
 *   - No traits registry → unconditional allow (backward compat)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ToolCallInfo } from '@neko/shared';
import { DEFAULT_TOOL_TRAITS } from '@neko/shared';
import { ToolTraitsRegistry, DEFAULT_CREATIVE_TOOL_TRAITS } from '../tool-traits-registry';
import { PermissionRuleMatcher } from '../rule-matcher';
import type { PermissionConfig } from '../types';
import { DEFAULT_READ_ONLY_TOOLS, CREATIVE_PLAN_TOOLS } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeToolCall(name: string, args?: Record<string, unknown>, id?: string): ToolCallInfo {
  return { name, arguments: args ?? {}, id: id ?? `call_${name}`, index: 0 };
}

function makeAutoConfig(overrides?: Partial<PermissionConfig>): PermissionConfig {
  return {
    mode: 'auto',
    rules: {},
    ...overrides,
  };
}

function makePlanConfig(overrides?: Partial<PermissionConfig>): PermissionConfig {
  return {
    mode: 'plan',
    rules: {},
    readOnlyTools: [...DEFAULT_READ_ONLY_TOOLS, ...CREATIVE_PLAN_TOOLS],
    ...overrides,
  };
}

// =============================================================================
// ToolTraitsRegistry
// =============================================================================

describe('ToolTraitsRegistry', () => {
  let registry: ToolTraitsRegistry;

  beforeEach(() => {
    registry = new ToolTraitsRegistry();
  });

  describe('get', () => {
    it('returns DEFAULT_TOOL_TRAITS for unregistered tools', () => {
      expect(registry.get('UnknownTool')).toEqual(DEFAULT_TOOL_TRAITS);
    });

    it('returns registered traits', () => {
      const traits = {
        cost: 'expensive' as const,
        reversible: false,
        locality: 'network' as const,
        impactLevel: 'high' as const,
      };
      registry.register('GenerateVideo', traits);
      expect(registry.get('GenerateVideo')).toEqual(traits);
    });
  });

  describe('register', () => {
    it('overwrites existing traits', () => {
      registry.register('Foo', {
        cost: 'free',
        reversible: true,
        locality: 'local',
        impactLevel: 'none',
      });
      registry.register('Foo', {
        cost: 'expensive',
        reversible: false,
        locality: 'network',
        impactLevel: 'high',
      });
      expect(registry.get('Foo').cost).toBe('expensive');
    });
  });

  describe('registerMany', () => {
    it('bulk registers multiple entries', () => {
      registry.registerMany(DEFAULT_CREATIVE_TOOL_TRAITS);
      expect(registry.has('GenerateVideo')).toBe(true);
      expect(registry.has('GetTimelineInfo')).toBe(true);
      expect(registry.get('GenerateVideo').cost).toBe('expensive');
      expect(registry.get('GetTimelineInfo').cost).toBe('free');
    });
  });

  describe('has', () => {
    it('returns false for unregistered tools', () => {
      expect(registry.has('Nonexistent')).toBe(false);
    });

    it('returns true for registered tools', () => {
      registry.register('Foo', DEFAULT_TOOL_TRAITS);
      expect(registry.has('Foo')).toBe(true);
    });
  });

  describe('keys', () => {
    it('returns all registered tool names', () => {
      registry.register('A', DEFAULT_TOOL_TRAITS);
      registry.register('B', DEFAULT_TOOL_TRAITS);
      expect(registry.keys().sort()).toEqual(['A', 'B']);
    });
  });

  describe('size', () => {
    it('reflects registration count', () => {
      expect(registry.size).toBe(0);
      registry.register('A', DEFAULT_TOOL_TRAITS);
      expect(registry.size).toBe(1);
    });
  });
});

// =============================================================================
// Auto Mode with Traits Registry
// =============================================================================

describe('PermissionRuleMatcher - auto mode with traits', () => {
  let registry: ToolTraitsRegistry;

  beforeEach(() => {
    registry = new ToolTraitsRegistry();
    registry.registerMany(DEFAULT_CREATIVE_TOOL_TRAITS);
  });

  describe('reversible OR local → auto-allow', () => {
    it('allows local reversible tools', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('GetTimelineInfo'));
      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('auto-allowed');
    });

    it('allows local tools even if irreversible', () => {
      registry.register('LocalDelete', {
        cost: 'free',
        reversible: false,
        locality: 'local',
        impactLevel: 'high',
      });
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('LocalDelete'));
      expect(result.decision).toBe('allow');
    });

    it('allows reversible network tools', () => {
      registry.register('ReversibleAPI', {
        cost: 'moderate',
        reversible: true,
        locality: 'network',
        impactLevel: 'low',
      });
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('ReversibleAPI'));
      expect(result.decision).toBe('allow');
    });

    it('allows core local tools (Read, ReadDocument, Write, Glob, Grep)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      expect(matcher.check(makeToolCall('Read')).decision).toBe('allow');
      expect(matcher.check(makeToolCall('ReadDocument')).decision).toBe('allow');
      expect(matcher.check(makeToolCall('Write')).decision).toBe('allow');
      expect(matcher.check(makeToolCall('Glob')).decision).toBe('allow');
      expect(matcher.check(makeToolCall('Grep')).decision).toBe('allow');
    });
  });

  describe('network + irreversible → ask', () => {
    it('asks for GenerateVideo (expensive, network, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('GenerateVideo'));
      expect(result.decision).toBe('ask');
      expect(result.reason).toContain('requires confirmation');
      expect(result.reason).toContain('network + irreversible');
    });

    it('asks for GenerateImage (moderate, network, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('GenerateImage'));
      expect(result.decision).toBe('ask');
    });

    it('asks for GenerateMusic (moderate, network, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('GenerateMusic'));
      expect(result.decision).toBe('ask');
    });

    it('asks for GenerateTTS (cheap, network, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('GenerateTTS'));
      expect(result.decision).toBe('ask');
    });

    it('asks for canvas_generate_image (network, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('canvas_generate_image'));
      expect(result.decision).toBe('ask');
    });

    it('asks for Bash (hybrid, irreversible)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('Bash', { command: 'rm -rf /' }));
      expect(result.decision).toBe('ask');
    });
  });

  describe('backward compatibility', () => {
    it('unconditionally allows when no traits registry provided', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig());
      const result = matcher.check(makeToolCall('GenerateVideo'));
      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('allowed by default');
    });

    it('unknown tools default to safe traits (allow)', () => {
      const matcher = new PermissionRuleMatcher(makeAutoConfig(), registry);
      const result = matcher.check(makeToolCall('SomeUnknownTool'));
      expect(result.decision).toBe('allow');
    });
  });

  describe('deny/allow rules take precedence over traits', () => {
    it('deny rules still block even if traits would allow', () => {
      const config = makeAutoConfig({ rules: { deny: ['GetTimelineInfo'] } });
      const matcher = new PermissionRuleMatcher(config, registry);
      const result = matcher.check(makeToolCall('GetTimelineInfo'));
      expect(result.decision).toBe('deny');
    });

    it('allow rules bypass traits check for generation tools', () => {
      const config = makeAutoConfig({ rules: { allow: ['GenerateVideo'] } });
      const matcher = new PermissionRuleMatcher(config, registry);
      const result = matcher.check(makeToolCall('GenerateVideo'));
      expect(result.decision).toBe('allow');
    });
  });
});

// =============================================================================
// Plan Mode with Creative Tools
// =============================================================================

describe('PermissionRuleMatcher - plan mode with creative tools', () => {
  it('allows creative plan tools in plan mode', () => {
    const matcher = new PermissionRuleMatcher(makePlanConfig());

    // Timeline read-only
    expect(matcher.check(makeToolCall('GetTimelineInfo')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('ListTimelineElements')).decision).toBe('allow');

    // Canvas read-only
    expect(matcher.check(makeToolCall('canvas_list_nodes')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('canvas_get_node')).decision).toBe('allow');

    // Effects discovery
    expect(matcher.check(makeToolCall('ListVideoEffects')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('GetVideoEffectInfo')).decision).toBe('allow');

    // Asset browsing
    expect(matcher.check(makeToolCall('ListAssets')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('GetAsset')).decision).toBe('allow');
  });

  it('still allows default read-only tools in plan mode', () => {
    const matcher = new PermissionRuleMatcher(makePlanConfig());
    expect(matcher.check(makeToolCall('Read')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('ReadDocument')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('Glob')).decision).toBe('allow');
    expect(matcher.check(makeToolCall('Grep')).decision).toBe('allow');
  });

  it('denies generation tools in plan mode', () => {
    const matcher = new PermissionRuleMatcher(makePlanConfig());
    expect(matcher.check(makeToolCall('GenerateImage')).decision).toBe('deny');
    expect(matcher.check(makeToolCall('GenerateVideo')).decision).toBe('deny');
    expect(matcher.check(makeToolCall('Bash', { command: 'ls' })).decision).toBe('deny');
  });

  it('denies write tools in plan mode', () => {
    const matcher = new PermissionRuleMatcher(makePlanConfig());
    expect(matcher.check(makeToolCall('Write', { file_path: 'test.ts' })).decision).toBe('deny');
    expect(matcher.check(makeToolCall('Edit', { file_path: 'test.ts' })).decision).toBe('deny');
  });
});

// =============================================================================
// DEFAULT_CREATIVE_TOOL_TRAITS completeness
// =============================================================================

describe('DEFAULT_CREATIVE_TOOL_TRAITS', () => {
  it('has valid trait values for all entries', () => {
    const validCosts = ['free', 'cheap', 'moderate', 'expensive'];
    const validLocalities = ['local', 'network', 'hybrid'];
    const validImpacts = ['none', 'low', 'high', 'critical'];

    for (const entry of DEFAULT_CREATIVE_TOOL_TRAITS) {
      expect(entry.name).toBeTruthy();
      expect(validCosts).toContain(entry.traits.cost);
      expect(typeof entry.traits.reversible).toBe('boolean');
      expect(validLocalities).toContain(entry.traits.locality);
      expect(validImpacts).toContain(entry.traits.impactLevel);
    }
  });

  it('marks generation tools as network + irreversible', () => {
    const generationTools = DEFAULT_CREATIVE_TOOL_TRAITS.filter(
      (e) => e.name.startsWith('Generate') || e.name.startsWith('canvas_generate'),
    );
    for (const entry of generationTools) {
      expect(entry.traits.locality).toBe('network');
      expect(entry.traits.reversible).toBe(false);
    }
  });

  it('marks timeline/canvas tools as local + reversible', () => {
    const localTools = DEFAULT_CREATIVE_TOOL_TRAITS.filter(
      (e) =>
        e.name.startsWith('GetTimeline') ||
        e.name.startsWith('ListTimeline') ||
        e.name.startsWith('canvas_list') ||
        e.name.startsWith('canvas_get'),
    );
    for (const entry of localTools) {
      expect(entry.traits.locality).toBe('local');
      expect(entry.traits.reversible).toBe(true);
    }
  });
});
