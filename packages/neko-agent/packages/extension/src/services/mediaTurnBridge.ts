/**
 * Webview bridge for direct media turns.
 *
 * Platform owns media routing/execution. This bridge only connects that runtime
 * to VSCode Webview messages and the VSCode-only delivery host.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import { createMediaTaskView, runMediaTurn } from '@neko/platform';
import type { MediaModelCategory, ModelRef } from '@neko-agent/types';
import { runAgentMediaTurnForWebview } from '@neko/agent/runtime';
import { getLogger } from '../base';
import { MediaTaskDeliveryHost } from './mediaTaskDeliveryHost';

const logger = getLogger('MediaTurnBridge');

export interface MediaTurnBridgeDeps {
  platform?: Platform;
  mediaDeliveryHost: MediaTaskDeliveryHost;
}

export interface ExecuteMediaTurnForWebviewInput {
  webview: vscode.Webview;
  conversationId: string;
  prompt: string;
  mediaModel: ModelRef<MediaModelCategory>;
}

export class MediaTurnBridge {
  constructor(private readonly deps: MediaTurnBridgeDeps) {}

  async execute(input: ExecuteMediaTurnForWebviewInput): Promise<void> {
    const media = this.deps.platform?.media;

    await runAgentMediaTurnForWebview({
      conversationId: input.conversationId,
      prompt: input.prompt,
      mediaModel: input.mediaModel,
      postMessage: (message) => {
        void input.webview.postMessage(message);
      },
      ...(media
        ? {
            executeMediaTurn: (runtimeInput) =>
              runMediaTurn({
                media,
                prompt: runtimeInput.prompt,
                mediaModel: runtimeInput.mediaModel,
                conversationId: runtimeInput.conversationId,
                createTaskView: (task) =>
                  this.deps.mediaDeliveryHost.createTaskView(input.webview, task),
                createFallbackTaskView: (task) => createMediaTaskView(task),
                onTaskCreated: ({ conversationId, task, mediaTask }) =>
                  runtimeInput.onTaskCreated({
                    conversationId,
                    task,
                    sourceTask: mediaTask,
                  }),
                onTaskProgress: ({ conversationId, task, mediaTask }) =>
                  runtimeInput.onTaskProgress({
                    conversationId,
                    task,
                    sourceTask: mediaTask,
                  }),
                onIgnoredConversationTask: ({ taskId, conversationId, mediaTask }) => {
                  runtimeInput.onIgnoredConversationTask?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                  });
                },
                onAlreadyTerminalTask: ({ taskId, conversationId, mediaTask }) => {
                  runtimeInput.onAlreadyTerminalTask?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                  });
                },
                onProgressDeliveryError: ({
                  taskId,
                  conversationId,
                  mediaTask,
                  error,
                  fallbackTask,
                }) => {
                  runtimeInput.onProgressDeliveryError?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                    error,
                    ...(fallbackTask ? { fallbackTask } : {}),
                  });
                },
              }),
          }
        : {}),
      onIgnoredConversationTask: ({ taskId }) => {
        logger.warn('Ignoring media task progress for a different conversation', {
          taskId,
          conversationId: input.conversationId,
        });
      },
      onAlreadyTerminalTask: ({ taskId, sourceTask }) => {
        logger.info(`Media task ${taskId} already in terminal state`, {
          sourceTask,
        });
      },
      onProgressDeliveryError: ({ taskId, error }) => {
        logger.warn('Failed to deliver media task progress', { taskId, error });
      },
      onExecutionError: (error) => {
        logger.error('Media generation error:', error);
      },
    });
  }
}
