import type { Task as IdcTask, TaskStatus as IdcTaskStatus } from '@neko-agent/types';
import {
  formatRunScope,
  type ConversationRunScope,
  type SerializableTask,
  type TaskRunScope,
} from '@neko/shared';
import type {
  CreationProjectedTaskArtifactBinding,
  CreationProjectedTaskUpsertInput,
} from './creation-projected-task';
import type { ICreationProjectedTaskStore } from './task-manager';

export interface ICreationTaskProjectionStore extends ICreationProjectedTaskStore {
  delete(scope: TaskRunScope): Promise<boolean>;
}

export interface ICreationTaskProjection {
  syncTask(input: {
    conversationId: string;
    runId: string;
    runStartedAt?: number;
    task: IdcTask;
    artifact?: CreationProjectedTaskArtifactBinding;
  }): Promise<readonly string[]>;
  clearRun(scope: ConversationRunScope, runStartedAt?: number): Promise<void>;
}

export interface CreationTaskProjectionConfig {
  readonly store: ICreationTaskProjectionStore;
}

class TaskManagerCreationTaskProjection implements ICreationTaskProjection {
  private readonly _store: ICreationTaskProjectionStore;
  private readonly _projectedScopesByRun = new Map<string, Map<string, TaskRunScope>>();

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
    const owner = { conversationId: input.conversationId, runId: input.runId };
    const runKey = createProjectionRunKey(owner, input.runStartedAt);
    const nextScopes = new Map<string, TaskRunScope>();

    for (const item of input.task.items) {
      const projected = toProjectedTask(
        input.conversationId,
        input.runId,
        input.runStartedAt,
        input.task,
        item,
        input.artifact,
      );
      nextScopes.set(projected.id, {
        ...owner,
        parentRunId: input.runId,
        childRunId: projected.id,
        childKind: 'task',
      });
      await this._store.upsertCreationProjectedTask(projected);
    }

    const previousScopes =
      this._projectedScopesByRun.get(runKey) ?? new Map<string, TaskRunScope>();
    for (const [staleId, staleScope] of previousScopes) {
      if (!nextScopes.has(staleId)) {
        await this._store.delete(staleScope);
      }
    }

    this._projectedScopesByRun.set(runKey, nextScopes);
    return [...nextScopes.keys()];
  }

  async clearRun(scope: ConversationRunScope, runStartedAt?: number): Promise<void> {
    await this._store.clearCreationProjectedTasksForRun(scope, runStartedAt);
    this._projectedScopesByRun.delete(createProjectionRunKey(scope, runStartedAt));
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

function createProjectionRunKey(scope: ConversationRunScope, runStartedAt?: number): string {
  const runKey = formatRunScope(scope);
  return runStartedAt === undefined ? runKey : `${runKey}@${runStartedAt}`;
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
