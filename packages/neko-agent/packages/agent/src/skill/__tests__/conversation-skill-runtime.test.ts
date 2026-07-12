import { describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityActivationProgressEvent,
  Skill,
  SkillDiscoveryResult,
  SkillInjection,
} from '@neko/shared';
import type { AgentPromptChainObservation } from '@neko-agent/types';
import { ConversationSkillRuntime } from '../conversation-skill-runtime';

function createSkill(
  name: string,
  command?: string,
  entryPointKind?: Skill['entryPointKind'],
  mediaWorkflow?: Skill['mediaWorkflow'],
): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} instructions`,
    source: 'project',
    enabled: true,
    ...(command ? { command } : {}),
    ...(entryPointKind ? { entryPointKind } : {}),
    ...(mediaWorkflow ? { mediaWorkflow } : {}),
  };
}

function createSkillService(
  skills: readonly Skill[],
  discoverResult: SkillDiscoveryResult = {
    found: false,
    matches: [],
    requiresConfirmation: false,
  },
) {
  return {
    registry: {
      listSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      getSkillByCommand: vi.fn((command: string) =>
        skills.find((skill) => skill.command === command),
      ),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
    },
    apply: vi.fn(async (skill: Skill, args?: string): Promise<SkillInjection> => ({
      name: skill.name,
      systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
      type: 'skill',
      allowedTools: skill.allowedTools ?? ['read'],
    })),
    discover: vi.fn(() => discoverResult),
  };
}

describe('ConversationSkillRuntime', () => {
  it('applies slash skills and records conversation-scoped active state', async () => {
    const commit = createSkill('commit', 'commit', 'command-artifact');
    const review = createSkill('review', 'review', 'command-artifact');
    const skillService = createSkillService([commit, review]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
      now: () => 42,
    });

    await expect(
      runtime.applySlashCommand({
        command: 'commit',
        conversationId: 'conv-1',
        args: 'fix bug',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        skill: commit,
        injection: expect.objectContaining({ systemPrompt: 'commit instructions: fix bug' }),
      }),
    );

    expect(runtime.getActiveSkill('conv-1')).toEqual({
      skill: expect.objectContaining({
        name: 'commit',
        description: 'commit skill',
        content: 'commit instructions: fix bug',
        source: 'project',
        enabled: true,
      }),
      injection: expect.objectContaining({ name: 'commit' }),
      appliedAt: 42,
    });
    expect(runtime.getActiveSkill('conv-2')).toBeUndefined();
    expect(runtime.projectSkillLifecycle('conv-1').promptSections).toEqual([
      expect.objectContaining({
        skillName: 'commit',
        content: 'commit instructions: fix bug',
      }),
    ]);
    expect(bridge.applySkillInjection).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ name: 'commit' }),
      commit,
    );
  });

  it('reports legacy slash skill aliases as migration-only diagnostics', async () => {
    const legacy = createSkill('legacy-skill', 'legacy');
    const skillService = createSkillService([legacy]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySlashCommand({
        command: 'legacy',
        conversationId: 'conv-1',
      }),
    ).resolves.toEqual({
      applied: false,
      error: 'Legacy slash Skill alias is not canonical: /legacy. Use $legacy-skill.',
    });
    expect(skillService.apply).not.toHaveBeenCalled();
  });

  it('applies explicit skill invocation by canonical skill name without slash command lookup', async () => {
    const statusCommand = createSkill('status-command', 'status');
    const statusSkill = createSkill('status');
    const skillService = createSkillService([statusCommand, statusSkill]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.applySkillInvocation({
      skillName: 'status',
      conversationId: 'conv-1',
      args: 'changed files',
    });

    expect(skillService.registry.getSkill).toHaveBeenCalledWith('status');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('status');
    expect(skillService.apply).toHaveBeenCalledWith(statusSkill, 'changed files');
    expect(result).toEqual(expect.objectContaining({ applied: true, skill: statusSkill }));
  });

  it('does not let legacy slash skill lookup produce canonical skill invocation success', async () => {
    const commit = createSkill('commit');
    const skillService = createSkillService([commit]);
    skillService.registry.getSkillByCommand.mockImplementation(() => {
      throw new Error('legacy slash path should not run');
    });
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.applySkillInvocation({
      skillName: '$Commit',
      conversationId: 'conv-1',
    });

    expect(skillService.registry.getSkill).toHaveBeenCalledWith('commit');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ applied: true, skill: commit }));
  });

  it('keeps supplemental reference skills active without replacing the domain skill', async () => {
    const storyboard = createSkill('storyboard');
    const canvas: Skill = {
      ...createSkill('canvas-authoring'),
      allowedTools: ['canvas.createStoryboardFromMarkdown'],
    };
    const skillService = createSkillService([storyboard, canvas]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      now: () => 100,
    });

    const domain = await runtime.activateDomainSkill({
      skillName: 'storyboard',
      conversationId: 'conv-1',
      reason: 'Create a storyboard creative table from comic evidence.',
    });
    const reference = await runtime.activateLifecycleSkill({
      skillName: 'canvas-authoring',
      conversationId: 'conv-1',
      reason: 'Use Canvas authoring guidance for Send to Canvas handoff.',
      slot: 'referenceSkill',
    });
    const records = runtime.getActiveLifecycleRecords('conv-1');
    const projection = runtime.projectSkillLifecycle('conv-1');

    expect(domain.success).toBe(true);
    expect(reference.success).toBe(true);
    expect(runtime.getActiveSkill('conv-1')?.skill.name).toBe('storyboard');
    expect(records.map((record) => [record.slot, record.skillName])).toEqual([
      ['domainSkill', 'storyboard'],
      ['referenceSkill', 'canvas-authoring'],
    ]);
    expect(projection.promptSections.map((section) => section.skillName)).toEqual([
      'storyboard',
      'canvas-authoring',
    ]);
    expect(projection.toolPolicy).toEqual({
      mode: 'allowlist',
      activationTools: ['canvas.createStoryboardFromMarkdown', 'read'],
      allowedTools: ['read'],
      contributingRecordIds: [records[0]?.id],
      diagnostics: [],
    });
  });

  it('resolves the bounded quality-assessment alias to the canonical lifecycle skill', async () => {
    const canonical = createSkill('media-quality-review');
    const skillService = createSkillService([canonical]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.activateLifecycleSkill({
      skillName: 'quality-assessment',
      conversationId: 'conv-quality',
      reason: 'Review the generated image quality.',
      slot: 'referenceSkill',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        skillName: 'media-quality-review',
        requestedSkillName: 'quality-assessment',
        diagnostics: [
          expect.objectContaining({
            code: 'legacy-skill-alias',
            skillName: 'media-quality-review',
            details: {
              requestedSkillName: 'quality-assessment',
              canonicalSkillName: 'media-quality-review',
            },
          }),
        ],
      }),
    );
    expect(skillService.registry.getSkill).toHaveBeenCalledWith('media-quality-review');
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('media-quality-review');
    expect(runtime.getActiveLifecycleRecords('conv-quality')).toEqual([
      expect.objectContaining({ skillName: 'media-quality-review', slot: 'referenceSkill' }),
    ]);
    expect(skillService.registry.listSkills().map((skill) => skill.name)).toEqual([
      'media-quality-review',
    ]);
  });

  it('returns fail-visible diagnostics for unknown and disabled skill invocation', async () => {
    const disabled = { ...createSkill('disabled-skill'), enabled: false };
    const skillService = createSkillService([disabled]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'missing', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Unknown skill: $missing' });
    await expect(
      runtime.applySkillInvocation({ skillName: 'disabled-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Skill is disabled: $disabled-skill' });
  });

  it('returns fail-visible diagnostics when lazy skill activation cannot load content', async () => {
    const lazy = { ...createSkill('lazy-skill'), content: '' };
    const skillService = createSkillService([lazy]);
    skillService.registry.ensureLoaded.mockResolvedValue(lazy);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'lazy-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Skill has no content: $lazy-skill' });
  });

  it('returns fail-visible diagnostics when lazy loading rejects', async () => {
    const lazy = createSkill('lazy-skill');
    const skillService = createSkillService([lazy]);
    skillService.registry.ensureLoaded.mockRejectedValue(new Error('manifest invalid'));
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'lazy-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({
      applied: false,
      error: 'Failed to load skill: $lazy-skill: manifest invalid',
    });
  });

  it('clears active skill and delegates runtime cleanup', async () => {
    const skill = createSkill('review');
    const skillService = createSkillService([skill]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
    });

    await runtime.executeSkill({ skillId: 'review', conversationId: 'conv-1' });
    runtime.clearActiveSkill('conv-1');

    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
    expect(bridge.clearActiveSkill).toHaveBeenCalledWith('conv-1');
  });

  it('derives legacy active Skill state from lifecycle records', async () => {
    const skill = createSkill('review');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      now: () => 100,
    });

    await runtime.executeSkill({ skillId: 'review', conversationId: 'conv-1' });
    const record = runtime.getActiveLifecycleRecords('conv-1')[0];
    expect(record).toBeDefined();
    runtime.getSkillLifecycleRuntime()?.deactivate({
      conversationId: 'conv-1',
      recordId: record!.id,
      actor: 'runtime',
      reason: 'conflict-resolution',
    });

    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
  });

  it('builds skill injection messages from active application results', async () => {
    const skill = createSkill('review');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.executeSkill({ skillId: 'review', conversationId: 'conv-1' });

    expect(runtime.buildSkillInjectionMessage(result!, 'conv-1')).toEqual({
      type: 'skillInjection',
      conversationId: 'conv-1',
      skillName: 'review',
      systemPrompt: 'review instructions',
      allowedTools: ['read'],
      lifecycle: {
        records: [
          expect.objectContaining({
            skillName: 'review',
            slot: 'domainSkill',
            clearable: true,
          }),
        ],
      },
    });
  });

  it('rejects natural-language auto activation without discovery, apply, or active state', async () => {
    const storyboard = createSkill('storyboard', undefined, undefined, {
      producedArtifacts: ['CreativeTable'],
      referencedCapabilities: ['canvas.authoring'],
      validationRequirements: ['CreativeTable'],
    });
    const skillService = createSkillService([storyboard], {
      found: true,
      matches: [{ skill: storyboard, relevance: 0.95, reason: 'artifact match' }],
      topMatch: { skill: storyboard, relevance: 0.95, reason: 'artifact match' },
      requiresConfirmation: false,
    });
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
      now: () => 99,
    });

    const result = await runtime.autoActivateSkill({
      conversationId: 'conv-1',
      userInput: '生成分镜表',
    });

    expect(result).toEqual({
      applied: false,
      error: 'Natural-language Skill auto-activation is disabled; use $skill or ActivateSkill.',
    });
    expect(skillService.discover).not.toHaveBeenCalled();
    expect(skillService.apply).not.toHaveBeenCalled();
    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
    expect(runtime.projectSkillLifecycle('conv-1').promptSections).toEqual([]);
    expect(runtime.getActiveLifecycleRecords('conv-1')).toEqual([]);
    expect(bridge.applySkillInjection).not.toHaveBeenCalled();
  });

  it('rejects natural-language auto activation even when matches would require confirmation', async () => {
    const storyboard = createSkill('storyboard');
    const skillService = createSkillService([storyboard], {
      found: true,
      matches: [{ skill: storyboard, relevance: 0.5, reason: 'weak match' }],
      topMatch: { skill: storyboard, relevance: 0.5, reason: 'weak match' },
      requiresConfirmation: true,
    });
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.autoActivateSkill({
      conversationId: 'conv-1',
      userInput: 'maybe storyboard',
    });

    expect(result).toEqual({
      applied: false,
      error: 'Natural-language Skill auto-activation is disabled; use $skill or ActivateSkill.',
    });
    expect(skillService.discover).not.toHaveBeenCalled();
    expect(skillService.registry.ensureLoaded).not.toHaveBeenCalled();
    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
    expect(runtime.getActiveLifecycleRecords('conv-1')).toEqual([]);
  });

  it('rejects natural-language auto activation even for high-confidence matches without validators', async () => {
    const notes = createSkill('notes');
    const skillService = createSkillService([notes], {
      found: true,
      matches: [{ skill: notes, relevance: 0.95, reason: 'keyword match' }],
      topMatch: { skill: notes, relevance: 0.95, reason: 'keyword match' },
      requiresConfirmation: false,
    });
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.autoActivateSkill({
      conversationId: 'conv-1',
      userInput: '整理 notes',
    });

    expect(result).toEqual({
      applied: false,
      error: 'Natural-language Skill auto-activation is disabled; use $skill or ActivateSkill.',
    });
    expect(skillService.discover).not.toHaveBeenCalled();
    expect(skillService.apply).not.toHaveBeenCalled();
    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
    expect(runtime.getActiveLifecycleRecords('conv-1')).toEqual([]);
  });

  it('emits host-visible activation progress without adding progress labels to Skill prompt', async () => {
    const progressEvents: AgentCapabilityActivationProgressEvent[] = [];
    const skill = createSkill('quality-review');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      now: () => 100,
      onActivationProgress: (_conversationId, events) => {
        progressEvents.push(...events);
      },
    });

    const result = await runtime.applySkillInvocation({
      skillName: 'quality-review',
      conversationId: 'conv-1',
      args: 'changed files',
    });

    expect(result).toEqual(expect.objectContaining({ applied: true, skill }));
    expect(progressEvents.map((event) => event.step)).toEqual([
      'requested',
      'validated',
      'loaded',
      'prepared',
      'record-created',
      'projected',
      'active',
    ]);
    expect(new Set(progressEvents.map((event) => event.source))).toEqual(
      new Set(['user-explicit']),
    );
    expect(runtime.projectSkillLifecycle('conv-1').visibleIndicators[0]?.provenance).toEqual(
      expect.objectContaining({
        source: 'user-explicit',
        target: 'skill',
        action: 'activate',
        requestedBy: 'user',
      }),
    );
    const promptContent = runtime
      .projectSkillLifecycle('conv-1')
      .promptSections.map((section) => section.content)
      .join('\n');
    expect(promptContent).toBe('quality-review instructions: changed files');
    for (const label of ['requested', 'validated', 'loaded', 'projected', 'active']) {
      expect(promptContent).not.toContain(label);
    }
  });

  it('records agent-tool provenance when ActivateSkill uses the domain activation path', async () => {
    const progressEvents: AgentCapabilityActivationProgressEvent[] = [];
    const skill = createSkill('quality-review');
    const skillService = createSkillService([skill]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
      now: () => 200,
      onActivationProgress: (_conversationId, events) => {
        progressEvents.push(...events);
      },
    });

    const result = await runtime.activateDomainSkill({
      skillName: 'quality-review',
      conversationId: 'conv-1',
      reason: 'Agent selected the review workflow',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        lifecycleRecordId: expect.any(String),
      }),
    );
    expect(progressEvents.at(-1)).toEqual(
      expect.objectContaining({
        step: 'active',
        source: 'agent-tool',
        requestedBy: 'agent',
        reason: 'Agent selected the review workflow',
      }),
    );
    expect(runtime.projectSkillLifecycle('conv-1').visibleIndicators[0]?.provenance).toEqual(
      expect.objectContaining({
        source: 'agent-tool',
        target: 'skill',
        action: 'activate',
        requestedBy: 'agent',
        reason: 'Agent selected the review workflow',
      }),
    );
    expect(bridge.applySkillInjection).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ name: 'quality-review' }),
      skill,
    );
  });

  it('records prompt-chain observation for explicit skill invocation with Agent-native creation metadata', async () => {
    const skill = createSkill('storyboard');
    const skillService = createSkillService([skill]);
    const observations: AgentPromptChainObservation[] = [];
    const promptChainObservationPort = {
      recordPromptChainObservation: vi.fn((observation: AgentPromptChainObservation) => {
        observations.push(observation);
        return observation;
      }),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      promptChainObservationPort,
      now: () => 301,
    });

    const result = await runtime.applySkillInvocation({
      skillName: 'storyboard',
      conversationId: 'conv-1',
      reason: 'Generate storyboard table',
      creation: {
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        promptChainId: 'storyboard.creation',
        checkpointId: 'skill-activated',
      },
    });

    expect(result).toEqual(expect.objectContaining({ applied: true, skill }));
    expect(promptChainObservationPort.recordPromptChainObservation).toHaveBeenCalledTimes(1);
    expect(observations).toEqual([
      expect.objectContaining({
        kind: 'started',
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        promptChainId: 'storyboard.creation',
        skillName: 'storyboard',
        observedAt: 301,
        reason: 'Generate storyboard table',
        metadata: expect.objectContaining({
          checkpointId: 'skill-activated',
          source: 'user-explicit',
          requestedBy: 'user',
        }),
      }),
    ]);
  });

  it('fails visibly when prompt-chain metadata is supplied without an observation port', async () => {
    const skill = createSkill('storyboard');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      now: () => 301,
    });

    const result = await runtime.applySkillInvocation({
      skillName: 'storyboard',
      conversationId: 'conv-1',
      reason: 'Generate storyboard table',
      creation: {
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        promptChainId: 'storyboard.creation',
      },
    });

    expect(result).toEqual({
      applied: false,
      error:
        'Agent-native creation metadata was supplied, but no prompt-chain observation port is configured.',
    });
  });

  it('does not create prompt-chain observation when skill invocation has no creation metadata', async () => {
    const skill = createSkill('quality-review');
    const skillService = createSkillService([skill]);
    const promptChainObservationPort = {
      recordPromptChainObservation: vi.fn(
        (observation: AgentPromptChainObservation) => observation,
      ),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      promptChainObservationPort,
    });

    await runtime.applySkillInvocation({
      skillName: 'quality-review',
      conversationId: 'conv-1',
    });

    expect(promptChainObservationPort.recordPromptChainObservation).not.toHaveBeenCalled();
  });
});
