import { describe, expect, it, vi } from 'vitest';
import {
  cancelMediaProductionWorkflow,
  completeMediaProductionStage,
  createGeneratedAssetRevisionRef,
  createGeneratedAssetStageArtifactRef,
  createMediaProductionWorkflowRun,
  startMediaProductionStage,
  type MediaProductionResourceArtifactRef,
  type MediaProductionWorkflowRunState,
} from '@neko/shared';
import {
  MediaProductionWorkflowRecoveryCoordinator,
  type MediaProductionWorkflowRecoveryPort,
} from '../workflow-recovery-coordinator';

function createLifecycle(assetId: string) {
  return createGeneratedAssetRevisionRef({
    assetId,
    contentDigest: `sha256:${assetId}`,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: `task-${assetId}`, runId: 'workflow-1' },
  });
}

function createInitialState(): MediaProductionWorkflowRunState {
  const source = createLifecycle('source-1');
  return createMediaProductionWorkflowRun({
    workflowRunId: 'workflow-1',
    sourceProfileId: 'media-production/from-comic',
    sourceRefs: [
      {
        kind: 'resource',
        sourceId: source.assetId,
        resourceRef: source.resourceRef,
        revision: source.revision,
        contentDigest: source.contentDigest,
      },
    ],
    createdAt: '2026-07-12T00:00:00.000Z',
  });
}

function createSourceArtifact(): MediaProductionResourceArtifactRef {
  return createGeneratedAssetStageArtifactRef({
    lifecycle: createLifecycle('storyboard-1'),
    profileId: 'storyboard.canonical',
    producerStageId: 'source-normalization',
    createdAt: '2026-07-12T00:00:01.000Z',
  });
}

function createCancelledState(): MediaProductionWorkflowRunState {
  const sourceRunning = startMediaProductionStage({
    state: createInitialState(),
    stageId: 'source-normalization',
    startedAt: '2026-07-12T00:00:01.000Z',
  });
  const sourceCompleted = completeMediaProductionStage({
    state: sourceRunning,
    stageId: 'source-normalization',
    completedAt: '2026-07-12T00:00:02.000Z',
    artifacts: [createSourceArtifact()],
  });
  const validationRunning = startMediaProductionStage({
    state: sourceCompleted,
    stageId: 'storyboard-validation',
    startedAt: '2026-07-12T00:00:03.000Z',
  });
  return cancelMediaProductionWorkflow({
    state: validationRunning,
    cancelledAt: '2026-07-12T00:00:04.000Z',
  });
}

function createRecoveryPort(): MediaProductionWorkflowRecoveryPort {
  return {
    validateStableReference: vi.fn(async () => []),
    reconcileInterruptedStage: vi.fn(async () => ({
      disposition: 'retry' as const,
      diagnostics: [],
    })),
  };
}

describe('media production workflow recovery coordinator', () => {
  it('validates stable source/artifact revisions before retrying only the incomplete stage', async () => {
    let state = createCancelledState();
    const recovery = createRecoveryPort();
    const save = vi.fn(async (_taskId: string, next: MediaProductionWorkflowRunState) => {
      state = next;
    });
    const coordinator = new MediaProductionWorkflowRecoveryCoordinator({
      stateStore: { load: vi.fn(async () => state), save },
      recovery,
      now: () => '2026-07-12T00:00:05.000Z',
    });

    const resumed = await coordinator.resume('task-workflow-1');

    expect(recovery.validateStableReference).toHaveBeenCalledTimes(2);
    expect(recovery.validateStableReference).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'source' }),
      undefined,
    );
    expect(recovery.validateStableReference).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'artifact',
        stageId: 'source-normalization',
        artifact: expect.objectContaining({ artifactId: 'storyboard-1' }),
      }),
      undefined,
    );
    expect(recovery.reconcileInterruptedStage).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'workflow-1',
        stage: expect.objectContaining({
          stageId: 'storyboard-validation',
          status: 'cancelled',
        }),
      }),
      undefined,
    );
    expect(resumed.stages[0]).toEqual(createCancelledState().stages[0]);
    expect(resumed.stages[1]).toMatchObject({ status: 'pending', attempt: 1 });
    expect(save).toHaveBeenCalledWith('task-workflow-1', resumed);
  });

  it('fails before reconciliation when a persisted reference is stale', async () => {
    const state = createCancelledState();
    const recovery = createRecoveryPort();
    recovery.validateStableReference = vi.fn(async (reference) =>
      reference.kind === 'artifact'
        ? [
            {
              code: 'stale-stage-artifact' as const,
              severity: 'error' as const,
              message: 'Storyboard revision no longer matches durable storage.',
              stageId: reference.stageId,
            },
          ]
        : [],
    );
    const save = vi.fn();
    const coordinator = new MediaProductionWorkflowRecoveryCoordinator({
      stateStore: { load: vi.fn(async () => state), save },
      recovery,
    });

    await expect(coordinator.resume('task-workflow-1')).rejects.toThrow(
      'resume-validation-failed: Storyboard revision no longer matches durable storage.',
    );
    expect(recovery.reconcileInterruptedStage).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects runtime-only persisted identity before calling external recovery', async () => {
    const stable = createCancelledState();
    const sourceStage = stable.stages[0];
    if (!sourceStage) throw new Error('Missing source-normalization stage.');
    const artifact = sourceStage.artifacts[0];
    if (!artifact || artifact.kind !== 'resource') throw new Error('Missing resource artifact.');
    const invalid: MediaProductionWorkflowRunState = {
      ...stable,
      stages: stable.stages.map((stage) =>
        stage.stageId === 'source-normalization'
          ? {
              ...stage,
              artifacts: [
                {
                  ...artifact,
                  resourceRef: { ...artifact.resourceRef, id: 'render://session-only' },
                },
              ],
            }
          : stage,
      ),
    };
    const recovery = createRecoveryPort();
    const coordinator = new MediaProductionWorkflowRecoveryCoordinator({
      stateStore: { load: vi.fn(async () => invalid), save: vi.fn() },
      recovery,
    });

    await expect(coordinator.resume('task-workflow-1')).rejects.toThrow('resume-validation-failed');
    expect(recovery.validateStableReference).not.toHaveBeenCalled();
    expect(recovery.reconcileInterruptedStage).not.toHaveBeenCalled();
  });

  it('accepts a reconciled durable artifact and marks the interrupted mutation completed', async () => {
    let state = createCancelledState();
    const recoveredArtifact = createGeneratedAssetStageArtifactRef({
      lifecycle: createLifecycle('validated-storyboard-1'),
      profileId: 'storyboard.validated',
      producerStageId: 'storyboard-validation',
      createdAt: '2026-07-12T00:00:04.500Z',
      sourceArtifactIds: ['storyboard-1'],
    });
    const recovery = createRecoveryPort();
    recovery.reconcileInterruptedStage = vi.fn(async () => ({
      disposition: 'complete' as const,
      artifacts: [recoveredArtifact],
      diagnostics: [],
    }));
    const coordinator = new MediaProductionWorkflowRecoveryCoordinator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async (_taskId, next) => {
          state = next;
        }),
      },
      recovery,
      now: () => '2026-07-12T00:00:05.000Z',
    });

    const resumed = await coordinator.resume('task-workflow-1');

    expect(resumed.stages[1]).toMatchObject({
      status: 'completed',
      artifacts: [expect.objectContaining({ artifactId: 'validated-storyboard-1' })],
    });
    expect(resumed.stages[2]?.status).toBe('pending');
    expect(recovery.validateStableReference).toHaveBeenCalledTimes(3);
  });
});
