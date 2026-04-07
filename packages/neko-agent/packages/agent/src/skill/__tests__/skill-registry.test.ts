/**
 * Skill Registry Tests
 *
 * Tests for skill and slash command registration and lookup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../skill-registry';
import type { Skill } from '@neko/shared';

// Mock skill factory
function createMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'Test skill description',
    content: 'Test content',
    enabled: true,
    source: 'project',
    ...overrides,
  } as Skill;
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('registerSkill', () => {
    it('should register a skill', () => {
      const skill = createMockSkill({ name: 'my-skill' });
      registry.registerSkill(skill);

      const retrieved = registry.getSkill('my-skill');
      expect(retrieved).toEqual(skill);
    });

    it('should throw error if skill has no name', () => {
      const skill = createMockSkill({ name: '' });
      expect(() => registry.registerSkill(skill)).toThrow('Skill must have a name');
    });

    it('should overwrite existing skill with same name', () => {
      const skill1 = createMockSkill({ name: 'skill', description: 'First' });
      const skill2 = createMockSkill({ name: 'skill', description: 'Second' });

      registry.registerSkill(skill1);
      registry.registerSkill(skill2);

      const retrieved = registry.getSkill('skill');
      expect(retrieved?.description).toBe('Second');
    });
  });

  describe('unregisterSkill', () => {
    it('should remove a skill', () => {
      const skill = createMockSkill({ name: 'my-skill' });
      registry.registerSkill(skill);
      registry.unregisterSkill('my-skill');

      const retrieved = registry.getSkill('my-skill');
      expect(retrieved).toBeUndefined();
    });

    it('should not throw if skill does not exist', () => {
      expect(() => registry.unregisterSkill('non-existent')).not.toThrow();
    });
  });

  describe('getSkill', () => {
    it('should return skill by name', () => {
      const skill = createMockSkill({ name: 'my-skill' });
      registry.registerSkill(skill);

      const retrieved = registry.getSkill('my-skill');
      expect(retrieved).toEqual(skill);
    });

    it('should return undefined for non-existent skill', () => {
      const retrieved = registry.getSkill('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listSkills', () => {
    it('should return all enabled skills', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1', enabled: true }));
      registry.registerSkill(createMockSkill({ name: 'skill2', enabled: true }));
      registry.registerSkill(createMockSkill({ name: 'skill3', enabled: false }));

      const skills = registry.listSkills();
      expect(skills).toHaveLength(2);
      expect(skills.map((s) => s.name)).toEqual(['skill1', 'skill2']);
    });

    it('should return empty array if no skills', () => {
      const skills = registry.listSkills();
      expect(skills).toEqual([]);
    });
  });

  describe('listAllSkills', () => {
    it('should return all skills including disabled', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1', enabled: true }));
      registry.registerSkill(createMockSkill({ name: 'skill2', enabled: false }));

      const skills = registry.listAllSkills();
      expect(skills).toHaveLength(2);
    });
  });

  describe('searchSkills', () => {
    beforeEach(() => {
      registry.registerSkill(
        createMockSkill({ name: 'commit-helper', description: 'Help with git commits' }),
      );
      registry.registerSkill(
        createMockSkill({ name: 'test-runner', description: 'Run unit tests' }),
      );
      registry.registerSkill(
        createMockSkill({ name: 'code-review', description: 'Review code changes' }),
      );
    });

    it('should find skills by name', () => {
      const results = registry.searchSkills('commit');
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('commit-helper');
    });

    it('should find skills by description', () => {
      const results = registry.searchSkills('review');
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('code-review');
    });

    it('should be case-insensitive', () => {
      const results = registry.searchSkills('COMMIT');
      expect(results).toHaveLength(1);
    });

    it('should return empty array if no match', () => {
      const results = registry.searchSkills('nonexistent');
      expect(results).toEqual([]);
    });

    it('should not return disabled skills', () => {
      registry.registerSkill(
        createMockSkill({ name: 'disabled-skill', description: 'test', enabled: false }),
      );
      const results = registry.searchSkills('disabled');
      expect(results).toEqual([]);
    });
  });

  describe('getSkillByCommand', () => {
    it('should find skill by command name', () => {
      const skill = createMockSkill({ name: 'commit-skill', command: 'commit' });
      registry.registerSkill(skill);

      const found = registry.getSkillByCommand('commit');
      expect(found).toBeDefined();
      expect(found?.name).toBe('commit-skill');
    });

    it('should strip leading slash from command name', () => {
      const skill = createMockSkill({ name: 'test-skill', command: 'test' });
      registry.registerSkill(skill);

      const found = registry.getSkillByCommand('/test');
      expect(found).toBeDefined();
    });

    it('should return undefined for non-existent command', () => {
      const found = registry.getSkillByCommand('nonexistent');
      expect(found).toBeUndefined();
    });

    it('should not return disabled skills', () => {
      const skill = createMockSkill({ name: 'disabled', command: 'disabled', enabled: false });
      registry.registerSkill(skill);

      const found = registry.getSkillByCommand('disabled');
      expect(found).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should remove all skills', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1' }));
      registry.registerSkill(createMockSkill({ name: 'skill2' }));

      registry.clear();

      expect(registry.listAllSkills()).toEqual([]);
    });
  });

  describe('skill counts', () => {
    it('should track skill count via skillCount', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1' }));
      registry.registerSkill(createMockSkill({ name: 'skill2' }));

      expect(registry.skillCount).toBe(2);
    });

    it('should track skill count via listAllSkills', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1' }));
      registry.registerSkill(createMockSkill({ name: 'skill2' }));

      expect(registry.listAllSkills()).toHaveLength(2);
    });
  });
});
