/**
 * AI Assistant View Provider
 * Main entry point - orchestrates all components
 *
 * Refactored to use specialized handlers for different domains:
 * - TaskHandler: Task management
 * - ModelPresetHandler: Model preset configuration
 * - TemplateHandler: Template execution
 */

import * as vscode from 'vscode';
import { getService, getLogger } from '../base';

const logger = getLogger('ChatProvider');
import type { Platform, TaskManager } from '@neko/platform';
import type { ProviderConfig } from '@neko/shared';
import type { IAgentManager } from '../ai/agentManager';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import { IPlatform, ITaskManager, IConnectionStateManager, IAgentManager as IAgentManagerId } from '../bootstrap';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationHandler } from './conversationHandler';
import { MessageHandler } from './messageHandler';
import { SystemPromptManager } from './systemPromptManager';
import { WebviewMessage, MessageAttachment, TabState, OpenTab } from './types';
import { GenericConfigService } from '../services/genericConfigService';
import { ConfigBridge } from '../services/configBridge';
import { TaskHandler, ModelPresetHandler, SkillHandler, FileOperationHandler, PlanModeHandler, ProviderHandler, IntegrationHandler } from './handlers';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.aiAssistant';
  private static readonly TAB_STATE_KEY = 'neko.tabState';

  private _view?: vscode.WebviewView;

  // Managers
  private readonly _settings: SettingsManager;
  private readonly _systemPrompt: SystemPromptManager;
  private readonly _conversations: ConversationHandler;
  private _providers?: ProviderManager;
  private _messages?: MessageHandler;

  // Tab state for persistence
  private _tabState: TabState = { openTabs: [], activeTabId: null };

  // Handlers
  private readonly _taskHandler: TaskHandler;
  private readonly _modelPresetHandler: ModelPresetHandler;
  private readonly _skillHandler: SkillHandler;
  private readonly _fileOperationHandler: FileOperationHandler;
  private readonly _planModeHandler: PlanModeHandler;
  private readonly _providerHandler: ProviderHandler;
  private readonly _integrationHandler: IntegrationHandler;

  // Services
  private _agentManager?: IAgentManager;
  private _editorRegistry?: IEditorRegistry;
  private _platform?: Platform;
  private _taskManager?: TaskManager;
  private _configBridge?: ConfigBridge;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    // Initialize managers
    this._settings = new SettingsManager(_context);
    this._systemPrompt = new SystemPromptManager();
    this._conversations = new ConversationHandler(_context);

    // Load persisted tab state
    this._loadTabState();

    // Initialize handlers with empty deps (will be updated after service init)
    this._taskHandler = new TaskHandler({});
    this._modelPresetHandler = new ModelPresetHandler({});
    this._skillHandler = new SkillHandler({});
    this._fileOperationHandler = new FileOperationHandler({});
    this._planModeHandler = new PlanModeHandler({
      systemPrompt: this._systemPrompt,
      conversations: this._conversations,
      settings: this._settings,
    });
    this._providerHandler = new ProviderHandler({
      settings: this._settings,
      sendSettings: () => this._sendSettings(),
      getWebview: () => this._view?.webview,
    });
    this._integrationHandler = new IntegrationHandler({
      context: this._context,
      sendSettings: () => this._sendSettings(),
    });

    // Get services - deferred initialization
    this._initializeServices();
  }

  private _initializeServices(): void {
    try {
      this._agentManager = getService(IAgentManagerId);
      this._editorRegistry = getService(IEditorRegistry);
      this._platform = getService(IPlatform);
      this._taskManager = getService(ITaskManager);

      if (this._platform) {
        // Inject Platform into SystemPromptManager
        this._systemPrompt.setPlatform(this._platform);

        // Load AGENTS.md content
        this._systemPrompt.loadAgentsFile().catch((err) => {
          logger.error('Failed to load AGENTS.md:', err);
        });

        // Get ConnectionStateManager for state sync
        const connectionStateManager = getService(IConnectionStateManager);

        // Initialize ConfigBridge for unified config message handling
        this._configBridge = new ConfigBridge(this._platform, connectionStateManager, this._context);

        // Initialize ToolSkills in ConfigBridge
        // Create a temporary AgentRunner to get ToolSkills (they are registered during configure)
        this._initializeToolSkills();

        this._providers = new ProviderManager(this._context, this._platform);
        this._messages = new MessageHandler(
          this._settings,
          this._providers,
          this._conversations,
          this._agentManager,
          this._editorRegistry,
          () => this._systemPrompt.getPrompt(),
          this._platform
        );

        // Update handler dependencies
        (this._taskHandler as any).deps = {
          platform: this._platform,
          taskManager: this._taskManager,
        };
        (this._skillHandler as any).deps = {
          platform: this._platform,
        };
        (this._fileOperationHandler as any).deps = {
          platform: this._platform,
        };
        (this._planModeHandler as any).deps = {
          ...this._planModeHandler['deps'],
          agentManager: this._agentManager,
          platform: this._platform,
          messages: this._messages,
        };
        (this._providerHandler as any).deps = {
          ...this._providerHandler['deps'],
          providers: this._providers,
        };
      }
    } catch (error) {
      logger.error('Failed to get services:', error);
    }
  }

  /**
   * Initialize ToolSkills in ConfigBridge
   * Creates a temporary AgentRunner to get ToolSkills (they are registered during configure)
   */
  private async _initializeToolSkills(): Promise<void> {
    if (!this._agentManager || !this._platform || !this._configBridge) {
      return;
    }

    try {
      // Get or create a temporary agent runner
      const tempRunner = this._agentManager.getOrCreate('__toolskill_init__');

      // Configure it to initialize ToolSkillRegistry
      await tempRunner.configure({
        platform: this._platform,
        groupId: 'default',
        systemPrompt: '',
        maxIterations: 1,
        autoExecuteTools: false,
      });

      // Get ToolSkills and pass to ConfigBridge
      const toolSkills = tempRunner.getToolSkills();
      this._configBridge.setToolSkills(toolSkills);

      // Clean up the temporary runner
      this._agentManager.remove('__toolskill_init__');
    } catch (error) {
      logger.error('Failed to initialize ToolSkills:', error);
    }
  }

  /**
   * Resolve the webview view when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Include workspace folders in localResourceRoots for accessing generated media files
    const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri) || [];
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri, ...workspaceFolders],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setupMessageHandlers(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._restoreState();
      }
    });
  }

  /**
   * Set the GenericConfigService for model preset management
   */
  public setGenericConfigService(service: GenericConfigService): void {
    this._modelPresetHandler.setConfigService(service);
  }

  /**
   * Send a message to the AI assistant from external commands
   * Opens the assistant panel and prefills/sends the message
   */
  public async sendMessageToAssistant(message: string, autoSend: boolean = true): Promise<void> {
    // Focus the AI Assistant panel
    await vscode.commands.executeCommand('neko.aiAssistant.focus');

    if (!this._view?.webview) {
      logger.warn('AI Assistant webview not available');
      return;
    }

    // Send message to webview to prefill or auto-send
    this._view.webview.postMessage({
      type: autoSend ? 'externalMessage' : 'prefillInput',
      message,
    });
  }

  /**
   * Set up message handlers for webview communication
   */
  private _setupMessageHandlers(webview: vscode.Webview) {
    // Register webview for broadcasts (skills, commands, etc.)
    const postMessageFn = (msg: unknown) => webview.postMessage(msg);
    if (this._configBridge) {
      this._configBridge.registerWebview(postMessageFn);
    }

    webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      // 1. Delegate config messages to ConfigBridge
      if (this._configBridge) {
        const handled = await this._configBridge.handleMessage(
          message as { type: string; [key: string]: unknown },
          postMessageFn
        );
        if (handled) return;
      }

      // 2. Handle chat-specific messages
      switch (message.type) {
        // Message handling
        case 'sendMessage':
          this._messages?.handleUserMessage(
            webview,
            message.message as string,
            message.providerId as string | undefined,
            message.modelId as string | undefined,
            message.attachments as MessageAttachment[] | undefined,
            message.promptId as string | undefined,
            message.conversationId as string | undefined
          );
          break;
        case 'searchProjectFiles':
          this._messages?.searchProjectFiles(webview, message.filter as string);
          break;
        case 'confirmTool': {
          const confirmConversationId = (message.conversationId as string) || this._conversations.getActiveId();
          if (confirmConversationId) {
            this._agentManager?.confirmTool(confirmConversationId, message.toolCallId as string, message.approved as boolean);
          } else {
            logger.warn('No conversation for confirmTool');
          }
          break;
        }

        // Plan mode messages
        case 'planApprove':
          this._planModeHandler.handlePlanApprove(webview, message.planId as string, message.conversationId as string, message.filePath as string | undefined);
          break;
        case 'planReject':
          this._planModeHandler.handlePlanReject(webview, message.planId as string, message.conversationId as string);
          break;
        case 'planStepApprove':
          this._planModeHandler.handlePlanStepAction(webview, message.planId as string, message.stepId as string, message.conversationId as string, 'approve');
          break;
        case 'planStepReject':
          this._planModeHandler.handlePlanStepAction(webview, message.planId as string, message.stepId as string, message.conversationId as string, 'reject');
          break;
        case 'planStepModify':
          this._planModeHandler.handlePlanStepModify(webview, message.planId as string, message.stepId as string, message.newDescription as string, message.conversationId as string);
          break;

        // Cancel message generation
        case 'cancelMessage':
          this._handleCancelMessage(webview);
          break;

        // Stop agent for a specific conversation
        case 'stopAgent':
          this._handleStopAgent(webview, message.conversationId as string);
          break;

        // Conversation handling
        case 'newConversation':
          this._conversations.create();
          this._sendConversationList();
          this._sendActiveConversation();
          break;
        case 'switchConversation':
          if (this._conversations.switchTo(message.conversationId as string)) {
            this._sendActiveConversation();
          }
          break;
        case 'deleteConversation':
          this._agentManager?.remove(message.conversationId as string);
          this._messages?.clearAgentState(message.conversationId as string);
          this._conversations.delete(message.conversationId as string);
          this._sendConversationList();
          this._sendActiveConversation();
          break;
        case 'getConversations':
          this._sendConversationList();
          break;
        case 'getActiveConversation':
          this._sendActiveConversation();
          break;
        case 'getAgentStates':
          this._sendAgentStateSnapshot(webview);
          break;
        case 'clearHistory':
          const currentConversationId = this._conversations.getActiveId();
          if (currentConversationId) {
            this._agentManager?.clearHistory(currentConversationId);
          }
          this._conversations.clearCurrent();
          webview.postMessage({ type: 'historyCleared' });
          break;
        case 'clearAllConversations':
          // Clear all agent histories
          for (const conv of this._conversations.list()) {
            this._agentManager?.remove(conv.id);
            this._messages?.clearAgentState(conv.id);
          }
          // Clear all conversations from storage
          this._conversations.manager.clear();
          // Notify webview
          this._sendConversationList();
          webview.postMessage({ type: 'historyCleared' });
          break;

        // Settings handling
        case 'getSettings':
          this._sendSettings();
          break;
        case 'updateSettings':
          this._handleUpdateSettings(message.settings as Record<string, unknown>);
          break;

        // Tab state handling
        case 'getTabState':
          this._sendTabState();
          break;
        case 'updateTabState':
          this._updateTabState(
            message.openTabs as OpenTab[],
            message.activeTabId as string | null
          );
          break;

        // Provider handling
        case 'addModel':
          this._providerHandler.handleAddModel(message.model as ProviderConfig);
          break;
        case 'removeModel':
          this._providerHandler.handleRemoveModel(message.modelType as string);
          break;
        case 'toggleProvider':
          this._providerHandler.handleToggleProvider(message.providerType as string, message.enabled as boolean);
          break;
        case 'toggleModel':
          this._providerHandler.handleToggleModel(message.providerType as string, message.modelId as string, message.enabled as boolean);
          break;

        // Integration handling
        case 'addMCPServer':
          this._integrationHandler.addMCPServer();
          break;
        case 'testMCPServer':
          this._integrationHandler.handleTestMCPServer(webview, message.server as { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; requestId?: string });
          break;

        // Task handling (delegated to TaskHandler)
        case 'getTasks':
          this._taskHandler.sendTasks(webview);
          break;
        case 'cancelTask':
          this._taskHandler.handleCancelTask(webview, message.taskId as string);
          break;
        case 'removeTask':
          this._taskHandler.handleRemoveTask(webview, message.taskId as string);
          break;
        case 'viewTaskResult':
          this._taskHandler.handleViewTaskResult(message.taskId as string);
          break;
        case 'clearCompletedTasks':
          this._taskHandler.handleClearCompletedTasks(webview);
          break;
        case 'openFile':
          this._fileOperationHandler.handleOpenFile(message.filePath as string);
          break;
        case 'openPromptConfig':
          this._fileOperationHandler.handleOpenPromptConfig(message.source as 'personal' | 'project', message.promptId as string | undefined);
          break;
        case 'openAgentsFile':
          this._fileOperationHandler.handleOpenAgentsFile(message.source as 'personal' | 'project');
          break;
        case 'openSettingsFile':
          this._fileOperationHandler.handleOpenSettingsFile(message.source as 'personal' | 'project' | 'local');
          break;

        // Prompt mode handling
        case 'setPromptMode':
          this._planModeHandler.handleSetPromptMode(webview, message.mode as 'default' | 'plan');
          break;
        case 'togglePlanMode':
          this._planModeHandler.handleTogglePlanMode(webview);
          break;
        case 'getPromptMode':
          this._planModeHandler.sendPromptMode(webview);
          break;

        case 'openSkillFile':
          this._fileOperationHandler.handleOpenSkillFile(
            message.skillName as string,
            message.source as 'personal' | 'project',
            message.fileType as 'skill' | 'reference' | 'script',
            message.filePath as string | undefined
          );
          break;
        case 'openCommandFile':
          this._fileOperationHandler.handleOpenCommandFile(
            message.commandName as string,
            message.source as 'personal' | 'project'
          );
          break;
        case 'openUrl':
          this._fileOperationHandler.handleOpenUrl(message.url as string);
          break;

        // Mermaid error feedback - send as new message to ask AI to fix
        case 'mermaidError':
          if (message.feedbackMessage) {
            this._messages?.handleUserMessage(
              webview,
              message.feedbackMessage as string,
              undefined, // providerId
              undefined, // modelId
              undefined, // attachments
              undefined  // promptId
            );
          }
          break;

        // Download SVG file
        case 'downloadSvg':
          this._fileOperationHandler.handleDownloadSvg(message.svg as string, message.filename as string);
          break;

        // Model Presets handling (delegated to ModelPresetHandler)
        case 'getModelPresets':
          this._modelPresetHandler.sendModelPresets(webview);
          break;
        case 'configureModelPreset':
          this._modelPresetHandler.handleConfigureModelPreset(webview, message.modelId as string, message.apiKey as string, message.baseUrl as string | undefined);
          break;
        case 'toggleModelPreset':
          this._modelPresetHandler.handleToggleModelPreset(webview, message.modelId as string, message.enabled as boolean);
          break;
        case 'removeModelPresetConfig':
          this._modelPresetHandler.handleRemoveModelPresetConfig(webview, message.modelId as string);
          break;
        case 'exportModelConfig':
          this._modelPresetHandler.handleExportModelConfig(message.includeSecrets as boolean);
          break;
        case 'importModelConfig':
          this._modelPresetHandler.handleImportModelConfig(webview, message.jsonString as string, message.options as { overwrite?: boolean; includeSecrets?: boolean });
          break;
        case 'addCustomModel':
          this._modelPresetHandler.handleAddCustomModel(webview, message.configJson as string, message.apiKey as string | undefined);
          break;

        // Skill handling (delegated to SkillHandler)
        case 'getSkills':
          this._skillHandler.sendSkillsList(webview);
          break;
        case 'executeSkill':
          this._skillHandler.handleExecuteSkill(webview, message.skillId as string, message.input as Record<string, unknown> || {});
          break;
        case 'cancelSkill':
          this._skillHandler.handleCancelSkill(message.skillId as string);
          break;

        // Slash command invocation
        case 'invokeSlashCommand':
          this._handleInvokeSlashCommand(webview, message.command as string, message.args as string | undefined);
          break;

        // Context management
        case 'getContextTokenCount':
          this._handleGetContextTokenCount(webview, message.conversationId as string | undefined);
          break;
        case 'compressContext':
          this._handleCompressContext(webview, message.conversationId as string | undefined);
          break;
      }
    });
  }

  // ============================================================================
  // Conversation Methods
  // ============================================================================

  /**
   * Handle cancel message request - stops agent execution
   */
  private _handleCancelMessage(webview: vscode.Webview): void {
    const conversationId = this._conversations.getActiveId();
    if (conversationId && this._agentManager) {
      const agent = this._agentManager.get(conversationId);
      if (agent?.isRunning()) {
        // Wait for agent to actually stop before notifying webview
        const disposable = agent.onDidStop(() => {
          disposable.dispose();
          webview.postMessage({ type: 'messageCancelled', conversationId });
        });
        this._agentManager.cancel(conversationId);
      } else {
        // Not running, just send immediately
        this._agentManager.cancel(conversationId);
        webview.postMessage({ type: 'messageCancelled', conversationId });
      }
    }
  }

  /**
   * Handle stop agent request for a specific conversation
   * @param webview - The webview to send messages to
   * @param conversationId - The conversation ID to stop
   */
  private _handleStopAgent(webview: vscode.Webview, conversationId: string): void {
    if (conversationId && this._agentManager) {
      this._agentManager.cancel(conversationId);
      this._messages?.clearAgentState(conversationId);
      webview.postMessage({
        type: 'agentStopped',
        conversationId,
      });
      // Also send idle phase to update UI
      webview.postMessage({
        type: 'agentPhase',
        conversationId,
        phase: 'idle',
        timestamp: Date.now(),
      });
    }
  }

  private _sendConversationList(): void {
    if (this._view) {
      this._conversations.sendConversationList(this._view.webview);
    }
  }

  private _sendActiveConversation(): void {
    if (this._view) {
      this._conversations.sendActiveConversation(this._view.webview);
    }
  }

  // ============================================================================
  // Settings Methods
  // ============================================================================

  private _sendSettings(): void {
    if (!this._view || !this._providers) return;

    const providers = this._providers.getAllProviders();
    const configuredProviders = this._providers.getConfiguredProviders();
    const providerTemplates = this._providers.getProviderTemplates();

    if (!this._settings.selectedProviderId) {
      const defaultProvider = this._providers.getDefaultProvider();
      if (defaultProvider) {
        this._settings.selectedProviderId = defaultProvider.id;
        this._settings.selectedModelId = defaultProvider.getDefaultModel();
      }
    }

    // Get chat model options from Platform ConfigManager
    const chatModelOptions = this._platform?.config.getChatModelOptions() ?? [];

    this._view.webview.postMessage({
      type: 'settingsData',
      providers,
      configuredProviders,
      providerTemplates,
      selectedProviderId: this._settings.selectedProviderId,
      selectedModelId: this._settings.selectedModelId,
      systemPrompt: this._settings.customSystemPrompt,
      autoExecuteTools: this._settings.get('autoExecuteTools'),
      streamResponses: this._settings.get('streamResponses'),
      showToolCalls: this._settings.get('showToolCalls'),
      temperature: this._settings.temperature,
      maxTokens: this._settings.maxTokens,
      executionMode: this._settings.executionMode,
      chatModelOptions,
    });
  }

  private _handleUpdateSettings(settings: Record<string, any>): void {
    if (settings.providerId !== undefined) this._settings.selectedProviderId = settings.providerId;
    if (settings.modelId !== undefined) this._settings.selectedModelId = settings.modelId;
    if (settings.systemPrompt !== undefined) this._settings.customSystemPrompt = settings.systemPrompt;
    if (settings.autoExecuteTools !== undefined) this._settings.set('autoExecuteTools', settings.autoExecuteTools);
    if (settings.streamResponses !== undefined) this._settings.set('streamResponses', settings.streamResponses);
    if (settings.showToolCalls !== undefined) this._settings.set('showToolCalls', settings.showToolCalls);
    if (settings.temperature !== undefined) this._settings.set('temperature', settings.temperature);
    if (settings.maxTokens !== undefined) this._settings.set('maxTokens', settings.maxTokens);
    if (settings.executionMode !== undefined) this._settings.executionMode = settings.executionMode;

    if (this._view) {
      this._view.webview.postMessage({ type: 'settingsUpdated', success: true });
    }
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  private _restoreState(): void {
    this._sendConversationList();
    this._sendActiveConversation();
    this._sendSettings();
    this._sendTabState();
    if (this._view) {
      this._taskHandler.sendTasks(this._view.webview);
      this._sendAgentStateSnapshot(this._view.webview);
    }
  }

  private _sendAgentStateSnapshot(webview: vscode.Webview): void {
    if (!this._messages) return;
    webview.postMessage({
      type: 'agentStateSnapshot',
      agentStates: this._messages.getAgentStateSnapshot(),
    });
  }

  // ============================================================================
  // Tab State Methods
  // ============================================================================

  private _loadTabState(): void {
    const saved = this._context.workspaceState.get<TabState>(ChatViewProvider.TAB_STATE_KEY);
    if (saved) {
      this._tabState = saved;
    }
  }

  private _saveTabState(): void {
    this._context.workspaceState.update(ChatViewProvider.TAB_STATE_KEY, this._tabState);
  }

  private _sendTabState(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'tabState',
      tabState: this._tabState,
    });
  }

  private _updateTabState(openTabs: OpenTab[], activeTabId: string | null): void {
    this._tabState = { openTabs, activeTabId };
    this._saveTabState();
  }

  // ============================================================================
  // Context Management Methods
  // ============================================================================

  /**
   * Get context token count for a conversation
   */
  private _handleGetContextTokenCount(webview: vscode.Webview, conversationId?: string): void {
    const activeId = conversationId || this._conversations.getActiveId();
    if (!activeId || !this._agentManager) {
      webview.postMessage({
        type: 'contextTokenCount',
        conversationId: activeId,
        tokenCount: 0,
      });
      return;
    }

    const tokenCount = this._agentManager.getContextTokenCount(activeId);
    webview.postMessage({
      type: 'contextTokenCount',
      conversationId: activeId,
      tokenCount,
    });
  }

  /**
   * Trigger context compression for a conversation
   */
  private async _handleCompressContext(webview: vscode.Webview, conversationId?: string): Promise<void> {
    const activeId = conversationId || this._conversations.getActiveId();
    if (!activeId || !this._agentManager) {
      webview.postMessage({
        type: 'compressionError',
        conversationId: activeId,
        error: 'No active conversation or agent manager',
      });
      return;
    }

    try {
      const result = await this._agentManager.compressContext(activeId);
      webview.postMessage({
        type: 'compressionResult',
        conversationId: activeId,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        ratio: result.ratio,
      });
    } catch (error) {
      webview.postMessage({
        type: 'compressionError',
        conversationId: activeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ============================================================================
  // Slash Command Handling
  // ============================================================================

  /**
   * Handle slash command invocation from webview
   * Supports both builtin commands and skill-based commands
   */
  private _handleInvokeSlashCommand(
    webview: vscode.Webview,
    command: string,
    args?: string
  ): void {
    // Remove leading / if present
    const cmdName = command.startsWith('/') ? command.slice(1) : command;

    // Handle builtin commands first
    switch (cmdName) {
      case 'clear':
      case 'cls':
        // Clear current conversation history
        const currentConversationId = this._conversations.getActiveId();
        if (currentConversationId) {
          this._agentManager?.clearHistory(currentConversationId);
        }
        this._conversations.clearCurrent();
        webview.postMessage({ type: 'historyCleared' });
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Conversation cleared',
        });
        return;

      case 'exit':
      case 'quit':
      case 'q':
        // Exit/close the assistant panel
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Goodbye!',
          action: 'exit',
        });
        return;

      case 'help':
      case 'h':
        // Show help information
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showHelp',
        });
        return;

      case 'new':
        // Create new conversation
        this._conversations.create();
        this._sendConversationList();
        this._sendActiveConversation();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'New conversation created',
        });
        return;

      case 'status':
      case 's':
        // Show status information
        this._sendStatusInfo(webview);
        return;

      case 'compact':
        // Compress context
        this._handleCompressContext(webview, this._conversations.getActiveId() ?? undefined);
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: 'Context compression initiated',
        });
        return;

      case 'model':
        // Show model selection or info
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showModelSelector',
        });
        return;

      case 'settings':
        // Show settings
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showSettings',
        });
        return;

      case 'plan':
        // Toggle plan mode
        this._planModeHandler.handleTogglePlanMode(webview);
        const newPlanMode = this._systemPrompt.isPlanMode();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'togglePlanMode',
          data: { planMode: newPlanMode },
          message: `Plan mode ${newPlanMode ? 'enabled' : 'disabled'}`,
        });
        return;

      case 'tasks':
      case 'todos':
        // Show tasks
        this._taskHandler.sendTasks(webview);
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showTasks',
        });
        return;

      case 'mcp':
        // Show MCP servers info
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showMCPServers',
        });
        return;

      case 'permissions':
        // Show permissions info
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'showPermissions',
        });
        return;

      case 'init':
        // Initialize project
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'initProject',
        });
        return;

      case 'resume':
        // Resume last conversation - send conversation list
        const conversations = this._conversations.list();
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          action: 'resumeConversation',
          data: {
            conversations: conversations.map(c => {
              const conv = this._conversations.manager.get(c.id);
              return {
                id: c.id,
                title: c.title,
                messageCount: conv?.messages.length ?? 0,
              };
            }),
          },
        });
        return;
    }

    // If not a builtin command, try skill-based slash command
    const result = this._skillHandler.handleSlashCommand(webview, cmdName, args);

    if (result) {
      if (result.applied) {
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: true,
          message: `Command /${cmdName} activated`,
          injection: result.injection,
        });
      } else {
        webview.postMessage({
          type: 'slashCommandResult',
          command: cmdName,
          success: false,
          error: result.error || `Failed to execute command: /${cmdName}`,
        });
      }
    } else {
      // Command not found
      webview.postMessage({
        type: 'slashCommandResult',
        command: cmdName,
        success: false,
        error: `Unknown command: /${cmdName}. Type /help for available commands.`,
      });
    }
  }

  /**
   * Send status information to webview
   */
  private _sendStatusInfo(webview: vscode.Webview): void {
    const activeConversationId = this._conversations.getActiveId();
    const conversations = this._conversations.list();
    const activeConversation = activeConversationId
      ? this._conversations.manager.get(activeConversationId)
      : null;

    // Get provider and model info
    const providerId = this._settings.selectedProviderId;
    const modelId = this._settings.selectedModelId;

    // Get skill info
    const activeSkill = this._skillHandler.getActiveSkill();

    // Get context token count
    const tokenCount = activeConversationId
      ? this._agentManager?.getContextTokenCount(activeConversationId) ?? 0
      : 0;

    webview.postMessage({
      type: 'slashCommandResult',
      command: 'status',
      success: true,
      action: 'showStatus',
      data: {
        provider: providerId,
        model: modelId,
        conversationCount: conversations.length,
        activeConversationId,
        messageCount: activeConversation?.messages.length ?? 0,
        tokenCount,
        activeSkill: activeSkill?.skill.name,
        planMode: this._systemPrompt.isPlanMode(),
        executionMode: this._settings.executionMode,
      },
    });
  }

  // ============================================================================
  // HTML Generation
  // ============================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant-style.css')
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:;">
  <title>AI Assistant</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
