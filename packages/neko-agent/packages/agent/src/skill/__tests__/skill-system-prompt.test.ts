import { describe, expect, it } from 'vitest';
import {
  buildSkillAwareSystemPrompt,
  getEnabledSkillPromptEntries,
  toSkillPromptEntries,
} from '../skill-system-prompt';

describe('skill system prompt', () => {
  it('appends enabled skill summaries to the base prompt', () => {
    const prompt = buildSkillAwareSystemPrompt({
      basePrompt: 'Base prompt',
      skills: [
        { name: 'storyboard', description: 'Storyboard expert\nsecond line' },
        { name: 'disabled', description: 'Hidden', enabled: false },
      ],
    });

    expect(prompt).toContain('Base prompt');
    expect(prompt).toContain('# Available Skills');
    expect(prompt).toContain('- **storyboard**: Storyboard expert');
    expect(prompt).not.toContain('disabled');
    expect(prompt).toContain('Use `ActivateSkill`');
  });

  it('keeps the base prompt unchanged when no enabled skills exist', () => {
    expect(
      buildSkillAwareSystemPrompt({
        basePrompt: 'Base prompt',
        skills: [{ name: 'disabled', enabled: false }],
      }),
    ).toBe('Base prompt');
  });

  it('projects shared Skill objects to prompt entries', () => {
    expect(
      getEnabledSkillPromptEntries(
        toSkillPromptEntries([
          {
            name: 'image',
            description: 'Image specialist',
            content: 'body',
            source: 'builtin',
            enabled: true,
          },
          {
            name: 'off',
            description: 'Disabled',
            content: 'body',
            source: 'builtin',
            enabled: false,
          },
        ]),
      ),
    ).toEqual([{ name: 'image', description: 'Image specialist', enabled: true }]);
  });
});
