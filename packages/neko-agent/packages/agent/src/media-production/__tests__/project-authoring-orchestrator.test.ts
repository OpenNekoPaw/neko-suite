import { describe, expect, it, vi } from 'vitest';
import {
  createGeneratedAssetRevisionRef,
  createMediaProductionWorkflowRun,
  setMediaProductionProjectAuthoringPlan,
  type MediaProductionQualityGateArtifactRef,
  type MediaProductionResourceArtifactRef,
  type MediaProductionStageArtifactRef,
  type MediaProductionWorkflowRunState,
} from '@neko/shared';
import {
  MediaProductionProjectAuthoringOrchestrator,
  type MediaProductionProjectAuthoringPorts,
} from '../project-authoring-orchestrator';

const CREATED_AT = '2026-07-12T00:00:00.000Z';
const TARGET_URI = 'file:///workspace/project/final.nkv';

function createApprovedAsset(): MediaProductionResourceArtifactRef {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'approved-shot-1',
    contentDigest: 'sha256:approved-shot-1',
    mediaKind: 'video',
    mimeType: 'video/mp4',
    generation: { taskId: 'generation-task-1' },
  });
  return {
    kind: 'resource',
    artifactId: lifecycle.assetId,
    profileId: 'media-production.generated-video',
    createdAt: '2026-07-12T00:00:04.000Z',
    producerStageId: 'media-generation',
    sourceArtifactIds: ['shot-plan-1'],
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

function createPlaceholderArtifact(
  stageId: 'source-normalization' | 'storyboard-validation' | 'shot-generation-planning',
): MediaProductionResourceArtifactRef {
  const asset = createApprovedAsset();
  return {
    ...asset,
    artifactId: `${stageId}-artifact`,
    profileId: `media-production.${stageId}`,
    producerStageId: stageId,
    createdAt: '2026-07-12T00:00:01.000Z',
  };
}

function createState(options: { readonly withPlan?: boolean; readonly approved?: boolean } = {}) {
  const asset = createApprovedAsset();
  const gate: MediaProductionQualityGateArtifactRef = {
    kind: 'quality-gate',
    artifactId: 'asset-gate-1',
    profileId: 'media-production.asset-quality-gate',
    createdAt: '2026-07-12T00:00:05.000Z',
    producerStageId: 'asset-quality-gate',
    sourceArtifactIds: [asset.artifactId],
    gateResultId: 'gate-result-1',
    target: {
      version: 1,
      targetId: 'approved-shot-1-target',
      kind: 'video-clip',
      resourceRef: asset.resourceRef,
      revision: asset.revision,
      contentDigest: asset.contentDigest,
    },
    verdict: options.approved === false ? 'fail' : 'pass',
  };
  const artifactsByStage: Readonly<Record<string, readonly MediaProductionStageArtifactRef[]>> = {
    'source-normalization': [createPlaceholderArtifact('source-normalization')],
    'storyboard-validation': [createPlaceholderArtifact('storyboard-validation')],
    'shot-generation-planning': [createPlaceholderArtifact('shot-generation-planning')],
    'media-generation': [asset],
    'asset-quality-gate': [gate],
  };
  let state: MediaProductionWorkflowRunState = createMediaProductionWorkflowRun({
    workflowRunId: 'workflow-1',
    sourceProfileId: 'media-production/from-prompt',
    sourceRefs: [
      {
        kind: 'resource',
        sourceId: asset.artifactId,
        resourceRef: asset.resourceRef,
        revision: asset.revision,
        contentDigest: asset.contentDigest,
      },
    ],
    createdAt: CREATED_AT,
  });
  state = {
    ...state,
    status: 'running',
    updatedAt: '2026-07-12T00:00:05.000Z',
    stages: state.stages.map((stage) =>
      artifactsByStage[stage.stageId]
        ? {
            ...stage,
            status: 'completed' as const,
            attempt: 1,
            startedAt: '2026-07-12T00:00:01.000Z',
            completedAt: '2026-07-12T00:00:05.000Z',
            artifacts: artifactsByStage[stage.stageId] ?? [],
          }
        : stage,
    ),
  };
  if (options.withPlan === false) return state;
  return setMediaProductionProjectAuthoringPlan({
    state,
    updatedAt: '2026-07-12T00:00:06.000Z',
    plan: {
      version: 1,
      handoffs: [
        {
          handoffId: 'cut-final',
          domain: 'cut',
          sourceArtifactId: asset.artifactId,
          outputProfileId: 'media-production.cut-project',
          target: { kind: 'file', documentUri: TARGET_URI },
          mediaType: 'video',
        },
      ],
    },
  });
}

function createHarness(state: MediaProductionWorkflowRunState) {
  let current = state;
  const saves: MediaProductionWorkflowRunState[] = [];
  const cutAuthor = vi.fn(async () => ({
    version: 1 as const,
    ok: true,
    documentUri: TARGET_URI,
    projectRef: {
      domain: 'cut' as const,
      documentUri: TARGET_URI,
      projectRevision: 'nkv:revision-2',
      contentDigest: 'revision-2',
    },
    diagnostics: [],
  }));
  const unavailable = vi.fn(async () => {
    throw new Error('unexpected authoring domain');
  });
  const ports: MediaProductionProjectAuthoringPorts = {
    canvas: { author: unavailable },
    cut: { author: cutAuthor },
    audio: { author: unavailable },
  };
  const orchestrator = new MediaProductionProjectAuthoringOrchestrator({
    stateStore: {
      async load() {
        return current;
      },
      async save(_taskId, next) {
        current = next;
        saves.push(next);
      },
    },
    ports,
    now: () => '2026-07-12T00:00:07.000Z',
  });
  return { orchestrator, cutAuthor, saves, getState: () => current };
}

describe('MediaProductionProjectAuthoringOrchestrator', () => {
  it('authors only the approved revision and binds the returned project revision', async () => {
    const harness = createHarness(createState());

    const result = await harness.orchestrator.run('task-1');

    expect(harness.cutAuthor).toHaveBeenCalledTimes(1);
    expect(harness.cutAuthor).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'workflow-1',
        handoff: expect.objectContaining({ target: { kind: 'file', documentUri: TARGET_URI } }),
        approvedAsset: expect.objectContaining({ artifactId: 'approved-shot-1' }),
      }),
    );
    expect(result.stages.find((stage) => stage.stageId === 'project-authoring')).toMatchObject({
      status: 'completed',
      artifacts: [
        {
          kind: 'project',
          sourceArtifactIds: ['approved-shot-1'],
          projectRef: {
            domain: 'cut',
            documentUri: TARGET_URI,
            projectRevision: 'nkv:revision-2',
          },
        },
      ],
    });
  });

  it('fails before mutation when the authoring plan or exact asset approval is missing', async () => {
    const missingPlan = createHarness(createState({ withPlan: false }));
    const missingPlanResult = await missingPlan.orchestrator.run('task-1');
    expect(missingPlan.cutAuthor).not.toHaveBeenCalled();
    expect(
      missingPlanResult.stages.find((stage) => stage.stageId === 'project-authoring'),
    ).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'missing-authoring-target' })],
    });

    const rejected = createHarness(createState({ approved: false }));
    const rejectedResult = await rejected.orchestrator.run('task-1');
    expect(rejected.cutAuthor).not.toHaveBeenCalled();
    expect(
      rejectedResult.stages.find((stage) => stage.stageId === 'project-authoring'),
    ).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'asset-not-approved' })],
    });
  });

  it('does not replay a completed project mutation', async () => {
    const harness = createHarness(createState());
    await harness.orchestrator.run('task-1');
    await harness.orchestrator.run('task-1');
    expect(harness.cutAuthor).toHaveBeenCalledTimes(1);
  });

  it('fails visibly when the owning API omits the resulting project revision', async () => {
    const harness = createHarness(createState());
    harness.cutAuthor.mockResolvedValueOnce({
      version: 1,
      ok: true,
      documentUri: TARGET_URI,
      diagnostics: [],
    });

    const result = await harness.orchestrator.run('task-1');

    expect(result.stages.find((stage) => stage.stageId === 'project-authoring')).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'invalid-authoring-result' })],
    });
  });
});
