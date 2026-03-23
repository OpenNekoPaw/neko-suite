/**
 * Agent Stream Processor
 *
 * Handles processing of agent event streams, including:
 * - thinking/text/tool_call/tool_result event dispatch
 * - Content block tracking for sequential rendering
 * - Background task progress subscription
 * - Media file local save and URL persistence
 *
 * Extracted from MessageHandler._executeWithAgent() for single responsibility.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { Platform } from '@neko/platform';
import { parsePlanMarkdown, type AgentEvent, type Plan } from '@neko/agent';
import type { ConversationHandler } from '../conversationHandler';
import { getLogger } from '../../base';

const logger = getLogger('AgentStreamProcessor');

type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming';

/**
 * Content block for sequential rendering persistence
 */
export interface ContentBlock {
  id: string;
  type: 'thinking' | 'text' | 'tool_call' | 'plan';
  timestamp: number;
  thinking?: string;
  isThinkingComplete?: boolean;
  content?: string;
  isStreaming?: boolean;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: { success: boolean; data: unknown; error?: string };
  };
  plan?: Plan;
}

/**
 * Collected tool call for persistence
 */
export interface CollectedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: { success: boolean; data: unknown; error?: string };
}

/**
 * Stream processing result
 */
export interface StreamProcessingResult {
  accumulatedResponse: string;
  accumulatedThinking: string;
  hasError: boolean;
  collectedToolCalls: CollectedToolCall[];
  contentBlocks: ContentBlock[];
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
  conversations?: ConversationHandler;
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
}

/**
 * Processor for agent event streams
 */
export class AgentStreamProcessor {
  constructor(private deps: AgentStreamProcessorDeps) {}

  /**
   * Process an agent event stream and dispatch to webview
   */
  async processStream(
    webview: vscode.Webview,
    conversationId: string,
    events: AsyncIterable<AgentEvent>,
    callbacks: StreamCallbacks,
  ): Promise<StreamProcessingResult> {
    let accumulatedResponse = '';
    let accumulatedThinking = '';
    let hasError = false;
    let currentPhase: AgentPhase = 'idle';

    const streamingMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const collectedToolCalls: CollectedToolCall[] = [];
    const contentBlocks: ContentBlock[] = [];
    const toolBlocksByCallId = new Map<string, ContentBlock>();
    let currentTextBlock: ContentBlock | null = null;
    let currentThinkingBlock: ContentBlock | null = null;

    const sendPhaseChange = (phase: AgentPhase, toolName?: string) => {
      if (phase !== currentPhase) {
        currentPhase = phase;
        callbacks.onPhaseChange(phase, toolName);
      }
    };

    for await (const event of events) {
      switch (event.type) {
        case 'thinking_content':
          sendPhaseChange('thinking');
          accumulatedThinking += event.thinking || '';

          if (!currentThinkingBlock) {
            currentThinkingBlock = {
              id: `block-thinking-${Date.now()}`,
              type: 'thinking',
              timestamp: Date.now(),
              thinking: event.thinking || '',
              isThinkingComplete: false,
            };
            contentBlocks.push(currentThinkingBlock);
          } else {
            currentThinkingBlock.thinking =
              (currentThinkingBlock.thinking || '') + (event.thinking || '');
          }

          webview.postMessage({
            type: 'streamThinking',
            conversationId,
            messageId: streamingMessageId,
            content: event.thinking,
          });
          break;

        case 'text':
        case 'text_delta':
          sendPhaseChange('streaming');
          accumulatedResponse += event.content || '';

          if (currentThinkingBlock) {
            currentThinkingBlock.isThinkingComplete = true;
            currentThinkingBlock = null;
          }

          if (!currentTextBlock) {
            currentTextBlock = {
              id: `block-text-${Date.now()}`,
              type: 'text',
              timestamp: Date.now(),
              content: event.content || '',
              isStreaming: true,
            };
            contentBlocks.push(currentTextBlock);
          } else {
            currentTextBlock.content = (currentTextBlock.content || '') + (event.content || '');
          }

          webview.postMessage({
            type: 'streamText',
            conversationId,
            messageId: streamingMessageId,
            content: event.content,
          });
          break;

        case 'tool_call':
          sendPhaseChange('acting', event.toolCall?.name);
          if (currentTextBlock) {
            currentTextBlock.isStreaming = false;
            currentTextBlock = null;
          }

          if (event.toolCall) {
            const toolCallData: CollectedToolCall = {
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            };
            collectedToolCalls.push(toolCallData);

            const toolBlock: ContentBlock = {
              id: `block-tool-${event.toolCall.id}`,
              type: 'tool_call',
              timestamp: Date.now(),
              toolCall: toolCallData,
            };
            contentBlocks.push(toolBlock);
            toolBlocksByCallId.set(event.toolCall.id, toolBlock);
          }
          webview.postMessage({
            type: 'toolCall',
            conversationId,
            messageId: streamingMessageId,
            toolCallId: event.toolCall?.id,
            toolName: event.toolCall?.name,
            arguments: event.toolCall?.arguments,
          });
          break;

        case 'tool_result':
          this._handleToolResult(
            webview,
            conversationId,
            streamingMessageId,
            event,
            collectedToolCalls,
            contentBlocks,
            toolBlocksByCallId,
          );
          break;

        case 'tool_confirmation':
          webview.postMessage({
            type: 'toolConfirmation',
            conversationId,
            toolCallId: event.toolConfirmation?.toolCall.id,
            toolName: event.toolConfirmation?.toolCall.name,
            action: event.toolConfirmation?.action,
            description: event.toolConfirmation?.description,
            details: event.toolConfirmation?.details,
          });
          break;

        case 'error':
          hasError = true;
          sendPhaseChange('idle');
          webview.postMessage({
            type: 'error',
            conversationId,
            message: event.error?.message || 'An error occurred',
          });
          break;

        case 'messageQueued':
          webview.postMessage({
            type: 'messageQueued',
            conversationId,
            content: event.content,
          });
          break;

        case 'done':
          sendPhaseChange('idle');
          webview.postMessage({
            type: 'streamComplete',
            conversationId,
            messageId: streamingMessageId,
          });
          if (event.usage) {
            webview.postMessage({
              type: 'contextTokenCount',
              conversationId,
              tokenCount: event.usage.totalTokens,
            });
          }
          break;
      }
    }

    // Mark remaining blocks as complete
    contentBlocks.forEach((block) => {
      if (block.type === 'text' && block.isStreaming) {
        block.isStreaming = false;
      }
      if (block.type === 'thinking' && !block.isThinkingComplete) {
        block.isThinkingComplete = true;
      }
    });

    return {
      accumulatedResponse,
      accumulatedThinking,
      hasError,
      collectedToolCalls,
      contentBlocks,
    };
  }

  /**
   * Handle tool_result event
   */
  private _handleToolResult(
    webview: vscode.Webview,
    conversationId: string,
    streamingMessageId: string,
    event: AgentEvent,
    collectedToolCalls: CollectedToolCall[],
    contentBlocks: ContentBlock[],
    toolBlocksByCallId: Map<string, ContentBlock>,
  ): void {
    let parsedPlan: Plan | undefined;

    if (event.toolResult) {
      const toolCall = collectedToolCalls.find((tc) => tc.id === event.toolResult!.toolCallId);
      if (toolCall) {
        toolCall.result = {
          success: event.toolResult.success,
          data: event.toolResult.data,
          error: event.toolResult.error,
        };
      }

      const toolBlock = toolBlocksByCallId.get(event.toolResult.toolCallId);
      if (toolBlock && toolBlock.toolCall) {
        toolBlock.toolCall.result = {
          success: event.toolResult.success,
          data: event.toolResult.data,
          error: event.toolResult.error,
        };
      }

      // Check for ExitPlanMode result — parse plan and include in message
      const resultData = event.toolResult.data as Record<string, unknown> | undefined;
      if (
        resultData?.planMode &&
        (resultData.planMode as Record<string, unknown>)?.status === 'awaiting_approval'
      ) {
        const planId = `plan-${Date.now()}`;
        const planTitle = (resultData.title as string) || 'Implementation Plan';
        const planContent = (resultData.plan as string) || '';
        const planFilePath = (resultData.filePath as string) || '';

        parsedPlan = parsePlanMarkdown(planContent, planId, planTitle);
        parsedPlan.filePath = planFilePath;

        contentBlocks.push({
          id: `block-plan-${parsedPlan.id}`,
          type: 'plan',
          timestamp: Date.now(),
          plan: parsedPlan,
        });
      }
    }

    webview.postMessage({
      type: 'toolResult',
      conversationId,
      messageId: streamingMessageId,
      toolCallId: event.toolResult?.toolCallId,
      success: event.toolResult?.success,
      data: event.toolResult?.data,
      plan: parsedPlan,
    });

    // Subscribe to background task progress
    this._subscribeToTaskProgress(webview, conversationId, event);
  }

  /**
   * Subscribe to background task progress updates
   */
  private _subscribeToTaskProgress(
    webview: vscode.Webview,
    conversationId: string,
    event: AgentEvent,
  ): void {
    const resultData = event.toolResult?.data as Record<string, unknown> | undefined;
    if (resultData?.backgroundMode !== true || !resultData?.taskId || !this.deps.platform) {
      return;
    }

    const taskId = resultData.taskId as string;
    const taskMessage = (resultData.message as string) || '';
    const routedTo = resultData.routedTo as Record<string, unknown> | undefined;

    // Determine task type: prefer explicit type field, fall back to heuristic
    const explicitType = resultData.type as string | undefined;
    const taskType: 'image' | 'video' | 'audio' =
      explicitType === 'video' ? 'video' : explicitType === 'audio' ? 'audio' : 'image';

    // Send taskCreated so webview can display the task immediately
    webview.postMessage({
      type: 'taskCreated',
      task: {
        id: taskId,
        type: taskType,
        name: taskMessage.slice(0, 50) || `${taskType} generation`,
        prompt: taskMessage,
        providerId: (routedTo?.provider as string) || 'unknown',
        providerName: (routedTo?.provider as string) || 'AI Provider',
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const toWebviewUri = (filePath: string | undefined): string | undefined => {
      if (!filePath) return undefined;
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
      }
      try {
        return webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
      } catch {
        logger.warn('Failed to convert path to webview URI:', filePath);
        return filePath;
      }
    };

    const unsubscribe = this.deps.platform.media?.onProgress(taskId, async (task) => {
      let resultUrls = task.outputs?.map((o) => o.url).filter(Boolean) || [];
      let thumbnailUrl = task.outputs?.[0]?.url;

      if (task.status === 'completed' && task.outputs && task.outputs.length > 0) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const mediaConfig = vscode.workspace.getConfiguration('neko.agent.media');
          const customDir = mediaConfig.get<string>('outputDir', '');
          const outputDir = customDir
            ? customDir
            : path.join(workspaceFolders[0].uri.fsPath, '.neko', 'generated');
          const localPaths = await this.deps.platform.media!.saveOutputs(task.id, outputDir, {
            transcodeFile: this.deps.transcodeFile,
          });
          if (localPaths.length > 0) {
            resultUrls = localPaths;
            thumbnailUrl = localPaths[0];
            const showNotification = mediaConfig.get<boolean>('showSaveNotification', true);
            if (showNotification) {
              const displayPath = localPaths[0];
              const shortPath = path.relative(workspaceFolders[0].uri.fsPath, displayPath);
              const label =
                taskType === 'video' ? 'Video' : taskType === 'audio' ? 'Audio' : 'Image';
              vscode.window
                .showInformationMessage(`${label} saved to ${shortPath}`, 'Show in Folder')
                .then((action) => {
                  if (action === 'Show in Folder') {
                    vscode.commands.executeCommand(
                      'revealFileInOS',
                      vscode.Uri.file(displayPath),
                    );
                  }
                });
            }
          }
        }
      }

      const webviewUrls = resultUrls.map((url) => toWebviewUri(url)).filter(Boolean) as string[];
      const webviewThumbnailUrl = toWebviewUri(thumbnailUrl);

      // Keep original local file paths (not vscode-resource:// URIs) for OS reveal/download
      const localPaths = resultUrls.filter(
        (url) => url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url),
      );

      webview.postMessage({
        type: 'taskUpdated',
        task: {
          id: task.id,
          type:
            task.type === 'text-to-image' || task.type === 'image-to-image'
              ? 'image'
              : task.type === 'text-to-video' || task.type === 'image-to-video'
                ? 'video'
                : task.type === 'text-to-audio' || task.type === 'text-to-music'
                  ? 'audio'
                  : 'image',
          status: task.status === 'pending' ? 'queued' : task.status,
          progress: task.progress,
          result:
            webviewUrls.length > 0
              ? {
                  urls: webviewUrls,
                  thumbnailUrl: webviewThumbnailUrl,
                  localPaths: localPaths.length > 0 ? localPaths : undefined,
                }
              : undefined,
          error: task.error?.message,
          updatedAt: new Date().toISOString(),
        },
      });

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        if (task.status === 'completed' && resultUrls.length > 0) {
          this.updateToolResultWithUrls(conversationId, taskId, resultUrls);
        }
        unsubscribe();
      }
    });
  }

  /**
   * Update tool result with final URLs for persistence
   */
  updateToolResultWithUrls(conversationId: string, taskId: string, urls: string[]): void {
    if (!this.deps.conversations) return;

    try {
      const conversation = this.deps.conversations.get(conversationId);
      if (!conversation) return;

      let updated = false;

      const updatedMessages = conversation.messages.map((message) => {
        if (!message.toolCalls && !message.contentBlocks) return message;

        const updatedMessage = { ...message };

        if (message.toolCalls) {
          const updatedToolCalls = message.toolCalls.map((toolCall) => {
            if (!toolCall.result?.data) return toolCall;

            const data = toolCall.result.data as Record<string, unknown>;
            if (data.taskId === taskId && data.backgroundMode === true) {
              updated = true;
              return {
                ...toolCall,
                result: {
                  ...toolCall.result,
                  data: {
                    ...data,
                    status: 'completed',
                    url: urls[0],
                    urls: urls,
                    localPath: urls[0],
                    localPaths: urls,
                  },
                },
              };
            }
            return toolCall;
          });
          updatedMessage.toolCalls = updatedToolCalls;
        }

        if (message.contentBlocks) {
          const updatedContentBlocks = message.contentBlocks.map((block) => {
            if (block.type !== 'tool_call' || !block.toolCall?.result?.data) return block;

            const data = block.toolCall.result.data as Record<string, unknown>;
            if (data.taskId === taskId && data.backgroundMode === true) {
              updated = true;
              return {
                ...block,
                toolCall: {
                  ...block.toolCall,
                  result: {
                    ...block.toolCall.result,
                    data: {
                      ...data,
                      status: 'completed',
                      url: urls[0],
                      urls: urls,
                      localPath: urls[0],
                      localPaths: urls,
                    },
                  },
                },
              };
            }
            return block;
          });
          updatedMessage.contentBlocks = updatedContentBlocks;
        }

        return updatedMessage;
      });

      if (updated) {
        this.deps.conversations.manager.updateMessages(conversationId, updatedMessages);
      }
    } catch (error) {
      logger.error('Failed to update tool result with URLs:', error);
    }
  }
}
