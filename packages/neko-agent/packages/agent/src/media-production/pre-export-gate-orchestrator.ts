import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  cancelMediaProductionWorkflow,
  completeMediaProductionStage,
  failMediaProductionStage,
  qualityTargetsMatch,
  startMediaProductionStage,
  validateQualityGateResult,
  type MediaProductionProjectArtifactRef,
  type MediaProductionQualityGateArtifactRef,
  type MediaProductionResourceArtifactRef,
  type MediaProductionWorkflowDiagnostic,
  type MediaProductionWorkflowRunState,
  type QualityGatePolicy,
  type QualityGateResult,
  type QualityTarget,
} from '@neko/shared';
import type { MediaProductionWorkflowStateStorePort } from './early-stage-orchestrator';

export interface MediaProductionPreExportGateRequest {
  readonly workflowRunId: string;
  readonly projectArtifact: MediaProductionProjectArtifactRef;
  readonly requiredAssets: readonly MediaProductionResourceArtifactRef[];
  readonly approvalGates: readonly MediaProductionQualityGateArtifactRef[];
  readonly target: QualityTarget;
  readonly policy: QualityGatePolicy;
  readonly signal?: AbortSignal;
}

export interface MediaProductionPreExportGatePort {
  evaluate(request: MediaProductionPreExportGateRequest): Promise<QualityGateResult>;
}

export interface MediaProductionPreExportGateOrchestratorOptions {
  readonly stateStore: MediaProductionWorkflowStateStorePort;
  readonly evaluator: MediaProductionPreExportGatePort;
  readonly now?: () => string;
}

export class MediaProductionPreExportGateOrchestrator {
  private readonly now: () => string;

  constructor(private readonly options: MediaProductionPreExportGateOrchestratorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(taskId: string, signal?: AbortSignal): Promise<MediaProductionWorkflowRunState> {
    let state = await this.options.stateStore.load(taskId);
    const stage = getStage(state, 'pre-export-gate');
    if (stage.status === 'completed' || stage.status === 'failed' || stage.status === 'cancelled') {
      return state;
    }
    if (stage.status === 'running') {
      throw new Error(
        'Media production stage pre-export-gate was interrupted and requires explicit resume validation.',
      );
    }
    if (signal?.aborted) {
      state = cancelMediaProductionWorkflow({ state, cancelledAt: this.now() });
      await this.options.stateStore.save(taskId, state);
      return state;
    }

    if (getStage(state, 'project-authoring').status !== 'completed') {
      return this.fail(taskId, state, [
        diagnostic(
          'stage-blocked',
          'Pre-export evaluation requires the project-authoring stage to be completed.',
        ),
      ]);
    }
    if (!state.preExportPlan) {
      return this.fail(taskId, state, [
        diagnostic(
          'missing-pre-export-plan',
          'Pre-export evaluation requires a persisted revision-bound policy plan.',
        ),
      ]);
    }

    const resolved = resolvePreExportInputs(state);
    if (resolved.diagnostics.length > 0) {
      return this.fail(taskId, state, resolved.diagnostics);
    }
    if (!resolved.request) {
      throw new Error('Pre-export input resolution returned neither a request nor diagnostics.');
    }

    state = startMediaProductionStage({
      state,
      stageId: 'pre-export-gate',
      startedAt: this.now(),
    });
    await this.options.stateStore.save(taskId, state);

    try {
      const result = await this.options.evaluator.evaluate({
        ...resolved.request,
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) throw createAbortError();
      const resultDiagnostics = validatePreExportResult(
        result,
        resolved.request.target,
        resolved.request.policy,
      );
      if (resultDiagnostics.length > 0) {
        state = failMediaProductionStage({
          state,
          stageId: 'pre-export-gate',
          failedAt: this.now(),
          diagnostics: resultDiagnostics,
        });
      } else {
        const artifact: MediaProductionQualityGateArtifactRef = {
          kind: 'quality-gate',
          artifactId: result.gateResultId,
          profileId: state.preExportPlan.outputProfileId,
          createdAt: result.createdAt,
          producerStageId: 'pre-export-gate',
          sourceArtifactIds: [
            resolved.request.projectArtifact.artifactId,
            ...resolved.request.requiredAssets.map((asset) => asset.artifactId),
            ...resolved.request.approvalGates.map((gate) => gate.artifactId),
          ],
          gateResultId: result.gateResultId,
          target: result.target,
          verdict: result.verdict,
        };
        state = completeMediaProductionStage({
          state,
          stageId: 'pre-export-gate',
          completedAt: this.now(),
          artifacts: [artifact],
        });
      }
      await this.options.stateStore.save(taskId, state);
      return state;
    } catch (error) {
      if (isAbortError(error)) {
        state = cancelMediaProductionWorkflow({ state, cancelledAt: this.now() });
        await this.options.stateStore.save(taskId, state);
        return state;
      }
      state = failMediaProductionStage({
        state,
        stageId: 'pre-export-gate',
        failedAt: this.now(),
        diagnostics: [
          diagnostic('stage-blocked', error instanceof Error ? error.message : String(error)),
        ],
      });
      await this.options.stateStore.save(taskId, state);
      return state;
    }
  }

  private async fail(
    taskId: string,
    state: MediaProductionWorkflowRunState,
    diagnostics: readonly MediaProductionWorkflowDiagnostic[],
  ): Promise<MediaProductionWorkflowRunState> {
    const running = startMediaProductionStage({
      state,
      stageId: 'pre-export-gate',
      startedAt: this.now(),
    });
    const failed = failMediaProductionStage({
      state: running,
      stageId: 'pre-export-gate',
      failedAt: this.now(),
      diagnostics,
    });
    await this.options.stateStore.save(taskId, failed);
    return failed;
  }
}

interface ResolvedPreExportRequest extends Omit<MediaProductionPreExportGateRequest, 'signal'> {}

function resolvePreExportInputs(state: MediaProductionWorkflowRunState): {
  readonly request?: ResolvedPreExportRequest;
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
} {
  const plan = state.preExportPlan;
  if (!plan) return { diagnostics: [] };
  const project = getStage(state, 'project-authoring').artifacts.find(
    (artifact): artifact is MediaProductionProjectArtifactRef =>
      artifact.kind === 'project' && artifact.artifactId === plan.projectArtifactId,
  );
  if (!project) {
    return {
      diagnostics: [
        diagnostic(
          'missing-stage-artifact',
          `Pre-export project artifact is missing: ${plan.projectArtifactId}.`,
        ),
      ],
    };
  }

  const resources = state.stages.flatMap((candidate) =>
    candidate.artifacts.filter(
      (artifact): artifact is MediaProductionResourceArtifactRef => artifact.kind === 'resource',
    ),
  );
  const approvalArtifacts = getStage(state, 'asset-quality-gate').artifacts.filter(
    (artifact): artifact is MediaProductionQualityGateArtifactRef =>
      artifact.kind === 'quality-gate',
  );
  const requiredAssets: MediaProductionResourceArtifactRef[] = [];
  const approvalGates: MediaProductionQualityGateArtifactRef[] = [];
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];

  for (const artifactId of plan.requiredAssetArtifactIds) {
    const asset = resources.find((candidate) => candidate.artifactId === artifactId);
    if (!asset) {
      diagnostics.push(
        diagnostic(
          'missing-stage-artifact',
          `Pre-export required asset is missing: ${artifactId}.`,
        ),
      );
      continue;
    }
    const approval = approvalArtifacts.find((gate) => isApprovalForAsset(gate, asset));
    if (!approval) {
      diagnostics.push(
        diagnostic(
          'asset-not-approved',
          `Pre-export required asset ${artifactId} is not approved at revision ${asset.revision}.`,
        ),
      );
      continue;
    }
    requiredAssets.push(asset);
    approvalGates.push(approval);
  }
  if (diagnostics.length > 0) return { diagnostics };

  const target: QualityTarget = {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: `${project.artifactId}:pre-export`,
    kind: 'project-artifact',
    projectRef: project.projectRef,
    ...(project.projectRef.contentDigest
      ? { contentDigest: project.projectRef.contentDigest }
      : {}),
  };
  return {
    diagnostics: [],
    request: {
      workflowRunId: state.workflowRunId,
      projectArtifact: project,
      requiredAssets,
      approvalGates,
      target,
      policy: plan.policy,
    },
  };
}

function isApprovalForAsset(
  gate: MediaProductionQualityGateArtifactRef,
  asset: MediaProductionResourceArtifactRef,
): boolean {
  return (
    gate.verdict === 'pass' &&
    gate.target.resourceRef?.id === asset.resourceRef.id &&
    gate.target.revision === asset.revision &&
    (gate.target.contentDigest === undefined || gate.target.contentDigest === asset.contentDigest)
  );
}

function validatePreExportResult(
  result: QualityGateResult,
  target: QualityTarget,
  policy: QualityGatePolicy,
): readonly MediaProductionWorkflowDiagnostic[] {
  const qualityValidation = validateQualityGateResult(result);
  const messages = qualityValidation.diagnostics.map((item) => item.message);
  if (!qualityTargetsMatch(result.target, target)) {
    messages.push('Pre-export evaluator returned a Gate bound to another project revision.');
  }
  if (
    result.policy.policyId !== policy.policyId ||
    result.policy.policyVersion !== policy.policyVersion ||
    !arraysEqual(result.policy.requiredProfiles, policy.requiredProfiles)
  ) {
    messages.push('Pre-export evaluator returned a Gate for another policy or profile set.');
  }
  return messages.map((message) => diagnostic('invalid-quality-gate-result', message));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getStage(
  state: MediaProductionWorkflowRunState,
  stageId: 'asset-quality-gate' | 'project-authoring' | 'pre-export-gate',
) {
  const stage = state.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage) throw new Error(`Media production workflow is missing stage ${stageId}.`);
  return stage;
}

function diagnostic(
  code: MediaProductionWorkflowDiagnostic['code'],
  message: string,
): MediaProductionWorkflowDiagnostic {
  return { code, severity: 'error', message, stageId: 'pre-export-gate' };
}

function createAbortError(): Error {
  const error = new Error('Media production pre-export-gate stage was cancelled.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
