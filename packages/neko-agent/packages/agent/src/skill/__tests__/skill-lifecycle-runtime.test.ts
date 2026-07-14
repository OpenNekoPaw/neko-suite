import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { SkillLifecycleRuntime } from '../skill-lifecycle-runtime';
import { SkillLifecycleStore } from '../skill-lifecycle-store';
import type { SkillService } from '../skill-service';

describe('SkillLifecycleRuntime', () => {
  it('projects ordinary domain and reference Skills as prompt/tool source of truth', async () => {
    const runtime = createRuntime([
      createSkill('storyboard', { allowedTools: ['ReadDocument', 'WriteDocument'] }),
      createSkill('style-reference', { allowedTools: ['ReadDocument'] }),
    ]);
    const domain = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'storyboard',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
    });
    const reference = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'style-reference',
      slot: 'referenceSkill',
      owner: 'agent',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-agent',
    });

    expect(domain.ok).toBe(true);
    expect(reference.ok).toBe(true);
    const projection = runtime.project('conv-1');
    expect(projection.promptSections).toHaveLength(2);
    expect(projection.toolPolicy).toEqual(
      expect.objectContaining({
        mode: 'allowlist',
        allowedTools: ['ReadDocument', 'WriteDocument'],
      }),
    );
    expect(projection.visibleIndicators.map((indicator) => indicator.slot)).toEqual([
      'domainSkill',
      'referenceSkill',
    ]);
  });

  it('projects host identity and hashes without exposing prompt bodies', () => {
    const runtime = createRuntime([]);
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('storyboard', {
        hostProjection: {
          source: 'project',
          location: { rootId: 'project-agent-skills', relativePath: 'storyboard' },
          provenance: 'workspace',
          enabled: true,
          editable: true,
          trusted: true,
          compatibility: { state: 'compatible', diagnostics: [] },
          fingerprint: `sha256:${'a'.repeat(64)}`,
          catalogActions: [{ id: 'run' }],
        },
      }),
      injection: createInjection('storyboard', {
        systemPrompt: 'HIDDEN_STORYBOARD_PROMPT',
        allowedTools: ['WriteDocument', 'ReadDocument'],
      }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
    });

    const [fact] = runtime.project('conv-1').visibleIndicators;
    expect(fact).toEqual(
      expect.objectContaining({
        skillName: 'storyboard',
        slot: 'domainSkill',
        triggerSource: 'explicit-user',
        injectedFragments: [expect.objectContaining({ hash: expect.stringMatching(/^sha256:/u) })],
      }),
    );
    expect(JSON.stringify(fact)).not.toContain('HIDDEN_STORYBOARD_PROMPT');
  });

  it('deactivates clearable records through the normal lifecycle', async () => {
    const runtime = createRuntime([createSkill('review')]);
    const activation = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
    });

    expect(
      runtime.deactivate({
        conversationId: 'conv-1',
        recordId: activation.record?.id,
        actor: 'user',
      }),
    ).toEqual(expect.objectContaining({ ok: true, removedRecordIds: [activation.record?.id] }));
    expect(runtime.project('conv-1').promptSections).toEqual([]);
  });

  it('expires turn, prompt-chain, and inactivity records only on owning events', () => {
    const runtime = createRuntime([], new SkillLifecycleStore());
    const turn = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('turn-skill'),
      injection: createInjection('turn-skill'),
      slot: 'ephemeralSkill',
      owner: 'runtime',
      lifetime: { kind: 'turn', turnId: 'turn-1' },
      source: 'runtime-expiry',
      turnCount: 1,
    });
    const chain = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('chain-skill'),
      injection: createInjection('chain-skill'),
      slot: 'promptChainSkill',
      owner: 'agent',
      lifetime: { kind: 'prompt-chain', runId: 'chain-1' },
      source: 'explicit-agent',
      turnCount: 1,
    });

    expect(
      runtime.expire({ conversationId: 'conv-1', reason: 'turn-ended', turnId: 'other' }),
    ).toEqual(expect.objectContaining({ removedRecordIds: [] }));
    expect(
      runtime.expire({ conversationId: 'conv-1', reason: 'turn-ended', turnId: 'turn-1' }),
    ).toEqual(expect.objectContaining({ removedRecordIds: [turn.record?.id] }));
    expect(
      runtime.expire({
        conversationId: 'conv-1',
        reason: 'prompt-chain-ended',
        runId: 'chain-1',
      }),
    ).toEqual(expect.objectContaining({ removedRecordIds: [chain.record?.id] }));
  });
});

function createRuntime(
  skills: readonly Skill[],
  store?: SkillLifecycleStore,
): SkillLifecycleRuntime {
  return new SkillLifecycleRuntime({
    skillService: createSkillService(skills) as unknown as SkillService,
    ...(store ? { store } : {}),
    now: () => 100,
  });
}

function createSkill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} prompt`,
    source: 'project',
    enabled: true,
    ...overrides,
  };
}

function createInjection(name: string, overrides: Partial<SkillInjection> = {}): SkillInjection {
  return { name, systemPrompt: `${name} prompt`, type: 'skill', ...overrides };
}

function createSkillService(skills: readonly Skill[]) {
  return {
    registry: {
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
      listSkills: vi.fn(() => skills),
    },
    apply: vi.fn(async (skill: Skill) =>
      createInjection(skill.name, {
        systemPrompt: skill.content,
        allowedTools: skill.allowedTools,
        model: skill.model,
      }),
    ),
  };
}
