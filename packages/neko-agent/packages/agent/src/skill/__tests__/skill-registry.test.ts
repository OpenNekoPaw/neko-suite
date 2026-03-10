/**
 * Skill Registry Tests
 *
 * Tests for skill and slash command registration and lookup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../skill-registry';
import type { Skill, SlashCommand } from '@neko/shared';

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

// Mock command factory
function createMockCommand(overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    command: 'test',
    description: 'Test command',
    content: 'Test content',
    enabled: true,
    source: 'project',
    ...overrides,
  } as SlashCommand;
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

  describe('registerCommand', () => {
    it('should register a slash command', () => {
      const command = createMockCommand({ command: 'test' });
      registry.registerCommand(command);

      const retrieved = registry.getCommand('test');
      expect(retrieved).toEqual(command);
    });

    it('should strip leading slash from command name', () => {
      const command = createMockCommand({ command: '/test' });
      registry.registerCommand(command);

      const retrieved = registry.getCommand('test');
      expect(retrieved).toBeDefined();
      expect(retrieved?.command).toBe('test');
    });

    it('should throw error if command has no name', () => {
      const command = createMockCommand({ command: '' });
      expect(() => registry.registerCommand(command)).toThrow(
        'SlashCommand must have a command name',
      );
    });

    it('should overwrite existing command with same name', () => {
      const cmd1 = createMockCommand({ command: 'test', description: 'First' });
      const cmd2 = createMockCommand({ command: 'test', description: 'Second' });

      registry.registerCommand(cmd1);
      registry.registerCommand(cmd2);

      const retrieved = registry.getCommand('test');
      expect(retrieved?.description).toBe('Second');
    });
  });

  describe('unregisterCommand', () => {
    it('should remove a command', () => {
      const command = createMockCommand({ command: 'test' });
      registry.registerCommand(command);
      registry.unregisterCommand('test');

      const retrieved = registry.getCommand('test');
      expect(retrieved).toBeUndefined();
    });

    it('should not throw if command does not exist', () => {
      expect(() => registry.unregisterCommand('non-existent')).not.toThrow();
    });
  });

  describe('getCommand', () => {
    it('should return command by name', () => {
      const command = createMockCommand({ command: 'test' });
      registry.registerCommand(command);

      const retrieved = registry.getCommand('test');
      expect(retrieved).toEqual(command);
    });

    it('should return undefined for non-existent command', () => {
      const retrieved = registry.getCommand('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listCommands', () => {
    it('should return all enabled commands', () => {
      registry.registerCommand(createMockCommand({ command: 'cmd1', enabled: true }));
      registry.registerCommand(createMockCommand({ command: 'cmd2', enabled: true }));
      registry.registerCommand(createMockCommand({ command: 'cmd3', enabled: false }));

      const commands = registry.listCommands();
      expect(commands).toHaveLength(2);
      expect(commands.map((c) => c.command)).toEqual(['cmd1', 'cmd2']);
    });

    it('should return empty array if no commands', () => {
      const commands = registry.listCommands();
      expect(commands).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all skills and commands', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1' }));
      registry.registerCommand(createMockCommand({ command: 'cmd1' }));

      registry.clear();

      expect(registry.listAllSkills()).toEqual([]);
      expect(registry.listCommands()).toEqual([]);
    });
  });

  describe('skill and command counts', () => {
    it('should track skill count via listAllSkills', () => {
      registry.registerSkill(createMockSkill({ name: 'skill1' }));
      registry.registerSkill(createMockSkill({ name: 'skill2' }));

      expect(registry.listAllSkills()).toHaveLength(2);
    });

    it('should track command count via listCommands', () => {
      registry.registerCommand(createMockCommand({ command: 'cmd1' }));
      registry.registerCommand(createMockCommand({ command: 'cmd2' }));

      expect(registry.listCommands()).toHaveLength(2);
    });
  });
});
