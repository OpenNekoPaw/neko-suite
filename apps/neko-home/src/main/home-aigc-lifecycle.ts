import {
  validateDurableResourceRef,
  type ArtifactValidationResult,
  type CompositeArtifact,
  type ResourceRef,
  type Task,
} from '@neko/shared';
import type { CreativeAiRunSnapshot } from '@neko/shared/types/creative-ai-invocation';

export interface HomeAigcGeneratedOutput {
  readonly outputId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly resourceRef: ResourceRef;
  readonly artifact: CompositeArtifact;
  readonly validation: ArtifactValidationResult;
}

export interface HomeAigcCreationObservation {
  readonly task: Task;
  readonly run: CreativeAiRunSnapshot;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly diagnostics: readonly string[];
  readonly outputs: readonly HomeAigcGeneratedOutput[];
}

export interface HomeAigcCreationProjection {
  readonly taskId: string;
  readonly taskRunId: string;
  readonly creationRunId: string;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly status: Task['status'];
  readonly progress: number;
  readonly diagnostics: readonly string[];
  readonly outputs: readonly HomeAigcGeneratedOutput[];
  readonly actions: readonly ('cancel' | 'retry' | 'promote')[];
}

export interface HomeAigcLifecycleActionPorts {
  readonly cancelTask?: (task: Task) => Promise<void>;
  readonly retryTask?: (task: Task) => Promise<void>;
  readonly promoteOutput?: (output: HomeAigcGeneratedOutput) => Promise<void>;
}

export type HomeAigcLifecycleDiagnosticCode =
  | 'invalid-aigc-observation'
  | 'unknown-aigc-task'
  | 'unknown-aigc-output'
  | 'aigc-action-unavailable';

export class HomeAigcLifecycleDiagnostic extends Error {
  constructor(
    readonly code: HomeAigcLifecycleDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'HomeAigcLifecycleDiagnostic';
  }
}

export class HomeAigcLifecycleProjectionRuntime {
  private readonly observations = new Map<string, HomeAigcCreationObservation>();

  constructor(private readonly actions: HomeAigcLifecycleActionPorts = {}) {}

  observe(observation: HomeAigcCreationObservation): HomeAigcCreationProjection {
    validateObservation(observation);
    this.observations.set(observation.task.id, cloneObservation(observation));
    return projectObservation(observation, this.actions);
  }

  list(): readonly HomeAigcCreationProjection[] {
    return [...this.observations.values()].map((observation) =>
      projectObservation(observation, this.actions),
    );
  }

  async cancel(taskId: string): Promise<HomeAigcCreationProjection> {
    const observation = this.requireTask(taskId);
    if (!this.actions.cancelTask) {
      throw unavailable('cancel', taskId);
    }
    await this.actions.cancelTask(observation.task);
    return projectObservation(observation, this.actions);
  }

  async retry(taskId: string): Promise<HomeAigcCreationProjection> {
    const observation = this.requireTask(taskId);
    if (!this.actions.retryTask) {
      throw unavailable('retry', taskId);
    }
    await this.actions.retryTask(observation.task);
    return projectObservation(observation, this.actions);
  }

  async promote(taskId: string, outputId: string): Promise<HomeAigcCreationProjection> {
    const observation = this.requireTask(taskId);
    const output = observation.outputs.find((candidate) => candidate.outputId === outputId);
    if (!output) {
      throw new HomeAigcLifecycleDiagnostic(
        'unknown-aigc-output',
        `Home AIGC output does not exist: ${taskId}/${outputId}`,
      );
    }
    if (!output.validation.ok) {
      throw new HomeAigcLifecycleDiagnostic(
        'invalid-aigc-observation',
        `Home AIGC output cannot be promoted before validation passes: ${outputId}`,
      );
    }
    if (!this.actions.promoteOutput) {
      throw unavailable('promote', taskId);
    }
    await this.actions.promoteOutput(output);
    return projectObservation(observation, this.actions);
  }

  private requireTask(taskId: string): HomeAigcCreationObservation {
    const observation = this.observations.get(taskId);
    if (!observation) {
      throw new HomeAigcLifecycleDiagnostic(
        'unknown-aigc-task',
        `Home AIGC task does not exist: ${taskId}`,
      );
    }
    return observation;
  }
}

function validateObservation(observation: HomeAigcCreationObservation): void {
  if (!observation.capabilityId.trim() || !observation.providerId.trim()) {
    throw invalid('Home AIGC observation requires owning capability and provider identity.');
  }
  if (observation.run.runId !== observation.task.scope.runId) {
    throw invalid('Home AIGC Task and creative run identities do not match.');
  }
  for (const output of observation.outputs) {
    if (output.taskId !== observation.task.id || output.runId !== observation.run.runId) {
      throw invalid(`Home AIGC output identity does not match its Task/Run: ${output.outputId}`);
    }
    const durable = validateDurableResourceRef(output.resourceRef);
    if (!durable.ok) {
      throw invalid(`Home AIGC output requires a durable ResourceRef: ${output.outputId}`);
    }
    if (output.artifact.artifactId.trim().length === 0 || !output.artifact.provenance) {
      throw invalid(`Home AIGC output requires Artifact identity and provenance: ${output.outputId}`);
    }
  }
}

function projectObservation(
  observation: HomeAigcCreationObservation,
  actions: HomeAigcLifecycleActionPorts,
): HomeAigcCreationProjection {
  const available: HomeAigcCreationProjection['actions'][number][] = [];
  if (actions.cancelTask && (observation.task.status === 'pending' || observation.task.status === 'running')) {
    available.push('cancel');
  }
  if (actions.retryTask && (observation.task.status === 'failed' || observation.task.status === 'cancelled')) {
    available.push('retry');
  }
  if (actions.promoteOutput && observation.outputs.some((output) => output.validation.ok)) {
    available.push('promote');
  }
  return {
    taskId: observation.task.id,
    taskRunId: observation.task.scope.runId,
    creationRunId: observation.run.runId,
    capabilityId: observation.capabilityId,
    providerId: observation.providerId,
    status: observation.task.status,
    progress: observation.task.progress,
    diagnostics: [...observation.diagnostics],
    outputs: observation.outputs.map(cloneOutput),
    actions: available,
  };
}

function cloneObservation(observation: HomeAigcCreationObservation): HomeAigcCreationObservation {
  return {
    ...observation,
    task: { ...observation.task, scope: { ...observation.task.scope }, input: { ...observation.task.input } },
    run: { ...observation.run },
    diagnostics: [...observation.diagnostics],
    outputs: observation.outputs.map(cloneOutput),
  };
}

function cloneOutput(output: HomeAigcGeneratedOutput): HomeAigcGeneratedOutput {
  return {
    ...output,
    resourceRef: { ...output.resourceRef },
    artifact: { ...output.artifact },
    validation: { ...output.validation, diagnostics: [...output.validation.diagnostics] },
  };
}

function invalid(message: string): HomeAigcLifecycleDiagnostic {
  return new HomeAigcLifecycleDiagnostic('invalid-aigc-observation', message);
}

function unavailable(action: string, taskId: string): HomeAigcLifecycleDiagnostic {
  return new HomeAigcLifecycleDiagnostic(
    'aigc-action-unavailable',
    `Home AIGC ${action} action is unavailable for task ${taskId}.`,
  );
}
