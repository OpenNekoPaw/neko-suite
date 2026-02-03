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
import * as fs from 'fs';
import * as path from 'path';
import { getService } from '../base';
import type { Platform, TaskManager } from '@neko/platform';
import { getWorkflowTestService } from '@neko/platform';
import { getMCPTestService } from '@neko/agent';
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
import { TaskHandler, ModelPresetHandler, SkillHandler } from './handlers';

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
          console.error('[ChatViewProvider] Failed to load AGENTS.md:', err);
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
      }
    } catch (error) {
      console.error('Failed to get services:', error);
    }
  }

  /**
   * Initialize ToolSkills in ConfigBridge
   * Creates a temporary AgentRunner to get ToolSkills (they are registered during configure)
   */
  private _initializeToolSkills(): void {
    if (!this._agentManager || !this._platform || !this._configBridge) {
      return;
    }

    try {
      // Get or create a temporary agent runner
      const tempRunner = this._agentManager.getOrCreate('__toolskill_init__');

      // Configure it to initialize ToolSkillRegistry
      tempRunner.configure({
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
      console.error('[ChatProvider] Failed to initialize ToolSkills:', error);
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
      console.warn('[Neko Suite] AI Assistant webview not available');
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
        case 'confirmTool':
          console.log('[ChatProvider] confirmTool message received:', {
            toolCallId: message.toolCallId,
            approved: message.approved,
          });
          const activeConversationId = this._conversations.getActiveId();
          console.log('[ChatProvider] Active conversation:', activeConversationId);
          if (activeConversationId) {
            this._agentManager?.confirmTool(activeConversationId, message.toolCallId as string, message.approved as boolean);
          } else {
            console.warn('[ChatProvider] No active conversation for confirmTool');
          }
          break;

        // Plan mode messages
        case 'planApprove':
          this._handlePlanApprove(webview, message.planId as string, message.conversationId as string, message.filePath as string | undefined);
          break;
        case 'planReject':
          this._handlePlanReject(webview, message.planId as string, message.conversationId as string);
          break;
        case 'planStepApprove':
          this._handlePlanStepAction(webview, message.planId as string, message.stepId as string, message.conversationId as string, 'approve');
          break;
        case 'planStepReject':
          this._handlePlanStepAction(webview, message.planId as string, message.stepId as string, message.conversationId as string, 'reject');
          break;
        case 'planStepModify':
          this._handlePlanStepModify(webview, message.planId as string, message.stepId as string, message.newDescription as string, message.conversationId as string);
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
          this._handleAddModel(message.model as ProviderConfig);
          break;
        case 'removeModel':
          this._handleRemoveModel(message.modelType as string);
          break;
        case 'toggleProvider':
          this._handleToggleProvider(message.providerType as string, message.enabled as boolean);
          break;
        case 'toggleModel':
          this._handleToggleModel(message.providerType as string, message.modelId as string, message.enabled as boolean);
          break;

        // Integration handling
        case 'addMCPServer':
          this._addMCPServer();
          break;
        case 'addWorkflow':
          this._addWorkflow();
          break;
        case 'testMCPServer':
          this._handleTestMCPServer(webview, message.server as { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; requestId?: string });
          break;
        case 'testWorkflow':
          this._handleTestWorkflow(webview, message.workflow as { id: string; name: string; engineType: string; url: string; apiKey?: string; requestId?: string });
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
          this._handleOpenFile(message.filePath as string);
          break;
        case 'openPromptConfig':
          this._handleOpenPromptConfig(message.source as 'personal' | 'project', message.promptId as string | undefined);
          break;
        case 'openAgentsFile':
          this._handleOpenAgentsFile(message.source as 'personal' | 'project');
          break;
        case 'openSettingsFile':
          this._handleOpenSettingsFile(message.source as 'personal' | 'project' | 'local');
          break;

        // Prompt mode handling
        case 'setPromptMode':
          this._handleSetPromptMode(webview, message.mode as 'default' | 'plan');
          break;
        case 'togglePlanMode':
          this._handleTogglePlanMode(webview);
          break;
        case 'getPromptMode':
          this._sendPromptMode(webview);
          break;

        case 'openSkillFile':
          this._handleOpenSkillFile(
            message.skillName as string,
            message.source as 'personal' | 'project',
            message.fileType as 'skill' | 'reference' | 'script',
            message.filePath as string | undefined
          );
          break;
        case 'openCommandFile':
          this._handleOpenCommandFile(
            message.commandName as string,
            message.source as 'personal' | 'project'
          );
          break;
        case 'openUrl':
          this._handleOpenUrl(message.url as string);
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
          this._handleDownloadSvg(message.svg as string, message.filename as string);
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
  // File/URL Opening Methods
  // ============================================================================

  /**
   * Open a file in VSCode editor
   */
  private async _handleOpenFile(filePath: string): Promise<void> {
    if (!filePath) return;

    try {
      // Handle file:// protocol
      const cleanPath = filePath.replace(/^file:\/\//, '');

      // Check if it's a relative path (resolve against workspace)
      let uri: vscode.Uri;
      if (cleanPath.startsWith('/')) {
        uri = vscode.Uri.file(cleanPath);
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          uri = vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
        } else {
          uri = vscode.Uri.file(cleanPath);
        }
      }

      // Open the file
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      console.error('[Neko Suite] Failed to open file:', error);
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  /**
   * Open a URL in external browser
   */
  private async _handleOpenUrl(url: string): Promise<void> {
    if (!url) return;

    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
      console.error('[Neko Suite] Failed to open URL:', error);
      vscode.window.showErrorMessage(`Failed to open URL: ${url}`);
    }
  }

  /**
   * Open prompt config file in VSCode editor
   * Creates the file if it doesn't exist
   */
  private async _handleOpenPromptConfig(source: 'personal' | 'project', promptId?: string): Promise<void> {
    try {
      let basePath: string;

      if (source === 'personal') {
        // User config: ~/.neko/prompts/
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'prompts');
      } else {
        // Project config: .neko/prompts/
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'prompts');
      }

      // Create directory if not exists
      await fs.promises.mkdir(basePath, { recursive: true });

      // Try to find existing prompt config to get the correct filePath
      let fileName: string;
      let promptName: string = promptId || 'New Prompt';

      if (promptId && this._platform) {
        const existingPrompt = this._platform.config.getPrompts().find(p => p.id === promptId);
        if (existingPrompt?.filePath) {
          // Use existing filePath from config
          fileName = path.basename(existingPrompt.filePath);
          promptName = existingPrompt.name;
        } else {
          // Fallback to promptId-based filename
          fileName = `${promptId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.md`;
        }
      } else {
        fileName = 'new-prompt.md';
      }

      const filePath = path.join(basePath, fileName);

      // Create file with template if not exists
      try {
        await fs.promises.access(filePath);
      } catch {
        // File doesn't exist, create with template
        const template = `# ${promptName}

<!-- Write your prompt content here -->

`;
        await fs.promises.writeFile(filePath, template, 'utf-8');
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      console.error('[Neko Suite] Failed to open prompt config:', error);
      vscode.window.showErrorMessage(`Failed to open prompt config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Open AGENTS.md file in VSCode editor
   * Creates the file if it doesn't exist
   */
  private async _handleOpenAgentsFile(source: 'personal' | 'project'): Promise<void> {
    try {
      const { getPromptFileService } = await import('../services/PromptFileService');
      const promptFileService = getPromptFileService();
      await promptFileService.openAgentsFile(source);
    } catch (error) {
      console.error('[Neko Suite] Failed to open AGENTS.md:', error);
      vscode.window.showErrorMessage(`Failed to open AGENTS.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Open settings.json file in VSCode editor (for Hooks configuration)
   * Creates the file if it doesn't exist
   */
  private async _handleOpenSettingsFile(source: 'personal' | 'project' | 'local'): Promise<void> {
    try {
      let filePath: string;

      if (source === 'personal') {
        // User settings: ~/.neko/settings.json
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        filePath = path.join(homeDir, '.neko', 'settings.json');
      } else {
        // Project settings: .neko/settings.json or .neko/settings.local.json
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        const fileName = source === 'local' ? 'settings.local.json' : 'settings.json';
        filePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', fileName);
      }

      // Create directory if not exists
      const dirPath = path.dirname(filePath);
      await fs.promises.mkdir(dirPath, { recursive: true });

      // Create file with default template if not exists
      try {
        await fs.promises.access(filePath);
      } catch {
        // File doesn't exist, create with default template
        const template = `{
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": []
  }
}
`;
        await fs.promises.writeFile(filePath, template, 'utf-8');
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      console.error('[Neko Suite] Failed to open settings.json:', error);
      vscode.window.showErrorMessage(`Failed to open settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==========================================================================
  // Prompt Mode Handling
  // ==========================================================================

  /**
   * Set prompt mode (default or plan)
   */
  private _handleSetPromptMode(webview: vscode.Webview, mode: 'default' | 'plan'): void {
    this._systemPrompt.setMode(mode);
    this._sendPromptMode(webview);
  }

  /**
   * Toggle between default and plan mode
   */
  private _handleTogglePlanMode(webview: vscode.Webview): void {
    this._systemPrompt.togglePlanMode();
    this._sendPromptMode(webview);
  }

  /**
   * Send current prompt mode to webview
   */
  private _sendPromptMode(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'promptModeChanged',
      mode: this._systemPrompt.getMode(),
      isPlanMode: this._systemPrompt.isPlanMode(),
    });
  }

  /**
   * Open skill-related file in VSCode editor
   * Supports: SKILL.md, references, scripts
   */
  private async _handleOpenSkillFile(
    skillName: string,
    source: 'personal' | 'project',
    fileType: 'skill' | 'reference' | 'script',
    filePath?: string
  ): Promise<void> {
    try {
      let basePath: string;

      if (source === 'personal') {
        // User skills: ~/.neko/skills/
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'skills');
      } else {
        // Project skills: .neko/skills/
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'skills');
      }

      // Build full path based on file type
      let fullPath: string;

      switch (fileType) {
        case 'skill':
          // SKILL.md is at skill-name/SKILL.md
          fullPath = path.join(basePath, skillName, 'SKILL.md');
          break;
        case 'reference':
          // References are at skill-name/references/<file>
          if (!filePath) {
            vscode.window.showErrorMessage('No file path provided for reference');
            return;
          }
          fullPath = path.join(basePath, skillName, 'references', filePath);
          break;
        case 'script':
          // Scripts are at skill-name/scripts/<file>
          if (!filePath) {
            vscode.window.showErrorMessage('No file path provided for script');
            return;
          }
          fullPath = path.join(basePath, skillName, 'scripts', filePath);
          break;
        default:
          vscode.window.showErrorMessage(`Unknown file type: ${fileType}`);
          return;
      }

      // Check if file exists
      try {
        await fs.promises.access(fullPath);
      } catch {
        vscode.window.showErrorMessage(`File not found: ${fullPath}`);
        return;
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(fullPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      console.error('[Neko Suite] Failed to open skill file:', error);
      vscode.window.showErrorMessage(`Failed to open skill file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Open command file in VSCode editor
   * Commands are stored at: ~/.neko/commands/<name>.md or .neko/commands/<name>.md
   */
  private async _handleOpenCommandFile(
    commandName: string,
    source: 'personal' | 'project'
  ): Promise<void> {
    try {
      let basePath: string;

      if (source === 'personal') {
        // User commands: ~/.neko/commands/
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        basePath = path.join(homeDir, '.neko', 'commands');
      } else {
        // Project commands: .neko/commands/
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }
        basePath = path.join(workspaceFolders[0].uri.fsPath, '.neko', 'commands');
      }

      // Command file: <name>.md
      const fullPath = path.join(basePath, `${commandName}.md`);

      // Check if file exists
      try {
        await fs.promises.access(fullPath);
      } catch {
        vscode.window.showErrorMessage(`File not found: ${fullPath}`);
        return;
      }

      // Open the file in VSCode
      const uri = vscode.Uri.file(fullPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      console.error('[Neko Suite] Failed to open command file:', error);
      vscode.window.showErrorMessage(`Failed to open command file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download SVG content as file
   */
  private async _handleDownloadSvg(svg: string, filename: string): Promise<void> {
    if (!svg) return;

    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(filename || 'diagram.svg'),
        filters: {
          'SVG Files': ['svg'],
          'All Files': ['*'],
        },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(svg, 'utf-8'));
        vscode.window.showInformationMessage(`SVG saved to ${uri.fsPath}`);
      }
    } catch (error) {
      console.error('[Neko Suite] Failed to save SVG:', error);
      vscode.window.showErrorMessage('Failed to save SVG file');
    }
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
      this._agentManager.cancel(conversationId);
      webview.postMessage({
        type: 'messageCancelled',
        conversationId,
      });
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
  // Provider Methods
  // ============================================================================

  private async _handleAddModel(model: any): Promise<void> {
    if (!this._providers) return;

    const result = await this._providers.addProvider(model);
    this._sendSettings();

    if (this._view) {
      this._view.webview.postMessage({
        type: 'modelAdded',
        success: result.success,
        modelType: model.type,
        error: result.error,
      });
    }
  }

  private async _handleRemoveModel(modelType: string): Promise<void> {
    if (!this._providers) return;

    const result = await this._providers.removeProvider(modelType);

    if (this._settings.selectedProviderId === modelType) {
      this._settings.selectedProviderId = null;
      this._settings.selectedModelId = null;
    }

    this._sendSettings();

    if (this._view) {
      this._view.webview.postMessage({
        type: 'modelRemoved',
        success: result.success,
        modelType,
        error: result.error,
      });
    }
  }

  private async _handleToggleProvider(providerType: string, enabled: boolean): Promise<void> {
    if (!this._providers) return;

    await this._providers.toggleProvider(providerType, enabled);

    if (!enabled && this._settings.selectedProviderId === providerType) {
      this._settings.selectedProviderId = null;
      this._settings.selectedModelId = null;
    }

    this._sendSettings();
  }

  private async _handleToggleModel(providerType: string, modelId: string, enabled: boolean): Promise<void> {
    if (!this._providers) return;

    await this._providers.toggleModel(providerType, modelId, enabled);

    if (!enabled && this._settings.selectedProviderId === providerType && this._settings.selectedModelId === modelId) {
      this._settings.selectedModelId = null;
    }

    this._sendSettings();
  }

  // ============================================================================
  // Integration Methods (MCP/Workflow - VSCode UI dependent)
  // ============================================================================

  private async _handleTestMCPServer(
    webview: vscode.Webview,
    server: { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; requestId?: string }
  ): Promise<void> {
    const requestId = server.requestId || `mcp-test-${Date.now()}`;

    try {
      const testService = getMCPTestService();
      const result = await testService.test({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        timeout: 10000,
      });

      webview.postMessage({
        type: 'mcpServerTestResult',
        requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      webview.postMessage({
        type: 'mcpServerTestResult',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async _handleTestWorkflow(
    webview: vscode.Webview,
    workflow: { id: string; name: string; engineType: string; url: string; apiKey?: string; requestId?: string }
  ): Promise<void> {
    const requestId = workflow.requestId || `workflow-test-${Date.now()}`;

    try {
      const testService = getWorkflowTestService();
      const result = await testService.test({
        id: workflow.id,
        name: workflow.name,
        engineType: workflow.engineType,
        url: workflow.url,
        apiKey: workflow.apiKey,
        timeout: 10000,
      });

      webview.postMessage({
        type: 'workflowTestResult',
        requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      webview.postMessage({
        type: 'workflowTestResult',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async _addMCPServer(): Promise<void> {
    const serverName = await vscode.window.showInputBox({
      prompt: 'Enter MCP Server name',
      placeHolder: 'e.g., my-mcp-server',
    });

    if (!serverName) return;

    const command = await vscode.window.showInputBox({
      prompt: 'Enter the command to start the MCP server',
      placeHolder: 'e.g., npx -y @modelcontextprotocol/server-filesystem',
    });

    if (!command) return;

    const argsInput = await vscode.window.showInputBox({
      prompt: 'Enter command arguments (comma-separated, optional)',
      placeHolder: 'e.g., /path/to/allowed/dir',
    });

    const args = argsInput ? argsInput.split(',').map(s => s.trim()) : [];

    const mcpServers = this._context.globalState.get<Record<string, any>>('neko.mcpServers', {});
    mcpServers[serverName] = { command, args };
    await this._context.globalState.update('neko.mcpServers', mcpServers);

    vscode.window.showInformationMessage(`MCP Server "${serverName}" added successfully.`);
    this._sendSettings();
  }

  private async _addWorkflow(): Promise<void> {
    const workflowType = await vscode.window.showQuickPick(
      ['ComfyUI', 'Dify', 'n8n', 'Custom'],
      { placeHolder: 'Select workflow type' }
    );

    if (!workflowType) return;

    const workflowName = await vscode.window.showInputBox({
      prompt: 'Enter workflow name',
      placeHolder: 'e.g., my-workflow',
    });

    if (!workflowName) return;

    const baseUrl = await vscode.window.showInputBox({
      prompt: `Enter ${workflowType} base URL`,
      placeHolder: workflowType === 'ComfyUI' ? 'http://127.0.0.1:8188' :
                   workflowType === 'Dify' ? 'https://api.dify.ai' :
                   workflowType === 'n8n' ? 'http://localhost:5678' : 'http://localhost:8000',
    });

    if (!baseUrl) return;

    const workflows = this._context.globalState.get<Record<string, any>>('neko.workflows', {});
    workflows[workflowName] = { type: workflowType, baseUrl };
    await this._context.globalState.update('neko.workflows', workflows);

    vscode.window.showInformationMessage(`Workflow "${workflowName}" added successfully.`);
    this._sendSettings();
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
  // Plan Mode Methods
  // ============================================================================

  /**
   * Handle plan approval - switch to auto mode and execute
   */
  private async _handlePlanApprove(
    webview: vscode.Webview,
    planId: string,
    conversationId: string,
    filePath?: string
  ): Promise<void> {
    console.log('[ChatProvider] Plan approved:', { planId, conversationId, filePath });

    // Persist the plan status change
    this._updatePlanStatusInConversation(conversationId, planId, 'approved');

    // Update plan status in UI
    webview.postMessage({
      type: 'planStatusUpdate',
      planId,
      conversationId,
      status: 'approved',
    });

    // If we have a plan file, read it and execute with auto mode
    if (filePath) {
      try {
        const fs = await import('fs');
        const planContent = await fs.promises.readFile(filePath, 'utf-8');

        // Switch agent to auto mode and execute the plan
        const agentRunner = this._agentManager?.get(conversationId);
        if (agentRunner && this._platform) {
          // Temporarily switch to auto mode for plan execution
          agentRunner.configure({
            platform: this._platform,
            groupId: 'default',
            systemPrompt: this._settings.customSystemPrompt || this._systemPrompt.getPrompt(),
            maxIterations: Infinity,
            autoExecuteTools: true,
            temperature: this._settings.temperature,
            maxTokens: this._settings.maxTokens,
            executionMode: 'auto', // Execute in auto mode
            thinkingBudget: 10000,
          });

          // Send message to execute the approved plan
          const executeMessage = `The plan has been approved. Please execute the following plan:\n\n${planContent}`;
          this._messages?.handleUserMessage(webview, executeMessage);
        }
      } catch (error) {
        console.error('[ChatProvider] Failed to read plan file:', error);
        webview.postMessage({
          type: 'error',
          message: `Failed to read plan file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    } else {
      // No file path - just notify the agent
      const agentRunner = this._agentManager?.get(conversationId);
      if (agentRunner && this._platform) {
        agentRunner.configure({
          platform: this._platform,
          groupId: 'default',
          systemPrompt: this._settings.customSystemPrompt || this._systemPrompt.getPrompt(),
          maxIterations: Infinity,
          autoExecuteTools: true,
          temperature: this._settings.temperature,
          maxTokens: this._settings.maxTokens,
          executionMode: 'auto',
          thinkingBudget: 10000,
        });

        this._messages?.handleUserMessage(webview, 'The plan has been approved. Please proceed with the implementation.');
      }
    }
  }

  /**
   * Handle plan rejection
   */
  private _handlePlanReject(
    webview: vscode.Webview,
    planId: string,
    conversationId: string
  ): void {
    console.log('[ChatProvider] Plan rejected:', { planId, conversationId });

    // Persist the plan status change
    this._updatePlanStatusInConversation(conversationId, planId, 'rejected');

    // Update plan status in UI
    webview.postMessage({
      type: 'planStatusUpdate',
      planId,
      conversationId,
      status: 'rejected',
    });

    // Notify the user
    webview.postMessage({
      type: 'streamText',
      conversationId,
      content: '\n\n---\n**Plan rejected.** Please provide more details or a different approach if you would like me to create a new plan.',
    });
  }

  /**
   * Handle individual plan step actions (approve/reject)
   */
  private _handlePlanStepAction(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    conversationId: string,
    action: 'approve' | 'reject'
  ): void {
    console.log('[ChatProvider] Plan step action:', { planId, stepId, conversationId, action });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Persist the step status change
    this._updatePlanStepInConversation(conversationId, planId, stepId, { status: newStatus });

    // Update step status in UI
    webview.postMessage({
      type: 'planStepStatusUpdate',
      planId,
      stepId,
      conversationId,
      status: newStatus,
    });
  }

  /**
   * Handle plan step modification
   */
  private _handlePlanStepModify(
    webview: vscode.Webview,
    planId: string,
    stepId: string,
    newDescription: string,
    conversationId: string
  ): void {
    console.log('[ChatProvider] Plan step modified:', { planId, stepId, newDescription, conversationId });

    // Persist the step modification
    this._updatePlanStepInConversation(conversationId, planId, stepId, {
      status: 'modified',
      description: newDescription,
    });

    // Update step in UI
    webview.postMessage({
      type: 'planStepStatusUpdate',
      planId,
      stepId,
      conversationId,
      status: 'modified',
      newDescription,
    });
  }

  /**
   * Update a plan step in the conversation and persist
   */
  private _updatePlanStepInConversation(
    conversationId: string,
    planId: string,
    stepId: string,
    update: { status?: string; description?: string }
  ): void {
    const conversation = this._conversations.manager.get(conversationId);
    if (!conversation) {
      console.warn('[ChatProvider] Conversation not found for plan step update:', conversationId);
      return;
    }

    let updated = false;
    const updatedMessages = conversation.messages.map(message => {
      if (!message.contentBlocks) return message;

      const updatedBlocks = message.contentBlocks.map(block => {
        if (block.type !== 'plan' || !block.plan) return block;

        // Type assertion for plan structure
        const plan = block.plan as {
          id: string;
          steps: Array<{ id: string; status: string; description: string }>;
        };

        if (plan.id !== planId) return block;

        // Update the step
        const updatedSteps = plan.steps.map(step => {
          if (step.id !== stepId) return step;
          updated = true;
          return {
            ...step,
            ...(update.status && { status: update.status }),
            ...(update.description && { description: update.description }),
          };
        });

        return {
          ...block,
          plan: {
            ...plan,
            steps: updatedSteps,
          },
        };
      });

      return {
        ...message,
        contentBlocks: updatedBlocks,
      };
    });

    if (updated) {
      this._conversations.manager.updateMessages(conversationId, updatedMessages);
      console.log('[ChatProvider] Persisted plan step update:', { conversationId, planId, stepId, update });
    }
  }

  /**
   * Update the overall plan status in the conversation and persist
   */
  private _updatePlanStatusInConversation(
    conversationId: string,
    planId: string,
    status: 'approved' | 'rejected'
  ): void {
    const conversation = this._conversations.manager.get(conversationId);
    if (!conversation) {
      console.warn('[ChatProvider] Conversation not found for plan status update:', conversationId);
      return;
    }

    let updated = false;
    const updatedMessages = conversation.messages.map(message => {
      if (!message.contentBlocks) return message;

      const updatedBlocks = message.contentBlocks.map(block => {
        if (block.type !== 'plan' || !block.plan) return block;

        // Type assertion for plan structure
        const plan = block.plan as {
          id: string;
          status: string;
        };

        if (plan.id !== planId) return block;

        updated = true;
        return {
          ...block,
          plan: {
            ...plan,
            status,
          },
        };
      });

      return {
        ...message,
        contentBlocks: updatedBlocks,
      };
    });

    if (updated) {
      this._conversations.manager.updateMessages(conversationId, updatedMessages);
      console.log('[ChatProvider] Persisted plan status update:', { conversationId, planId, status });
    }
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
        this._handleTogglePlanMode(webview);
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
