import {
  cancelMediaProductionWorkflow,
  completeMediaProductionStage,
  failMediaProductionStage,
  startMediaProductionStage,
  type MediaProductionStageArtifactRef,
  type MediaProductionStageId,
  type MediaProductionWorkflowDiagnostic,
  type MediaProductionWorkflowRunState,
  type MediaProductionWorkflowSourceRef,
} from '@neko/shared';

export const MEDIA_PRODUCTION_EARLY_STAGE_IDS = [
  'source-normalization',
  'storyboard-validation',
  'shot-generation-planning',
  'media-generation',
  'asset-quality-gate',
] as const satisfies readonly MediaProductionStageId[];

export interface MediaProductionStageExecutionContext {
  readonly workflowRunId: string;
  readonly stageId: (typeof MEDIA_PRODUCTION_EARLY_STAGE_IDS)[number];
  readonly sourceProfileId: string;
  readonly sourceRefs: readonly MediaProductionWorkflowSourceRef[];
  readonly inputArtifacts: readonly MediaProductionStageArtifactRef[];
  readonly signal?: AbortSignal;
}

export interface MediaProductionStageExecutionResult {
  readonly artifacts: readonly MediaProductionStageArtifactRef[];
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}

export interface MediaProductionStageExecutorPort {
  execute(
    context: MediaProductionStageExecutionContext,
  ): Promise<MediaProductionStageExecutionResult>;
}

export interface MediaProductionEarlyStagePorts {
  readonly sourceToStoryboard: MediaProductionStageExecutorPort;
  readonly storyboardValidation: MediaProductionStageExecutorPort;
  readonly shotGenerationPlanning: MediaProductionStageExecutorPort;
  readonly mediaGeneration: MediaProductionStageExecutorPort;
  readonly assetQualityGate: MediaProductionStageExecutorPort;
}

export interface MediaProductionWorkflowStateStorePort {
  load(taskId: string): Promise<MediaProductionWorkflowRunState>;
  save(taskId: string, state: MediaProductionWorkflowRunState): Promise<void>;
}

export interface MediaProductionEarlyStageOrchestratorOptions {
  readonly stateStore: MediaProductionWorkflowStateStorePort;
  readonly ports: MediaProductionEarlyStagePorts;
  readonly now?: () => string;
}

export class MediaProductionEarlyStageOrchestrator {
  private readonly now: () => string;

  constructor(private readonly options: MediaProductionEarlyStageOrchestratorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(taskId: string, signal?: AbortSignal): Promise<MediaProductionWorkflowRunState> {
    let state = await this.options.stateStore.load(taskId);

    for (const stageId of MEDIA_PRODUCTION_EARLY_STAGE_IDS) {
      const stage = state.stages.find((candidate) => candidate.stageId === stageId);
      if (!stage) throw new Error(`Media production workflow is missing stage ${stageId}.`);
      if (stage.status === 'completed') continue;
      if (stage.status === 'failed' || stage.status === 'cancelled') return state;
      if (stage.status === 'running') {
        throw new Error(
          `Media production stage ${stageId} was interrupted and requires explicit resume validation.`,
        );
      }
      if (signal?.aborted) {
        state = cancelMediaProductionWorkflow({ state, cancelledAt: this.now() });
        await this.options.stateStore.save(taskId, state);
        return state;
      }

      state = startMediaProductionStage({ state, stageId, startedAt: this.now() });
      await this.options.stateStore.save(taskId, state);

      try {
        const result = await this.getExecutor(stageId).execute({
          workflowRunId: state.workflowRunId,
          stageId,
          sourceProfileId: state.sourceProfileId,
          sourceRefs: state.sourceRefs,
          inputArtifacts: getInputArtifacts(state, stageId),
          ...(signal ? { signal } : {}),
        });
        if (signal?.aborted) throw createAbortError(stageId);
        const diagnostics = result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          stageId,
        }));
        if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
          state = failMediaProductionStage({
            state,
            stageId,
            failedAt: this.now(),
            diagnostics,
          });
          await this.options.stateStore.save(taskId, state);
          return state;
        }

        state = completeMediaProductionStage({
          state,
          stageId,
          completedAt: this.now(),
          artifacts: result.artifacts,
          diagnostics,
        });
        await this.options.stateStore.save(taskId, state);
      } catch (error) {
        if (isAbortError(error)) {
          state = cancelMediaProductionWorkflow({ state, cancelledAt: this.now() });
          await this.options.stateStore.save(taskId, state);
          return state;
        }
        const diagnostics: readonly MediaProductionWorkflowDiagnostic[] = [
          {
            code: 'stage-blocked',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
            stageId,
          },
        ];
        state = failMediaProductionStage({
          state,
          stageId,
          failedAt: this.now(),
          diagnostics,
        });
        await this.options.stateStore.save(taskId, state);
        return state;
      }
    }

    return state;
  }

  private getExecutor(stageId: (typeof MEDIA_PRODUCTION_EARLY_STAGE_IDS)[number]) {
    switch (stageId) {
      case 'source-normalization':
        return this.options.ports.sourceToStoryboard;
      case 'storyboard-validation':
        return this.options.ports.storyboardValidation;
      case 'shot-generation-planning':
        return this.options.ports.shotGenerationPlanning;
      case 'media-generation':
        return this.options.ports.mediaGeneration;
      case 'asset-quality-gate':
        return this.options.ports.assetQualityGate;
    }
  }
}

function getInputArtifacts(
  state: MediaProductionWorkflowRunState,
  stageId: (typeof MEDIA_PRODUCTION_EARLY_STAGE_IDS)[number],
): readonly MediaProductionStageArtifactRef[] {
  const index = MEDIA_PRODUCTION_EARLY_STAGE_IDS.indexOf(stageId);
  if (index === 0) return [];
  const previousStageId = MEDIA_PRODUCTION_EARLY_STAGE_IDS[index - 1];
  const previousStage = state.stages.find((stage) => stage.stageId === previousStageId);
  if (
    !previousStage ||
    previousStage.status !== 'completed' ||
    previousStage.artifacts.length === 0
  ) {
    throw new Error(`Media production stage ${stageId} is missing validated input artifacts.`);
  }
  return previousStage.artifacts;
}

function createAbortError(stageId: MediaProductionStageId): Error {
  const error = new Error(`Media production stage ${stageId} was cancelled.`);
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
