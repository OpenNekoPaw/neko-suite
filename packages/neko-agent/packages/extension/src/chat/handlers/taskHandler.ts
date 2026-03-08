/**
 * Task Handler - Handles task-related webview messages
 *
 * Responsible for:
 * - Sending task lists to webview
 * - Task cancellation
 * - Task removal
 * - Viewing task results
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import type { ITaskManager as TaskManager, Task, TaskView } from '@neko/shared';

/**
 * Dependencies for TaskHandler
 */
export interface TaskHandlerDeps {
  platform?: Platform;
  taskManager?: TaskManager;
}

/**
 * Handler for task-related webview messages
 */
export class TaskHandler {
  constructor(private deps: TaskHandlerDeps) {}

  /**
   * Send all tasks to webview
   */
  async sendTasks(webview: vscode.Webview): Promise<void> {
    if (!this.deps.taskManager) {
      webview.postMessage({
        type: 'tasksUpdated',
        tasks: [],
      });
      return;
    }

    const tasks = await this.deps.taskManager.list();
    const taskViews = tasks.map(t => this.toTaskView(t));
    webview.postMessage({
      type: 'tasksUpdated',
      tasks: taskViews,
    });
  }

  /**
   * Handle task cancellation
   */
  async handleCancelTask(webview: vscode.Webview, taskId: string): Promise<void> {
    if (!this.deps.taskManager) return;
    await this.deps.taskManager.cancel(taskId);
    await this.sendTasks(webview);
  }

  /**
   * Handle task removal
   */
  async handleRemoveTask(webview: vscode.Webview, taskId: string): Promise<void> {
    // Delete from Platform's media task manager
    if (this.deps.platform) {
      await this.deps.platform.media.deleteTask(taskId);
    }

    // Notify webview
    webview.postMessage({
      type: 'taskRemoved',
      taskId,
    });
  }

  /**
   * Handle viewing task result
   */
  async handleViewTaskResult(taskId: string): Promise<void> {
    // First try Platform's media service (for media generation tasks)
    if (this.deps.platform) {
      const mediaTask = await this.deps.platform.media.getTask(taskId);
      if (mediaTask && mediaTask.outputs && mediaTask.outputs.length > 0) {
        const firstOutput = mediaTask.outputs[0];
        if (firstOutput?.url) {
          await this.openUrl(firstOutput.url);
          return;
        }
      }
    }

    // Fallback to extension's task manager
    if (!this.deps.taskManager) return;

    const task = await this.deps.taskManager.get(taskId);
    if (!task || !task.output?.data) return;

    // Check if output has URL information
    const data = task.output.data as Record<string, unknown>;
    const url = (data.urls as string[])?.[0] || (data.url as string);
    if (url) {
      await this.openUrl(url);
    }
  }

  /**
   * Handle clearing completed tasks
   */
  async handleClearCompletedTasks(webview: vscode.Webview): Promise<void> {
    if (!this.deps.taskManager) {
      await this.sendTasks(webview);
      return;
    }

    // Get all completed/failed/cancelled tasks
    const completedTasks = await this.deps.taskManager.list('completed');
    const failedTasks = await this.deps.taskManager.list('failed');
    const cancelledTasks = await this.deps.taskManager.list('cancelled');

    // Delete each completed task
    const tasksToDelete = [...completedTasks, ...failedTasks, ...cancelledTasks];
    for (const task of tasksToDelete) {
      await this.deps.taskManager.delete(task.id);
      // Also delete from platform media service if available
      if (this.deps.platform) {
        try {
          await this.deps.platform.media.deleteTask(task.id);
        } catch {
          // Ignore if task doesn't exist in media service
        }
      }
    }

    // Refresh task list
    await this.sendTasks(webview);
  }

  /**
   * Convert Task to TaskView for webview display
   */
  private toTaskView(task: Task): TaskView {
    const payload = task.input.payload as Record<string, unknown>;
    const prompt = payload?.prompt as string | undefined;

    // Generate display name from prompt (truncated) or fallback to task type
    let displayName: string;
    if (prompt && prompt.length > 0) {
      // Truncate prompt to 50 characters for display
      displayName = prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt;
    } else if (payload?.name && typeof payload.name === 'string') {
      displayName = payload.name;
    } else {
      // Format task type for display (e.g., "image_generation" -> "Image Generation")
      displayName = task.type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    return {
      id: task.id,
      type: task.type,
      name: displayName,
      prompt: prompt,
      providerId: payload?.providerId as string | undefined,
      providerName: payload?.providerName as string | undefined,
      status: task.status,
      progress: task.progress,
      createdAt: new Date(task.createdAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString(),
      result: task.output?.data,
      error: task.error,
    };
  }

  /**
   * Open URL in VSCode or browser
   */
  private async openUrl(url: string): Promise<void> {
    if (url.startsWith('file://') || url.startsWith('/')) {
      const filePath = url.replace('file://', '');
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    } else {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }
}
