/**
 * Skill Conflict Resolver Tests
 *
 * Tests for skill conflict detection and resolution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillConflictResolver } from '../skill-conflict-resolver';
import type { Skill, SkillConflictConfig } from '@neko/shared';

// Mock skill factory
function createMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'Test skill',
    content: 'Test content',
    enabled: true,
    source: 'project',
    ...overrides,
  } as Skill;
}

describe('SkillConflictResolver', () => {
  let resolver: SkillConflictResolver;

  beforeEach(() => {
    resolver = new SkillConflictResolver();
  });

  describe('constructor', () => {
    it('should use default strategy', () => {
      const resolver = new SkillConflictResolver();
      expect(resolver).toBeDefined();
    });

    it('should accept custom default strategy', () => {
      const resolver = new SkillConflictResolver({ defaultStrategy: 'merge' });
      expect(resolver).toBeDefined();
    });

    it('should accept custom max concurrent skills', () => {
      const resolver = new SkillConflictResolver({ maxConcurrentSkills: 5 });
      expect(resolver).toBeDefined();
    });
  });

  describe('registerSkill', () => {
    it('should register a skill', () => {
      const skill = createMockSkill({ name: 'test' });
      resolver.registerSkill(skill);

      const conflict = resolver.checkConflicts('test', []);
      expect(conflict).toBeNull();
    });

    it('should register skill with conflict config', () => {
      const skill = createMockSkill({ name: 'skill1' });
      const config: SkillConflictConfig = {
        conflicts: ['skill2'],
        priority: 10,
      };

      resolver.registerSkill(skill, config);

      const conflict = resolver.checkConflicts('skill1', ['skill2']);
      expect(conflict).not.toBeNull();
    });

    it('should overwrite existing skill', () => {
      const skill1 = createMockSkill({ name: 'test', description: 'First' });
      const skill2 = createMockSkill({ name: 'test', description: 'Second' });

      resolver.registerSkill(skill1);
      resolver.registerSkill(skill2);

      // Should not throw
      expect(() => resolver.checkConflicts('test', [])).not.toThrow();
    });
  });

  describe('unregisterSkill', () => {
    it('should remove a skill', () => {
      const skill = createMockSkill({ name: 'test' });
      resolver.registerSkill(skill);
      resolver.unregisterSkill('test');

      const conflict = resolver.checkConflicts('test', []);
      expect(conflict).toBeNull();
    });

    it('should not throw if skill does not exist', () => {
      expect(() => resolver.unregisterSkill('non-existent')).not.toThrow();
    });
  });

  describe('checkConflicts', () => {
    beforeEach(() => {
      const skill1 = createMockSkill({ name: 'skill1' });
      const skill2 = createMockSkill({ name: 'skill2' });
      const skill3 = createMockSkill({ name: 'skill3' });

      resolver.registerSkill(skill1, { conflicts: ['skill2'] });
      resolver.registerSkill(skill2);
      resolver.registerSkill(skill3, { conflicts: ['skill1'] });
    });

    it('should detect explicit conflicts', () => {
      const conflict = resolver.checkConflicts('skill1', ['skill2']);

      expect(conflict).not.toBeNull();
      expect(conflict?.requestedSkill).toBe('skill1');
      expect(conflict?.conflictingSkills).toContain('skill2');
      expect(conflict?.reason).toBe('explicit_conflict');
    });

    it('should detect reverse conflicts', () => {
      const conflict = resolver.checkConflicts('skill1', ['skill3']);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictingSkills).toContain('skill3');
    });

    it('should return null if no conflicts', () => {
      const conflict = resolver.checkConflicts('skill2', ['skill3']);

      expect(conflict).toBeNull();
    });

    it('should return null for unregistered skill', () => {
      const conflict = resolver.checkConflicts('unknown', ['skill1']);

      expect(conflict).toBeNull();
    });

    it('should handle empty active skills', () => {
      const conflict = resolver.checkConflicts('skill1', []);

      expect(conflict).toBeNull();
    });

    it('should detect multiple conflicts', () => {
      const skill4 = createMockSkill({ name: 'skill4' });
      resolver.registerSkill(skill4, { conflicts: ['skill1', 'skill2'] });

      const conflict = resolver.checkConflicts('skill4', ['skill1', 'skill2']);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictingSkills).toHaveLength(2);
    });
  });

  describe('resolveConflict', () => {
    beforeEach(() => {
      const skill1 = createMockSkill({ name: 'skill1' });
      const skill2 = createMockSkill({ name: 'skill2' });

      resolver.registerSkill(skill1, { priority: 10 });
      resolver.registerSkill(skill2, { priority: 1 });
    });

    it('should have resolveConflict method', () => {
      expect(typeof resolver.resolveConflict).toBe('function');
    });

    it('should accept conflict and strategy parameters', () => {
      const conflict = {
        requestedSkill: 'skill1',
        conflictingSkills: ['skill2'],
        reason: 'explicit_conflict' as const,
        suggestedResolution: 'priority' as const,
      };

      expect(() => resolver.resolveConflict(conflict, 'priority')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle self-conflict', () => {
      const skill = createMockSkill({ name: 'self' });
      resolver.registerSkill(skill, { conflicts: ['self'] });

      const conflict = resolver.checkConflicts('self', ['self']);

      expect(conflict).not.toBeNull();
    });

    it('should handle circular conflicts', () => {
      const skill1 = createMockSkill({ name: 'a' });
      const skill2 = createMockSkill({ name: 'b' });

      resolver.registerSkill(skill1, { conflicts: ['b'] });
      resolver.registerSkill(skill2, { conflicts: ['a'] });

      const conflict1 = resolver.checkConflicts('a', ['b']);
      const conflict2 = resolver.checkConflicts('b', ['a']);

      expect(conflict1).not.toBeNull();
      expect(conflict2).not.toBeNull();
    });

    it('should handle many active skills', () => {
      const activeSkills = Array.from({ length: 100 }, (_, i) => `skill${i}`);

      const conflict = resolver.checkConflicts('new-skill', activeSkills);

      expect(conflict).toBeNull();
    });
  });
});
