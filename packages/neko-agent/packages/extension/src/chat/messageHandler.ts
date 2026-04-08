/**
 * Message Handler
 *
 * Orchestrates user messages, AI interactions, and agent execution.
 * Delegates attachment processing to AttachmentProcessor and
 * stream processing to AgentStreamProcessor.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { Platform, MediaTask } from '@neko/platform';
import type { ConversationMessage } from './conversationManager';
import type { IAgentManager } from '../ai/agentManager';
import { createDefaultAgentContext } from '../ai/agentContext';
import { getCanvasSelection } from '../services/canvasAmbientContext';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationHandler } from './conversationHandler';
import { FileReference, MessageAttachment } from './types';
import { AttachmentProcessor } from './message/attachmentProcessor';
import { AgentStreamProcessor } from './message/agentStreamProcessor';
import { MediaPreprocessor, isImageMime, isVideoMime } from './message/mediaPreprocessor';
import { getMimeType } from '@neko/shared';
import { createInputProcessor, type InputProcessor, type IFileReader } from '@neko/agent';
import { EngineClient } from '@neko/neko-client';
import type { AgentPhase } from '@neko-agent/types';
import { GeneratedAssetIndex, resolveGeneratedDir } from '../services/generatedAssetIndex';
import { getLogger } from '../base';

const logger = getLogger('MessageHandler');

// =============================================================================
// neko-engine transcoder (lazy, optional)
// =============================================================================

let _engineClient: EngineClient | null = null;

/**
 * Lazily acquire EngineClient via neko-engine Frame Server command.
 * Returns null if neko-engine is not installed or fails to start.
 */
async function getEngineClient(): Promise<EngineClient | null> {
  if (_engineClient) return _engineClient;
  try {
    const ext = vscode.extensions.getExtension('neko.neko-engine');
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();
    const result = await vscode.commands.executeCommand<{ port: number } | null>(
      'neko.engine.ensureFrameServer',
    );
    if (!result) return null;
    _engineClient = new EngineClient(result.port, { timeout: 300_000 });
    return _engineClient;
  } catch {
    return null;
  }
}

/**
 * Transcode a media file to a webview-compatible format using neko-engine FFmpeg.
 * Audio → MP3, Video → H.264 MP4.
 */
async function transcodeFile(
  inputPath: string,
  outputPath: string,
  mediaType: 'audio' | 'video',
): Promise<boolean> {
  const client = await getEngineClient();
  if (!client) return false;

  try {
    const group = mediaType === 'audio' ? 'audios' : 'videos';
    const codec = mediaType === 'audio' ? 'mp3' : 'h264';
    const resp = await client.dispatch({
      group,
      action: 'transcode',
      options: { source: inputPath, output: outputPath, codec },
    });
    return resp.status === 'ok';
  } catch (err) {
    logger.warn('neko-engine transcode failed:', err);
    return false;
  }
}

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
  private readonly _assetIndex: GeneratedAssetIndex | undefined;

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

    // Initialize GeneratedAssetIndex if workspace is available (ADR-4)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      try {
        const generatedDir = resolveGeneratedDir(workspaceFolders[0].uri.fsPath);
        this._assetIndex = new GeneratedAssetIndex(generatedDir);
        void this._assetIndex.load();
      } catch {
        // Directory may not be writable (e.g. tests, readonly workspace)
        logger.warn('Failed to initialize GeneratedAssetIndex — asset tracking disabled');
      }
    }

    this._streamProcessor = new AgentStreamProcessor({
      platform: this._platform,
      conversations: this._conversations,
      assetIndex: this._assetIndex,
      transcodeFile,
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
   * @param sessionMode - Session mode ('agent' | 'image' | 'video' | 'audio')
   * @param mediaModelId - Selected media model ID for non-agent modes
   */
  async handleUserMessage(
    webview: vscode.Webview,
    messageText: string,
    providerId?: string,
    modelId?: string,
    attachments?: MessageAttachment[],
    promptId?: string,
    requestConversationId?: string,
    sessionMode?: string,
    mediaProviderId?: string,
    mediaModelId?: string,
    agentMediaModels?: {
      image?: { providerId?: string; modelId: string };
      video?: { providerId?: string; modelId: string };
      audio?: { providerId?: string; modelId: string };
    },
  ): Promise<void> {
    const conversationId = requestConversationId || this._conversations.ensureActive();

    // Parse @ file references
    const { message: parsedMessage, fileContents } = await this._parseFileReferences(messageText);

    // Process attachments via AttachmentProcessor
    const { textContent: attachmentText, imageAttachments } =
      await this._attachmentProcessor.processAttachments(attachments);

    // Auto-preprocess media files referenced via [File: ...] chips
    const mediaImages = await this._preprocessFileReferences(parsedMessage, imageAttachments);

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

    // Route: non-agent mode → media generation service
    const isMediaMode =
      sessionMode && sessionMode !== 'agent' && mediaModelId && mediaModelId !== 'none';

    if (isMediaMode && this._platform?.media) {
      await this._executeMediaGeneration(
        webview,
        conversationId,
        enhancedMessage,
        sessionMode,
        mediaProviderId,
        mediaModelId,
      );
    } else if (this._agentManager && this._platform) {
      await this._executeWithAgent(
        webview,
        conversationId,
        enhancedMessage,
        providerId,
        modelId,
        mediaImages,
        promptId,
        mediaProviderId,
        mediaModelId,
        agentMediaModels,
      );
    } else {
      this._sendFallbackResponse(webview);
    }
  }

  /**
   * Execute media generation for non-agent session modes (image / video / audio).
   * Delegates routing and provider selection to platform.media.
   */
  private async _executeMediaGeneration(
    webview: vscode.Webview,
    conversationId: string,
    prompt: string,
    category: string,
    providerId: string | undefined,
    modelId: string,
  ): Promise<void> {
    try {
      const media = this._platform!.media!;
      let task: MediaTask;

      if (category === 'image') {
        task = await media.generateImage({ prompt, providerId, modelId });
      } else if (category === 'video') {
        task = await media.generateVideo({ prompt, providerId, modelId });
      } else if (category === 'audio') {
        task = await media.generateAudio({ prompt, providerId, modelId });
      } else {
        this._sendFallbackResponse(webview);
        return;
      }

      // Notify webview: task submitted
      webview.postMessage({ type: 'mediaTaskCreated', conversationId, task });

      // Subscribe to progress — webview receives live updates until done
      const unsubscribe = media.onProgress(task.id, (updated) => {
        webview.postMessage({ type: 'mediaTaskProgress', conversationId, task: updated });
        if (
          updated.status === 'completed' ||
          updated.status === 'failed' ||
          updated.status === 'cancelled'
        ) {
          unsubscribe();
        }
      });

      // Race condition fix: task may have already completed/failed before onProgress registered
      const currentTask = await media.getTask(task.id);
      if (
        currentTask &&
        (currentTask.status === 'completed' ||
          currentTask.status === 'failed' ||
          currentTask.status === 'cancelled')
      ) {
        logger.info(`Media task ${task.id} already in terminal state: ${currentTask.status}`, {
          error: currentTask.error,
        });
        webview.postMessage({ type: 'mediaTaskProgress', conversationId, task: currentTask });
        unsubscribe();
      }
    } catch (error) {
      logger.error('Media generation error:', error);
      webview.postMessage({
        type: 'error',
        conversationId,
        message: error instanceof Error ? error.message : 'Media generation failed',
      });
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
    mediaProviderId?: string,
    mediaModelId?: string,
    agentMediaModels?: {
      image?: { providerId?: string; modelId: string };
      video?: { providerId?: string; modelId: string };
      audio?: { providerId?: string; modelId: string };
    },
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

      // Apply session-level media routing defaults so agent tool calls can omit providerId/modelId.
      // Agent mode: apply per-category selections from AgentMediaBar.
      // Non-agent mode: apply single mediaModelId across all categories.
      if (agentMediaModels && Object.keys(agentMediaModels).length > 0) {
        this._platform.config.setRuntimeMediaDefaults({
          image: agentMediaModels.image?.modelId,
          video: agentMediaModels.video?.modelId,
          audio: agentMediaModels.audio?.modelId,
          music: agentMediaModels.audio?.modelId,
        });
      } else if (mediaModelId) {
        this._platform.config.setRuntimeMediaDefaults({
          image: mediaModelId,
          video: mediaModelId,
          audio: mediaModelId,
          music: mediaModelId,
        });
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

      let systemPrompt = this._settings.customSystemPrompt || this._getSystemPrompt();

      // Append ambient canvas context to system prompt if nodes are selected
      const ambientCanvas = getCanvasSelection();
      if (ambientCanvas.length > 0) {
        const nodeLines = ambientCanvas
          .map((n) => `  - [${n.type}] ${n.summary} (id: ${n.nodeId})`)
          .join('\n');
        systemPrompt +=
          `\n\n## Current Canvas Selection\nThe user has selected the following canvas node(s):\n${nodeLines}\n` +
          `Use canvas_get_node / canvas_update_node / canvas_generate_image tools to operate on them.`;
      }

      await agentRunner.configure({
        platform: this._platform,
        systemPrompt,
        maxIterations: 200,
        autoExecuteTools: this._settings.autoExecuteTools,
        temperature: this._settings.temperature,
        maxTokens: this._settings.maxTokens,
        modelId: effectiveModelId,
        executionMode: this._settings.executionMode,
        thinkingBudget: this._settings.thinkingBudget,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });

      // Create agent context
      const context = createDefaultAgentContext();
      context.activeEditor = this._editorRegistry?.getActiveEditor();
      context.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      context.projectType = context.activeEditor?.type || 'unknown';
      if (imageAttachments && imageAttachments.length > 0) {
        context.imageAttachments = imageAttachments;
      }
      // Inject ambient canvas selection (updated by onSelectionChange subscription)
      const canvasSelection = getCanvasSelection();
      if (canvasSelection.length > 0) {
        context.canvasContext = { selectedNodes: canvasSelection };
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
   * Extract [File: ...] references from chip-injected messages and
   * auto-preprocess images/videos into vision-ready attachments.
   */
  private async _preprocessFileReferences(
    message: string,
    existingImages: Array<{ type: 'base64'; media_type: string; data: string }>,
  ): Promise<Array<{ type: 'base64'; media_type: string; data: string }>> {
    // Match [File: label]\nfilePath pattern injected by InputArea chip consumption
    const FILE_REF_RE = /\[File: [^\]]+\]\n(.+)/g;
    const paths: string[] = [];
    let match;
    while ((match = FILE_REF_RE.exec(message)) !== null) {
      const fp = match[1]?.trim();
      if (fp) paths.push(fp);
    }

    if (paths.length === 0) return existingImages;

    const engineClient = await getEngineClient();
    const preprocessor = new MediaPreprocessor(engineClient);
    const result = [...existingImages];

    for (const fp of paths) {
      const mime = getMimeType(fp);
      if (!isImageMime(mime) && !isVideoMime(mime)) continue;

      try {
        const processed = await preprocessor.process(fp);
        for (const img of processed.images) {
          result.push({ type: 'base64', media_type: img.media_type, data: img.data });
        }
        if (processed.metadata) {
          logger.info(`Preprocessed ${fp}: ${processed.type}`, processed.metadata);
        }
      } catch (err) {
        logger.warn(`Failed to preprocess media: ${fp}`, err);
      }
    }

    return result;
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
   * Search project files for @ reference.
   * Also appends canvas ambient nodes as mention extras so the webview can
   * show them as context-chip candidates alongside file results.
   */
  async searchProjectFiles(webview: vscode.Webview, filter: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    let projectFiles: Array<{ path: string; name: string; type: 'file' }> = [];

    if (workspaceFolders && workspaceFolders.length > 0) {
      try {
        const pattern = filter ? `**/*${filter}*` : '**/*';
        const excludePattern = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**';
        const files = await vscode.workspace.findFiles(pattern, excludePattern, 30);

        projectFiles = files.map((file) => {
          const relativePath = vscode.workspace.asRelativePath(file);
          const name = relativePath.split('/').pop() || relativePath;
          return { path: relativePath, name, type: 'file' as const };
        });
      } catch (error) {
        logger.error('Error searching project files:', error);
      }
    }

    // Include canvas ambient nodes as mention extras
    const { getCanvasSelection } = await import('../services/canvasAmbientContext');
    const canvasNodes = getCanvasSelection();
    const mentionExtras = canvasNodes
      .filter((n) => !filter || n.summary.toLowerCase().includes(filter.toLowerCase()))
      .map((n) => ({
        type: 'canvas-node' as const,
        id: n.nodeId,
        label: n.summary,
        summary: `Canvas: ${n.summary}`,
      }));

    webview.postMessage({ type: 'projectFiles', files: projectFiles, mentionExtras });
  }

  /**
   * Generate unique ID
   */
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Dispose resources. Flushes asset index to disk.
   */
  dispose(): void {
    this._assetIndex?.dispose();
  }
}
