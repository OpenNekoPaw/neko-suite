import { describe, expect, it } from 'vitest';
import {
  completeMediaProductionStage,
  createGeneratedAssetRevisionRef,
  createGeneratedAssetStageArtifactRef,
  createMediaProductionWorkflowRun,
  getNextMediaProductionStage,
  startMediaProductionStage,
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
});
