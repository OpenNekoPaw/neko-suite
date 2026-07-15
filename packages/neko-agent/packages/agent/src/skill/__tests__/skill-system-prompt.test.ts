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
    expect(prompt).toContain('Do not activate skills by keyword matching');
    expect(prompt).toContain('Use ordinary Agent capabilities first');
    expect(prompt).toContain('briefly state the activation reason');
    expect(prompt).toContain('registered description and current capability context');
    expect(prompt).not.toContain('storyboard, animation, video');
  });

  it('keeps Chinese skill catalogs in Chinese when a skill lacks localized description', () => {
    const prompt = buildSkillAwareSystemPrompt({
      basePrompt: '基础提示',
      skills: [
        { name: 'video-editing', description: 'Video editing assistant for timeline operations.' },
        { name: 'storyboard', description: '将漫画页面转换成可审阅分镜表。' },
      ],
    });

    expect(prompt).toContain('# 可用技能');
    expect(prompt).toContain(
      '- **video-editing**: 领域能力说明以技能正文为准；仅在 Agent 判断需要后激活。',
    );
    expect(prompt).toContain('- **storyboard**: 将漫画页面转换成可审阅分镜表。');
    expect(prompt).not.toContain('Video editing assistant');
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
