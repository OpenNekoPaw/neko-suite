import { describe, expect, it, vi } from 'vitest';
import type { Skill } from '@neko/shared';
import { handleTUISkillInvocation } from './slash-adapter';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { createTestAgentTerminalPresentation } from '../presentation/testing';

describe('slash adapter Skill invocation presentation', () => {
  it('uses the invocation presentation while preserving execution semantics', async () => {
    const skill = {
      name: 'quality-review',
      description: 'Review files',
      content: 'Review instructions',
      enabled: true,
    } satisfies Partial<Skill>;
    const skillService = createSkillService(skill);
    const onOutput = vi.fn();

    const result = await handleTUISkillInvocation('$quality-review changed files', {
      presentation: createTestAgentTerminalPresentation('zh-cn'),
      config: DEFAULT_CLI_CONFIG,
      skillService: skillService as never,
      onConfigUpdate: vi.fn(),
      onOutput,
    });

    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        output: 'Skill 已激活：quality-review',
        lifecycleActivation: { skillName: 'quality-review', args: 'changed files' },
        agentPrompt: 'changed files',
        executionOverrides: {
          metadata: {
            agentCreation: {
              entrySignal: 'prompt-chain-skill',
              taskShape: 'multi-step',
              creationKind: 'skill:quality-review',
            },
          },
        },
      }),
    );
    expect(onOutput).toHaveBeenCalledWith('Skill 已激活：quality-review');
  });

  it('keeps diagnostic identity and external load detail stable across locales', async () => {
    const skill = {
      name: 'broken-skill',
      description: 'Broken',
      content: 'Prompt',
      enabled: true,
    } satisfies Partial<Skill>;
    const detail = 'EACCES: /external/路径';

    for (const locale of ['en', 'zh-cn'] as const) {
      const skillService = createSkillService(skill);
      skillService.registry.ensureLoaded.mockRejectedValue(new Error(detail));
      const result = await handleTUISkillInvocation('$broken-skill', {
        presentation: createTestAgentTerminalPresentation(locale),
        config: DEFAULT_CLI_CONFIG,
        skillService: skillService as never,
        onConfigUpdate: vi.fn(),
        onOutput: vi.fn(),
      });

      expect(result.diagnosticCode).toBe('skill.load-failed');
      expect(result.error).toContain('broken-skill');
      expect(result.error).toContain(detail);
    }
  });
});

function createSkillService(skill: Partial<Skill>) {
  return {
    registry: {
      skillCount: 1,
      listSkills: vi.fn(() => [skill]),
      listAllSkills: vi.fn(() => [skill]),
      getSkill: vi.fn((name: string) => (name === skill.name ? skill : undefined)),
      getSkillByCommand: vi.fn(),
      searchSkills: vi.fn(() => []),
      ensureLoaded: vi.fn(async () => skill),
    },
    skillCount: 1,
    apply: vi.fn(),
  };
}
