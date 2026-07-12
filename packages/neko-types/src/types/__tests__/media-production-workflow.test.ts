import { describe, expect, it } from 'vitest';
import {
  cancelMediaProductionWorkflow,
  completeMediaProductionStage,
  createGeneratedAssetRevisionRef,
  createGeneratedAssetStageArtifactRef,
  createMediaProductionWorkflowRun,
  getNextMediaProductionStage,
  resumeMediaProductionWorkflow,
  startMediaProductionStage,
  setMediaProductionProjectAuthoringPlan,
  validateMediaProductionWorkflowRun,
  type MediaProductionResourceArtifactRef,
} from '..';

const CREATED_AT = '2026-07-12T00:00:00.000Z';

function createSourceRef() {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'comic-source-1',
    contentDigest: 'sha256:comic-source',
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task-import-source' },
  });
  return {
    kind: 'resource' as const,
    sourceId: 'comic-source-1',
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

function createRun() {
  return createMediaProductionWorkflowRun({
    workflowRunId: 'workflow-1',
    sourceProfileId: 'media-production/from-comic',
    sourceRefs: [createSourceRef()],
    createdAt: CREATED_AT,
  });
}

function createGeneratedArtifact(): MediaProductionResourceArtifactRef {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'storyboard-1',
    contentDigest: 'sha256:storyboard',
    mediaKind: 'image',
    mimeType: 'application/vnd.neko.storyboard+json',
    generation: {
      taskId: 'task-source-normalization',
      runId: 'workflow-1',
      workflowStage: {
        workflowId: 'workflow-1',
        stageId: 'source-normalization',
        stageRevision: 'stage-rev-1',
      },
    },
  });
  return createGeneratedAssetStageArtifactRef({
    lifecycle,
    profileId: 'storyboard.canonical',
    producerStageId: 'source-normalization',
    createdAt: '2026-07-12T00:00:01.000Z',
  });
}

describe('media production workflow contract', () => {
  it('creates the canonical ordered stage state and advances only after dependencies complete', () => {
    const run = createRun();
    expect(run.stages.map((stage) => stage.stageId)).toEqual([
      'source-normalization',
      'storyboard-validation',
      'shot-generation-planning',
      'media-generation',
      'asset-quality-gate',
      'project-authoring',
      'pre-export-gate',
      'export',
      'deliverable-verification',
    ]);

    expect(() =>
      startMediaProductionStage({
        state: run,
        stageId: 'storyboard-validation',
        startedAt: '2026-07-12T00:00:01.000Z',
      }),
    ).toThrow('cannot start before source-normalization completes');

    const running = startMediaProductionStage({
      state: run,
      stageId: 'source-normalization',
      startedAt: '2026-07-12T00:00:01.000Z',
    });
    const completed = completeMediaProductionStage({
      state: running,
      stageId: 'source-normalization',
      completedAt: '2026-07-12T00:00:02.000Z',
      artifacts: [createGeneratedArtifact()],
    });

    expect(completed.status).toBe('running');
    expect(getNextMediaProductionStage(completed)?.stageId).toBe('storyboard-validation');
    expect(completed.stages[0]?.artifacts[0]).toMatchObject({
      kind: 'resource',
      artifactId: 'storyboard-1',
      revision: expect.stringMatching(/^rev_/),
      contentDigest: 'sha256:storyboard',
    });
    expect(validateMediaProductionWorkflowRun(completed)).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects runtime/cache identity instead of accepting a path as a stage artifact', () => {
    const running = startMediaProductionStage({
      state: createRun(),
      stageId: 'source-normalization',
      startedAt: '2026-07-12T00:00:01.000Z',
    });
    const stable = createGeneratedArtifact();
    const unstable: MediaProductionResourceArtifactRef = {
      ...stable,
      resourceRef: {
        ...stable.resourceRef,
        id: 'render://session-1',
      },
    };

    expect(() =>
      completeMediaProductionStage({
        state: running,
        stageId: 'source-normalization',
        completedAt: '2026-07-12T00:00:02.000Z',
        artifacts: [unstable],
      }),
    ).toThrow('durable ResourceRef and revision identity');
  });

  it('does not replay or overwrite a completed stage mutation', () => {
    const running = startMediaProductionStage({
      state: createRun(),
      stageId: 'source-normalization',
      startedAt: '2026-07-12T00:00:01.000Z',
    });
    const completed = completeMediaProductionStage({
      state: running,
      stageId: 'source-normalization',
      completedAt: '2026-07-12T00:00:02.000Z',
      artifacts: [createGeneratedArtifact()],
    });

    expect(() =>
      startMediaProductionStage({
        state: completed,
        stageId: 'source-normalization',
        startedAt: '2026-07-12T00:00:03.000Z',
      }),
    ).toThrow('is not pending');
  });

  it('resumes a cancelled stage only after explicit reconciliation and preserves completed mutations', () => {
    const sourceRunning = startMediaProductionStage({
      state: createRun(),
      stageId: 'source-normalization',
      startedAt: '2026-07-12T00:00:01.000Z',
    });
    const sourceCompleted = completeMediaProductionStage({
      state: sourceRunning,
      stageId: 'source-normalization',
      completedAt: '2026-07-12T00:00:02.000Z',
      artifacts: [createGeneratedArtifact()],
    });
    const validationRunning = startMediaProductionStage({
      state: sourceCompleted,
      stageId: 'storyboard-validation',
      startedAt: '2026-07-12T00:00:03.000Z',
    });
    const cancelled = cancelMediaProductionWorkflow({
      state: validationRunning,
      cancelledAt: '2026-07-12T00:00:04.000Z',
    });

    expect(() =>
      resumeMediaProductionWorkflow({
        state: cancelled,
        resumedAt: '2026-07-12T00:00:05.000Z',
      }),
    ).toThrow('requires explicit reconciliation');

    const resumed = resumeMediaProductionWorkflow({
      state: cancelled,
      resumedAt: '2026-07-12T00:00:05.000Z',
      interruptedStageRecovery: {
        disposition: 'retry',
        stageId: 'storyboard-validation',
      },
    });

    expect(resumed.status).toBe('running');
    expect(resumed.stages[0]).toEqual(sourceCompleted.stages[0]);
    expect(resumed.stages[1]).toMatchObject({
      status: 'pending',
      attempt: 1,
      artifacts: [],
      diagnostics: [],
    });
    expect(resumed.stages[1]?.startedAt).toBeUndefined();
    expect(getNextMediaProductionStage(resumed)?.stageId).toBe('storyboard-validation');
  });

  it('persists only explicit owning project targets and rejects active fallback', () => {
    const planned = setMediaProductionProjectAuthoringPlan({
      state: createRun(),
      updatedAt: '2026-07-12T00:00:01.000Z',
      plan: {
        version: 1,
        handoffs: [
          {
            handoffId: 'cut-final',
            domain: 'cut',
            sourceArtifactId: 'approved-shot-1',
            outputProfileId: 'media-production.cut-project',
            target: { kind: 'file', documentUri: 'file:///workspace/final.nkv' },
            mediaType: 'video',
          },
        ],
      },
    });
    expect(planned.projectAuthoringPlan?.handoffs[0]?.target).toEqual({
      kind: 'file',
      documentUri: 'file:///workspace/final.nkv',
    });

    expect(() =>
      setMediaProductionProjectAuthoringPlan({
        state: createRun(),
        updatedAt: '2026-07-12T00:00:01.000Z',
        plan: {
          version: 1,
          handoffs: [
            {
              handoffId: 'cut-active',
              domain: 'cut',
              sourceArtifactId: 'approved-shot-1',
              outputProfileId: 'media-production.cut-project',
              target: { kind: 'active' },
            },
          ],
        },
      }),
    ).toThrow('explicit file or new target');
  });
});
