import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  completeMediaProductionStage,
  createGeneratedAssetRevisionRef,
  createMediaProductionWorkflowRun,
  setMediaProductionPreExportPlan,
  startMediaProductionStage,
  type MediaProductionQualityGateArtifactRef,
  type MediaProductionResourceArtifactRef,
  type MediaProductionStageArtifactRef,
  type MediaProductionStageId,
  type MediaProductionWorkflowRunState,
  type QualityGatePolicy,
  type QualityGateResult,
  type QualityTarget,
} from '@neko/shared';
import {
  MediaProductionPreExportGateOrchestrator,
  type MediaProductionPreExportGatePort,
} from '../pre-export-gate-orchestrator';

const CREATED_AT = '2026-07-12T00:00:00.000Z';
const PROJECT_URI = 'file:///workspace/final.nkv';
const REQUIRED_PROFILES = [
  'project-integrity',
  'required-assets',
  'timeline-final-cut',
  'audio',
  'subtitles',
  'output-framing',
  'required-approvals',
] as const;
const POLICY: QualityGatePolicy = {
  version: 1,
  policyId: 'media-production.pre-export',
  policyVersion: '2026-07-12',
  requiredProfiles: REQUIRED_PROFILES,
  requiredEvaluatorClasses: ['structural', 'technical', 'policy'],
  blockingSeverities: ['error', 'critical'],
  allowManualReview: true,
  allowManualOverride: false,
  requireCurrentEvidence: true,
};

function createResourceArtifact(
  stageId: MediaProductionStageId,
  artifactId: string,
): MediaProductionResourceArtifactRef {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: artifactId,
    contentDigest: `sha256:${artifactId}`,
    mediaKind: 'video',
    mimeType: 'video/mp4',
    generation: { taskId: `task-${stageId}` },
  });
  return {
    kind: 'resource',
    artifactId,
    profileId: `media-production.${stageId}`,
    createdAt: '2026-07-12T00:00:01.000Z',
    producerStageId: stageId,
    sourceArtifactIds: [],
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

function completeStage(
  state: MediaProductionWorkflowRunState,
  stageId: MediaProductionStageId,
  artifacts: readonly MediaProductionStageArtifactRef[],
): MediaProductionWorkflowRunState {
  const running = startMediaProductionStage({
    state,
    stageId,
    startedAt: '2026-07-12T00:00:02.000Z',
  });
  return completeMediaProductionStage({
    state: running,
    stageId,
    completedAt: '2026-07-12T00:00:03.000Z',
    artifacts,
  });
}

function createState(
  options: {
    readonly requiredAssetId?: string;
    readonly approvalRevision?: string;
  } = {},
): MediaProductionWorkflowRunState {
  const asset = createResourceArtifact('media-generation', 'approved-shot-1');
  const approval: MediaProductionQualityGateArtifactRef = {
    kind: 'quality-gate',
    artifactId: 'asset-gate-1',
    profileId: 'media-production.asset-approval',
    createdAt: '2026-07-12T00:00:01.000Z',
    producerStageId: 'asset-quality-gate',
    sourceArtifactIds: [asset.artifactId],
    gateResultId: 'asset-gate-result-1',
    target: {
      version: 1,
      targetId: `${asset.artifactId}:quality`,
      kind: 'video-clip',
      resourceRef: asset.resourceRef,
      revision: options.approvalRevision ?? asset.revision,
      contentDigest: asset.contentDigest,
    },
    verdict: 'pass',
  };
  let state = setMediaProductionPreExportPlan({
    state: createMediaProductionWorkflowRun({
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
    }),
    updatedAt: '2026-07-12T00:00:01.000Z',
    plan: {
      version: 1,
      projectArtifactId: 'cut-project-1',
      requiredAssetArtifactIds: [options.requiredAssetId ?? asset.artifactId],
      outputProfileId: 'deliverable.video.master',
      policy: POLICY,
    },
  });
  for (const stageId of [
    'source-normalization',
    'storyboard-validation',
    'shot-generation-planning',
  ] as const) {
    state = completeStage(state, stageId, [createResourceArtifact(stageId, `${stageId}-1`)]);
  }
  state = completeStage(state, 'media-generation', [asset]);
  state = completeStage(state, 'asset-quality-gate', [approval]);
  state = completeStage(state, 'project-authoring', [
    {
      kind: 'project',
      artifactId: 'cut-project-1',
      profileId: 'media-production.cut-project',
      createdAt: '2026-07-12T00:00:01.000Z',
      producerStageId: 'project-authoring',
      sourceArtifactIds: [asset.artifactId],
      projectRef: {
        domain: 'cut',
        documentUri: PROJECT_URI,
        projectRevision: 'nkv:revision-2',
        contentDigest: 'sha256:cut-project-revision-2',
      },
    },
  ]);
  return state;
}

function createGateResult(
  requestTarget: QualityTarget,
  verdict: QualityGateResult['verdict'] = 'pass',
): QualityGateResult {
  return {
    version: 1,
    gateResultId: `pre-export-${verdict}`,
    target: requestTarget,
    policy: {
      policyId: POLICY.policyId,
      policyVersion: POLICY.policyVersion,
      requiredProfiles: POLICY.requiredProfiles,
    },
    verdict,
    evidenceIds: ['project-integrity-evidence'],
    staleEvidenceIds: [],
    missingEvaluatorClasses: [],
    diagnostics:
      verdict === 'fail'
        ? [{ code: 'quality-evaluator-failed', severity: 'error', message: 'Final cut failed.' }]
        : [],
    createdAt: '2026-07-12T00:00:04.000Z',
  };
}

function createHarness(
  state: MediaProductionWorkflowRunState,
  implementation?: MediaProductionPreExportGatePort['evaluate'],
) {
  let current = state;
  const evaluate = vi.fn(implementation ?? (async (request) => createGateResult(request.target)));
  const orchestrator = new MediaProductionPreExportGateOrchestrator({
    stateStore: {
      async load() {
        return current;
      },
      async save(_taskId, next) {
        current = next;
      },
    },
    evaluator: { evaluate },
    now: () => '2026-07-12T00:00:05.000Z',
  });
  return { orchestrator, evaluate, getState: () => current };
}

describe('MediaProductionPreExportGateOrchestrator', () => {
  it('evaluates the exact current project revision, required assets, approvals, and full policy', async () => {
    const harness = createHarness(createState());

    const result = await harness.orchestrator.run('task-1');

    expect(harness.evaluate).toHaveBeenCalledTimes(1);
    expect(harness.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'workflow-1',
        projectArtifact: expect.objectContaining({ artifactId: 'cut-project-1' }),
        requiredAssets: [expect.objectContaining({ artifactId: 'approved-shot-1' })],
        approvalGates: [expect.objectContaining({ artifactId: 'asset-gate-1' })],
        target: expect.objectContaining({
          targetId: 'cut-project-1:pre-export',
          kind: 'project-artifact',
          projectRef: expect.objectContaining({ projectRevision: 'nkv:revision-2' }),
        }),
        policy: expect.objectContaining({ requiredProfiles: REQUIRED_PROFILES }),
      }),
    );
    expect(result.stages.find((stage) => stage.stageId === 'pre-export-gate')).toMatchObject({
      status: 'completed',
      artifacts: [
        {
          kind: 'quality-gate',
          gateResultId: 'pre-export-pass',
          verdict: 'pass',
          sourceArtifactIds: ['cut-project-1', 'approved-shot-1', 'asset-gate-1'],
        },
      ],
    });
  });

  it('fails before evaluation when a required asset or exact approval is missing', async () => {
    const missing = createHarness(createState({ requiredAssetId: 'missing-shot' }));
    const missingResult = await missing.orchestrator.run('task-1');
    expect(missing.evaluate).not.toHaveBeenCalled();
    expect(missingResult.stages.find((stage) => stage.stageId === 'pre-export-gate')).toMatchObject(
      {
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'missing-stage-artifact' })],
      },
    );

    const stale = createHarness(createState({ approvalRevision: 'rev_stale' }));
    const staleResult = await stale.orchestrator.run('task-1');
    expect(stale.evaluate).not.toHaveBeenCalled();
    expect(staleResult.stages.find((stage) => stage.stageId === 'pre-export-gate')).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'asset-not-approved' })],
    });
  });

  it('fails visibly when the evaluator returns another target revision or policy', async () => {
    const harness = createHarness(createState(), async (request) => ({
      ...createGateResult({
        ...request.target,
        projectRef: { ...request.target.projectRef!, projectRevision: 'nkv:revision-stale' },
      }),
      policy: { ...createGateResult(request.target).policy, policyVersion: 'stale-policy' },
    }));

    const result = await harness.orchestrator.run('task-1');

    expect(result.stages.find((stage) => stage.stageId === 'pre-export-gate')).toMatchObject({
      status: 'failed',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-quality-gate-result' }),
      ]),
    });
  });

  it.each(['fail', 'manual-review'] as const)(
    'records a %s verdict as a completed evaluation for the export policy stage',
    async (verdict) => {
      const harness = createHarness(createState(), async (request) =>
        createGateResult(request.target, verdict),
      );

      const result = await harness.orchestrator.run('task-1');

      expect(result.stages.find((stage) => stage.stageId === 'pre-export-gate')).toMatchObject({
        status: 'completed',
        artifacts: [expect.objectContaining({ verdict })],
      });
    },
  );

  it('persists cancellation and never replays a completed evaluation', async () => {
    const cancelled = createHarness(createState(), async () => {
      const error = new Error('Evaluation cancelled.');
      error.name = 'AbortError';
      throw error;
    });
    const cancelledResult = await cancelled.orchestrator.run('task-1');
    expect(cancelledResult.status).toBe('cancelled');
    expect(
      cancelledResult.stages.find((stage) => stage.stageId === 'pre-export-gate'),
    ).toMatchObject({
      status: 'cancelled',
      attempt: 1,
    });

    const completed = createHarness(createState());
    await completed.orchestrator.run('task-1');
    await completed.orchestrator.run('task-1');
    expect(completed.evaluate).toHaveBeenCalledTimes(1);
  });

  it('keeps pre-export orchestration independent from feature packages, commands, and Webviews', () => {
    const source = readFileSync(
      new URL('../pre-export-gate-orchestrator.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"]@neko(?:\/|-)(?:canvas|cut|audio)(?:\/|['"])/);
    expect(source).not.toMatch(/commands\.executeCommand|executeCommand\(/);
    expect(source).not.toMatch(/postMessage\(|WebviewPanel|requestWebviewProjectSnapshot/);
  });
});
