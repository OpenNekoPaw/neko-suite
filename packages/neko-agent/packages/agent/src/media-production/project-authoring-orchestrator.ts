import {
  completeMediaProductionStage,
  failMediaProductionStage,
  startMediaProductionStage,
  validateNekoProjectAuthoringResult,
  type MediaProductionProjectAuthoringDomain,
  type MediaProductionProjectAuthoringHandoff,
  type MediaProductionProjectArtifactRef,
  type MediaProductionQualityGateArtifactRef,
  type MediaProductionResourceArtifactRef,
  type MediaProductionWorkflowDiagnostic,
  type MediaProductionWorkflowRunState,
  type NekoProjectAuthoringResult,
} from '@neko/shared';
import type { MediaProductionWorkflowStateStorePort } from './early-stage-orchestrator';

export interface MediaProductionProjectAuthoringRequest {
  readonly workflowRunId: string;
  readonly handoff: MediaProductionProjectAuthoringHandoff;
  readonly approvedAsset: MediaProductionResourceArtifactRef;
  readonly signal?: AbortSignal;
}

export interface MediaProductionProjectAuthoringPort {
  author(request: MediaProductionProjectAuthoringRequest): Promise<NekoProjectAuthoringResult>;
}

export type MediaProductionProjectAuthoringPorts = Readonly<
  Record<MediaProductionProjectAuthoringDomain, MediaProductionProjectAuthoringPort>
>;

export interface MediaProductionProjectAuthoringOrchestratorOptions {
  readonly stateStore: MediaProductionWorkflowStateStorePort;
  readonly ports: MediaProductionProjectAuthoringPorts;
  readonly now?: () => string;
}

export class MediaProductionProjectAuthoringOrchestrator {
  private readonly now: () => string;

  constructor(private readonly options: MediaProductionProjectAuthoringOrchestratorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(taskId: string, signal?: AbortSignal): Promise<MediaProductionWorkflowRunState> {
    let state = await this.options.stateStore.load(taskId);
    const stage = getStage(state, 'project-authoring');
    if (stage.status === 'completed' || stage.status === 'failed' || stage.status === 'cancelled') {
      return state;
    }
    if (stage.status === 'running') {
      throw new Error(
        'Media production stage project-authoring was interrupted and requires explicit resume validation.',
      );
    }
    if (signal?.aborted) {
      throw createAbortError();
    }

    const dependency = getStage(state, 'asset-quality-gate');
    if (dependency.status !== 'completed') {
      return this.fail(taskId, state, [
        diagnostic(
          'stage-blocked',
          'Project authoring requires the asset-quality-gate stage to be completed.',
        ),
      ]);
    }
    if (!state.projectAuthoringPlan) {
      return this.fail(taskId, state, [
        diagnostic(
          'missing-authoring-target',
          'Project authoring requires a persisted explicit authoring plan.',
        ),
      ]);
    }

    const resolved = resolveApprovedHandoffs(state);
    if (resolved.diagnostics.length > 0) {
      return this.fail(taskId, state, resolved.diagnostics);
    }

    state = startMediaProductionStage({
      state,
      stageId: 'project-authoring',
      startedAt: this.now(),
    });
    await this.options.stateStore.save(taskId, state);

    try {
      const artifacts: MediaProductionProjectArtifactRef[] = [];
      for (const item of resolved.handoffs) {
        if (signal?.aborted) throw createAbortError();
        const result = await this.options.ports[item.handoff.domain].author({
          workflowRunId: state.workflowRunId,
          handoff: item.handoff,
          approvedAsset: item.asset,
          ...(signal ? { signal } : {}),
        });
        const resultDiagnostics = validateAuthoringResult(item.handoff, result);
        if (resultDiagnostics.length > 0) {
          state = failMediaProductionStage({
            state,
            stageId: 'project-authoring',
            failedAt: this.now(),
            diagnostics: resultDiagnostics,
          });
          await this.options.stateStore.save(taskId, state);
          return state;
        }
        const projectRef = result.projectRef;
        if (!projectRef) {
          throw new Error('Validated project authoring result did not contain projectRef.');
        }
        artifacts.push({
          kind: 'project',
          artifactId: `${state.workflowRunId}:project-authoring:${item.handoff.handoffId}`,
          profileId: item.handoff.outputProfileId,
          createdAt: this.now(),
          producerStageId: 'project-authoring',
          sourceArtifactIds: [item.asset.artifactId],
          projectRef,
        });
      }

      state = completeMediaProductionStage({
        state,
        stageId: 'project-authoring',
        completedAt: this.now(),
        artifacts,
      });
      await this.options.stateStore.save(taskId, state);
      return state;
    } catch (error) {
      state = failMediaProductionStage({
        state,
        stageId: 'project-authoring',
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
      stageId: 'project-authoring',
      startedAt: this.now(),
    });
    const failed = failMediaProductionStage({
      state: running,
      stageId: 'project-authoring',
      failedAt: this.now(),
      diagnostics,
    });
    await this.options.stateStore.save(taskId, failed);
    return failed;
  }
}

interface ResolvedHandoff {
  readonly handoff: MediaProductionProjectAuthoringHandoff;
  readonly asset: MediaProductionResourceArtifactRef;
}

function resolveApprovedHandoffs(state: MediaProductionWorkflowRunState): {
  readonly handoffs: readonly ResolvedHandoff[];
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
} {
  const plan = state.projectAuthoringPlan;
  if (!plan) return { handoffs: [], diagnostics: [] };
  const resources = state.stages.flatMap((stage) =>
    stage.artifacts.filter(
      (artifact): artifact is MediaProductionResourceArtifactRef => artifact.kind === 'resource',
    ),
  );
  const gates = getStage(state, 'asset-quality-gate').artifacts.filter(
    (artifact): artifact is MediaProductionQualityGateArtifactRef =>
      artifact.kind === 'quality-gate',
  );
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  const handoffs: ResolvedHandoff[] = [];

  for (const handoff of plan.handoffs) {
    const asset = resources.find((candidate) => candidate.artifactId === handoff.sourceArtifactId);
    if (!asset) {
      diagnostics.push(
        diagnostic(
          'missing-stage-artifact',
          `Project authoring source artifact is missing: ${handoff.sourceArtifactId}.`,
        ),
      );
      continue;
    }
    const approved = gates.some((gate) => isApprovalForAsset(gate, asset));
    if (!approved) {
      diagnostics.push(
        diagnostic(
          'asset-not-approved',
          `Project authoring source ${asset.artifactId} is not approved at revision ${asset.revision}.`,
        ),
      );
      continue;
    }
    handoffs.push({ handoff, asset });
  }
  return { handoffs, diagnostics };
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

function validateAuthoringResult(
  handoff: MediaProductionProjectAuthoringHandoff,
  result: NekoProjectAuthoringResult,
): readonly MediaProductionWorkflowDiagnostic[] {
  const validation = validateNekoProjectAuthoringResult(result);
  const messages = validation.diagnostics.map((item) => item.message);
  if (!result.ok) {
    messages.push(...result.diagnostics.map((item) => item.message));
  }
  if (!result.projectRef) {
    messages.push('Successful project authoring must return the resulting project revision.');
  } else {
    if (result.projectRef.domain !== handoff.domain) {
      messages.push(
        `Project authoring returned ${result.projectRef.domain} for ${handoff.domain} handoff.`,
      );
    }
    if (
      handoff.target.kind === 'file' &&
      handoff.target.documentUri !== result.projectRef.documentUri
    ) {
      messages.push('Project authoring returned a revision for a different target document.');
    }
  }
  return messages.map((message) => diagnostic('invalid-authoring-result', message));
}

function getStage(
  state: MediaProductionWorkflowRunState,
  stageId: 'asset-quality-gate' | 'project-authoring',
) {
  const stage = state.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage) throw new Error(`Media production workflow is missing stage ${stageId}.`);
  return stage;
}

function diagnostic(
  code: MediaProductionWorkflowDiagnostic['code'],
  message: string,
): MediaProductionWorkflowDiagnostic {
  return { code, severity: 'error', message, stageId: 'project-authoring' };
}

function createAbortError(): Error {
  const error = new Error('Media production project-authoring stage was cancelled.');
  error.name = 'AbortError';
  return error;
}
