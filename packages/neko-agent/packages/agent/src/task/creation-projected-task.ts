import type { SerializableTask, TaskLifecycleMetadata } from '@neko/shared';

export interface CreationProjectedTaskArtifactBinding {
  readonly kind: 'task';
  readonly artifactId: string;
  readonly path: string;
  readonly updatedAt: number;
}

export interface CreationProjectedTaskBinding {
  readonly source: 'creation';
  readonly conversationId: string;
  readonly runId: string;
  readonly runStartedAt?: number;
  readonly checklistId: string;
  readonly itemId: string;
  readonly artifact?: CreationProjectedTaskArtifactBinding;
}

export interface CreationProjectedTaskPayload extends Record<string, unknown> {
  readonly source: CreationProjectedTaskBinding['source'];
  readonly name: string;
  readonly legacyTrace: CreationProjectedTaskLegacyTrace;
  readonly checklistId: string;
  readonly itemId: string;
  readonly activeForm?: string;
  readonly artifact?: CreationProjectedTaskArtifactBinding;
}

export interface CreationProjectedTaskLegacyTrace {
  readonly runId: string;
  readonly runStartedAt?: number;
}

export interface CreationProjectedTaskUpsertInput {
  readonly id: string;
  readonly status: SerializableTask['status'];
  readonly progress: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly content: string;
  readonly activeForm?: string;
  readonly error?: string;
  readonly binding: CreationProjectedTaskBinding;
}

export interface CreationProjectedTaskRunBinding {
  readonly runId: string;
  readonly runStartedAt?: number;
}

export function toSerializableCreationProjectedTask(
  input: CreationProjectedTaskUpsertInput,
): SerializableTask {
  const lifecycle = toCreationProjectedTaskLifecycle(input.binding);
  return {
    id: input.id,
    type: 'workflow',
    status: input.status,
    input: {
      type: 'workflow',
      payload: toCreationProjectedTaskPayload(input),
      lifecycle,
    },
    lifecycle,
    ...(input.error ? { error: input.error } : {}),
    progress: input.progress,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function toCreationProjectedTaskLifecycle(
  binding: CreationProjectedTaskBinding,
): TaskLifecycleMetadata {
  return {
    ownerConversationId: binding.conversationId,
    ownerRunId: binding.runId,
    ...(binding.runStartedAt !== undefined ? { ownerRunStartedAt: binding.runStartedAt } : {}),
    runMode: 'background',
    costPhase: 'idle',
    interruptPolicy: 'detach-and-continue',
    recoverPolicy: 'snapshot-only',
  };
}

export function toCreationProjectedTaskPayload(
  input: CreationProjectedTaskUpsertInput,
): CreationProjectedTaskPayload {
  return {
    source: input.binding.source,
    name: input.content,
    legacyTrace: {
      runId: input.binding.runId,
      ...(input.binding.runStartedAt !== undefined
        ? { runStartedAt: input.binding.runStartedAt }
        : {}),
    },
    checklistId: input.binding.checklistId,
    itemId: input.binding.itemId,
    ...(input.activeForm ? { activeForm: input.activeForm } : {}),
    ...(input.binding.artifact ? { artifact: input.binding.artifact } : {}),
  };
}

export function isCreationProjectedTaskPayload(
  value: unknown,
): value is CreationProjectedTaskPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const artifact = candidate['artifact'];
  const legacyTrace = candidate['legacyTrace'];

  return (
    candidate['source'] === 'creation' &&
    typeof candidate['name'] === 'string' &&
    !Object.prototype.hasOwnProperty.call(candidate, 'content') &&
    !Object.prototype.hasOwnProperty.call(candidate, 'runId') &&
    !Object.prototype.hasOwnProperty.call(candidate, 'runStartedAt') &&
    isCreationProjectedTaskLegacyTrace(legacyTrace) &&
    typeof candidate['checklistId'] === 'string' &&
    typeof candidate['itemId'] === 'string' &&
    (candidate['activeForm'] === undefined || typeof candidate['activeForm'] === 'string') &&
    (artifact === undefined || isCreationProjectedTaskArtifactBinding(artifact))
  );
}

export function getCreationProjectedTaskRunBinding(
  task: Pick<SerializableTask, 'type' | 'input'>,
): CreationProjectedTaskRunBinding | null {
  if (task.type !== 'workflow' || !isCreationProjectedTaskPayload(task.input.payload)) {
    return null;
  }

  return {
    runId: task.input.payload.legacyTrace.runId,
    ...(task.input.payload.legacyTrace.runStartedAt !== undefined
      ? { runStartedAt: task.input.payload.legacyTrace.runStartedAt }
      : {}),
  };
}

export function getCreationProjectedTaskRunId(
  task: Pick<SerializableTask, 'type' | 'input'>,
): string | null {
  return getCreationProjectedTaskRunBinding(task)?.runId ?? null;
}

function isCreationProjectedTaskArtifactBinding(
  value: unknown,
): value is CreationProjectedTaskArtifactBinding {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate['kind'] === 'task' &&
    typeof candidate['artifactId'] === 'string' &&
    typeof candidate['path'] === 'string' &&
    typeof candidate['updatedAt'] === 'number'
  );
}

function isCreationProjectedTaskLegacyTrace(
  value: unknown,
): value is CreationProjectedTaskLegacyTrace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['runId'] === 'string' &&
    (candidate['runStartedAt'] === undefined || typeof candidate['runStartedAt'] === 'number')
  );
}
