import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { SkillLifecycleRuntime } from '../skill-lifecycle-runtime';
import { SkillLifecycleStore } from '../skill-lifecycle-store';
import type { SkillService } from '../skill-service';

describe('SkillLifecycleRuntime', () => {
  it('creates lifecycle records as prompt/tool projection source of truth', async () => {
    const runtime = createRuntime([
      createSkill('review', { allowedTools: ['ReadDocument'] }),
      createSkill('stage-persona', { allowedTools: ['ReadDocument', 'WriteDraft'] }),
    ]);

    const stage = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('stage-persona', { allowedTools: ['ReadDocument', 'WriteDraft'] }),
      injection: createInjection('stage-persona', {
        systemPrompt: 'Stage persona',
        allowedTools: ['ReadDocument', 'WriteDraft'],
      }),
      slot: 'stagePersona',
      owner: 'creation-profile',
      lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'plan' },
      source: 'creation-stage',
      now: 1,
      turnCount: 1,
    });
    const domain = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    expect(stage.ok).toBe(true);
    expect(domain.ok).toBe(true);
    const projection = runtime.project('conv-1');

    expect(projection.promptSections.map((section) => section.id)).toEqual([
      `skill:stagePersona:stage-persona:${stage.record?.id}`,
      `skill:domainSkill:review:${domain.record?.id}`,
    ]);
    expect(projection.promptSections.map((section) => section.content)).toEqual([
      'Stage persona',
      'review prompt',
    ]);
    expect(projection.toolPolicy).toEqual(
      expect.objectContaining({
        mode: 'intersection',
        allowedTools: ['ReadDocument'],
      }),
    );
    expect(projection.visibleIndicators).toEqual([
      expect.objectContaining({
        id: stage.record?.id,
        skillName: 'stage-persona',
        slot: 'stagePersona',
        clearable: false,
      }),
      expect.objectContaining({
        id: domain.record?.id,
        skillName: 'review',
        slot: 'domainSkill',
        clearable: true,
      }),
    ]);
  });

  it('deactivation removes records and the next projection omits prompt and tool policy', async () => {
    const runtime = createRuntime([createSkill('review', { allowedTools: ['ReadDocument'] })]);
    const activation = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
    });

    expect(activation.record).toBeDefined();
    expect(runtime.project('conv-1').promptSections).toHaveLength(1);

    const deactivation = runtime.deactivate({
      conversationId: 'conv-1',
      recordId: activation.record?.id,
      actor: 'user',
      reason: 'explicit-clear',
    });

    expect(deactivation).toEqual({
      ok: true,
      removedRecordIds: [activation.record?.id],
      diagnostics: [],
    });
    expect(runtime.project('conv-1').promptSections).toEqual([]);
    expect(runtime.project('conv-1').toolPolicy.mode).toBe('unrestricted');
  });

  it('rejects locked Creation stage persona deactivation but expires it on matching stage exit', () => {
    const runtime = createRuntime([]);
    const activation = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('creation-persona'),
      injection: createInjection('creation-persona'),
      slot: 'stagePersona',
      owner: 'creation-profile',
      lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'draft' },
      source: 'creation-stage',
      now: 1,
      turnCount: 1,
    });

    expect(
      runtime.deactivate({
        conversationId: 'conv-1',
        recordId: activation.record?.id,
        actor: 'user',
        reason: 'explicit-clear',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'locked-deactivation' })],
      }),
    );
    expect(runtime.list('conv-1')).toHaveLength(1);

    expect(
      runtime.expire({
        conversationId: 'conv-1',
        reason: 'stage-exited',
        runId: 'run-1',
        stage: 'draft',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        removedRecordIds: [activation.record?.id],
      }),
    );
    expect(runtime.list('conv-1')).toEqual([]);
  });

  it('reports ambiguous skill-name deactivation when multiple slots use the same Skill', () => {
    const runtime = createRuntime([]);
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('review'),
      injection: createInjection('review', { systemPrompt: 'domain review' }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 1,
      turnCount: 1,
    });
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('review'),
      injection: createInjection('review', { systemPrompt: 'reference review' }),
      slot: 'referenceSkill',
      owner: 'agent',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-agent',
      now: 2,
      turnCount: 2,
    });

    expect(
      runtime.deactivate({
        conversationId: 'conv-1',
        skillName: 'review',
        actor: 'agent',
        reason: 'explicit-clear',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'ambiguous-deactivation' })],
      }),
    );
  });

  it('returns an unknown-record diagnostic for stale scoped deactivation', () => {
    const runtime = createRuntime([]);

    expect(
      runtime.deactivate({
        conversationId: 'conv-1',
        recordId: 'missing-record',
        actor: 'user',
        reason: 'explicit-clear',
      }),
    ).toEqual({
      ok: false,
      removedRecordIds: [],
      diagnostics: [
        expect.objectContaining({
          code: 'unknown-record',
          recordId: 'missing-record',
        }),
      ],
    });
  });

  it('replaces same-slot domain Skill records by default', async () => {
    const runtime = createRuntime([createSkill('review'), createSkill('storyboard')]);

    const first = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 1,
      turnCount: 1,
    });
    const second = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'storyboard',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    expect(second.ok).toBe(true);
    expect(second.replacedRecordIds).toEqual([first.record?.id]);
    expect(runtime.list('conv-1').map((record) => record.skillName)).toEqual(['storyboard']);
  });

  it('renews an existing same-skill lifecycle record instead of creating duplicates', async () => {
    const runtime = createRuntime([createSkill('review')]);

    const first = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 1,
      turnCount: 1,
    });
    const second = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'review',
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    expect(second.record?.id).toBe(first.record?.id);
    expect(second.replacedRecordIds).toBeUndefined();
    expect(runtime.list('conv-1')).toHaveLength(1);
    expect(runtime.list('conv-1')[0]?.lastUsedTurn).toBe(2);
  });

  it('fails closed before creating records with incompatible model override conflicts', () => {
    const runtime = createRuntime([]);
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('review'),
      injection: createInjection('review', { allowedTools: ['ReadDocument'], model: 'model-a' }),
      slot: 'stagePersona',
      owner: 'creation-profile',
      lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'apply' },
      source: 'creation-stage',
      now: 1,
      turnCount: 1,
    });
    const activation = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('write'),
      injection: createInjection('write', { allowedTools: ['WriteDocument'], model: 'model-b' }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    const projection = runtime.project('conv-1');

    expect(activation).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: 'skill-conflict',
            details: expect.objectContaining({ reason: 'model-override-conflict' }),
          }),
        ],
      }),
    );
    expect(runtime.list('conv-1').map((record) => record.skillName)).toEqual(['review']);
    expect(projection.toolPolicy).toEqual(expect.objectContaining({ mode: 'allowlist' }));
    expect(projection.diagnostics).toEqual([]);
  });

  it('rejects lifecycle activation when an explicit conflict config matches an active record', () => {
    const runtime = createRuntime([], undefined, (skillName) =>
      skillName === 'new-domain' ? { conflicts: ['locked-domain'] } : undefined,
    );
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('locked-domain'),
      injection: createInjection('locked-domain'),
      slot: 'referenceSkill',
      owner: 'agent',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-agent',
      now: 1,
      turnCount: 1,
    });

    const conflict = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('new-domain'),
      injection: createInjection('new-domain', { model: 'model-a' }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    expect(conflict).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: 'skill-conflict',
            details: expect.objectContaining({ reason: 'explicit-conflict' }),
          }),
        ],
      }),
    );
    expect(runtime.list('conv-1').map((record) => record.skillName)).toEqual(['locked-domain']);
  });

  it('rejects model override conflicts before creating the new lifecycle record', () => {
    const runtime = createRuntime([]);
    runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('stage-persona'),
      injection: createInjection('stage-persona', { model: 'model-a' }),
      slot: 'stagePersona',
      owner: 'creation-profile',
      lifetime: { kind: 'creation-stage', runId: 'run-1', stage: 'plan' },
      source: 'creation-stage',
      now: 1,
      turnCount: 1,
    });

    const activation = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('domain-review'),
      injection: createInjection('domain-review', { model: 'model-b' }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 2,
      turnCount: 2,
    });

    expect(activation).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: 'skill-conflict',
            details: expect.objectContaining({ reason: 'model-override-conflict' }),
          }),
        ],
      }),
    );
    expect(runtime.list('conv-1').map((record) => record.skillName)).toEqual(['stage-persona']);
  });

  it('accepts promptChainSkill as the canonical method-guidance slot', async () => {
    const runtime = createRuntime([createSkill('storyboard-method')]);

    const result = await runtime.activate({
      conversationId: 'conv-1',
      skillName: 'storyboard-method',
      slot: 'promptChainSkill',
      owner: 'agent',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-agent',
    });

    expect(result.ok).toBe(true);
    expect(result.record?.slot).toBe('promptChainSkill');
  });

  it('keeps referenceSkill guidance out of effective tool policy restrictions', () => {
    const runtime = createRuntime([]);
    const domain = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('domain-review'),
      injection: createInjection('domain-review', { allowedTools: ['WriteDocument'] }),
      slot: 'domainSkill',
      owner: 'user',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-user',
      now: 1,
      turnCount: 1,
    });
    const reference = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('reference-notes'),
      injection: createInjection('reference-notes', { allowedTools: ['ReadDocument'] }),
      slot: 'referenceSkill',
      owner: 'agent',
      lifetime: { kind: 'conversation', untilCleared: true },
      source: 'explicit-agent',
      now: 2,
      turnCount: 2,
    });

    const projection = runtime.project('conv-1');

    expect(domain.ok).toBe(true);
    expect(reference.ok).toBe(true);
    expect(projection.promptSections.map((section) => section.skillName)).toEqual([
      'domain-review',
      'reference-notes',
    ]);
    expect(projection.toolPolicy).toEqual({
      mode: 'allowlist',
      activationTools: ['ReadDocument', 'WriteDocument'],
      allowedTools: ['WriteDocument'],
      contributingRecordIds: [domain.record?.id],
      diagnostics: [],
    });
  });

  it('expires turn, prompt-chain, and inactivity scoped records only when their event matches', () => {
    const store = new SkillLifecycleStore();
    const runtime = createRuntime([], store);
    const turn = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('turn-skill'),
      injection: createInjection('turn-skill'),
      slot: 'ephemeralSkill',
      owner: 'runtime',
      lifetime: { kind: 'turn', turnId: 'turn-1' },
      source: 'runtime-expiry',
      now: 1,
      turnCount: 1,
    });
    const promptChain = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('prompt-chain-skill'),
      injection: createInjection('prompt-chain-skill'),
      slot: 'promptChainSkill',
      owner: 'agent',
      lifetime: { kind: 'prompt-chain', runId: 'chain-1' },
      source: 'explicit-agent',
      now: 2,
      turnCount: 2,
    });
    const inactive = runtime.activatePrepared({
      conversationId: 'conv-1',
      skill: createSkill('idle-skill'),
      injection: createInjection('idle-skill'),
      slot: 'referenceSkill',
      owner: 'agent',
      lifetime: { kind: 'inactivity', maxIdleTurns: 2 },
      source: 'explicit-agent',
      now: 3,
      turnCount: 3,
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
    ).toEqual(expect.objectContaining({ removedRecordIds: [promptChain.record?.id] }));
    expect(
      runtime.expire({ conversationId: 'conv-1', reason: 'inactive', currentTurn: 4 }),
    ).toEqual(expect.objectContaining({ removedRecordIds: [] }));
    expect(
      runtime.expire({ conversationId: 'conv-1', reason: 'inactive', currentTurn: 5 }),
    ).toEqual(expect.objectContaining({ removedRecordIds: [inactive.record?.id] }));
  });
});

function createRuntime(
  skills: readonly Skill[],
  store?: SkillLifecycleStore,
  getConflictConfig?: (skillName: string) => import('@neko/shared').SkillConflictConfig | undefined,
): SkillLifecycleRuntime {
  return new SkillLifecycleRuntime({
    skillService: createSkillService(skills) as unknown as SkillService,
    ...(store ? { store } : {}),
    ...(getConflictConfig ? { getConflictConfig } : {}),
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
  return {
    name,
    systemPrompt: `${name} prompt`,
    type: 'skill',
    ...overrides,
  };
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
