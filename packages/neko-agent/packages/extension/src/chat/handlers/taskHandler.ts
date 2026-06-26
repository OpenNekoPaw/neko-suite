/**
 * Task Handler - Handles task-related webview messages
 *
 * Responsible for:
 * - Bridging task runtime messages to the webview
 * - Injecting task manager and media service adapters
 * - Executing VSCode-only open-file/open-external effects
 * - Re-generating webview URIs from local paths for session reload
 */

import * as vscode from 'vscode';
import {
  runCancelTaskRuntime,
  runRetryTaskRuntime,
  runSendTasksRuntime,
  runViewTaskResultRuntime,
  type TaskActionRejectPlan,
  type TaskResultOpenPlan,
  type TaskRuntimeDeps,
  type TaskRuntimeEffects,
  type TaskRuntimeMediaGateway,
  type TaskRuntimeMessage,
} from '@neko/agent';
import type { Platform } from '@neko/platform';
import {
  createMediaTaskActionCandidate,
  createMediaTaskView,
} from '@neko/platform/media/media-task-view';
import type { ITaskManager as TaskManager } from '@neko/shared';
import { getLogger } from '../../base';
import type { AgentDashboardWorkItemSource } from '../../services/dashboardWorkItemSource';
import type { AgentLocalResourceAccess } from '../../services/localResourceAccess';

const logger = getLogger('TaskHandler');

/**
 * Dependencies for TaskHandler
 */
export interface TaskHandlerDeps {
  platform?: Platform;
  taskManager?: TaskManager;
  dashboardWorkItems?: AgentDashboardWorkItemSource;
  localResourceAccess?: AgentLocalResourceAccess;
}

/**
 * Handler for task-related webview messages
 */
export class TaskHandler {
  constructor(private deps: TaskHandlerDeps) {}

  updateDeps(partial: Partial<TaskHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Send all tasks to webview
   */
  async sendTasks(webview: vscode.Webview, conversationId: string): Promise<void> {
    await this._runTaskRuntime(() =>
      runSendTasksRuntime(
        { conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle task cancellation
   */
  async handleCancelTask(
    webview: vscode.Webview,
    taskId: string,
    conversationId: string,
  ): Promise<void> {
    await this._runTaskRuntime(() =>
      runCancelTaskRuntime(
        { taskId, conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle task retry — re-submit the failed task with the same payload
   */
  async handleRetryTask(
    webview: vscode.Webview,
    taskId: string,
    conversationId: string,
  ): Promise<void> {
    await this._runTaskRuntime(() =>
      runRetryTaskRuntime(
        { taskId, conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle viewing task result
   */
  async handleViewTaskResult(taskId: string, conversationId: string): Promise<void> {
    await this._runTaskRuntime(() =>
      runViewTaskResultRuntime(
        { taskId, conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(),
      ),
    );
  }

  /**
   * Bridge runtime dependencies to extension-owned services.
   */
  private _createTaskRuntimeDeps(): TaskRuntimeDeps {
    const media = this._createTaskRuntimeMediaGateway();
    return {
      ...(this.deps.taskManager ? { taskManager: this.deps.taskManager } : {}),
      ...(media ? { media } : {}),
    };
  }

  private _createTaskRuntimeEffects(webview?: vscode.Webview): TaskRuntimeEffects {
    return {
      postMessage: async (message: TaskRuntimeMessage): Promise<void> => {
        this.deps.dashboardWorkItems?.acceptWebviewMessage(message);
        await webview?.postMessage(message);
      },
      openTaskResult: (plan: TaskResultOpenPlan) => this.executeOpenPlan(plan),
      onRejectedAction: ({ action, plan }) => this.logRejectedTaskAction(action, plan),
      onTaskRetried: ({ taskId, newTaskId }) => {
        logger.debug('Task retried', { originalTaskId: taskId, newTaskId });
      },
      onRetryFailed: ({ taskId, error }) => {
        logger.error('Failed to retry task', { taskId, error });
      },
      onMediaDeleteFailed: ({ taskId, error }) => {
        logger.debug('Ignoring media task delete failure during task cleanup', { taskId, error });
      },
    };
  }

  private _createTaskRuntimeMediaGateway(): TaskRuntimeMediaGateway | undefined {
    const media = this.deps.platform?.media;
    if (!media) return undefined;

    return {
      getCandidate: async (taskId) => createMediaTaskActionCandidate(await media.getTask(taskId)),
      cancelTask: async (taskId) => {
        await media.cancelTask(taskId);
        const updated = await media.getTask(taskId);
        return updated ? createMediaTaskView(updated) : undefined;
      },
      deleteTask: (taskId) => media.deleteTask(taskId),
    };
  }

  private async _runTaskRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Task runtime bridge failed', error);
    }
  }

  private toWebviewUri(webview: vscode.Webview, path: string): string | undefined {
    if (this.deps.localResourceAccess) {
      return this.deps.localResourceAccess.toWebviewUri(webview, path, 'neko-agent.task');
    }
    logger.warn('Local resource access service unavailable for task media projection', { path });
    return undefined;
  }

  private logRejectedTaskAction(action: string, plan: TaskActionRejectPlan): void {
    logger.warn(`Cannot ${action} task`, {
      taskId: plan.taskId,
      conversationId: plan.conversationId,
      taskConversationId: plan.taskConversationId,
      reason: plan.reason,
    });
  }

  private async executeOpenPlan(plan: TaskResultOpenPlan): Promise<void> {
    if (plan.kind === 'open-file') {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(plan.filePath));
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(plan.url));
  }
}
