import { describe, expect, it } from 'vitest';
import type { Skill } from '@neko/shared';
import type { LazyCommand, LazySkill } from '../lazy-loader';
import { SkillRegistryPopulator } from '../skill-registry-populator';
import { SkillRegistry } from '../skill-registry';

function makeSkill(name: string, source: Skill['source'] = 'project'): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} content`,
    source,
    enabled: true,
  };
}

describe('SkillRegistryPopulator', () => {
  it('registers builtin, disk skills and command-backed skills with population summary', () => {
    const registry = new SkillRegistry();
    const populator = new SkillRegistryPopulator();

    const summary = populator.populate({
      registry,
      builtinSkills: [makeSkill('builtin', 'builtin')],
      scanResult: {
        personal: {
          skills: [makeSkill('personal', 'personal')],
          commands: [
            {
              command: 'fix',
              description: 'Fix command',
              content: 'Fix $ARGUMENTS',
              source: 'personal',
              enabled: true,
            },
          ],
        },
        project: {
          skills: [makeSkill('project', 'project')],
          commands: [],
        },
      },
    });

    expect(summary).toEqual({
      total: 4,
      builtin: 1,
      personal: 1,
      project: 1,
      personalCommands: 1,
      projectCommands: 0,
    });
    expect(registry.getSkill('builtin')?.source).toBe('builtin');
    expect(registry.getSkillByCommand('fix')?.supportsArguments).toBe(true);
  });

  it('restores fallback skills when managed disk entries disappear', () => {
    const registry = new SkillRegistry();
    const populator = new SkillRegistryPopulator();
    const builtin = makeSkill('shared', 'builtin');
    const disk = makeSkill('shared', 'project');

    populator.populate({
      registry,
      builtinSkills: [builtin],
      scanResult: {
        personal: { skills: [], commands: [] },
        project: { skills: [disk], commands: [] },
      },
    });
    expect(registry.getSkill('shared')?.source).toBe('project');

    populator.populate({
      registry,
      builtinSkills: [builtin],
      scanResult: {
        personal: { skills: [], commands: [] },
        project: { skills: [], commands: [] },
      },
    });
    expect(registry.getSkill('shared')?.source).toBe('builtin');
  });

  it('registers lazy skills and lazy command-backed skills', async () => {
    const registry = new SkillRegistry();
    const populator = new SkillRegistryPopulator();
    const lazySkill: LazySkill = {
      name: 'lazy-skill',
      description: 'Lazy skill',
      source: 'project',
      directoryPath: '/tmp/lazy-skill',
      isLoaded: false,
      loadContent: async () => makeSkill('lazy-skill', 'project'),
    };
    const lazyCommand: LazyCommand = {
      command: 'lazy-command',
      description: 'Lazy command',
      source: 'project',
      filePath: '/tmp/lazy-command.md',
      isLoaded: false,
      loadContent: async () => ({
        command: 'lazy-command',
        description: 'Lazy command',
        content: 'Run $1',
        source: 'project',
        enabled: true,
      }),
    };

    populator.populateLazy({
      registry,
      builtinSkills: [],
      scanResult: {
        personal: { skills: [], commands: [] },
        project: { skills: [lazySkill], commands: [lazyCommand] },
      },
    });

    expect(registry.isLazy('lazy-skill')).toBe(true);
    expect(registry.isLazy('lazy-command')).toBe(true);
    await expect(registry.ensureLoaded('lazy-command')).resolves.toMatchObject({
      name: 'lazy-command',
      command: 'lazy-command',
      supportsArguments: true,
    });
  });
});
