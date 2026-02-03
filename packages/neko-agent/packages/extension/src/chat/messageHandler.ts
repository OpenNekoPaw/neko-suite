/**
 * Message Handler
 * Handles user messages, AI interactions, and agent execution
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Platform } from '@neko/platform';
import type { ConversationMessage } from './conversationManager';
import type { IAgentManager } from '../ai/agentManager';
import { createDefaultAgentContext } from '../ai/agentContext';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationHandler } from './conversationHandler';
import { FileReference, MessageAttachment } from './types';
import {
  createInputProcessor,
  type InputProcessor,
  type IFileReader,
} from '@neko/agent';

/**
 * Plan step for plan persistence
 */
interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}

/**
 * Plan structure for persistence
 */
interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'pending' | 'approved' | 'rejected';
  filePath?: string;
}

type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming';

interface AgentStateSnapshot {
  conversationId: string;
  phase: AgentPhase;
  toolName?: string;
  startedAt: number;
}

/**
 * Parse plan markdown content into Plan object
 * Extracts sections starting with ## or ### as steps
 */
function parsePlanMarkdown(markdown: string, planId: string, title: string): Plan {
  const lines = markdown.split('\n');
  const steps: PlanStep[] = [];
  let currentStep: string[] = [];
  let stepIndex = 0;

  for (const line of lines) {
    // Match ## or ### headers as step boundaries
    const headerMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headerMatch) {
      // Save previous step if exists
      if (currentStep.length > 0) {
        steps.push({
          id: `${planId}-step-${stepIndex}`,
          description: currentStep.join('\n').trim(),
          status: 'pending',
        });
        stepIndex++;
      }
      // Start new step with header as description
      currentStep = [headerMatch[1]];
    } else if (line.trim()) {
      // Add non-empty lines to current step
      currentStep.push(line);
    }
  }

  // Save last step
  if (currentStep.length > 0) {
    steps.push({
      id: `${planId}-step-${stepIndex}`,
      description: currentStep.join('\n').trim(),
      status: 'pending',
    });
  }

  // If no steps parsed (no headers), create single step with entire content
  if (steps.length === 0) {
    steps.push({
      id: `${planId}-step-0`,
      description: markdown.trim(),
      status: 'pending',
    });
  }

  return {
    id: planId,
    title,
    steps,
    status: 'pending',
  };
}

export class MessageHandler {
  private _agentStates = new Map<string, { phase: AgentPhase; toolName?: string; startedAt: number }>();
  private _inputProcessor: InputProcessor | null = null;

  constructor(
    private readonly _settings: SettingsManager,
    private readonly _providers: ProviderManager,
    private readonly _conversations: ConversationHandler,
    private readonly _agentManager: IAgentManager | undefined,
    private readonly _editorRegistry: IEditorRegistry | undefined,
    private readonly _getSystemPrompt: () => string,
    private readonly _platform?: Platform
  ) {}

  /**
   * Get or create InputProcessor for the current workspace
   */
  private _getInputProcessor(): InputProcessor | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // Create InputProcessor with VSCode FileReader
    if (!this._inputProcessor) {
      const vscodeFileReader: IFileReader = {
        async readFile(filePath: string): Promise<string> {
          const fullPath = path.isAbsolute(filePath)
            ? vscode.Uri.file(filePath)
            : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
          const content = await vscode.workspace.fs.readFile(fullPath);
          return Buffer.from(content).toString('utf-8');
        },
        async exists(filePath: string): Promise<boolean> {
          try {
            const fullPath = path.isAbsolute(filePath)
              ? vscode.Uri.file(filePath)
              : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
            await vscode.workspace.fs.stat(fullPath);
            return true;
          } catch {
            return false;
          }
        },
        async isFile(filePath: string): Promise<boolean> {
          try {
            const fullPath = path.isAbsolute(filePath)
              ? vscode.Uri.file(filePath)
              : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
            const stat = await vscode.workspace.fs.stat(fullPath);
            return stat.type === vscode.FileType.File;
          } catch {
            return false;
          }
        },
        async isDirectory(filePath: string): Promise<boolean> {
          try {
            const fullPath = path.isAbsolute(filePath)
              ? vscode.Uri.file(filePath)
              : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
            const stat = await vscode.workspace.fs.stat(fullPath);
            return stat.type === vscode.FileType.Directory;
          } catch {
            return false;
          }
        },
        async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
          // Use vscode.workspace.findFiles for glob
          const cwd = options?.cwd ?? workspaceRoot;
          const relativePattern = new vscode.RelativePattern(cwd, pattern);
          const files = await vscode.workspace.findFiles(relativePattern, '**/node_modules/**', 100);
          return files.map(f => vscode.workspace.asRelativePath(f, false));
        },
        async stat(filePath: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
          const fullPath = path.isAbsolute(filePath)
            ? vscode.Uri.file(filePath)
            : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
          const stat = await vscode.workspace.fs.stat(fullPath);
          return {
            size: stat.size,
            isFile: stat.type === vscode.FileType.File,
            isDirectory: stat.type === vscode.FileType.Directory,
          };
        },
      };

      this._inputProcessor = createInputProcessor({
        workspaceRoot,
        fileReader: vscodeFileReader,
        maxFileSize: 1024 * 1024, // 1MB
        maxFiles: 20,
        includeLineNumbers: true,
        includeLanguageHints: true,
      });
    }

    return this._inputProcessor;
  }

  getAgentStateSnapshot(): AgentStateSnapshot[] {
    return Array.from(this._agentStates.entries()).map(([conversationId, state]) => ({
      conversationId,
      phase: state.phase,
      toolName: state.toolName,
      startedAt: state.startedAt,
    }));
  }

  clearAgentState(conversationId: string): void {
    this._agentStates.delete(conversationId);
  }

  /**
   * Handle incoming user message
   * @param requestConversationId - Optional conversation ID from Webview (for session binding)
   */
  async handleUserMessage(
    webview: vscode.Webview,
    messageText: string,
    providerId?: string,
    modelId?: string,
    attachments?: MessageAttachment[],
    promptId?: string,
    requestConversationId?: string
  ): Promise<void> {
    // Use provided conversation ID or fall back to active conversation
    const conversationId = requestConversationId || this._conversations.ensureActive();

    // Parse @ file references
    const { message: parsedMessage, fileContents } = await this._parseFileReferences(messageText);

    // Process attachments
    const { textContent: attachmentText, imageAttachments } = await this._processAttachments(attachments);

    // Build enhanced message with file contents and attachment text
    let enhancedMessage = parsedMessage;
    if (fileContents.length > 0) {
      enhancedMessage += '\n\n--- Referenced Files ---';
      for (const { path, content } of fileContents) {
        enhancedMessage += `\n\n### File: ${path}\n\`\`\`\n${content}\n\`\`\``;
      }
    }
    if (attachmentText) {
      enhancedMessage += '\n\n--- Attached Files ---' + attachmentText;
    }

    // Store user message
    const userMessage: ConversationMessage = {
      id: this._generateId(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };
    this._conversations.addMessageToConversation(conversationId, userMessage);

    // Send thinking indicator
    webview.postMessage({ type: 'thinking', conversationId });

    // Execute with agent
    if (this._agentManager && this._platform) {
      await this._executeWithAgent(webview, conversationId, enhancedMessage, providerId, modelId, imageAttachments, promptId);
    } else {
      this._sendFallbackResponse(webview);
    }
  }

  /**
   * Process attachments - extract text content and image data
   */
  private async _processAttachments(attachments?: MessageAttachment[]): Promise<{
    textContent: string;
    imageAttachments: Array<{ type: 'base64'; media_type: string; data: string }>;
  }> {
    const imageAttachments: Array<{ type: 'base64'; media_type: string; data: string }> = [];
    let textContent = '';

    if (!attachments || attachments.length === 0) {
      return { textContent, imageAttachments };
    }

    for (const attachment of attachments) {
      switch (attachment.type) {
        case 'image':
          // For images, extract base64 data for multimodal AI
          if (attachment.preview) {
            // Preview is already base64 data URL
            const match = attachment.preview.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              imageAttachments.push({
                type: 'base64',
                media_type: match[1],
                data: match[2],
              });
            }
          } else if (attachment.path) {
            // Read from file path
            try {
              const base64Data = await this._readFileAsBase64(attachment.path);
              if (base64Data) {
                imageAttachments.push(base64Data);
              }
            } catch (err) {
              console.error('Failed to read image attachment:', err);
            }
          }
          break;

        case 'file':
          // For text files, read content and append to message
          if (attachment.path) {
            try {
              const content = await fs.promises.readFile(attachment.path, 'utf-8');
              textContent += `\n\n### File: ${attachment.name}\n\`\`\`\n${content}\n\`\`\``;
            } catch (err) {
              console.error('Failed to read file attachment:', err);
              textContent += `\n\n### File: ${attachment.name}\n(Failed to read file)`;
            }
          }
          break;

        case 'video':
        case 'audio':
          // For media files, just note the reference (actual processing would need specific handling)
          textContent += `\n\n[Attached ${attachment.type}: ${attachment.name}]`;
          if (attachment.path) {
            textContent += ` (path: ${attachment.path})`;
          }
          break;
      }
    }

    return { textContent, imageAttachments };
  }

  /**
   * Read file as base64 for image attachments
   */
  private async _readFileAsBase64(filePath: string): Promise<{
    type: 'base64';
    media_type: string;
    data: string;
  } | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      const mediaType = mimeTypes[ext] || 'image/png';
      return {
        type: 'base64',
        media_type: mediaType,
        data: buffer.toString('base64'),
      };
    } catch (err) {
      console.error('Failed to read file as base64:', err);
      return null;
    }
  }

  /**
   * Execute message with agent
   */
  private async _executeWithAgent(
    webview: vscode.Webview,
    conversationId: string,
    message: string,
    providerId?: string,
    modelId?: string,
    imageAttachments?: Array<{ type: 'base64'; media_type: string; data: string }>,
    promptId?: string
  ): Promise<void> {
    // Declare disposable outside try block so it can be accessed in finally
    let confirmationDisposable: { dispose(): void } | undefined;

    try {
      // Get provider
      const effectiveProviderId = providerId || this._settings.selectedProviderId;

      let provider = effectiveProviderId
        ? this._providers.getProvider(effectiveProviderId)
        : this._providers.getDefaultProvider();

      if (!provider || !provider.isConfigured) {
        provider = this._providers.getDefaultProvider();
      }

      if (!provider || !provider.isConfigured) {
        this._sendFallbackResponse(webview);
        return;
      }

      if (!this._platform) {
        this._sendFallbackResponse(webview);
        return;
      }

      // Get or create agent for this conversation
      const agentRunner = this._agentManager!.getOrCreate(conversationId);

      // Only sync history if agent history is empty or out of sync
      // Don't load history every time as it causes duplicate messages
      const agentHistory = agentRunner.getHistory();
      const conversation = this._conversations.get(conversationId);

      // Only sync if agent has no history (new agent) and conversation has history
      // Exclude the last message (current user message) as agent will add it
      if (agentHistory.length === 0 && conversation && conversation.messages.length > 1) {
        // Use the new toAgentHistory method for full context preservation
        // This includes tool calls and results for proper resume
        const fullHistory = this._conversations.manager.toAgentHistory(conversationId);
        // Exclude the last message (current user message) as agent will add it
        const historyToLoad = fullHistory.slice(0, -1);
        if (historyToLoad.length > 0) {
          this._agentManager!.loadHistoryWithContext(conversationId, historyToLoad);
        }
      }

      // Configure agent
      // Note: modelId is undefined when Auto mode is selected
      // In that case, let Platform decide the model via group routing
      // Don't fall back to selectedModelId - that would bypass Auto mode
      const effectiveModelId = modelId;

      // Get system prompt from selected prompt preset, or fall back to custom/default
      let systemPrompt = this._settings.customSystemPrompt || this._getSystemPrompt();
      if (promptId && this._platform) {
        const promptConfig = this._platform.config.getPrompt(promptId);
        if (promptConfig && promptConfig.systemPrompt) {
          systemPrompt = promptConfig.systemPrompt;
        }
      }

      agentRunner.configure({
        platform: this._platform,
        groupId: 'default', // Use 'default' group which routes to configured providers
        systemPrompt,
        maxIterations: Infinity, // No iteration limit - let agent complete all tasks
        autoExecuteTools: this._settings.autoExecuteTools,
        temperature: this._settings.temperature,
        maxTokens: this._settings.maxTokens,
        modelId: effectiveModelId,
        executionMode: this._settings.executionMode,
        // Enable extended thinking for Claude models (10000 tokens budget)
        // This allows the model to "think" before responding
        thinkingBudget: 10000,
      });

      // Create agent context
      const context = createDefaultAgentContext();
      context.activeEditor = this._editorRegistry?.getActiveEditor();
      context.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      context.projectType = context.activeEditor?.type || 'unknown';
      // Add image attachments to context for multimodal support
      if (imageAttachments && imageAttachments.length > 0) {
        context.imageAttachments = imageAttachments;
      }

      // Subscribe to tool confirmation requests (ask mode)
      // This listener fires when PermissionHooks needs user confirmation
      confirmationDisposable = agentRunner.onDidRequestConfirmation((request) => {
        webview.postMessage({
          type: 'toolConfirmation',
          conversationId,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          action: request.action,
          description: request.description,
          details: request.details,
        });
      });

      let accumulatedResponse = '';
      let accumulatedThinking = '';
      let hasError = false;
      // Track current agent phase for UI indicator
      let currentPhase: AgentPhase = 'idle';
      // Generate unique messageId for this execution
      // This ID is used to associate all streaming messages (text, thinking, toolCall, toolResult)
      // with the correct assistant message in the webview
      const streamingMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      // Collect tool calls for persistence
      const collectedToolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
        result?: { success: boolean; data: unknown; error?: string };
      }> = [];
      // Collect content blocks for sequential rendering persistence
      // This preserves the exact order of thinking, text, and tool calls
      const contentBlocks: Array<{
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
      }> = [];
      // Track current text block for accumulation
      let currentTextBlockId: string | null = null;
      let currentThinkingBlockId: string | null = null;

      // Helper: Send agent phase change to UI
      const sendPhaseChange = (phase: AgentPhase, toolName?: string) => {
        if (phase !== currentPhase) {
          const timestamp = Date.now();
          currentPhase = phase;
          this._updateAgentState(conversationId, phase, toolName, timestamp);
          webview.postMessage({
            type: 'agentPhase',
            conversationId,
            phase,
            toolName,
            timestamp,
          });
        }
      };

      // Execute agent and stream events
      for await (const event of agentRunner.execute(message, context)) {
        switch (event.type) {
          case 'thinking_content':
            // Extended thinking content (Claude)
            sendPhaseChange('thinking');
            accumulatedThinking += event.thinking || '';

            // Add to contentBlocks - create new block or append to existing
            if (!currentThinkingBlockId) {
              currentThinkingBlockId = `block-thinking-${Date.now()}`;
              contentBlocks.push({
                id: currentThinkingBlockId,
                type: 'thinking',
                timestamp: Date.now(),
                thinking: event.thinking || '',
                isThinkingComplete: false,
              });
            } else {
              const thinkingBlock = contentBlocks.find(b => b.id === currentThinkingBlockId);
              if (thinkingBlock) {
                thinkingBlock.thinking = (thinkingBlock.thinking || '') + (event.thinking || '');
              }
            }

            webview.postMessage({
              type: 'streamThinking',
              conversationId,
              messageId: streamingMessageId,
              content: event.thinking,
            });
            break;

          case 'text':
            sendPhaseChange('streaming');
            accumulatedResponse += event.content || '';

            // If there was thinking, mark it complete and start new text block
            if (currentThinkingBlockId) {
              const thinkingBlock = contentBlocks.find(b => b.id === currentThinkingBlockId);
              if (thinkingBlock) {
                thinkingBlock.isThinkingComplete = true;
              }
              currentThinkingBlockId = null;
            }

            // Add to contentBlocks - create new block or append to existing
            if (!currentTextBlockId) {
              currentTextBlockId = `block-text-${Date.now()}`;
              contentBlocks.push({
                id: currentTextBlockId,
                type: 'text',
                timestamp: Date.now(),
                content: event.content || '',
                isStreaming: true,
              });
            } else {
              const textBlock = contentBlocks.find(b => b.id === currentTextBlockId);
              if (textBlock) {
                textBlock.content = (textBlock.content || '') + (event.content || '');
              }
            }

            webview.postMessage({
              type: 'streamText',
              conversationId,
              messageId: streamingMessageId,
              content: event.content,
            });
            break;

          case 'tool_call':
            // Send acting phase with tool name
            sendPhaseChange('acting', event.toolCall?.name);
            // Mark current text block as complete since tool call interrupts text flow
            if (currentTextBlockId) {
              const textBlock = contentBlocks.find(b => b.id === currentTextBlockId);
              if (textBlock) {
                textBlock.isStreaming = false;
              }
              currentTextBlockId = null;
            }

            // Collect tool call for persistence
            if (event.toolCall) {
              const toolCallData = {
                id: event.toolCall.id,
                name: event.toolCall.name,
                arguments: event.toolCall.arguments,
              };
              collectedToolCalls.push(toolCallData);

              // Add to contentBlocks
              contentBlocks.push({
                id: `block-tool-${event.toolCall.id}`,
                type: 'tool_call',
                timestamp: Date.now(),
                toolCall: toolCallData,
              });
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
            // Update tool call with result for persistence
            if (event.toolResult) {
              const toolCall = collectedToolCalls.find(tc => tc.id === event.toolResult!.toolCallId);
              if (toolCall) {
                toolCall.result = {
                  success: event.toolResult.success,
                  data: event.toolResult.data,
                  error: event.toolResult.error,
                };
              }

              // Also update contentBlocks
              const toolBlock = contentBlocks.find(
                b => b.type === 'tool_call' && b.toolCall?.id === event.toolResult!.toolCallId
              );
              if (toolBlock && toolBlock.toolCall) {
                toolBlock.toolCall.result = {
                  success: event.toolResult.success,
                  data: event.toolResult.data,
                  error: event.toolResult.error,
                };
              }

              // Check if this is an ExitPlanMode result - create plan ContentBlock for persistence
              const resultData = event.toolResult.data as Record<string, unknown> | undefined;
              if (resultData?.planMode && (resultData.planMode as Record<string, unknown>)?.status === 'awaiting_approval') {
                const planId = `plan-${Date.now()}`;
                const planTitle = (resultData.title as string) || 'Implementation Plan';
                const planContent = (resultData.plan as string) || '';
                const planFilePath = (resultData.filePath as string) || '';

                // Parse markdown into plan steps
                const plan = parsePlanMarkdown(planContent, planId, planTitle);
                // Store file path in plan for later use
                plan.filePath = planFilePath;

                // Create plan content block for persistence
                contentBlocks.push({
                  id: `block-plan-${planId}`,
                  type: 'plan',
                  timestamp: Date.now(),
                  plan,
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
            });

            // Subscribe to task progress if this is a background task
            {
              const resultData = event.toolResult?.data as Record<string, unknown> | undefined;
              if (resultData?.backgroundMode === true && resultData?.taskId && this._platform) {
                const taskId = resultData.taskId as string;

                // Helper: convert local path to webview URI
                const toWebviewUri = (filePath: string | undefined): string | undefined => {
                  if (!filePath) return undefined;
                  // Already a URL, return as-is
                  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                    return filePath;
                  }
                  // Convert local path to webview URI
                  try {
                    return webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
                  } catch {
                    console.warn('[UniEdit] Failed to convert path to webview URI:', filePath);
                    return filePath;
                  }
                };

                // Subscribe to task updates via MediaGenerationService
                const unsubscribe = this._platform.media.onProgress(taskId, async (task) => {
                  // Prepare result URLs (will be updated if saved locally)
                  let resultUrls = task.outputs?.map((o) => o.url).filter(Boolean) || [];
                  let thumbnailUrl = task.outputs?.[0]?.url;

                  // Auto-save to local when completed
                  if (task.status === 'completed' && task.outputs && task.outputs.length > 0) {
                    const localPaths = await this._saveOutputsToLocal(task.id, task.type, task.outputs);
                    if (localPaths.length > 0) {
                      resultUrls = localPaths;
                      thumbnailUrl = localPaths[0];

                      // Update task outputs with local paths so viewTaskResult can use them
                      const updatedOutputs = task.outputs.map((output, index) => ({
                        ...output,
                        url: localPaths[index] || output.url,
                      }));
                      await this._platform?.media.updateTaskOutputs(task.id, updatedOutputs);
                    }
                  }

                  // Convert paths to webview URIs for display in webview
                  const webviewUrls = resultUrls.map(url => toWebviewUri(url)).filter(Boolean) as string[];
                  const webviewThumbnailUrl = toWebviewUri(thumbnailUrl);

                  // Send task update to webview
                  webview.postMessage({
                    type: 'taskUpdated',
                    task: {
                      id: task.id,
                      type: task.type === 'text-to-image' ? 'image' : task.type === 'text-to-video' ? 'video' : 'image',
                      status: task.status === 'pending' ? 'queued' : task.status,
                      progress: task.progress,
                      result: webviewUrls.length > 0 ? {
                        urls: webviewUrls,
                        thumbnailUrl: webviewThumbnailUrl,
                      } : undefined,
                      error: task.error?.message,
                      updatedAt: new Date().toISOString(),
                    },
                  });

                  // Unsubscribe when task is done
                  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
                    // Update saved conversation with final URLs for persistence
                    if (task.status === 'completed' && resultUrls.length > 0) {
                      this._updateToolResultWithUrls(conversationId, taskId, resultUrls);
                    }
                    unsubscribe();
                  }
                });
              }
            }
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
            // Message was queued while agent was running
            webview.postMessage({
              type: 'messageQueued',
              conversationId,
              content: event.content,
            });
            break;

          case 'done':
            sendPhaseChange('idle');
            webview.postMessage({ type: 'streamComplete', conversationId, messageId: streamingMessageId });
            // Send updated token count after completion
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

      // Store assistant message (if there's content or tool calls or thinking)
      if ((accumulatedResponse || collectedToolCalls.length > 0 || accumulatedThinking) && !hasError) {
        // Mark any remaining blocks as complete
        contentBlocks.forEach(block => {
          if (block.type === 'text' && block.isStreaming) {
            block.isStreaming = false;
          }
          if (block.type === 'thinking' && !block.isThinkingComplete) {
            block.isThinkingComplete = true;
          }
        });

        const assistantMessage: ConversationMessage = {
          id: this._generateId(),
          role: 'assistant',
          content: accumulatedResponse,
          timestamp: Date.now(),
          // Include thinking for persistence (Claude extended thinking)
          thinking: accumulatedThinking || undefined,
          // Include tool calls for persistence and display after conversation switch
          toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
          // Include content blocks for sequential rendering preservation
          // This ensures the order of thinking, text, and tool calls is maintained
          contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        };
        this._conversations.addMessageToConversation(conversationId, assistantMessage);
      }
    } catch (error) {
      console.error('Agent execution error:', error);
      this._updateAgentState(conversationId, 'idle', undefined, Date.now());
      // Ensure UI returns to idle state on error
      webview.postMessage({
        type: 'agentPhase',
        conversationId,
        phase: 'idle',
        timestamp: Date.now(),
      });
      webview.postMessage({
        type: 'error',
        conversationId,
        message: error instanceof Error ? error.message : 'Failed to generate response',
      });
    } finally {
      // Dispose confirmation listener (may be undefined if error happened early)
      confirmationDisposable?.dispose();
    }
  }

  /**
   * Send fallback response when no provider is configured
   */
  private _sendFallbackResponse(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'error',
      message: 'No AI provider configured. Please go to Settings and add an AI provider (Claude, OpenAI, etc.) with your API key.',
    });
  }

  private _updateAgentState(
    conversationId: string,
    phase: AgentPhase,
    toolName: string | undefined,
    startedAt: number
  ): void {
    if (phase === 'idle') {
      this._agentStates.delete(conversationId);
      return;
    }

    this._agentStates.set(conversationId, {
      phase,
      toolName,
      startedAt,
    });
  }

  /**
   * Parse @ file references from message using InputProcessor
   * Supports:
   * - @file.ts - Single file reference
   * - @src/ - Directory reference
   * - @src/*.ts - Glob pattern
   * - @file.ts:10-20 - Line range
   * - @file.ts:15 - Single line with context
   */
  private async _parseFileReferences(messageText: string): Promise<{
    message: string;
    fileContents: FileReference[];
  }> {
    const inputProcessor = this._getInputProcessor();
    if (!inputProcessor) {
      // No workspace, return empty
      return { message: messageText, fileContents: [] };
    }

    try {
      const result = await inputProcessor.process(messageText);

      // Convert ProcessedInput to FileReference format
      const fileContents: FileReference[] = result.fileReferences
        .filter(ref => ref.content)
        .map(ref => ({
          path: ref.path,
          content: ref.content!,
        }));

      // Log any errors
      if (result.errors.length > 0) {
        for (const error of result.errors) {
          console.warn(`[UniEdit] Could not read file: ${error.reference}`, error.error);
        }
      }

      return { message: messageText, fileContents };
    } catch (error) {
      console.error('[UniEdit] InputProcessor error:', error);
      // Fallback to empty on error
      return { message: messageText, fileContents: [] };
    }
  }

  /**
   * Search project files for @ reference
   */
  async searchProjectFiles(webview: vscode.Webview, filter: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      webview.postMessage({ type: 'projectFiles', files: [] });
      return;
    }

    try {
      const pattern = filter ? `**/*${filter}*` : '**/*';
      const excludePattern = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**';

      const files = await vscode.workspace.findFiles(pattern, excludePattern, 30);

      const projectFiles = files.map(file => {
        const relativePath = vscode.workspace.asRelativePath(file);
        const name = relativePath.split('/').pop() || relativePath;

        return {
          path: relativePath,
          name,
          type: 'file' as const,
        };
      });

      webview.postMessage({ type: 'projectFiles', files: projectFiles });
    } catch (error) {
      console.error('Error searching project files:', error);
      webview.postMessage({ type: 'projectFiles', files: [] });
    }
  }

  /**
   * Save task outputs to local filesystem
   */
  private async _saveOutputsToLocal(
    taskId: string,
    taskType: string,
    outputs: Array<{ url?: string; type?: string }>
  ): Promise<string[]> {
    const savedPaths: string[] = [];

    try {
      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[UniEdit] No workspace folder, cannot save outputs locally');
        return savedPaths;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const outputDir = path.join(workspaceRoot, '.uniedit', 'generated');

      // Create output directory if not exists
      await fs.promises.mkdir(outputDir, { recursive: true });

      // Determine file extension based on task type
      const getExtension = (type: string, outputType?: string): string => {
        if (outputType?.includes('video') || type.includes('video')) return '.mp4';
        if (outputType?.includes('audio') || type.includes('audio')) return '.mp3';
        return '.png';
      };

      // Download and save each output
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        if (!output.url) continue;

        // Skip if already a local path
        if (output.url.startsWith('/') || output.url.startsWith('file://')) {
          savedPaths.push(output.url.replace('file://', ''));
          continue;
        }

        const ext = getExtension(taskType, output.type);
        const filename = `${taskId}_${i}${ext}`;
        const localPath = path.join(outputDir, filename);

        try {
          const response = await fetch(output.url);
          if (!response.ok) {
            console.error('[UniEdit] Download failed:', response.status, response.statusText);
            continue;
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          await fs.promises.writeFile(localPath, buffer);
          savedPaths.push(localPath);
        } catch (downloadError) {
          console.error('[UniEdit] Failed to download/save output:', downloadError);
          // Keep original URL as fallback
          savedPaths.push(output.url);
        }
      }
    } catch (error) {
      console.error('[UniEdit] Failed to save outputs locally:', error);
    }

    return savedPaths;
  }

  /**
   * Generate unique ID
   */
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Update tool result with final URLs for persistence
   * Called when background task completes to save image URLs to conversation
   */
  private _updateToolResultWithUrls(conversationId: string, taskId: string, urls: string[]): void {
    try {
      const conversation = this._conversations.get(conversationId);
      if (!conversation) return;

      let updated = false;

      // Find the message with the tool call that has this taskId
      const updatedMessages = conversation.messages.map(message => {
        if (!message.toolCalls && !message.contentBlocks) return message;

        let updatedMessage = { ...message };

        // Update legacy toolCalls array
        if (message.toolCalls) {
          const updatedToolCalls = message.toolCalls.map(toolCall => {
            if (!toolCall.result?.data) return toolCall;

            const data = toolCall.result.data as Record<string, unknown>;
            if (data.taskId === taskId && data.backgroundMode === true) {
              updated = true;
              // Update the result data with final URLs
              // Store both webview-ready URLs and original local paths for file opening
              return {
                ...toolCall,
                result: {
                  ...toolCall.result,
                  data: {
                    ...data,
                    status: 'completed',
                    url: urls[0],      // Primary URL (local path)
                    urls: urls,        // All URLs (local paths)
                    localPath: urls[0], // Original local path for file opening
                    localPaths: urls,   // All original local paths
                  },
                },
              };
            }
            return toolCall;
          });
          updatedMessage.toolCalls = updatedToolCalls;
        }

        // Update contentBlocks (for sequential rendering)
        if (message.contentBlocks) {
          const updatedContentBlocks = message.contentBlocks.map(block => {
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
                      localPath: urls[0],  // Original local path for file opening
                      localPaths: urls,    // All original local paths
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
        // Use the manager's updateMessages method to persist
        this._conversations.manager.updateMessages(conversationId, updatedMessages);
      }
    } catch (error) {
      console.error('[UniEdit] Failed to update tool result with URLs:', error);
    }
  }
}
