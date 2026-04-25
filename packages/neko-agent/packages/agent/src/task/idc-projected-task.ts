import type { SerializableTask } from '@neko/shared';

export interface IdcProjectedTaskArtifactBinding {
  readonly kind: 'task';
  readonly artifactId: string;
  readonly path: string;
  readonly updatedAt: number;
}

export interface IdcProjectedTaskBinding {
  readonly source: 'idc';
  readonly runId: string;
  readonly runStartedAt?: number;
  readonly checklistId: string;
  readonly itemId: string;
  readonly artifact?: IdcProjectedTaskArtifactBinding;
}

export interface IdcProjectedTaskPayload extends Record<string, unknown> {
  readonly source: IdcProjectedTaskBinding['source'];
  readonly name: string;
  readonly content: string;
  readonly runId: string;
  readonly runStartedAt?: number;
  readonly checklistId: string;
  readonly itemId: string;
  readonly activeForm?: string;
  readonly artifact?: IdcProjectedTaskArtifactBinding;
}

export interface IdcProjectedTaskUpsertInput {
  readonly id: string;
  readonly status: SerializableTask['status'];
  readonly progress: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly content: string;
  readonly activeForm?: string;
  readonly error?: string;
  readonly binding: IdcProjectedTaskBinding;
}

export interface IdcProjectedTaskRunBinding {
  readonly runId: string;
  readonly runStartedAt?: number;
}

export function toSerializableIdcProjectedTask(
  input: IdcProjectedTaskUpsertInput,
): SerializableTask {
  return {
    id: input.id,
    type: 'workflow',
    status: input.status,
    input: {
      type: 'workflow',
      payload: toIdcProjectedTaskPayload(input),
    },
    ...(input.error ? { error: input.error } : {}),
    progress: input.progress,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function toIdcProjectedTaskPayload(
  input: IdcProjectedTaskUpsertInput,
): IdcProjectedTaskPayload {
  return {
    source: input.binding.source,
    name: input.content,
    content: input.content,
    runId: input.binding.runId,
    ...(input.binding.runStartedAt !== undefined
      ? { runStartedAt: input.binding.runStartedAt }
      : {}),
    checklistId: input.binding.checklistId,
    itemId: input.binding.itemId,
    ...(input.activeForm ? { activeForm: input.activeForm } : {}),
    ...(input.binding.artifact ? { artifact: input.binding.artifact } : {}),
  };
}

export function isIdcProjectedTaskPayload(value: unknown): value is IdcProjectedTaskPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const artifact = candidate['artifact'];

  return (
    candidate['source'] === 'idc' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['content'] === 'string' &&
    typeof candidate['runId'] === 'string' &&
    (candidate['runStartedAt'] === undefined || typeof candidate['runStartedAt'] === 'number') &&
    typeof candidate['checklistId'] === 'string' &&
    typeof candidate['itemId'] === 'string' &&
    (candidate['activeForm'] === undefined || typeof candidate['activeForm'] === 'string') &&
    (artifact === undefined || isIdcProjectedTaskArtifactBinding(artifact))
  );
}

export function getIdcProjectedTaskRunBinding(
  task: Pick<SerializableTask, 'type' | 'input'>,
): IdcProjectedTaskRunBinding | null {
  if (task.type !== 'workflow' || !isIdcProjectedTaskPayload(task.input.payload)) {
    return null;
  }

  return {
    runId: task.input.payload.runId,
    ...(task.input.payload.runStartedAt !== undefined
      ? { runStartedAt: task.input.payload.runStartedAt }
      : {}),
  };
}

export function getIdcProjectedTaskRunId(
  task: Pick<SerializableTask, 'type' | 'input'>,
): string | null {
  return getIdcProjectedTaskRunBinding(task)?.runId ?? null;
}

function isIdcProjectedTaskArtifactBinding(
  value: unknown,
): value is IdcProjectedTaskArtifactBinding {
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
