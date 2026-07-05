/**
 * SkillInjectionCoordinator Tests
 *
 * Verifies atomic 3-track skill injection/removal:
 * - Track A: Prompt section management
 * - Track B: Permission allow rules
 * - Track C: Allowed tools state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillInjectionCoordinator } from '../skill-injection-coordinator';
import type { SkillInjectionCoordinatorDeps } from '../skill-injection-coordinator';
import { SkillInjectionModule } from '../../prompt/modules/skill/skill-injection-module';
import type { SkillInjection } from '@neko/shared';

// =============================================================================
// Mocks
// =============================================================================

function createMockDeps() {
  const mockComposer = createMockComposer();
  const mockPermissionHooks = createMockPermissionHooks();
  let syncCalls = 0;

  const deps: SkillInjectionCoordinatorDeps = {
    promptComposer: mockComposer,
    getPermissionHooks: () =>
      mockPermissionHooks as unknown as import('../../permission/permission-manager-types').IPermissionManager,
    syncSystemPrompt: () => {
      syncCalls++;
    },
    skillInjectionModule: new SkillInjectionModule(),
  };

  return {
    ...deps,
    mockComposer,
    mockPermissionHooks,
    get syncCalls() {
      return syncCalls;
    },
  };
}

function createMockComposer() {
  return {
    setBase: vi.fn(),
    setSection: vi.fn(),
    removeSection: vi.fn().mockReturnValue(true),
    removeSectionsByPrefix: vi.fn(),
    hasSection: vi.fn().mockReturnValue(false),
    getSection: vi.fn(),
    compose: vi.fn().mockReturnValue('composed prompt'),
    composeStructured: vi.fn().mockReturnValue({ text: 'composed prompt', sections: [] }),
    getTotalTokens: vi.fn().mockReturnValue(0),
    getLayerUsage: vi.fn(),
    dumpSections: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  };
}

function createMockPermissionHooks() {
  return {
    addAllowRule: vi.fn(),
    removeAllowRule: vi.fn(),
  };
}

function createInjection(overrides?: Partial<SkillInjection>): SkillInjection {
  return {
    name: 'test-skill',
    systemPrompt: 'Test skill prompt',
    type: 'skill',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SkillInjectionCoordinator', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let coordinator: SkillInjectionCoordinator;

  beforeEach(() => {
    deps = createMockDeps();
    coordinator = new SkillInjectionCoordinator(deps);
  });

  // ---------------------------------------------------------------------------
  // apply()
  // ---------------------------------------------------------------------------

  describe('apply()', () => {
    it('should add prompt section (Track A)', () => {
      coordinator.apply(createInjection());

      expect(deps.mockComposer.setSection).toHaveBeenCalledWith({
        id: 'skill:test-skill',
        layer: 'skill',
        content: 'Test skill prompt',
        priority: 50,
      });
    });

    it('should sync system prompt after adding section', () => {
      coordinator.apply(createInjection());
      expect(deps.syncCalls).toBeGreaterThan(0);
    });

    it('should add permission allow rules (Track B)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read', 'Bash(git:*)'] }));

      expect(deps.mockPermissionHooks.addAllowRule).toHaveBeenCalledWith('Read');
      expect(deps.mockPermissionHooks.addAllowRule).not.toHaveBeenCalledWith('Bash(git:*)');
    });

    it('should track allowed tools state (Track C)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read'] }));

      expect(coordinator.getActiveSkillAllowedTools()).toEqual(['Read']);
      expect(coordinator.hasActiveInjection()).toBe(true);
    });

    it('marks persistent shell allows ineffective for active skill state', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read', 'Bash(git:*)'] }));

      expect(coordinator.getActiveSkillAllowedTools()).toEqual(['Read']);
      expect(coordinator.isToolAllowed('Bash')).toBe(false);
    });

    it('should not add permission rules when allowedTools is empty', () => {
      coordinator.apply(createInjection({ allowedTools: [] }));
      expect(deps.mockPermissionHooks.addAllowRule).not.toHaveBeenCalled();
    });

    it('should not add permission rules when allowedTools is undefined', () => {
      coordinator.apply(createInjection({ allowedTools: undefined }));
      expect(deps.mockPermissionHooks.addAllowRule).not.toHaveBeenCalled();
    });

    it('should auto-remove previous injection before applying new one', () => {
      coordinator.apply(createInjection({ name: 'skill-a', allowedTools: ['Read'] }));
      coordinator.apply(createInjection({ name: 'skill-b', allowedTools: ['Write'] }));

      // Previous skill section should have been removed
      expect(deps.mockComposer.removeSection).toHaveBeenCalledWith('skill:skill-a');
      // Previous allow rules should have been cleaned
      expect(deps.mockPermissionHooks.removeAllowRule).toHaveBeenCalledWith('Read');
      // New skill should be active
      expect(coordinator.getActiveInjectionName()).toBe('skill-b');
      expect(coordinator.getActiveSkillAllowedTools()).toEqual(['Write']);
    });
  });

  // ---------------------------------------------------------------------------
  // remove()
  // ---------------------------------------------------------------------------

  describe('remove()', () => {
    it('should remove prompt section (Track A)', () => {
      coordinator.apply(createInjection());
      coordinator.remove('test-skill');

      expect(deps.mockComposer.removeSection).toHaveBeenCalledWith('skill:test-skill');
    });

    it('should remove only effective permission allow rules (Track B)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read', 'Bash(git:*)'] }));
      coordinator.remove('test-skill');

      expect(deps.mockPermissionHooks.removeAllowRule).toHaveBeenCalledWith('Read');
      expect(deps.mockPermissionHooks.removeAllowRule).not.toHaveBeenCalledWith('Bash(git:*)');
    });

    it('should clear allowed tools state (Track C)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read'] }));
      coordinator.remove('test-skill');

      expect(coordinator.getActiveSkillAllowedTools()).toBeUndefined();
      expect(coordinator.hasActiveInjection()).toBe(false);
    });

    it('should not throw when removing non-existent injection', () => {
      expect(() => coordinator.remove('non-existent')).not.toThrow();
    });

    it('should sync system prompt after removal', () => {
      coordinator.apply(createInjection());
      const syncBefore = deps.syncCalls;
      coordinator.remove('test-skill');
      expect(deps.syncCalls).toBeGreaterThan(syncBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Null permission hooks
  // ---------------------------------------------------------------------------

  describe('without permission hooks', () => {
    it('should not throw when applying with null permission hooks', () => {
      const nullDeps = {
        ...deps,
        getPermissionHooks: () => null,
      };
      const coord = new SkillInjectionCoordinator(nullDeps);

      expect(() => coord.apply(createInjection({ allowedTools: ['Read'] }))).not.toThrow();
    });

    it('should not throw when removing with null permission hooks', () => {
      const nullDeps = {
        ...deps,
        getPermissionHooks: () => null,
      };
      const coord = new SkillInjectionCoordinator(nullDeps);

      coord.apply(createInjection({ allowedTools: ['Read'] }));
      expect(() => coord.remove('test-skill')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Rollback on failure
  // ---------------------------------------------------------------------------

  describe('rollback on Track B failure', () => {
    it('should rollback prompt section when addAllowRule throws', () => {
      const failingPermission = {
        addAllowRule: vi.fn().mockImplementation(() => {
          throw new Error('Permission error');
        }),
        removeAllowRule: vi.fn(),
      };
      const failDeps = {
        ...deps,
        getPermissionHooks: () =>
          failingPermission as unknown as import('../../permission/permission-manager-types').IPermissionManager,
      };
      const coord = new SkillInjectionCoordinator(failDeps);

      expect(() => coord.apply(createInjection({ allowedTools: ['Read'] }))).toThrow(
        'Permission error',
      );

      // Track A should be rolled back
      expect(deps.mockComposer.removeSection).toHaveBeenCalledWith('skill:test-skill');
      // No active injection
      expect(coord.hasActiveInjection()).toBe(false);
    });

    it('should rollback partially added rules when later addAllowRule throws', () => {
      let callCount = 0;
      const partialFailPermission = {
        addAllowRule: vi.fn().mockImplementation((_rule: string) => {
          callCount++;
          if (callCount === 2) throw new Error('Second rule failed');
        }),
        removeAllowRule: vi.fn(),
      };
      const failDeps = {
        ...deps,
        getPermissionHooks: () =>
          partialFailPermission as unknown as import('../../permission/permission-manager-types').IPermissionManager,
      };
      const coord = new SkillInjectionCoordinator(failDeps);

      expect(() =>
        coord.apply(createInjection({ allowedTools: ['Read', 'Write', 'Bash'] })),
      ).toThrow('Second rule failed');

      // First rule should be rolled back
      expect(partialFailPermission.removeAllowRule).toHaveBeenCalledWith('Read');
      // Second rule was never added, third rule was never reached
      expect(partialFailPermission.removeAllowRule).not.toHaveBeenCalledWith('Write');
      expect(partialFailPermission.removeAllowRule).not.toHaveBeenCalledWith('Bash');
      // No active injection
      expect(coord.hasActiveInjection()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  describe('state queries', () => {
    it('should return undefined for allowed tools when no injection active', () => {
      expect(coordinator.getActiveSkillAllowedTools()).toBeUndefined();
    });

    it('should return false for hasActiveInjection when none applied', () => {
      expect(coordinator.hasActiveInjection()).toBe(false);
    });

    it('should return undefined for active injection name when none applied', () => {
      expect(coordinator.getActiveInjectionName()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // SkillInjectionModule integration
  //
  // These tests exercise the canonical Track A path through the module. They
  // use a real SystemPromptComposer so we can assert the module-owned section
  // contract is written into the composer.
  // ---------------------------------------------------------------------------

  describe('with SkillInjectionModule', () => {
    // Deferred imports — the real composer and module are heavier than the
    // existing mocks used by the legacy tests above.
    let realComposer: import('../../prompt/system-prompt-composer').SystemPromptComposer;
    let moduleInstance: import('../../prompt/modules/skill/skill-injection-module').SkillInjectionModule;
    let coord: SkillInjectionCoordinator;
    let realPermissionHooks: ReturnType<typeof createMockPermissionHooks>;

    beforeEach(async () => {
      const { SystemPromptComposer } = await import('../../prompt/system-prompt-composer');
      realComposer = new SystemPromptComposer();
      moduleInstance = new SkillInjectionModule();
      realPermissionHooks = createMockPermissionHooks();
      coord = new SkillInjectionCoordinator({
        promptComposer: realComposer,
        getPermissionHooks: () =>
          realPermissionHooks as unknown as import('../../permission/permission-manager-types').IPermissionManager,
        syncSystemPrompt: () => {},
        skillInjectionModule: moduleInstance,
      });
    });

    it('apply writes the skill section through the module and into the composer', () => {
      coord.apply(createInjection({ name: 'helper', systemPrompt: 'HELPER_PROMPT' }));
      expect(realComposer.hasSection('skill:helper')).toBe(true);
      expect(realComposer.getSection('skill:helper')?.content).toBe('HELPER_PROMPT');
      expect(moduleInstance.getInjection()?.name).toBe('helper');
    });

    it('passes the configured locale into Track A module rendering', () => {
      const renderSpy = vi.spyOn(moduleInstance, 'renderSync');
      coord = new SkillInjectionCoordinator({
        promptComposer: realComposer,
        getPermissionHooks: () =>
          realPermissionHooks as unknown as import('../../permission/permission-manager-types').IPermissionManager,
        syncSystemPrompt: () => {},
        skillInjectionModule: moduleInstance,
        getLocale: () => 'zh',
      });

      coord.apply(createInjection({ name: 'helper', systemPrompt: 'HELPER_PROMPT' }));

      expect(renderSpy).toHaveBeenCalledWith(expect.objectContaining({ locale: 'zh' }));
    });

    it('remove clears both the composer section and the module state', () => {
      coord.apply(createInjection({ name: 'helper' }));
      coord.remove('helper');
      expect(realComposer.hasSection('skill:helper')).toBe(false);
      expect(moduleInstance.getInjection()).toBeNull();
    });

    it('module path composes the expected skill section output', async () => {
      const { SystemPromptComposer } = await import('../../prompt/system-prompt-composer');
      const injection = createInjection({ name: 'cut', systemPrompt: 'CUT_PROMPT' });

      const modComposer = new SystemPromptComposer();
      modComposer.setBase('BASE');
      const modInstance = new SkillInjectionModule();
      const modPermission = createMockPermissionHooks();
      const modCoord = new SkillInjectionCoordinator({
        promptComposer: modComposer,
        getPermissionHooks: () =>
          modPermission as unknown as import('../../permission/permission-manager-types').IPermissionManager,
        syncSystemPrompt: () => {},
        skillInjectionModule: modInstance,
      });
      modCoord.apply(injection);

      expect(modComposer.getSection('skill:cut')).toMatchObject({
        id: 'skill:cut',
        layer: 'skill',
        content: 'CUT_PROMPT',
        priority: 50,
      });
      expect(modComposer.compose()).toContain('CUT_PROMPT');
    });

    it('apply → apply (switching skills) swaps the section and module state', () => {
      coord.apply(createInjection({ name: 'first', systemPrompt: 'FIRST' }));
      coord.apply(createInjection({ name: 'second', systemPrompt: 'SECOND' }));

      expect(realComposer.hasSection('skill:first')).toBe(false);
      expect(realComposer.hasSection('skill:second')).toBe(true);
      expect(realComposer.getSection('skill:second')?.content).toBe('SECOND');
      expect(moduleInstance.getInjection()?.name).toBe('second');
    });

    it('rollback on Track B failure clears both module and composer', () => {
      realPermissionHooks.addAllowRule.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      expect(() =>
        coord.apply(createInjection({ name: 'will-fail', allowedTools: ['Read'] })),
      ).toThrow('boom');

      expect(realComposer.hasSection('skill:will-fail')).toBe(false);
      expect(moduleInstance.getInjection()).toBeNull();
      expect(coord.hasActiveInjection()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Ablation: enableInjection=false (P1-A Toggle 2)
  // ---------------------------------------------------------------------------

  describe('ablation: enableInjection=false', () => {
    it('apply() does not write Track A section', () => {
      const d = createMockDeps();
      const coord = new SkillInjectionCoordinator({ ...d, enableInjection: false });

      coord.apply(createInjection());

      expect(d.mockComposer.setSection).not.toHaveBeenCalled();
    });

    it('apply() does not add Track B allow rules', () => {
      const d = createMockDeps();
      const coord = new SkillInjectionCoordinator({ ...d, enableInjection: false });

      coord.apply(createInjection({ allowedTools: ['Read', 'Write'] }));

      expect(d.mockPermissionHooks.addAllowRule).not.toHaveBeenCalled();
    });

    it('apply() does not track Track C state (no active injection)', () => {
      const d = createMockDeps();
      const coord = new SkillInjectionCoordinator({ ...d, enableInjection: false });

      coord.apply(createInjection({ allowedTools: ['Read'] }));

      expect(coord.hasActiveInjection()).toBe(false);
      expect(coord.getActiveSkillAllowedTools()).toBeUndefined();
    });

    it('apply() is a silent no-op (does not throw)', () => {
      const d = createMockDeps();
      const coord = new SkillInjectionCoordinator({ ...d, enableInjection: false });

      expect(() => coord.apply(createInjection())).not.toThrow();
    });

    it('default (enableInjection=undefined) preserves normal behavior', () => {
      const d = createMockDeps();
      const coord = new SkillInjectionCoordinator(d);

      coord.apply(createInjection());

      expect(d.mockComposer.setSection).toHaveBeenCalled();
      expect(coord.hasActiveInjection()).toBe(true);
    });
  });
});
