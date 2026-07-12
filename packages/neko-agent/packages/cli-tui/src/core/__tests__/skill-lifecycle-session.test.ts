import { describe, expect, it, vi } from 'vitest';
import { SkillRegistry, SkillService, type IAgentSession, type ISkillProvider } from '@neko/agent';
import type { CreateSkillInput, CreateSkillResult, Skill } from '@neko/shared';
import {
  createCliSkillLifecycleRuntime,
  wireCliSkillLifecycleSession,
} from '../skill-lifecycle-session';

describe('wireCliSkillLifecycleSession', () => {
  it('delegates native creation without changing activation lifecycle state', async () => {
    const result: CreateSkillResult = {
      source: 'project',
      rootId: 'project-agent-skills',
      relativePath: 'portable-story',
      absolutePath: '/workspace/.agents/skills/portable-story',
      fingerprint: 'sha256:portable-story',
      diagnostics: [],
    };
    const createSkill = vi.fn(async (_input: CreateSkillInput) => result);
    const { provider, lifecycleRuntime, session } = createWiredProvider([], { createSkill });
    const nativeCreate = provider.createSkill;
    expect(nativeCreate).toBeTypeOf('function');
    if (!nativeCreate) {
      throw new Error('Expected native Skill creation to be wired');
    }
    const input: CreateSkillInput = {
      target: 'project',
      skill: {
        name: 'portable-story',
        description: 'Portable story guidance.',
        body: '# Portable story',
      },
    };

    await expect(nativeCreate(input)).resolves.toEqual(result);

    expect(createSkill).toHaveBeenCalledWith(input);
    expect(lifecycleRuntime.list('conversation-1')).toEqual([]);
    expect(session.applySkillInjection).not.toHaveBeenCalled();
    expect(session.clearActiveSkill).toHaveBeenCalledTimes(1);
  });

  it('activates skills from structured Agent requests without passing the object as skillName', async () => {
    const { provider, lifecycleRuntime } = createWiredProvider([createSkill('storyboard')]);

    const result = await provider.activateSkill({
      name: 'storyboard',
      reason: 'EPUB page analysis needs storyboard rules.',
      slot: 'referenceSkill',
    });

    expect(result.success).toBe(true);
    expect(result).toEqual(expect.objectContaining({ success: true, skillName: 'storyboard' }));
    expect(result).not.toHaveProperty('message');
    expect(lifecycleRuntime.list('conversation-1')).toEqual([
      expect.objectContaining({
        skillName: 'storyboard',
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

  it('activates reference skill tool sets without projecting them as restrictive allowed tools', async () => {
    const { provider, session } = createWiredProvider([
      createSkill('canvas-authoring', ['canvas.createStoryboardFromMarkdown']),
    ]);

    const result = await provider.activateSkill({
      name: 'canvas-authoring',
      reason: 'Need supplemental Canvas authoring guidance.',
      slot: 'referenceSkill',
    });

    expect(result.success).toBe(true);
    expect(session.activateToolSetsForTools).toHaveBeenCalledWith([
      'canvas.createStoryboardFromMarkdown',
    ]);
    expect(session.applySkillInjection).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        allowedTools: expect.any(Array),
      }),
      expect.any(Object),
    );

    await provider.deactivateSkill({ slot: 'referenceSkill' });

    expect(session.deactivateToolSet).toHaveBeenCalledWith('canvas-editing');
  });
});

function createWiredProvider(
  skills: readonly Skill[],
  options: {
    readonly createSkill?: (input: CreateSkillInput) => Promise<CreateSkillResult>;
  } = {},
): {
  readonly provider: ISkillProvider;
  readonly lifecycleRuntime: ReturnType<typeof createCliSkillLifecycleRuntime>;
  readonly session: IAgentSession;
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
    activateToolSetsForTools: vi.fn(() => ['canvas-editing']),
    deactivateToolSet: vi.fn(),
  } as unknown as IAgentSession;

  wireCliSkillLifecycleSession({
    session,
    skillService,
    lifecycleRuntime,
    conversationId: 'conversation-1',
    ...(options.createSkill ? { createSkill: options.createSkill } : {}),
  });

  return {
    provider: requireProvider(provider),
    lifecycleRuntime,
    session,
  };
}

function createSkill(name: string, allowedTools?: readonly string[]): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} prompt`,
    ...(allowedTools ? { allowedTools: [...allowedTools] } : {}),
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
