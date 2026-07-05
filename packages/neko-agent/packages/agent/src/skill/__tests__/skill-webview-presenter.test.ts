import { describe, expect, it } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { buildSkillInjectionMessage, buildSkillsListMessage } from '../skill-webview-presenter';

describe('skill webview presenter', () => {
  it('builds skills list messages from skill summaries', () => {
    expect(
      buildSkillsListMessage([
        {
          name: 'commit',
          description: 'Create commits',
          content: 'Commit instructions',
          source: 'project',
          enabled: true,
          command: 'commit',
        } satisfies Skill,
      ]),
    ).toEqual({
      type: 'skillsList',
      skills: [
        expect.objectContaining({
          name: 'commit',
          description: 'Create commits',
        }),
      ],
    });
  });

  it('builds skill injection messages with explicit conversation and tools', () => {
    const injection: SkillInjection = {
      name: 'review',
      systemPrompt: 'Review code',
      allowedTools: ['read'],
      model: 'claude',
      type: 'skill',
    };
    const skill = {
      name: 'review',
      description: 'Review code',
      content: 'Review instructions',
      source: 'project',
      enabled: true,
      toolDefinitions: [{ name: 'custom_tool', description: 'Custom tool', parameters: {} }],
    } satisfies Skill;

    expect(
      buildSkillInjectionMessage({
        injection,
        skill,
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'skillInjection',
      conversationId: 'conv-1',
      skillName: 'review',
      systemPrompt: 'Review code',
      allowedTools: ['read'],
      model: 'claude',
      toolDefinitions: [{ name: 'custom_tool', description: 'Custom tool', parameters: {} }],
    });

    expect(() =>
      buildSkillInjectionMessage({
        injection,
        skill,
        conversationId: '',
      }),
    ).toThrow('skillInjection requires non-empty conversationId');
  });
});
