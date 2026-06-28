import * as vscode from 'vscode';
import {
  DASHBOARD_TASK_CONTRACT_VERSION,
  type DashboardTask,
  type DashboardTaskEvent,
  type DashboardTaskRef,
  type DashboardTaskSource,
} from '@neko/shared/types/dashboard-task';
import {
  type AgentTurnTimelineMessage,
  isTaskWorkItem,
  type AgentWorkItem,
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
import { AgentTaskProjectionSource } from './taskProjectionSource';

const SOURCE_ID = 'neko-agent';
const SOURCE_NAME = 'Neko Agent';

type MirroredWorkItemMessage =
  | AgentTurnTimelineMessage
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
  private readonly projection = new AgentTaskProjectionSource({
    host: {
      get workspaceFolders() {
        return vscode.workspace.workspaceFolders;
      },
    },
  });
  readonly projectionSource = {
    getSnapshot: async (): Promise<DashboardTask[]> => this.getProjectionSnapshot(),
  };
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
      case 'agentTurnTimeline':
        this.upsertTimelineWorkItems(message);
        return;
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
    return this.getProjectionSnapshot();
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
          task: this.projection.toDashboardTask(item),
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

  private upsertTimelineWorkItems(message: AgentTurnTimelineMessage): void {
    for (const event of message.events) {
      if (event.kind !== 'task' && event.kind !== 'media') {
        continue;
      }
      this.upsertWorkItem(message.conversationId, event.payload.workItem);
    }
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
      task: this.projection.toDashboardTask(item),
    });
  }

  private emitUpsert(item: AgentWorkItem, previous?: AgentWorkItem): void {
    this.emitter.fire({
      type: previous ? 'updated' : 'added',
      task: this.projection.toDashboardTask(item),
    });
  }

  private toTasks(): DashboardTask[] {
    return this.getProjectionSnapshot();
  }

  private getProjectionSnapshot(): DashboardTask[] {
    return this.projection.getSnapshot(this.iterWorkItems());
  }

  private *iterWorkItems(): Iterable<AgentWorkItem> {
    for (const conversationItems of this.workItemsByConversation.values()) {
      yield* conversationItems.values();
    }
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

function isMirroredWorkItemMessage(message: unknown): message is MirroredWorkItemMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  return (
    message.type === 'tasksUpdated' ||
    message.type === 'agentTurnTimeline' ||
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

function assertNever(value: never): never {
  throw new Error(`Unhandled work item message: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
