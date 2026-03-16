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
      mockPermissionHooks as unknown as import('../../permission/permission-hooks').PermissionHooks,
    syncSystemPrompt: () => {
      syncCalls++;
    },
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
    hasSection: vi.fn().mockReturnValue(false),
    getSection: vi.fn(),
    compose: vi.fn().mockReturnValue('composed prompt'),
    getTotalTokens: vi.fn().mockReturnValue(0),
    getLayerUsage: vi.fn(),
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
      expect(deps.mockPermissionHooks.addAllowRule).toHaveBeenCalledWith('Bash(git:*)');
    });

    it('should track allowed tools state (Track C)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read'] }));

      expect(coordinator.getActiveSkillAllowedTools()).toEqual(['Read']);
      expect(coordinator.hasActiveInjection()).toBe(true);
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

    it('should remove permission allow rules (Track B)', () => {
      coordinator.apply(createInjection({ allowedTools: ['Read', 'Bash(git:*)'] }));
      coordinator.remove('test-skill');

      expect(deps.mockPermissionHooks.removeAllowRule).toHaveBeenCalledWith('Read');
      expect(deps.mockPermissionHooks.removeAllowRule).toHaveBeenCalledWith('Bash(git:*)');
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
});
