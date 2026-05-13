import * as path from 'path';
import * as vscode from 'vscode';
import {
  DASHBOARD_TASK_CONTRACT_VERSION,
  clampDashboardTaskProgress,
  normalizeDashboardLocalRef,
  toDashboardTaskId,
  type DashboardTask,
  type DashboardTaskAction,
  type DashboardTaskEvent,
  type DashboardTaskOutputRef,
  type DashboardTaskRef,
  type DashboardTaskSource,
} from '@neko/shared/types/dashboard-task';
import {
  isTaskWorkItem,
  type AgentWorkItem,
  type AgentWorkItemTaskStatus,
  type MediaTaskCreatedMessage,
  type MediaTaskProgressMessage,
  type SubAgentEventMessage,
  type TaskCreatedMessage,
  type TaskRemovedMessage,
  type TasksUpdatedMessage,
  type TaskUpdatedMessage,
  type TaskWorkItem,
} from '@neko-agent/types';
import type { Platform } from '@neko/platform';
import type { IRuntimeTaskManager } from '@neko/agent';

const SOURCE_ID = 'neko-agent';
const SOURCE_NAME = 'Neko Agent';

type MirroredWorkItemMessage =
  | TasksUpdatedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskRemovedMessage
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | SubAgentEventMessage;

export interface AgentDashboardWorkItemSourceDeps {
  readonly platform?: Platform;
  readonly taskManager?: IRuntimeTaskManager;
}

export class AgentDashboardWorkItemSource implements DashboardTaskSource, vscode.Disposable {
  readonly contractVersion = DASHBOARD_TASK_CONTRACT_VERSION;
  readonly source = SOURCE_ID;
  readonly sourceDisplayName = SOURCE_NAME;
  readonly capabilities = {
    cancel: true,
    retry: true,
    revealOutput: true,
  };

  private readonly emitter = new vscode.EventEmitter<DashboardTaskEvent>();
  private readonly workItemsByConversation = new Map<string, Map<string, AgentWorkItem>>();
  private deps: AgentDashboardWorkItemSourceDeps;

  constructor(deps: AgentDashboardWorkItemSourceDeps = {}) {
    this.deps = deps;
  }

  updateDeps(deps: AgentDashboardWorkItemSourceDeps): void {
    this.deps = deps;
  }

  acceptWebviewMessage(message: unknown): void {
    if (!isMirroredWorkItemMessage(message)) {
      return;
    }

    switch (message.type) {
      case 'tasksUpdated':
        this.replaceBackgroundTasks(message);
        return;
      case 'taskCreated':
      case 'taskUpdated':
      case 'mediaTaskCreated':
      case 'mediaTaskProgress':
        this.upsertWorkItem(message.conversationId, message.workItem);
        return;
      case 'subagentEvent':
        this.upsertWorkItem(message.conversationId, message.workItem);
        return;
      case 'taskRemoved':
        this.removeWorkItem(message.conversationId, message.taskId);
        return;
      default:
        assertNever(message);
    }
  }

  async getSnapshot(): Promise<DashboardTask[]> {
    return this.toTasks().sort((a, b) => b.startedAt - a.startedAt);
  }

  onDidChangeTask(listener: (event: DashboardTaskEvent) => void): vscode.Disposable {
    return this.emitter.event(listener);
  }

  async cancel(task: DashboardTaskRef): Promise<void> {
    const item = this.getWorkItem(task);
    if (!item || item.kind === 'subagent') {
      throw new Error(`Task cannot be cancelled: ${task.sourceTaskId}`);
    }

    if (item.kind === 'media-task') {
      if (!this.deps.platform?.media) {
        throw new Error('Agent media task service is unavailable.');
      }
      const cancelled = await this.deps.platform.media.cancelTask(item.id);
      if (cancelled === false) {
        throw new Error(`Media task was not cancelled: ${item.id}`);
      }
      return;
    }

    if (!this.deps.taskManager) {
      throw new Error('Agent task manager is unavailable.');
    }
    await this.deps.taskManager.cancel(item.id);
  }

  async retry(task: DashboardTaskRef): Promise<void> {
    const item = this.getWorkItem(task);
    if (!item || item.kind !== 'tool-background-task') {
      throw new Error(`Task cannot be retried: ${task.sourceTaskId}`);
    }
    if (!this.deps.taskManager) {
      throw new Error('Agent task manager is unavailable.');
    }

    const sourceTask = await this.deps.taskManager.get(item.id);
    if (!sourceTask) {
      throw new Error(`Task unavailable for retry: ${item.id}`);
    }

    await this.deps.taskManager.submit(sourceTask.input);
  }

  dispose(): void {
    this.workItemsByConversation.clear();
    this.emitter.dispose();
  }

  private replaceBackgroundTasks(message: TasksUpdatedMessage): void {
    const conversationItems = new Map(this.workItemsByConversation.get(message.conversationId));
    const incomingIds = new Set(message.workItems.map((item) => item.id));

    for (const [itemId, item] of conversationItems) {
      if (item.kind === 'tool-background-task' && !incomingIds.has(itemId)) {
        conversationItems.delete(itemId);
        this.emitter.fire({
          type: 'removed',
          task: toDashboardTask(item),
        });
      }
    }

    for (const item of message.workItems) {
      conversationItems.set(item.id, item);
      this.emitUpsert(item);
    }

    this.workItemsByConversation.set(message.conversationId, conversationItems);
  }

  private upsertWorkItem(conversationId: string, item: AgentWorkItem): void {
    const conversationItems = new Map(this.workItemsByConversation.get(conversationId));
    const existing = conversationItems.get(item.id);
    const merged = existing ? mergeWorkItem(existing, item) : item;
    conversationItems.set(item.id, merged);
    this.workItemsByConversation.set(conversationId, conversationItems);
    this.emitUpsert(merged, existing);
  }

  private removeWorkItem(conversationId: string, taskId: string): void {
    const conversationItems = this.workItemsByConversation.get(conversationId);
    const item = conversationItems?.get(taskId);
    if (!conversationItems || !item) {
      return;
    }

    conversationItems.delete(taskId);
    this.emitter.fire({
      type: 'removed',
      task: toDashboardTask(item),
    });
  }

  private emitUpsert(item: AgentWorkItem, previous?: AgentWorkItem): void {
    this.emitter.fire({
      type: previous ? 'updated' : 'added',
      task: toDashboardTask(item),
    });
  }

  private toTasks(): DashboardTask[] {
    const tasks: DashboardTask[] = [];
    for (const conversationItems of this.workItemsByConversation.values()) {
      for (const item of conversationItems.values()) {
        tasks.push(toDashboardTask(item));
      }
    }
    return tasks;
  }

  private getWorkItem(ref: DashboardTaskRef): AgentWorkItem | undefined {
    if (ref.source !== SOURCE_ID) {
      return undefined;
    }

    for (const conversationItems of this.workItemsByConversation.values()) {
      const item = conversationItems.get(ref.sourceTaskId);
      if (item) {
        return item;
      }
    }

    return undefined;
  }
}

function toDashboardTask(item: AgentWorkItem): DashboardTask {
  const sourceTaskId = item.id;
  const status = toDashboardStatus(item.status);
  const outputs = toOutputRefs(item);

  return {
    taskId: toDashboardTaskId({ source: SOURCE_ID, sourceTaskId }),
    source: SOURCE_ID,
    sourceDisplayName: SOURCE_NAME,
    sourceTaskId,
    kind: item.kind,
    title: item.title,
    status,
    progress: clampDashboardTaskProgress(item.progress),
    actions: toActions(item, status, outputs),
    startedAt: Date.parse(item.createdAt) || 0,
    ...(isTerminalStatus(status) ? { completedAt: Date.parse(item.updatedAt) || Date.now() } : {}),
    ...(outputs.length > 0 ? { outputs } : {}),
    ...(item.currentStepId ? { currentStep: item.currentStepId } : {}),
    ...(item.error ? { error: item.error } : {}),
    conversationId: item.conversationId,
    workItemKind: item.kind,
  };
}

function toDashboardStatus(status: AgentWorkItemTaskStatus): DashboardTask['status'] {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
  }
}

function toActions(
  item: AgentWorkItem,
  status: DashboardTask['status'],
  outputs: readonly DashboardTaskOutputRef[],
): DashboardTaskAction[] {
  const actions: DashboardTaskAction[] = [];
  if ((status === 'queued' || status === 'running') && item.kind !== 'subagent') {
    actions.push('cancel');
  }
  if (status === 'error' && item.kind === 'tool-background-task') {
    actions.push('retry');
  }
  if (outputs.some((output) => output.kind === 'file' || output.kind === 'folder')) {
    actions.push('reveal-output');
  }
  return actions;
}

function toOutputRefs(item: AgentWorkItem): DashboardTaskOutputRef[] {
  if (!isTaskWorkItem(item)) {
    return [];
  }

  const outputs: DashboardTaskOutputRef[] = [];
  for (const localPath of item.task.result?.localPaths ?? []) {
    const ref = toWorkspaceRelativeRef(localPath);
    if (ref) {
      outputs.push({ kind: 'file', ref, label: path.basename(ref) });
    }
  }

  for (const url of item.task.result?.urls ?? []) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      outputs.push({ kind: 'url', ref: url, label: 'Generated output' });
    }
  }

  for (const asset of item.task.result?.assets ?? []) {
    outputs.push({ kind: 'asset', ref: asset.id, label: asset.id });
  }

  return dedupeOutputs(outputs);
}

function toWorkspaceRelativeRef(localPath: string): string | undefined {
  if (!localPath) return undefined;
  if (!path.isAbsolute(localPath)) {
    return normalizeDashboardLocalRef(localPath);
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const relative = path.relative(folder.uri.fsPath, localPath);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return normalizeDashboardLocalRef(relative);
    }
  }

  return undefined;
}

function isTerminalStatus(status: DashboardTask['status']): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

function isMirroredWorkItemMessage(message: unknown): message is MirroredWorkItemMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  return (
    message.type === 'tasksUpdated' ||
    message.type === 'taskCreated' ||
    message.type === 'taskUpdated' ||
    message.type === 'taskRemoved' ||
    message.type === 'mediaTaskCreated' ||
    message.type === 'mediaTaskProgress' ||
    message.type === 'subagentEvent'
  );
}

function mergeWorkItem(existing: AgentWorkItem, incoming: AgentWorkItem): AgentWorkItem {
  if (existing.kind !== incoming.kind) {
    return incoming;
  }

  if (existing.kind === 'subagent' && incoming.kind === 'subagent') {
    return {
      ...existing,
      ...incoming,
      createdAt: existing.createdAt || incoming.createdAt,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      subAgent: { ...existing.subAgent, ...incoming.subAgent },
    };
  }

  if (isTaskWorkItem(existing) && isTaskWorkItem(incoming)) {
    return {
      ...existing,
      ...incoming,
      createdAt: existing.createdAt || incoming.createdAt,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      task: {
        ...existing.task,
        ...incoming.task,
        result: incoming.task.result ?? existing.task.result,
      },
      result: incoming.result ?? existing.result,
    };
  }

  return incoming;
}

function dedupeOutputs(outputs: DashboardTaskOutputRef[]): DashboardTaskOutputRef[] {
  const seen = new Set<string>();
  return outputs.filter((output) => {
    const key = `${output.kind}:${output.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled work item message: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
