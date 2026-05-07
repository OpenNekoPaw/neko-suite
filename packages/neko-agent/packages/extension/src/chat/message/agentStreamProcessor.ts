/**
 * Agent Stream Processor
 *
 * Bridges agent stream runtime contracts to VSCode webview and platform media
 * delivery effects. Runtime owns projection state and subscription lifecycle.
 */

import * as vscode from 'vscode';
import type { MediaTask, Platform } from '@neko/platform';
import { observeMediaTaskProgress } from '@neko/platform';
import { toStableGeneratedAssetUri as toPlatformStableGeneratedAssetUri } from '@neko/platform/media';
import { createMediaTaskProgressView } from '@neko/platform/media/media-task-view';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import {
  AgentEventStreamRuntimeProcessor,
  persistAgentStreamBackgroundTaskResultUrls,
  type BackfillSink,
  type AgentStreamBackgroundTaskObservedProgress,
  type CollectedToolCall,
  type IPerceptionPipeline,
} from '@neko/agent/runtime';
import type { AgentEvent } from '@neko/agent';
import type { GeneratedAsset, ToolResultBackfillPayload } from '@neko/shared';
import { type AgentPhase, type ContentBlock } from '@neko-agent/types';
import type { ConversationBridge } from '../conversationBridge';
import type { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';
import { MediaTaskDeliveryHost } from '../../services/mediaTaskDeliveryHost';
import { getLogger } from '../../base';

const logger = getLogger('AgentStreamProcessor');

/**
 * Stream processing result
 */
export interface StreamProcessingResult {
  accumulatedResponse: string;
  accumulatedThinking: string;
  hasError: boolean;
  collectedToolCalls: readonly CollectedToolCall[];
  contentBlocks: readonly ContentBlock[];
}

/**
 * Callbacks for stream events
 */
export interface StreamCallbacks {
  onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
}

/**
 * Dependencies for AgentStreamProcessor
 */
export interface AgentStreamProcessorDeps {
  platform?: Platform;
  conversations?: ConversationBridge;
  /** Asset index for registering generated assets (ADR-4) */
  assetIndex?: GeneratedAssetIndex;
  /**
   * Optional transcoder for converting incompatible media formats.
   * Called when a downloaded file uses a codec not supported by Electron webview
   * (e.g. raw Opus audio, HEVC video).
   * Returns true on success; on failure the original file is kept.
   */
  transcodeFile?: (
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ) => Promise<boolean>;
  /** VSCode-only media delivery host adapter. */
  mediaDeliveryHost?: MediaTaskDeliveryHost;
  /** Optional runtime perception/backfill adapter for completed media tasks. */
  mediaBackfill?: {
    readonly perceptionPipeline?: IPerceptionPipeline;
    readonly backfillSink?: BackfillSink;
  };
}

/**
 * Processor for agent event streams
 */
export class AgentStreamProcessor {
  private readonly mediaDeliveryHost: MediaTaskDeliveryHost;
  private readonly streamRuntime = new AgentEventStreamRuntimeProcessor<
    MediaTask,
    MediaTaskProgressDeliveryPlan
  >();

  constructor(private deps: AgentStreamProcessorDeps) {
    this.mediaDeliveryHost =
      deps.mediaDeliveryHost ??
      new MediaTaskDeliveryHost({
        platform: deps.platform,
        assetIndex: deps.assetIndex,
        transcodeFile: deps.transcodeFile,
      });
  }

  /**
   * Process an agent event stream and dispatch to webview
   */
  async processStream(
    webview: vscode.Webview,
    conversationId: string,
    events: AsyncIterable<AgentEvent>,
    callbacks: StreamCallbacks,
  ): Promise<StreamProcessingResult> {
    const media = this.deps.platform?.media;

    return this.streamRuntime.process({
      conversationId,
      events,
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      onPhaseChange: callbacks.onPhaseChange,
      backgroundTasks: {
        ...(media
          ? {
              observeProgress: (input) =>
                observeMediaTaskProgress<
                  AgentStreamBackgroundTaskObservedProgress<MediaTaskProgressDeliveryPlan>
                >({
                  media,
                  taskId: input.taskId,
                  conversationId: input.conversationId,
                  unsubscribeOnIgnoredConversation: input.unsubscribeOnIgnoredConversation,
                  createFallbackTaskView: (task) => input.createFallbackTaskView(task),
                  createTaskView: (task) => input.createTaskView(task),
                  onIgnoredConversationTask: ({ taskId, conversationId, mediaTask }) => {
                    input.onIgnoredConversationTask?.({
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
                    input.onProgressDeliveryError?.({
                      taskId,
                      conversationId,
                      sourceTask: mediaTask,
                      error,
                      ...(fallbackTask ? { fallbackTask } : {}),
                    });
                  },
                  onTaskProgress: ({ conversationId, task, mediaTask }) =>
                    input.onTaskProgress({
                      conversationId,
                      task,
                      sourceTask: mediaTask,
                    }),
                }),
            }
          : {}),
        createFallbackProgress: (task) => createMediaTaskProgressView({ task }),
        createProgressDelivery: async (task, context) => {
          const delivery = await this.mediaDeliveryHost.createProgressViewDelivery(
            webview,
            task,
            context.taskType,
          );
          if (
            context.toolCallId &&
            delivery.deliveryPlan.generatedAssets.length > 0 &&
            delivery.deliveryPlan.shouldPersistResultUrls
          ) {
            await this.applyCompletedMediaTaskBackfill({
              toolCallId: context.toolCallId,
              taskId: context.taskId,
              assets: delivery.deliveryPlan.generatedAssets,
            });
          }
          return {
            progress: delivery.view,
            deliveryPlan: delivery.deliveryPlan,
            ...(delivery.deliveryPlan.shouldPersistResultUrls
              ? { persistResultUrls: delivery.deliveryPlan.resultUrls }
              : {}),
          };
        },
        shouldForgetSubscriptionAfterProgressDelivery: (progress) =>
          Boolean(progress.deliveryPlan?.shouldUnsubscribe),
        shouldForgetSubscriptionAfterProgressError: (event) =>
          Boolean(event.fallbackTask?.deliveryPlan?.shouldUnsubscribe),
        onIgnoredConversationTask: ({ taskId }) => {
          logger.warn('Ignoring background task progress for a different conversation', {
            taskId,
            conversationId,
          });
        },
        onProgressDeliveryError: ({ taskId, error }) => {
          logger.warn('Failed to deliver media task progress', { taskId, error });
        },
        persistResultUrls: ({ conversationId, taskId, urls }) => {
          this.updateToolResultWithUrls(conversationId, taskId, [...urls]);
        },
      },
    });
  }

  /**
   * Update tool result with final URLs for persistence
   */
  updateToolResultWithUrls(conversationId: string, taskId: string, urls: string[]): void {
    if (!this.deps.conversations) return;

    persistAgentStreamBackgroundTaskResultUrls({
      conversationId,
      taskId,
      urls,
      getMessages: (id) => this.deps.conversations?.get(id)?.messages,
      updateMessages: (id, messages) =>
        this.deps.conversations?.updateMessagesForConversation(id, messages),
      onError: (error) => logger.error('Failed to update tool result with URLs:', error),
    });
  }

  private async applyCompletedMediaTaskBackfill(input: {
    readonly toolCallId: string;
    readonly taskId: string;
    readonly assets: readonly GeneratedAsset[];
  }): Promise<void> {
    const sink = this.deps.mediaBackfill?.backfillSink;
    const pipeline = this.deps.mediaBackfill?.perceptionPipeline;
    if (!sink && !pipeline) {
      return;
    }

    const assetRefs = input.assets.map((asset) => toPerceptualAssetRef(asset));
    const payload: ToolResultBackfillPayload = {
      toolCallId: input.toolCallId,
      timestamp: Date.now(),
      dataPatch: {
        status: 'completed',
        taskId: input.taskId,
        resultAssetRefs: assetRefs,
        ...(assetRefs[0] ? { thumbnailAssetRef: assetRefs[0] } : {}),
      },
      attachments: input.assets.map((asset) => ({
        type: toAttachmentType(asset),
        path: assetRefs.find((ref) => ref.assetId === asset.id)?.uri ?? asset.path,
        mimeType: asset.mimeType,
        assetRef: toPerceptualAssetRef(asset),
      })),
    };

    await sink?.applyBackfill(payload);

    if (!pipeline) {
      return;
    }

    for (const asset of input.assets) {
      await pipeline.perceive({
        asset: { assetId: asset.id, ref: toPerceptualAssetRef(asset) },
        sourceToolCallId: input.toolCallId,
        policy: {
          timing: 'on-completion',
          layers: [0],
          reason: 'completed media task output',
        },
      });
    }
  }

  clearConversation(conversationId: string): void {
    this.streamRuntime.clearConversation(conversationId);
  }

  dispose(): void {
    this.streamRuntime.dispose();
  }
}

function toPerceptualAssetRef(asset: GeneratedAsset): import('@neko/shared').PerceptualAssetRef {
  if (asset.assetRef) {
    return asset.assetRef;
  }

  return {
    assetId: asset.id,
    uri: toStableGeneratedAssetUri(asset),
    mimeType: asset.mimeType,
  };
}

function toStableGeneratedAssetUri(asset: GeneratedAsset): string {
  return toPlatformStableGeneratedAssetUri(asset.path);
}

function toAttachmentType(asset: GeneratedAsset): 'image' | 'video' | 'audio' {
  switch (asset.type) {
    case 'generated-video':
      return 'video';
    case 'generated-audio':
      return 'audio';
    case 'generated-storyboard':
    case 'generated-image':
      return 'image';
  }
}
