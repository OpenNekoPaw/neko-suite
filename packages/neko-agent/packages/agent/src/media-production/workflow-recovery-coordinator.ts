import {
  cancelMediaProductionWorkflow,
  resumeMediaProductionWorkflow,
  validateMediaProductionWorkflowRun,
  type MediaProductionInterruptedStageRecovery,
  type MediaProductionStageArtifactRef,
  type MediaProductionStageId,
  type MediaProductionStageState,
  type MediaProductionWorkflowDiagnostic,
  type MediaProductionWorkflowRunState,
  type MediaProductionWorkflowSourceRef,
} from '@neko/shared';
import type { MediaProductionWorkflowStateStorePort } from './early-stage-orchestrator';

export type MediaProductionWorkflowStableReference =
  | {
      readonly kind: 'source';
      readonly source: MediaProductionWorkflowSourceRef;
    }
  | {
      readonly kind: 'artifact';
      readonly stageId: MediaProductionStageId;
      readonly artifact: MediaProductionStageArtifactRef;
    };

export interface MediaProductionInterruptedStageRecoveryResult {
  readonly disposition: 'retry' | 'complete';
  readonly artifacts?: readonly MediaProductionStageArtifactRef[];
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}

export interface MediaProductionWorkflowRecoveryPort {
  validateStableReference(
    reference: MediaProductionWorkflowStableReference,
    signal?: AbortSignal,
  ): Promise<readonly MediaProductionWorkflowDiagnostic[]>;
  reconcileInterruptedStage(
    input: {
      readonly workflowRunId: string;
      readonly stage: MediaProductionStageState;
    },
    signal?: AbortSignal,
  ): Promise<MediaProductionInterruptedStageRecoveryResult>;
}

export interface MediaProductionWorkflowRecoveryCoordinatorOptions {
  readonly stateStore: MediaProductionWorkflowStateStorePort;
  readonly recovery: MediaProductionWorkflowRecoveryPort;
  readonly now?: () => string;
}

export class MediaProductionWorkflowRecoveryCoordinator {
  private readonly now: () => string;

  constructor(private readonly options: MediaProductionWorkflowRecoveryCoordinatorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async cancel(taskId: string): Promise<MediaProductionWorkflowRunState> {
    const state = await this.options.stateStore.load(taskId);
    const cancelled = cancelMediaProductionWorkflow({ state, cancelledAt: this.now() });
    await this.options.stateStore.save(taskId, cancelled);
    return cancelled;
  }

  async resume(taskId: string, signal?: AbortSignal): Promise<MediaProductionWorkflowRunState> {
    const state = await this.options.stateStore.load(taskId);
    const stateValidation = validateMediaProductionWorkflowRun(state);
    if (!stateValidation.ok) {
      throw new Error(formatResumeFailure(stateValidation.diagnostics));
    }
    if (signal?.aborted) throw createAbortError();
    if (state.status === 'completed') return state;
    if (state.status === 'failed' || state.status === 'blocked') {
      throw new Error(
        `resume-validation-failed: Workflow ${state.workflowRunId} requires explicit repair before resume.`,
      );
    }

    const references: MediaProductionWorkflowStableReference[] = [
      ...state.sourceRefs.map((source) => ({ kind: 'source' as const, source })),
      ...state.stages.flatMap((stage) =>
        stage.status === 'completed'
          ? stage.artifacts.map((artifact) => ({
              kind: 'artifact' as const,
              stageId: stage.stageId,
              artifact,
            }))
          : [],
      ),
    ];
    const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
    for (const reference of references) {
      if (signal?.aborted) throw createAbortError();
      diagnostics.push(...(await this.options.recovery.validateStableReference(reference, signal)));
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      throw new Error(formatResumeFailure(diagnostics));
    }

    const interrupted = state.stages.find(
      (stage) => stage.status === 'running' || stage.status === 'cancelled',
    );
    let interruptedStageRecovery: MediaProductionInterruptedStageRecovery | undefined;
    if (interrupted) {
      const recovery = await this.options.recovery.reconcileInterruptedStage(
        { workflowRunId: state.workflowRunId, stage: interrupted },
        signal,
      );
      if (recovery.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        throw new Error(formatResumeFailure(recovery.diagnostics));
      }
      if (recovery.disposition === 'retry') {
        interruptedStageRecovery = { disposition: 'retry', stageId: interrupted.stageId };
      } else {
        const artifacts = recovery.artifacts ?? [];
        for (const artifact of artifacts) {
          diagnostics.push(
            ...(await this.options.recovery.validateStableReference(
              { kind: 'artifact', stageId: interrupted.stageId, artifact },
              signal,
            )),
          );
        }
        if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
          throw new Error(formatResumeFailure(diagnostics));
        }
        interruptedStageRecovery = {
          disposition: 'complete',
          stageId: interrupted.stageId,
          completedAt: this.now(),
          artifacts,
          diagnostics: recovery.diagnostics,
        };
      }
    }

    const resumed = resumeMediaProductionWorkflow({
      state,
      resumedAt: this.now(),
      ...(interruptedStageRecovery ? { interruptedStageRecovery } : {}),
    });
    await this.options.stateStore.save(taskId, resumed);
    return resumed;
  }
}

function formatResumeFailure(diagnostics: readonly MediaProductionWorkflowDiagnostic[]): string {
  const messages = diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.message);
  return `resume-validation-failed: ${messages.join(' ')}`;
}

function createAbortError(): Error {
  const error = new Error('Media production workflow recovery was cancelled.');
  error.name = 'AbortError';
  return error;
}
