/**
 * AI Assistant View Provider
 * Main entry point - orchestrates all components
 *
 * Refactored to use specialized handlers for different domains:
 * - TaskHandler: Task management
 * - TemplateHandler: Template execution
 */

import * as vscode from 'vscode';
import { getService, getLogger } from '../base';

const logger = getLogger('ChatProvider');
import type { Platform } from '@neko/platform';
import type { ITaskManager as TaskManager } from '@neko/shared';
import type { ProviderConfig } from '@neko/shared';
import type { IAgentManager } from '../ai/agentManager';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import {
  IPlatform,
  ITaskManager,
  IConnectionStateManager,
  IAgentManager as IAgentManagerId,
} from '../bootstrap';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationHandler } from './conversationHandler';
import { MessageHandler } from './messageHandler';
import { SystemPromptManager } from './systemPromptManager';
import { WebviewMessage, MessageAttachment, TabState, OpenTab } from './types';
import { ConfigBridge } from '../services/configBridge';
import {
  TaskHandler,
  SkillHandler,
  FileOperationHandler,
  PlanModeHandler,
  ProviderHandler,
  IntegrationHandler,
  SettingsHandler,
  ContextHandler,
  SlashCommandHandler,
  ConversationMessageHandler,
} from './handlers';
import { createSkillService, builtinSkills } from '@neko/agent';
import { getSkillFileService, type SkillScanResult } from '../services/SkillFileService';

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
  private readonly _skillHandler: SkillHandler;
  private readonly _fileOperationHandler: FileOperationHandler;
  private readonly _planModeHandler: PlanModeHandler;
  private readonly _providerHandler: ProviderHandler;
  private readonly _integrationHandler: IntegrationHandler;
  private readonly _settingsHandler: SettingsHandler;
  private readonly _contextHandler: ContextHandler;
  private readonly _slashCommandHandler: SlashCommandHandler;
  private readonly _conversationMessageHandler: ConversationMessageHandler;

  // Lifecycle
  private readonly _disposables: vscode.Disposable[] = [];

  // Services
  private _agentManager?: IAgentManager;
  private _editorRegistry?: IEditorRegistry;
  private _platform?: Platform;
  private _taskManager?: TaskManager;
  private _configBridge?: ConfigBridge;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {
    // Initialize managers
    this._settings = new SettingsManager();
    this._systemPrompt = new SystemPromptManager();
    this._conversations = new ConversationHandler(_context);

    // Load persisted tab state
    this._loadTabState();

    // Initialize handlers with empty deps (will be updated after service init)
    this._taskHandler = new TaskHandler({});
    this._skillHandler = new SkillHandler({});
    this._fileOperationHandler = new FileOperationHandler({});
    this._planModeHandler = new PlanModeHandler({
      systemPrompt: this._systemPrompt,
      conversations: this._conversations,
      settings: this._settings,
    });
    this._providerHandler = new ProviderHandler({
      settings: this._settings,
      sendSettings: () => {
        if (this._view?.webview) {
          this._settingsHandler.sendSettings(this._view.webview);
        }
      },
      getWebview: () => this._view?.webview,
    });
    this._integrationHandler = new IntegrationHandler({
      context: this._context,
      sendSettings: () => {
        if (this._view?.webview) {
          this._settingsHandler.sendSettings(this._view.webview);
        }
      },
    });
    this._settingsHandler = new SettingsHandler({
      settings: this._settings,
    });
    this._contextHandler = new ContextHandler({
      conversations: this._conversations,
    });
    this._conversationMessageHandler = new ConversationMessageHandler({
      conversations: this._conversations,
      getWebview: () => this._view?.webview,
    });
    this._slashCommandHandler = new SlashCommandHandler({
      conversations: this._conversations,
      settings: this._settings,
      systemPrompt: this._systemPrompt,
      skillHandler: this._skillHandler,
      taskHandler: this._taskHandler,
      contextHandler: this._contextHandler,
      planModeHandler: this._planModeHandler,
      sendConversationList: () => this._conversationMessageHandler.sendConversationList(),
      sendActiveConversation: () => this._conversationMessageHandler.sendActiveConversation(),
    });

    // Get services - deferred initialization
    this._initializeServices();
  }

  /**
   * Build system prompt with available skills summary appended
   */
  private _buildSystemPromptWithSkills(
    skillService: ReturnType<typeof createSkillService>,
  ): string {
    const basePrompt = this._systemPrompt.getPrompt();
    const skills = skillService.registry.listSkills().filter((s) => s.enabled !== false);
    logger.info(`Building system prompt with ${skills.length} skills`);
    if (skills.length === 0) return basePrompt;

    const lines = ['\n\n# Available Skills\n'];
    lines.push(
      'Skills are specialized instruction sets that get automatically activated when your request matches them. The following skills are registered:\n',
    );
    for (const skill of skills) {
      const desc = skill.description?.split('\n')[0] ?? '';
      lines.push(`- **${skill.name}**: ${desc}`);
    }
    lines.push(
      "\nUse `ActivateSkill` to activate a skill when the user's request matches a skill domain.",
      'Use `GetContext` to see all registered skills and current state.',
    );
    return basePrompt + lines.join('\n');
  }

  /**
   * Populate the skill registry from builtin skills/commands and a disk scan result.
   * Called once on startup and again whenever the file watcher fires.
   */
  private _populateSkillRegistry(
    skillService: ReturnType<typeof createSkillService>,
    scanResult: SkillScanResult,
  ): void {
    skillService.registry.clear();

    for (const skill of builtinSkills) {
      skillService.registry.registerSkill({ ...skill, source: 'builtin' as const, enabled: true });
    }
    for (const skill of [...scanResult.personal.skills, ...scanResult.project.skills]) {
      skillService.registry.registerSkill(skill);
    }

    logger.info(`Skill registry populated: ${skillService.skillCount} skills`, {
      builtin: builtinSkills.length,
      personal: scanResult.personal.skills.length,
      project: scanResult.project.skills.length,
    });
  }

  private _initializeServices(): void {
    try {
      this._agentManager = getService(IAgentManagerId);
      this._editorRegistry = getService(IEditorRegistry);
      this._platform = getService(IPlatform);
      this._taskManager = getService(ITaskManager);

      if (this._platform) {
        // Inject ConfigManager into SettingsManager (late binding)
        this._settings.setConfigManager(this._platform.config);

        // Inject Platform into SystemPromptManager
        this._systemPrompt.setPlatform(this._platform);

        // Load AGENTS.md content
        this._systemPrompt.loadAgentsFile().catch((err) => {
          logger.error('Failed to load AGENTS.md:', err);
        });

        // Get ConnectionStateManager for state sync
        const connectionStateManager = getService(IConnectionStateManager);

        // Initialize ConfigBridge for unified config message handling
        this._configBridge = new ConfigBridge(
          this._platform,
          connectionStateManager,
          this._context,
        );

        // Initialize ToolSkills in ConfigBridge
        // Create a temporary AgentRunner to get ToolSkills (they are registered during configure)
        this._initializeToolSkills();

        // Wire up SkillService: create instance, populate from disk, keep in sync.
        const skillFileService = getSkillFileService();
        const skillService = createSkillService();

        this._providers = new ProviderManager(this._context, this._platform);
        this._messages = new MessageHandler(
          this._settings,
          this._providers,
          this._conversations,
          this._agentManager,
          this._editorRegistry,
          () => this._buildSystemPromptWithSkills(skillService),
          this._platform,
        );

        skillFileService
          .getSkills()
          .then((result) => {
            this._populateSkillRegistry(skillService, result);
          })
          .catch((err: unknown) => {
            logger.warn('Failed to load initial skills into SkillService:', err);
          });
        this._disposables.push(
          skillFileService.onSkillsChanged((result) =>
            this._populateSkillRegistry(skillService, result),
          ),
        );
        this._skillHandler.setDependencies({
          skillService,
          agentManager: this._agentManager,
          getActiveConversationId: () => this._conversations.getActiveId(),
        });

        // Bridge skillService to ISkillProvider for meta tools
        if (this._agentManager) {
          this._agentManager.setSkillProvider({
            listSkills: () =>
              skillService.registry
                .listSkills()
                .filter((s) => s.enabled !== false)
                .map((s) => ({ name: s.name, description: s.description || '' })),
            getActiveSkill: () => {
              const activeId = this._conversations.getActiveId();
              if (!activeId) return null;
              const skill = this._agentManager?.getActiveSkill(activeId);
              return skill ? { name: skill.name, description: skill.description || '' } : null;
            },
            activateSkill: (name: string) => {
              const skill = skillService.registry.getSkill(name);
              if (!skill) return { success: false, message: `Skill "${name}" not found` };
              const activeId = this._conversations.getActiveId();
              if (!activeId) return { success: false, message: 'No active conversation' };
              const injection = skillService.apply(skill);
              this._agentManager?.applySkillInjection(activeId, injection, skill);
              return {
                success: true,
                message: `Activated skill "${name}"`,
                allowedTools: injection.allowedTools,
              };
            },
            deactivateSkill: () => {
              const activeId = this._conversations.getActiveId();
              if (!activeId) return { success: false, message: 'No active conversation' };
              this._agentManager?.clearActiveSkill(activeId);
              return { success: true, message: 'Skill deactivated' };
            },
          });
        }

        // Update handler dependencies via type-safe updateDeps()
        this._taskHandler.updateDeps({
          platform: this._platform,
          taskManager: this._taskManager,
        });
        this._fileOperationHandler.updateDeps({ platform: this._platform });
        this._planModeHandler.updateDeps({
          agentManager: this._agentManager,
          platform: this._platform,
          messages: this._messages,
        });
        this._providerHandler.updateDeps({ providers: this._providers });
        this._settingsHandler.updateDeps({
          providers: this._providers,
          platform: this._platform,
        });
        this._contextHandler.updateDeps({ agentManager: this._agentManager });
        this._slashCommandHandler.updateDeps({ agentManager: this._agentManager });
        this._conversationMessageHandler.updateDeps({
          agentManager: this._agentManager,
          messages: this._messages,
        });
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
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // Include workspace folders in localResourceRoots for accessing generated media files
    const workspaceFolders = vscode.workspace.workspaceFolders?.map((f) => f.uri) || [];
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
          postMessageFn,
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
            message.conversationId as string | undefined,
            message.sessionMode as string | undefined,
            message.mediaProviderId as string | undefined,
            message.mediaModelId as string | undefined,
            message.agentMediaModels as
              | {
                  image?: { providerId?: string; modelId: string };
                  video?: { providerId?: string; modelId: string };
                  audio?: { providerId?: string; modelId: string };
                }
              | undefined,
          );
          break;
        case 'searchProjectFiles':
          this._messages?.searchProjectFiles(webview, message.filter as string);
          break;
        case 'confirmTool':
          this._conversationMessageHandler.handleConfirmTool(
            message.toolCallId as string,
            message.approved as boolean,
            message.conversationId as string | undefined,
          );
          break;

        // Plan mode messages
        case 'planApprove':
          this._planModeHandler.handlePlanApprove(
            webview,
            message.planId as string,
            message.conversationId as string,
            message.filePath as string | undefined,
          );
          break;
        case 'planReject':
          this._planModeHandler.handlePlanReject(
            webview,
            message.planId as string,
            message.conversationId as string,
          );
          break;
        case 'planStepApprove':
          this._planModeHandler.handlePlanStepAction(
            webview,
            message.planId as string,
            message.stepId as string,
            message.conversationId as string,
            'approve',
          );
          break;
        case 'planStepReject':
          this._planModeHandler.handlePlanStepAction(
            webview,
            message.planId as string,
            message.stepId as string,
            message.conversationId as string,
            'reject',
          );
          break;
        case 'planStepModify':
          this._planModeHandler.handlePlanStepModify(
            webview,
            message.planId as string,
            message.stepId as string,
            message.newDescription as string,
            message.conversationId as string,
          );
          break;

        // Cancel / stop agent
        case 'cancelMessage':
          this._conversationMessageHandler.handleCancelMessage(webview);
          break;
        case 'stopAgent':
          this._conversationMessageHandler.handleStopAgent(
            webview,
            message.conversationId as string,
          );
          break;

        // Conversation management (delegated to ConversationMessageHandler)
        case 'newConversation':
          this._conversationMessageHandler.handleNewConversation();
          break;
        case 'switchConversation':
          this._conversationMessageHandler.handleSwitchConversation(
            message.conversationId as string,
          );
          break;
        case 'deleteConversation':
          this._conversationMessageHandler.handleDeleteConversation(
            message.conversationId as string,
          );
          break;
        case 'getConversations':
          this._conversationMessageHandler.sendConversationList();
          break;
        case 'getActiveConversation':
          this._conversationMessageHandler.sendActiveConversation();
          break;
        case 'getAgentStates':
          this._conversationMessageHandler.sendAgentStateSnapshot(webview);
          break;
        case 'clearHistory':
          this._conversationMessageHandler.handleClearHistory(webview);
          break;
        case 'clearAllConversations':
          this._conversationMessageHandler.handleClearAllConversations(webview);
          break;

        // Settings handling
        case 'getSettings':
          this._settingsHandler.sendSettings(webview);
          break;
        case 'updateSettings':
          this._settingsHandler.handleUpdateSettings(
            webview,
            message.settings as Record<string, unknown>,
          );
          break;

        // Tab state handling
        case 'getTabState':
          this._sendTabState();
          break;
        case 'updateTabState':
          this._updateTabState(message.openTabs as OpenTab[], message.activeTabId as string | null);
          break;

        // Provider handling
        case 'addModel':
          this._providerHandler.handleAddModel(message.model as ProviderConfig);
          break;
        case 'removeModel':
          this._providerHandler.handleRemoveModel(message.modelType as string);
          break;
        case 'toggleProvider':
          this._providerHandler.handleToggleProvider(
            message.providerType as string,
            message.enabled as boolean,
          );
          break;
        case 'toggleModel':
          this._providerHandler.handleToggleModel(
            message.providerType as string,
            message.modelId as string,
            message.enabled as boolean,
          );
          break;

        // Integration handling
        case 'addMCPServer':
          this._integrationHandler.addMCPServer();
          break;
        case 'testMCPServer':
          this._integrationHandler.handleTestMCPServer(
            webview,
            message.server as {
              id: string;
              name: string;
              command: string;
              args?: string[];
              env?: Record<string, string>;
              requestId?: string;
            },
          );
          break;

        // Task handling (delegated to TaskHandler)
        case 'getTasks':
          this._taskHandler.sendTasks(webview);
          break;
        case 'cancelTask':
          this._taskHandler.handleCancelTask(webview, message.taskId as string);
          break;
        case 'retryTask':
          this._taskHandler.handleRetryTask(webview, message.taskId as string);
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
        case 'revealFile':
          this._fileOperationHandler.handleRevealFile(message.filePath as string);
          break;
        case 'openConfigFile':
          this._fileOperationHandler.handleOpenConfigFile();
          break;
        case 'openPromptConfig':
          this._fileOperationHandler.handleOpenPromptConfig(
            message.source as 'personal' | 'project',
            message.promptId as string | undefined,
          );
          break;
        case 'openAgentsFile':
          this._fileOperationHandler.handleOpenAgentsFile(message.source as 'personal' | 'project');
          break;
        case 'openSettingsFile':
          this._fileOperationHandler.handleOpenSettingsFile(
            message.source as 'personal' | 'project' | 'local',
          );
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
            message.filePath as string | undefined,
          );
          break;
        case 'openCommandFile':
          this._fileOperationHandler.handleOpenCommandFile(
            message.commandName as string,
            message.source as 'personal' | 'project',
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
              undefined, // promptId
            );
          }
          break;

        // Download SVG file
        case 'downloadSvg':
          this._fileOperationHandler.handleDownloadSvg(
            message.svg as string,
            message.filename as string,
          );
          break;

        // Skill handling (delegated to SkillHandler)
        case 'getSkills':
          this._skillHandler.sendSkillsList(webview);
          break;
        case 'executeSkill':
          this._skillHandler.handleExecuteSkill(
            webview,
            message.skillId as string,
            (message.input as Record<string, unknown>) || {},
          );
          break;
        case 'cancelSkill':
          this._skillHandler.handleCancelSkill(message.skillId as string);
          break;

        // Slash command invocation
        case 'invokeSlashCommand':
          this._slashCommandHandler.handleCommand(
            webview,
            message.command as string,
            message.args as string | undefined,
          );
          break;

        // Context management
        case 'getContextTokenCount':
          this._contextHandler.getTokenCount(webview, message.conversationId as string | undefined);
          break;
        case 'compressContext':
          this._contextHandler.compressContext(
            webview,
            message.conversationId as string | undefined,
          );
          break;

        // Open full Neko Marketplace panel (neko-market extension)
        case 'openMarketplace':
          vscode.commands.executeCommand('neko.market.openSkills').then(undefined, () => {
            // neko-market extension not installed — silently ignore
          });
          break;
      }
    });
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  private _restoreState(): void {
    this._conversationMessageHandler.sendConversationList();
    this._conversationMessageHandler.sendActiveConversation();
    if (this._view) {
      this._settingsHandler.sendSettings(this._view.webview);
      this._sendTabState();
      this._taskHandler.sendTasks(this._view.webview);
      this._conversationMessageHandler.sendAgentStateSnapshot(this._view.webview);
    }
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
  // HTML Generation
  // ============================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant-style.css'),
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
