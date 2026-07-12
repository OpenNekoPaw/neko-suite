import {
  MEDIA_PRODUCTION_WORKFLOW_VERSION,
  validateMediaProductionWorkflowRun,
  type MediaProductionWorkflowRunState,
  type Task,
  type TaskInput,
  type TaskRunScope,
} from '@neko/shared';

export const MEDIA_PRODUCTION_WORKFLOW_PAYLOAD_KIND = 'media-production-workflow' as const;
export const MEDIA_PRODUCTION_WORKFLOW_STATE_OUTPUT_KEY = 'mediaProductionWorkflowState' as const;

export interface MediaProductionWorkflowTaskStatePort {
  get(scope: TaskRunScope): Promise<Task | undefined>;
  updateOutputData(scope: TaskRunScope, outputData: Record<string, unknown>): Promise<boolean>;
}

export function createMediaProductionWorkflowTaskInput(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly ownerConversationId?: string;
  readonly ownerRunId?: string;
  readonly ownerRunStartedAt?: number;
}): TaskInput {
  assertValidWorkflowState(input.state);
  return {
    type: 'workflow',
    payload: {
      kind: MEDIA_PRODUCTION_WORKFLOW_PAYLOAD_KIND,
      workflowVersion: MEDIA_PRODUCTION_WORKFLOW_VERSION,
      workflowRunId: input.state.workflowRunId,
      initialState: input.state,
    },
    lifecycle: {
      ...(input.ownerConversationId ? { ownerConversationId: input.ownerConversationId } : {}),
      ...(input.ownerRunId ? { ownerRunId: input.ownerRunId } : {}),
      ...(input.ownerRunStartedAt !== undefined
        ? { ownerRunStartedAt: input.ownerRunStartedAt }
        : {}),
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
  };
}

export function readMediaProductionWorkflowTaskState(
  task: Task,
): MediaProductionWorkflowRunState | undefined {
  if (
    task.type !== 'workflow' ||
    task.input.payload['kind'] !== MEDIA_PRODUCTION_WORKFLOW_PAYLOAD_KIND
  ) {
    return undefined;
  }
  const output = readRecord(task.output?.data);
  const candidate =
    output?.[MEDIA_PRODUCTION_WORKFLOW_STATE_OUTPUT_KEY] ?? task.input.payload['initialState'];
  if (!isMediaProductionWorkflowRunState(candidate)) {
    throw new Error(`Workflow task ${task.id} has invalid or missing media production state.`);
  }
  assertValidWorkflowState(candidate);
  if (candidate.workflowRunId !== task.input.payload['workflowRunId']) {
    throw new Error(`Workflow task ${task.id} state does not match its workflow run id.`);
  }
  return candidate;
}

export class TaskBackedMediaProductionWorkflowStateStore {
  constructor(private readonly tasks: MediaProductionWorkflowTaskStatePort) {}

  async load(scope: TaskRunScope): Promise<MediaProductionWorkflowRunState> {
    const task = await this.tasks.get(scope);
    if (!task) {
      throw new Error(
        `Media production workflow task ${scope.childRunId} was not found in ${scope.conversationId}/${scope.runId}.`,
      );
    }
    const state = readMediaProductionWorkflowTaskState(task);
    if (!state) {
      throw new Error(`Task ${scope.childRunId} is not a media production workflow task.`);
    }
    return state;
  }

  async save(scope: TaskRunScope, state: MediaProductionWorkflowRunState): Promise<void> {
    assertValidWorkflowState(state);
    const task = await this.tasks.get(scope);
    if (!task) {
      throw new Error(
        `Media production workflow task ${scope.childRunId} was not found in ${scope.conversationId}/${scope.runId}.`,
      );
    }
    const current = readMediaProductionWorkflowTaskState(task);
    if (!current) {
      throw new Error(`Task ${scope.childRunId} is not a media production workflow task.`);
    }
    if (current.workflowRunId !== state.workflowRunId) {
      throw new Error(
        `Workflow task ${scope.childRunId} cannot be rebound to another workflow run.`,
      );
    }
    const updated = await this.tasks.updateOutputData(scope, {
      [MEDIA_PRODUCTION_WORKFLOW_STATE_OUTPUT_KEY]: state,
    });
    if (!updated) {
      throw new Error(
        `Media production workflow task ${scope.childRunId} state was not persisted.`,
      );
    }
  }
}

function assertValidWorkflowState(state: MediaProductionWorkflowRunState): void {
  const validation = validateMediaProductionWorkflowRun(state);
  if (!validation.ok) {
    throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }
}

function isMediaProductionWorkflowRunState(
  value: unknown,
): value is MediaProductionWorkflowRunState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === MEDIA_PRODUCTION_WORKFLOW_VERSION &&
    typeof candidate['workflowRunId'] === 'string' &&
    typeof candidate['sourceProfileId'] === 'string' &&
    Array.isArray(candidate['stages'])
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}
