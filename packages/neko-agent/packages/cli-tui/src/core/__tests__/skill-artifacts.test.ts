import { describe, expect, it, vi } from 'vitest';
import { loadCodexSkillArtifactsAsSkills, loadSkillArtifactsAsSkills } from '../skill-artifacts';

describe('loadSkillArtifactsAsSkills', () => {
  it('loads sibling .neko/commands artifacts and adapts them into Skills', async () => {
    const loadFromDirectory = vi.fn(async (dir: string) => {
      if (dir === '/workspace/demo/.neko/skills') {
        return {
          skills: [
            {
              name: 'storyboard',
              description: 'Storyboard planning',
              content: 'Skill body',
              source: 'project',
              enabled: true,
            },
          ],
          commands: [],
          errors: [],
        };
      }

      if (dir === '/workspace/demo/.neko/commands') {
        return {
          skills: [],
          commands: [
            {
              command: 'commit',
              description: 'Create a commit message',
              content: 'Use $ARGUMENTS',
              source: 'project',
              filePath: '/workspace/demo/.neko/commands/commit.md',
              enabled: true,
            },
          ],
          errors: [],
        };
      }

      return { skills: [], commands: [], errors: [] };
    });

    const skills = await loadSkillArtifactsAsSkills(
      { loadFromDirectory },
      '/workspace/demo/.neko/skills',
    );

    expect(loadFromDirectory).toHaveBeenCalledWith('/workspace/demo/.neko/skills');
    expect(loadFromDirectory).toHaveBeenCalledWith('/workspace/demo/.neko/commands');
    expect(skills).toEqual([
      expect.objectContaining({ name: 'storyboard' }),
      expect.objectContaining({
        name: 'commit',
        command: 'commit',
        supportsArguments: true,
      }),
    ]);
  });
});

describe('loadCodexSkillArtifactsAsSkills', () => {
  it('loads Codex-style SKILL.md directories as lightweight project Skills', async () => {
    const files = new Map([
      [
        '/workspace/demo/.codex/skills/openspec-apply-change/SKILL.md',
        [
          '---',
          'name: openspec-apply-change',
          'description: Implement tasks from an OpenSpec change.',
          'license: MIT',
          '---',
          '',
          'Use OpenSpec apply instructions.',
        ].join('\n'),
      ],
    ]);
    const fs = {
      readdir: vi.fn(async () => [
        { name: 'openspec-apply-change', isDirectory: () => true },
        { name: 'README.md', isDirectory: () => false },
      ]),
      readFile: vi.fn(async (filePath: string) => {
        const content = files.get(filePath);
        if (content === undefined) {
          throw new Error(`ENOENT ${filePath}`);
        }
        return content;
      }),
    };

    const skills = await loadCodexSkillArtifactsAsSkills(
      fs,
      { join: (...parts: string[]) => parts.join('/') },
      '/workspace/demo/.codex/skills',
    );

    expect(skills).toEqual([
      expect.objectContaining({
        name: 'openspec-apply-change',
        description: 'Implement tasks from an OpenSpec change.',
        content: 'Use OpenSpec apply instructions.',
        source: 'project',
        enabled: true,
        entryPointKind: 'skill',
      }),
    ]);
  });
});
