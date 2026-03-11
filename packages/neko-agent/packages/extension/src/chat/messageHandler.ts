/**
 * Message Handler
 *
 * Orchestrates user messages, AI interactions, and agent execution.
 * Delegates attachment processing to AttachmentProcessor and
 * stream processing to AgentStreamProcessor.
 */

import * as vscode from 'vscode';
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
import { AttachmentProcessor } from './message/attachmentProcessor';
import { AgentStreamProcessor } from './message/agentStreamProcessor';
import { createInputProcessor, type InputProcessor, type IFileReader } from '@neko/agent';
import { getLogger } from '../base';

const logger = getLogger('MessageHandler');

type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming';

interface AgentStateSnapshot {
  conversationId: string;
  phase: AgentPhase;
  toolName?: string;
  startedAt: number;
}

export class MessageHandler {
  private _agentStates = new Map<
    string,
    { phase: AgentPhase; toolName?: string; startedAt: number }
  >();
  private _inputProcessor: InputProcessor | null = null;
  private readonly _attachmentProcessor: AttachmentProcessor;
  private readonly _streamProcessor: AgentStreamProcessor;

  constructor(
    private readonly _settings: SettingsManager,
    private readonly _providers: ProviderManager,
    private readonly _conversations: ConversationHandler,
    private readonly _agentManager: IAgentManager | undefined,
    private readonly _editorRegistry: IEditorRegistry | undefined,
    private readonly _getSystemPrompt: () => string,
    private readonly _platform?: Platform,
  ) {
    this._attachmentProcessor = new AttachmentProcessor();
    this._streamProcessor = new AgentStreamProcessor({
      platform: this._platform,
      conversations: this._conversations,
    });
  }

  /**
   * Get or create InputProcessor for the current workspace
   */
  private _getInputProcessor(): InputProcessor | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

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
          const cwd = options?.cwd ?? workspaceRoot;
          const relativePattern = new vscode.RelativePattern(cwd, pattern);
          const files = await vscode.workspace.findFiles(
            relativePattern,
            '**/node_modules/**',
            100,
          );
          return files.map((f) => vscode.workspace.asRelativePath(f, false));
        },
        async stat(
          filePath: string,
        ): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
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
    requestConversationId?: string,
  ): Promise<void> {
    const conversationId = requestConversationId || this._conversations.ensureActive();

    // Parse @ file references
    const { message: parsedMessage, fileContents } = await this._parseFileReferences(messageText);

    // Process attachments via AttachmentProcessor
    const { textContent: attachmentText, imageAttachments } =
      await this._attachmentProcessor.processAttachments(attachments);

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
      await this._executeWithAgent(
        webview,
        conversationId,
        enhancedMessage,
        providerId,
        modelId,
        imageAttachments,
        promptId,
      );
    } else {
      this._sendFallbackResponse(webview);
    }
  }

  /**
   * Execute message with agent - orchestrates provider selection,
   * agent configuration, and delegates stream processing to AgentStreamProcessor
   */
  private async _executeWithAgent(
    webview: vscode.Webview,
    conversationId: string,
    message: string,
    providerId?: string,
    modelId?: string,
    imageAttachments?: Array<{ type: 'base64'; media_type: string; data: string }>,
    promptId?: string,
  ): Promise<void> {
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

      // Only sync history if agent history is empty
      const agentHistory = agentRunner.getHistory();
      const conversation = this._conversations.get(conversationId);

      if (agentHistory.length === 0 && conversation && conversation.messages.length > 1) {
        const fullHistory = this._conversations.manager.toAgentHistory(conversationId);
        const historyToLoad = fullHistory.slice(0, -1);
        if (historyToLoad.length > 0) {
          this._agentManager!.loadHistoryWithContext(conversationId, historyToLoad);
        }
      }

      // Configure agent
      const effectiveModelId = modelId;

      const systemPrompt = this._settings.customSystemPrompt || this._getSystemPrompt();

      await agentRunner.configure({
        platform: this._platform,
        systemPrompt,
        maxIterations: Infinity,
        autoExecuteTools: this._settings.autoExecuteTools,
        temperature: this._settings.temperature,
        maxTokens: this._settings.maxTokens,
        modelId: effectiveModelId,
        executionMode: this._settings.executionMode,
        thinkingBudget: 10000,
      });

      // Create agent context
      const context = createDefaultAgentContext();
      context.activeEditor = this._editorRegistry?.getActiveEditor();
      context.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      context.projectType = context.activeEditor?.type || 'unknown';
      if (imageAttachments && imageAttachments.length > 0) {
        context.imageAttachments = imageAttachments;
      }

      // Subscribe to tool confirmation requests (ask mode)
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

      // Delegate stream processing to AgentStreamProcessor
      const result = await this._streamProcessor.processStream(
        webview,
        conversationId,
        agentRunner.execute(message, context),
        {
          onPhaseChange: (phase, toolName) => {
            const timestamp = Date.now();
            this._updateAgentState(conversationId, phase, toolName, timestamp);
            webview.postMessage({
              type: 'agentPhase',
              conversationId,
              phase,
              toolName,
              timestamp,
            });
          },
        },
      );

      // Store assistant message
      if (
        (result.accumulatedResponse ||
          result.collectedToolCalls.length > 0 ||
          result.accumulatedThinking) &&
        !result.hasError
      ) {
        const assistantMessage: ConversationMessage = {
          id: this._generateId(),
          role: 'assistant',
          content: result.accumulatedResponse,
          timestamp: Date.now(),
          thinking: result.accumulatedThinking || undefined,
          toolCalls: result.collectedToolCalls.length > 0 ? result.collectedToolCalls : undefined,
          contentBlocks: result.contentBlocks.length > 0 ? result.contentBlocks : undefined,
        };
        this._conversations.addMessageToConversation(conversationId, assistantMessage);
      }
    } catch (error) {
      logger.error('Agent execution error:', error);
      this._updateAgentState(conversationId, 'idle', undefined, Date.now());
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
      confirmationDisposable?.dispose();
    }
  }

  /**
   * Send fallback response when no provider is configured
   */
  private _sendFallbackResponse(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'error',
      message:
        'No AI provider configured. Please go to Settings and add an AI provider (Claude, OpenAI, etc.) with your API key.',
    });
  }

  private _updateAgentState(
    conversationId: string,
    phase: AgentPhase,
    toolName: string | undefined,
    startedAt: number,
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
   */
  private async _parseFileReferences(messageText: string): Promise<{
    message: string;
    fileContents: FileReference[];
  }> {
    const inputProcessor = this._getInputProcessor();
    if (!inputProcessor) {
      return { message: messageText, fileContents: [] };
    }

    try {
      const result = await inputProcessor.process(messageText);

      const fileContents: FileReference[] = result.fileReferences
        .filter((ref) => ref.content)
        .map((ref) => ({
          path: ref.path,
          content: ref.content!,
        }));

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          logger.warn(`Could not read file: ${error.reference}`, error.error);
        }
      }

      return { message: messageText, fileContents };
    } catch (error) {
      logger.error('InputProcessor error:', error);
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

      const projectFiles = files.map((file) => {
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
      logger.error('Error searching project files:', error);
      webview.postMessage({ type: 'projectFiles', files: [] });
    }
  }

  /**
   * Generate unique ID
   */
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
