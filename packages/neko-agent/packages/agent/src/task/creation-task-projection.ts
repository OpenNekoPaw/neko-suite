import type { Task as IdcTask, TaskStatus as IdcTaskStatus } from '@neko-agent/types';
import type { SerializableTask } from '@neko/shared';
import type {
  CreationProjectedTaskArtifactBinding,
  CreationProjectedTaskUpsertInput,
} from './creation-projected-task';
import type { ICreationProjectedTaskStore } from './task-manager';

export interface ICreationTaskProjectionStore extends ICreationProjectedTaskStore {
  delete(id: string): Promise<boolean>;
}

export interface ICreationTaskProjection {
  syncTask(input: {
    conversationId: string;
    runId: string;
    runStartedAt?: number;
    task: IdcTask;
    artifact?: CreationProjectedTaskArtifactBinding;
  }): Promise<readonly string[]>;
  clearRun(runId: string, runStartedAt?: number): Promise<void>;
}

export interface CreationTaskProjectionConfig {
  readonly store: ICreationTaskProjectionStore;
}

class TaskManagerCreationTaskProjection implements ICreationTaskProjection {
  private readonly _store: ICreationTaskProjectionStore;
  private readonly _projectedIdsByRun = new Map<string, Set<string>>();

  constructor(config: CreationTaskProjectionConfig) {
    this._store = config.store;
  }

  async syncTask(input: {
    conversationId: string;
    runId: string;
    runStartedAt?: number;
    task: IdcTask;
    artifact?: CreationProjectedTaskArtifactBinding;
  }): Promise<readonly string[]> {
    const runKey = createProjectionRunKey(input.runId, input.runStartedAt);
    const nextIds = new Set<string>();

    for (const item of input.task.items) {
      const projected = toProjectedTask(
        input.conversationId,
        input.runId,
        input.runStartedAt,
        input.task,
        item,
        input.artifact,
      );
      nextIds.add(projected.id);
      await this._store.upsertCreationProjectedTask(projected);
    }

    const previousIds = this._projectedIdsByRun.get(runKey) ?? new Set<string>();
    for (const staleId of previousIds) {
      if (!nextIds.has(staleId)) {
        await this._store.delete(staleId);
      }
    }

    this._projectedIdsByRun.set(runKey, nextIds);
    return [...nextIds];
  }

  async clearRun(runId: string, runStartedAt?: number): Promise<void> {
    await this._store.clearCreationProjectedTasksForRun(runId, runStartedAt);
    this._projectedIdsByRun.delete(createProjectionRunKey(runId, runStartedAt));
  }
}

export function createTaskManagerCreationTaskProjection(
  config: CreationTaskProjectionConfig,
): ICreationTaskProjection {
  return new TaskManagerCreationTaskProjection(config);
}

function toProjectedTask(
  conversationId: string,
  runId: string,
  runStartedAt: number | undefined,
  task: IdcTask,
  item: IdcTask['items'][number],
  artifact?: CreationProjectedTaskArtifactBinding,
): CreationProjectedTaskUpsertInput {
  return {
    id: createProjectedTaskId(runId, item.id),
    status: toProjectedTaskStatus(item.status),
    binding: {
      source: 'creation',
      conversationId,
      runId,
      ...(runStartedAt !== undefined ? { runStartedAt } : {}),
      checklistId: task.id,
      itemId: item.id,
      ...(artifact ? { artifact } : {}),
    },
    content: item.content,
    ...(item.activeForm ? { activeForm: item.activeForm } : {}),
    ...(item.error ? { error: item.error } : {}),
    progress: toProjectedTaskProgress(item.status),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function createProjectedTaskId(runId: string, itemId: string): string {
  return `creation:${runId}:${itemId}`;
}

function createProjectionRunKey(runId: string, runStartedAt?: number): string {
  return runStartedAt === undefined ? runId : `${runId}@${runStartedAt}`;
}

function toProjectedTaskStatus(status: IdcTaskStatus): SerializableTask['status'] {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
  }
}

function toProjectedTaskProgress(status: IdcTaskStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'in_progress':
      return 50;
    case 'completed':
    case 'failed':
      return 100;
  }
}
