import { describe, expect, it } from 'vitest';
import {
  CreativeProcessValidationStageController,
  createArtifactRegistry,
  createCreativeProcessRecoveryPolicy,
  createDefaultArtifactRegistry,
  createDefaultCreativeProcessRecoveryPolicy,
  createDefaultStageRegistry,
  createStageRegistry,
} from './index';

describe('StageRegistry', () => {
  it('registers read-only stage descriptors in insertion order', () => {
    const registry = createStageRegistry([
      { id: 'specify', label: 'Specify', enabled: true },
      { id: 'apply', label: 'Apply', enabled: true, riskLevel: 'medium' },
    ]);

    expect(registry.has('specify')).toBe(true);
    expect(registry.get('apply')).toEqual({
      id: 'apply',
      label: 'Apply',
      enabled: true,
      riskLevel: 'medium',
    });
    expect(registry.list().map((stage) => stage.id)).toEqual(['specify', 'apply']);
  });

  it('rejects empty stage ids', () => {
    const registry = createStageRegistry();
    expect(() => registry.register({ id: ' ', label: 'Invalid', enabled: true })).toThrow(
      'StageRegistry: descriptor id must not be empty',
    );
  });

  it('creates default IDC stage descriptors in runtime order', () => {
    const registry = createDefaultStageRegistry();

    expect(registry.list().map((stage) => stage.id)).toEqual(['draft', 'plan', 'apply']);
    expect(registry.get('apply')).toEqual(
      expect.objectContaining({
        id: 'apply',
        outputArtifactKinds: ['task'],
        enabled: true,
      }),
    );
  });
});

describe('ArtifactRegistry', () => {
  it('registers artifacts and resolves them by stage', () => {
    const registry = createArtifactRegistry([
      {
        id: 'apply',
        label: 'Apply',
        stageId: 'apply',
        storageKind: 'task',
        enabled: true,
      },
    ]);

    expect(registry.has('apply')).toBe(true);
    expect(registry.byStage('apply')?.storageKind).toBe('task');
  });

  it('creates default artifact descriptors with apply mapped to task storage', () => {
    const registry = createDefaultArtifactRegistry();

    expect(registry.list().map((artifact) => artifact.id)).toEqual(['draft', 'plan', 'apply']);
    expect(registry.byStage('apply')).toEqual(
      expect.objectContaining({
        id: 'apply',
        storageKind: 'task',
      }),
    );
  });
});

describe('CreativeProcessRecoveryPolicy', () => {
  it('turns repair validation decisions into non-executing stage guidance', () => {
    const registry = createStageRegistry([{ id: 'apply', label: 'Apply', enabled: true }]);
    const recoveryPolicy = createCreativeProcessRecoveryPolicy({
      stageRegistry: registry,
      stageController: new CreativeProcessValidationStageController(),
      now: () => 1_771_718_420_000,
    });

    const decision = recoveryPolicy.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'QualityCheck',
        error: 'failed',
      },
    });

    expect(decision).toEqual({
      input: expect.objectContaining({ currentStageId: 'apply' }),
      guidance: {
        transitionAction: 'retry-stage',
        decisionAction: 'repair',
        fromStageId: 'apply',
        toStageId: 'apply',
        reason: 'Repair recommended for tool-failure.',
        requiresUserApproval: false,
      },
      createdAt: 1_771_718_420_000,
    });
    expect(recoveryPolicy.getDecisionHistory()).toHaveLength(1);
  });

  it('regresses to the previous registered stage after repeated repair guidance', () => {
    const recoveryPolicy = createDefaultCreativeProcessRecoveryPolicy({ now: () => 1 });

    recoveryPolicy.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'QualityCheck',
        error: 'failed',
      },
    });
    const decision = recoveryPolicy.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-2',
        toolName: 'QualityCheck',
        error: 'failed again',
      },
    });

    expect(decision.guidance).toEqual({
      transitionAction: 'regress-to',
      decisionAction: 'repair',
      fromStageId: 'apply',
      toStageId: 'plan',
      reason: 'Repeated repair signal for tool-failure; regress to plan before retrying apply.',
      requiresUserApproval: false,
    });
  });

  it('requests a run restart when repeated repair happens at the first stage', () => {
    const recoveryPolicy = createDefaultCreativeProcessRecoveryPolicy({ now: () => 1 });

    recoveryPolicy.advise({
      currentStageId: 'draft',
      decision: {
        action: 'repair',
        signalKind: 'artifact-invalid',
        runId: 'run-1',
        artifactKind: 'draft',
        path: '/tmp/draft.md',
        issueCount: 1,
      },
    });
    const decision = recoveryPolicy.advise({
      currentStageId: 'draft',
      decision: {
        action: 'repair',
        signalKind: 'artifact-invalid',
        runId: 'run-1',
        artifactKind: 'draft',
        path: '/tmp/draft.md',
        issueCount: 2,
      },
    });

    expect(decision.guidance).toEqual({
      transitionAction: 'restart-run',
      decisionAction: 'repair',
      fromStageId: 'draft',
      reason:
        'Repeated repair signal for artifact-invalid at the first stage; restart the IDC run with revised intent.',
      requiresUserApproval: true,
    });
  });

  it('creates a default CreativeProcessRecoveryPolicy with IDC stage and artifact registries', () => {
    const recoveryPolicy = createDefaultCreativeProcessRecoveryPolicy({ now: () => 1 });

    expect(recoveryPolicy.stageRegistry.list().map((stage) => stage.id)).toEqual([
      'draft',
      'plan',
      'apply',
    ]);
    expect(recoveryPolicy.artifactRegistry.byStage('apply')?.storageKind).toBe('task');
  });

  it('accumulates every advise call in decision history', () => {
    const recoveryPolicy = createCreativeProcessRecoveryPolicy({
      stageRegistry: createStageRegistry([{ id: 'apply', label: 'Apply', enabled: true }]),
      stageController: new CreativeProcessValidationStageController(),
      now: (() => {
        let tick = 10;
        return () => tick++;
      })(),
    });

    recoveryPolicy.advise({
      currentStageId: 'apply',
      decision: {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'QualityCheck',
        error: 'failed',
      },
    });
    recoveryPolicy.advise({
      decision: { action: 'continue', reason: 'no-actionable-signal' },
    });
    recoveryPolicy.advise({
      currentStageId: 'apply',
      decision: {
        action: 'self-evaluate',
        signalKind: 'self-evaluation-requested',
        stage: 'apply',
      },
    });

    expect(recoveryPolicy.getDecisionHistory()).toEqual([
      expect.objectContaining({
        createdAt: 10,
        guidance: expect.objectContaining({
          transitionAction: 'retry-stage',
          decisionAction: 'repair',
        }),
      }),
      expect.objectContaining({ createdAt: 11, guidance: null }),
      expect.objectContaining({
        createdAt: 12,
        guidance: expect.objectContaining({ decisionAction: 'self-evaluate' }),
      }),
    ]);
  });

  it('does not produce guidance for continue decisions', () => {
    const recoveryPolicy = createCreativeProcessRecoveryPolicy({
      stageRegistry: createStageRegistry(),
      stageController: new CreativeProcessValidationStageController(),
      now: () => 1,
    });

    expect(
      recoveryPolicy.advise({
        decision: { action: 'continue', reason: 'no-actionable-signal' },
      }).guidance,
    ).toBeNull();
  });
});
