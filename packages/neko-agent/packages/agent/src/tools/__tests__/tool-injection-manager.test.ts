import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolInjectionManager, createToolInjectionManager } from '../tool-injection-manager';
import type {
  IToolCategoryRegistry,
  IToolProvider,
  ToolInjectionConfig,
  ToolInjectionLayer,
} from '@neko/shared';
import { CORE_TOOLS } from '@neko/shared';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockCategoryRegistry(): IToolCategoryRegistry {
  return {
    getToolInfo: vi.fn((name: string) => {
      // Core tools are 'always' layer
      if (CORE_TOOLS.includes(name as never)) {
        return { name, layer: 'always' as ToolInjectionLayer, category: 'core', tokenCost: 100 };
      }
      // Dynamic tools
      return { name, layer: 'dynamic' as ToolInjectionLayer, category: 'custom', tokenCost: 200 };
    }),
    calculateTokenCost: vi.fn((tools: string[]) => tools.length * 100),
    registerCategory: vi.fn(),
    getCategory: vi.fn(),
    listCategories: vi.fn(() => []),
    categorizeTool: vi.fn(),
    getToolsByCategory: vi.fn(() => []),
    getToolsByLayer: vi.fn(() => []),
    setToolTokenCost: vi.fn(),
    setToolActive: vi.fn(),
  } as unknown as IToolCategoryRegistry;
}

function makeMockToolProvider(
  activeTools: string[] = [],
  defaultTools: string[] = [],
): IToolProvider {
  return {
    getActiveTools: vi.fn((_toolSets: string[]) => activeTools),
    getDefaultTools: vi.fn(() => defaultTools),
  } as unknown as IToolProvider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolInjectionManager', () => {
  let registry: IToolCategoryRegistry;
  let manager: ToolInjectionManager;

  beforeEach(() => {
    registry = makeMockCategoryRegistry();
    manager = new ToolInjectionManager(registry);
  });

  // -----------------------------------------------------------------------
  // initial state
  // -----------------------------------------------------------------------
  describe('initial state', () => {
    it('has core tools in always layer', () => {
      const state = manager.getState();
      const alwaysTools = state.injectedTools.get('always');
      expect(alwaysTools).toBeDefined();
      for (const tool of CORE_TOOLS) {
        expect(alwaysTools).toContain(tool);
      }
    });

    it('has empty dynamic layer', () => {
      const state = manager.getState();
      const dynamicTools = state.injectedTools.get('dynamic');
      expect(dynamicTools).toEqual([]);
    });

    it('has no active tool sets', () => {
      const state = manager.getState();
      expect(state.activeToolSets).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getToolsForTurn
  // -----------------------------------------------------------------------
  describe('getToolsForTurn', () => {
    it('returns core tools when no tool provider', () => {
      const tools = manager.getToolsForTurn('');
      for (const core of CORE_TOOLS) {
        expect(tools).toContain(core);
      }
    });

    it('includes dynamic tools from activated tool sets', () => {
      const provider = makeMockToolProvider(['CustomTool'], []);
      const mgr = new ToolInjectionManager(registry, provider);
      mgr.activateToolSet('web-tools');

      const tools = mgr.getToolsForTurn('');
      expect(tools).toContain('CustomTool');
    });

    it('includes default tools from tool provider', () => {
      const provider = makeMockToolProvider([], ['DefaultTool']);
      const mgr = new ToolInjectionManager(registry, provider);

      const tools = mgr.getToolsForTurn('');
      expect(tools).toContain('DefaultTool');
    });

    it('deduplicates tools', () => {
      // Provider returns a core tool name as both active and default
      const duplicatedTool = CORE_TOOLS[0]!;
      const provider = makeMockToolProvider([duplicatedTool], [duplicatedTool]);
      const mgr = new ToolInjectionManager(registry, provider);
      mgr.activateToolSet('dup-set');

      const tools = mgr.getToolsForTurn('');
      const occurrences = tools.filter((t) => t === duplicatedTool);
      expect(occurrences).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // activateToolSet / deactivateToolSet
  // -----------------------------------------------------------------------
  describe('activateToolSet / deactivateToolSet', () => {
    it('activateToolSet adds to active list', () => {
      manager.activateToolSet('web-tools');
      expect(manager.getActiveToolSets()).toContain('web-tools');
    });

    it('activateToolSet is idempotent', () => {
      manager.activateToolSet('web-tools');
      manager.activateToolSet('web-tools');
      const sets = manager.getActiveToolSets();
      const count = sets.filter((s) => s === 'web-tools').length;
      expect(count).toBe(1);
    });

    it('deactivateToolSet removes from active list', () => {
      manager.activateToolSet('web-tools');
      manager.deactivateToolSet('web-tools');
      expect(manager.getActiveToolSets()).not.toContain('web-tools');
    });

    it('deactivateToolSet is no-op for unknown', () => {
      // Should not throw
      expect(() => manager.deactivateToolSet('nonexistent')).not.toThrow();
      expect(manager.getActiveToolSets()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // events
  // -----------------------------------------------------------------------
  describe('events', () => {
    it('emits skill_activated on activateToolSet', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.activateToolSet('web-tools');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill_activated',
          skillName: 'web-tools',
          layer: 'dynamic',
        }),
      );
    });

    it('emits skill_deactivated on deactivateToolSet', () => {
      manager.activateToolSet('web-tools');
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.deactivateToolSet('web-tools');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill_deactivated',
          skillName: 'web-tools',
          layer: 'dynamic',
        }),
      );
    });

    it('emits state_reset on reset', () => {
      const listener = vi.fn();
      manager.addEventListener(listener);

      manager.reset();

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'state_reset' }));
    });

    it('removeListener stops events', () => {
      const listener = vi.fn();
      const remove = manager.addEventListener(listener);

      remove();
      manager.activateToolSet('web-tools');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------
  describe('reset', () => {
    it('reset restores initial state', () => {
      manager.activateToolSet('web-tools');
      manager.activateToolSet('db-tools');
      manager.getToolsForTurn('test');

      manager.reset();

      const state = manager.getState();
      expect(state.activeToolSets).toEqual([]);
      expect(state.injectedTools.get('dynamic')).toEqual([]);
      // Core tools should be restored
      for (const tool of CORE_TOOLS) {
        expect(state.injectedTools.get('always')).toContain(tool);
      }
    });
  });

  // -----------------------------------------------------------------------
  // token usage
  // -----------------------------------------------------------------------
  describe('token usage', () => {
    it('getTokenUsage returns usage per layer', () => {
      manager.getToolsForTurn('');
      const usage = manager.getTokenUsage();

      expect(usage.length).toBe(2);
      const layers = usage.map((u) => u.layer);
      expect(layers).toContain('always');
      expect(layers).toContain('dynamic');
      // Each entry should have numeric fields
      for (const entry of usage) {
        expect(typeof entry.used).toBe('number');
        expect(typeof entry.budget).toBe('number');
        expect(typeof entry.toolCount).toBe('number');
      }
    });

    it('getTotalTokenUsage sums all layers', () => {
      manager.getToolsForTurn('');
      const total = manager.getTotalTokenUsage();
      const perLayer = manager.getTokenUsage();
      const expectedTotal = perLayer.reduce((sum, u) => sum + u.used, 0);
      expect(total).toBe(expectedTotal);
    });

    it('isBudgetExceeded returns false when within budget', () => {
      manager.getToolsForTurn('');
      expect(manager.isBudgetExceeded('always')).toBe(false);
      expect(manager.isBudgetExceeded('dynamic')).toBe(false);
    });

    it('getTotalTokenBudget returns sum of layer budgets', () => {
      const budget = manager.getTotalTokenBudget();
      // Default: always=500000, dynamic=500000
      expect(budget).toBe(1000000);
    });
  });

  // -----------------------------------------------------------------------
  // tool queries
  // -----------------------------------------------------------------------
  describe('tool queries', () => {
    it('isToolInjected returns true for injected tools', () => {
      manager.getToolsForTurn('');
      const coreTool = CORE_TOOLS[0]!;
      expect(manager.isToolInjected(coreTool)).toBe(true);
    });

    it('isToolInjected returns false for non-injected tools', () => {
      manager.getToolsForTurn('');
      expect(manager.isToolInjected('SomeRandomToolThatDoesNotExist')).toBe(false);
    });

    it('getToolLayer returns correct layer', () => {
      manager.getToolsForTurn('');
      const coreTool = CORE_TOOLS[0]!;
      expect(manager.getToolLayer(coreTool)).toBe('always');
    });
  });

  // -----------------------------------------------------------------------
  // configure
  // -----------------------------------------------------------------------
  describe('configure', () => {
    it('configure updates settings', () => {
      const provider = makeMockToolProvider(['T1', 'T2', 'T3'], []);
      const mgr = new ToolInjectionManager(registry, provider);
      mgr.activateToolSet('test-set');

      // Restrict always layer to 2 tools max
      mgr.configure({ maxToolsPerLayer: { always: 2, dynamic: 30 } });

      const tools = mgr.getToolsForTurn('');
      // Always-layer tools should be capped at 2
      const state = mgr.getState();
      const alwaysTools = state.injectedTools.get('always') ?? [];
      expect(alwaysTools.length).toBeLessThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // activateToolSetsForTools
  // -----------------------------------------------------------------------
  describe('activateToolSetsForTools', () => {
    it('activates ToolSets that contain the given tools', () => {
      const provider = {
        getActiveTools: vi.fn(() => ['ToolA', 'ToolB']),
        getDefaultTools: vi.fn(() => []),
        getGroupsForTool: vi.fn((name: string) => {
          if (name === 'ToolA') return ['group-alpha'];
          if (name === 'ToolB') return ['group-beta'];
          return [];
        }),
      } as unknown as IToolProvider;

      const mgr = new ToolInjectionManager(registry, provider);
      const activated = mgr.activateToolSetsForTools(['ToolA', 'ToolB']);

      expect(activated).toContain('group-alpha');
      expect(activated).toContain('group-beta');
      expect(mgr.getActiveToolSets()).toContain('group-alpha');
      expect(mgr.getActiveToolSets()).toContain('group-beta');
    });

    it('returns empty when no tool provider', () => {
      const mgr = new ToolInjectionManager(registry);
      const activated = mgr.activateToolSetsForTools(['ToolA']);
      expect(activated).toEqual([]);
    });

    it('skips already-active ToolSets', () => {
      const provider = {
        getActiveTools: vi.fn(() => []),
        getDefaultTools: vi.fn(() => []),
        getGroupsForTool: vi.fn(() => ['group-alpha']),
      } as unknown as IToolProvider;

      const mgr = new ToolInjectionManager(registry, provider);
      mgr.activateToolSet('group-alpha'); // pre-activate

      const activated = mgr.activateToolSetsForTools(['ToolA']);
      expect(activated).toEqual([]); // already active, not re-activated
    });

    it('returns empty when provider lacks getGroupsForTool', () => {
      const provider = makeMockToolProvider([], []);
      const mgr = new ToolInjectionManager(registry, provider);
      const activated = mgr.activateToolSetsForTools(['ToolA']);
      expect(activated).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // createToolInjectionManager factory
  // -----------------------------------------------------------------------
  describe('createToolInjectionManager factory', () => {
    it('creates instance with defaults', () => {
      const instance = createToolInjectionManager(registry);
      expect(instance).toBeInstanceOf(ToolInjectionManager);

      const state = instance.getState();
      expect(state.activeToolSets).toEqual([]);
      expect(state.injectedTools.get('always')).toEqual(expect.arrayContaining([...CORE_TOOLS]));
    });
  });
});
