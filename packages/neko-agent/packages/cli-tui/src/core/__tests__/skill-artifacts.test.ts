import { describe, expect, it, vi } from 'vitest';
import { loadSkillArtifactsAsSkills } from '../skill-artifacts';

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
