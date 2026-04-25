import { describe, expect, it } from 'vitest';
import { createCommandBackedSkill, createLazyCommandBackedSkill } from '../command-backed-skill';

describe('command-backed-skill', () => {
  it('projects slash command artifacts onto the Skill runtime shape', () => {
    const skill = createCommandBackedSkill({
      command: 'commit',
      description: 'Create a commit message',
      content: 'Use $ARGUMENTS to prepare a git commit message.',
      argumentHint: '[message]',
      allowedTools: ['Read', 'Bash(git:*)'],
      model: 'claude-sonnet',
      source: 'project',
      filePath: '/tmp/proj/.neko/commands/commit.md',
      enabled: true,
      icon: 'git-commit',
    });

    expect(skill).toEqual(
      expect.objectContaining({
        name: 'commit',
        description: 'Create a commit message',
        command: 'commit',
        argumentHint: '[message]',
        supportsArguments: true,
        autoInvoke: false,
        directoryPath: '/tmp/proj/.neko/commands',
      }),
    );
  });

  it('wraps lazy command artifacts as lazy skills', async () => {
    const lazySkill = createLazyCommandBackedSkill({
      command: 'review',
      description: 'Review a diff',
      argumentHint: '[path]',
      icon: 'eye',
      source: 'personal',
      filePath: '/tmp/home/.neko/commands/review.md',
      isLoaded: false,
      async loadContent() {
        return {
          command: 'review',
          description: 'Review a diff',
          content: 'Inspect $1 carefully.',
          source: 'personal',
          filePath: '/tmp/home/.neko/commands/review.md',
          enabled: true,
        };
      },
    });

    expect(lazySkill.name).toBe('review');
    expect(lazySkill.isLoaded).toBe(false);

    const loaded = await lazySkill.loadContent();
    expect(loaded).toEqual(
      expect.objectContaining({
        name: 'review',
        command: 'review',
        supportsArguments: true,
      }),
    );
    expect(lazySkill.isLoaded).toBe(true);
  });
});
