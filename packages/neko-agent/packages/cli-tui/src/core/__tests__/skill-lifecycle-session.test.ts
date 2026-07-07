import { describe, expect, it, vi } from 'vitest';
import { SkillRegistry, SkillService, type IAgentSession, type ISkillProvider } from '@neko/agent';
import type { Skill } from '@neko/shared';
import {
  createCliSkillLifecycleRuntime,
  wireCliSkillLifecycleSession,
} from '../skill-lifecycle-session';

describe('wireCliSkillLifecycleSession', () => {
  it('activates skills from structured Agent requests without passing the object as skillName', async () => {
    const { provider, lifecycleRuntime } = createWiredProvider([
      createSkill('comic-to-storyboard'),
    ]);

    const result = await provider.activateSkill({
      name: 'comic-to-storyboard',
      reason: 'EPUB page analysis needs storyboard rules.',
      slot: 'referenceSkill',
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Activated skill "comic-to-storyboard"');
    expect(lifecycleRuntime.list('conversation-1')).toEqual([
      expect.objectContaining({
        skillName: 'comic-to-storyboard',
        slot: 'referenceSkill',
        owner: 'agent',
        source: 'explicit-agent',
      }),
    ]);
  });

  it('preserves structured activation reason on lifecycle diagnostics', async () => {
    const { provider } = createWiredProvider([]);

    const result = await provider.activateSkill({
      name: 'missing-skill',
      reason: 'The task requested a missing workflow.',
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics?.[0]).toEqual(
      expect.objectContaining({
        skillName: 'missing-skill',
        details: expect.objectContaining({
          activationReason: 'The task requested a missing workflow.',
        }),
      }),
    );
  });
});

function createWiredProvider(skills: readonly Skill[]): {
  readonly provider: ISkillProvider;
  readonly lifecycleRuntime: ReturnType<typeof createCliSkillLifecycleRuntime>;
} {
  const registry = new SkillRegistry();
  for (const skill of skills) {
    registry.registerSkill(skill);
  }
  const skillService = new SkillService({ registry });
  const lifecycleRuntime = createCliSkillLifecycleRuntime(skillService);
  let provider: ISkillProvider | undefined;
  const session = {
    setSkillProvider: vi.fn((next: ISkillProvider) => {
      provider = next;
    }),
    clearActiveSkill: vi.fn(),
    applySkillInjection: vi.fn(),
  } as unknown as IAgentSession;

  wireCliSkillLifecycleSession({
    session,
    skillService,
    lifecycleRuntime,
    conversationId: 'conversation-1',
  });

  return {
    provider: requireProvider(provider),
    lifecycleRuntime,
  };
}

function createSkill(name: string): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} prompt`,
    source: 'builtin',
    enabled: true,
  };
}

function requireProvider(provider: ISkillProvider | undefined): ISkillProvider {
  if (!provider) {
    throw new Error('TUI skill provider was not wired');
  }
  return provider;
}
