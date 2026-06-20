/**
 * AI Assistant View Provider
 * Main entry point - orchestrates all components
 *
 * Refactored to use specialized handlers for different domains:
 * - TaskHandler: Task management
 * - TemplateHandler: Template execution
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { getService, getLogger } from '../base';
import type { Platform } from '@neko/platform';
import type { IAgentManager } from '../ai/agentManager';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import {
  IPlatform,
  ITaskManager,
  IToolRegistry,
  IAgentManager as IAgentManagerId,
} from '../bootstrap';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationBridge } from './conversationBridge';
import { AgentMessageTurnHandler } from './agentMessageTurnHandler';
import { SystemPromptManager } from './systemPromptManager';
import { ConfigBridge, getNekoAuthAPI } from '../services/configBridge';
import { DragDropBroker } from '../services/DragDropBroker';
import {
  TaskHandler,
  SkillHandler,
  FileOperationHandler,
  PlanModeHandler,
  SettingsHandler,
  ContextHandler,
  SlashCommandHandler,
  ConversationMessageHandler,
} from './handlers';
import {
  buildChatAmbientCanvasUpdateMessage,
  buildChatContextInjectionMessage,
  buildChatExternalInputMessage,
  buildChatPluginCommandsMessage,
  buildChatRestorePlan,
  buildChatTabStateMessage,
  buildInvalidWebviewPayloadMessage,
  createCapabilityRuntimeRefreshRuntime,
  syncActiveConversationFromTabState,
  updateTabStateRuntime,
  type CapabilityRuntimeRefreshRuntime,
} from '@neko/agent/runtime';
import {
  createRuntimeSkillBootstrap,
  createRuntimeSkillLazySync,
  getBuiltinSkills,
  SkillRegistry,
  type IRuntimeTaskManager,
  type ISubpackageResolver,
} from '@neko/agent';
import { getSkillFileService } from '../services/SkillFileService';
import { setActiveCanvasAmbientScope } from '../services/canvasAmbientContext';
import { postPluginsAvailable } from '../services/pluginTransferBridge';
import { AgentDashboardWorkItemSource } from '../services/dashboardWorkItemSource';
import { CharacterDialogueController } from './characterDialogueController';
import { EmbodyCharacterController } from './embodyCharacterController';
import {
  createAgentLocalResourceAccess,
  type AgentLocalResourceAccess,
} from '../services/localResourceAccess';
import { StateTaskDeliveryCursorStorage, TaskDeliveryBridge } from '../services/taskDeliveryBridge';
import { handleChatWebviewMessage } from './chatWebviewMessageRouter';
import {
  getCapabilityDiscoveryService,
  getCapabilityRuntimeBindings,
  setCapabilityRuntimeSkillService,
} from '../bootstrap/capabilityBootstrap';
import {
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
  normalizeTabState,
  parseWebviewToExtensionMessage,
  type OpenTab,
  type TabState,
} from '@neko-agent/types';
import type { NpcAgentWorkflowRequest } from '@neko/shared';
import { updateWebviewKeyboardEditableOwner } from '@neko/shared/vscode/extension';
import { AccountAiCatalogCache } from '../services/accountAiCatalogCache';

const logger = getLogger('ChatProvider');
const AGENT_KEYBOARD_EDITABLE_CONTEXT = 'neko.agent.keyboardEditable';
const AGENT_KEYBOARD_EDITABLE_OWNER_ID = 'neko.agent:assistant';

function getCurrentWorkspaceRoot(): string | undefined {
  const activeEditorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (activeEditorPath) {
    const activeFolder = workspaceFolders.find((folder) =>
      isPathInsideWorkspace(activeEditorPath, folder.uri.fsPath),
    );
    if (activeFolder) return activeFolder.uri.fsPath;
  }
  return workspaceFolders[0]?.uri.fsPath;
}

function isPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function createChatLocalResourceAccess(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
): AgentLocalResourceAccess {
  return createAgentLocalResourceAccess(extensionUri, context);
}

export interface ChatViewProviderOptions {
  readonly localResourceAccess?: AgentLocalResourceAccess;
}

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'neko.aiAssistant';
  private static readonly TAB_STATE_KEY = 'neko.tabState';

  private _view?: vscode.WebviewView;

  // Managers
  private readonly _settings: SettingsManager;
  private readonly _systemPrompt: SystemPromptManager;
  private readonly _conversations: ConversationBridge;
  private _providers?: ProviderManager;
  private _messages?: AgentMessageTurnHandler;

  // Tab state for persistence
  private _tabState: TabState = { openTabs: [], activeTabId: null };
  private _hasPersistedTabState = false;

  // Handlers
  private readonly _taskHandler: TaskHandler;
  private readonly _skillHandler: SkillHandler;
  private readonly _fileOperationHandler: FileOperationHandler;
  private readonly _planModeHandler: PlanModeHandler;
  private readonly _settingsHandler: SettingsHandler;
  private readonly _contextHandler: ContextHandler;
  private readonly _slashCommandHandler: SlashCommandHandler;
  private readonly _conversationMessageHandler: ConversationMessageHandler;
  private readonly _characterDialogue: CharacterDialogueController;
  private readonly _embodyCharacter: EmbodyCharacterController;

  // Lifecycle
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _webviewDisposables: vscode.Disposable[] = [];

  // Lazy getter for plugin slash commands (set by the command host after registry is ready)
  private _pluginCommandsGetter?: () => Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }>;

  // Services
  private _agentManager?: IAgentManager;
  private _editorRegistry?: IEditorRegistry;
  private _platform?: Platform;
  private _taskManager?: IRuntimeTaskManager;
  private _configBridge?: ConfigBridge;
  private readonly _accountAiCatalog: AccountAiCatalogCache;
  private readonly _localResourceAccess: AgentLocalResourceAccess;
  private _capabilityRefreshRuntime?: CapabilityRuntimeRefreshRuntime;
  private readonly _dashboardWorkItems = new AgentDashboardWorkItemSource();
  private readonly _taskDeliveryBridge: TaskDeliveryBridge;
  // Note: _routerAskBroker and _workflowPlanHandler were removed alongside
  // the workflow/orchestrator layer. Pipeline intents now flow through the
  // Agent + Skill stack; no separate plan handler is needed.
  private readonly _dndBroker = new DragDropBroker();
  private _webviewReady = false;
  private _keyboardFocused = false;
  private _keyboardEditable = false;
  private _keyboardEditableUpdateSequence = 0;
  private _pendingContextPayload: import('@neko/shared').AgentContextPayload | null = null;
  private _pendingExternalMessage: { message: string; autoSend: boolean } | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    options: ChatViewProviderOptions = {},
  ) {
    // Initialize managers
    this._settings = new SettingsManager();
    this._systemPrompt = new SystemPromptManager();
    this._accountAiCatalog = new AccountAiCatalogCache({
      getAuth: () => getNekoAuthAPI(),
      logger,
    });
    this._localResourceAccess =
      options.localResourceAccess ?? createChatLocalResourceAccess(_extensionUri, _context);
    this._conversations = new ConversationBridge(
      _context,
      getCurrentWorkspaceRoot,
      this._localResourceAccess,
    );

    this._taskDeliveryBridge = new TaskDeliveryBridge({
      projectionSource: this._dashboardWorkItems.projectionSource,
      cursorStorage: new StateTaskDeliveryCursorStorage(
        'neko.agent.taskDeliveryCursors',
        this._context.globalState,
      ),
    });

    // Initialize handlers with empty deps (will be updated after service init)
    this._taskHandler = new TaskHandler({});
    this._skillHandler = new SkillHandler({});
    this._fileOperationHandler = new FileOperationHandler({});
    this._planModeHandler = new PlanModeHandler({
      systemPrompt: this._systemPrompt,
      conversations: this._conversations,
    });
    this._settingsHandler = new SettingsHandler({});
    this._contextHandler = new ContextHandler({
      conversations: this._conversations,
    });
    this._conversationMessageHandler = new ConversationMessageHandler({
      conversations: this._conversations,
      promptModeCleanup: this._systemPrompt,
      getWebview: () => this._view?.webview,
    });
    this._characterDialogue = new CharacterDialogueController({
      getWebview: () => this._view?.webview,
      getProjectRoot: () => getCurrentWorkspaceRoot(),
      getPlatform: () => this._platform,
      getSelectedChatModel: () => this._getSelectedChatModelRef(),
      getTabState: () => this._tabState,
      getActiveConversationId: () => this._conversations.getActiveId(),
      updateTabState: (openTabs, activeTabId) => this._updateTabState(openTabs, activeTabId),
      sendTabState: () => this._sendTabState(),
    });
    this._embodyCharacter = new EmbodyCharacterController({
      getWebview: () => this._view?.webview,
      getProjectRoot: () => getCurrentWorkspaceRoot(),
      getPlatform: () => this._platform,
      getSelectedChatModel: () => this._getSelectedChatModelRef(),
      getTabState: () => this._tabState,
      updateTabState: (openTabs, activeTabId) => this._updateTabState(openTabs, activeTabId),
      sendTabState: () => this._sendTabState(),
    });

    // Load persisted tab state after role-session controllers exist because
    // restore filtering checks whether persisted role-session tabs are live.
    this._loadTabState();

    this._context.subscriptions.push(
      this._dashboardWorkItems,
      vscode.commands.registerCommand(
        'neko.agent.getDashboardTaskSource',
        () => this._dashboardWorkItems,
      ),
    );
    this._slashCommandHandler = new SlashCommandHandler({
      conversations: this._conversations,
      settings: this._settings,
      systemPrompt: this._systemPrompt,
      skillHandler: this._skillHandler,
      taskHandler: this._taskHandler,
      contextHandler: this._contextHandler,
      planModeHandler: this._planModeHandler,
      characterDialogue: this._characterDialogue,
      sendConversationList: () => this._conversationMessageHandler.sendConversationList(),
      sendActiveConversation: () => this._conversationMessageHandler.sendActiveConversation(),
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
        // Inject ConfigManager into SettingsManager (late binding)
        this._settings.setConfigManager(this._platform.config);

        // Inject Platform into SystemPromptManager
        this._systemPrompt.setPlatform(this._platform);

        // Load AGENTS.md content
        this._systemPrompt.loadAgentsFile().catch((err) => {
          logger.error('Failed to load AGENTS.md:', err);
        });

        // Initialize ConfigBridge for unified config message handling
        this._configBridge = new ConfigBridge(
          this._platform,
          this._context,
          this._accountAiCatalog,
        );

        this._capabilityRefreshRuntime = createCapabilityRuntimeRefreshRuntime({
          getBindings: () => getCapabilityRuntimeBindings(),
          refreshAgentRuntime: () => this._agentManager?.refreshCapabilityRuntime(),
          setToolSkills: (toolSkills) => this._configBridge?.setToolSkills(toolSkills),
          logger,
        });
        this._capabilityRefreshRuntime.syncToolSkills();

        // Wire up SkillService: create instance, populate from disk, keep in sync.
        // Inject toolRegistry so allowedTools validation warns on unregistered tool references.
        // Inject subpackage resolver so requiredSubpackages is enforced at activation time.
        const skillFileService = getSkillFileService();
        const toolRegistry = getService(IToolRegistry);
        // CapabilityDiscoveryService is bootstrapped earlier in activation; fall
        // back silently if something flipped the order so the chat view still opens.
        let subpackageResolver: ISubpackageResolver | undefined;
        try {
          const capabilityDiscovery = getCapabilityDiscoveryService();
          subpackageResolver = {
            get: (id: string) => capabilityDiscovery.getSubpackage(id),
          };
        } catch {
          subpackageResolver = undefined;
        }
        const capabilityRuntime = getCapabilityRuntimeBindings();
        const skillRuntimeBootstrap = createRuntimeSkillBootstrap({
          registry: capabilityRuntime.skillRegistry ?? new SkillRegistry(),
          toolRegistry: toolRegistry ?? undefined,
          subpackageResolver,
          builtinSkills: getBuiltinSkills({ locale: vscode.env.language }),
          logger,
        });
        const { skillService } = skillRuntimeBootstrap;
        skillRuntimeBootstrap.populateLazy({
          personal: { skills: [], commands: [] },
          project: { skills: [], commands: [] },
        });
        setCapabilityRuntimeSkillService(skillService);

        this._providers = new ProviderManager(this._platform, this._accountAiCatalog);
        this._messages = new AgentMessageTurnHandler(
          this._settings,
          this._providers,
          this._conversations,
          this._agentManager,
          this._editorRegistry,
          (conversationId) =>
            skillRuntimeBootstrap.buildSystemPrompt(this._systemPrompt.getPrompt(conversationId))
              .prompt,
          (conversationId) => this._systemPrompt.isPlanMode(conversationId),
          this._platform,
          this._taskManager,
          (conversationId) => this._skillHandler.getActiveSkill(conversationId),
          undefined,
          this._dashboardWorkItems,
          this._localResourceAccess,
          {
            accountAiCatalog: this._accountAiCatalog,
            skillAutoActivation: {
              activate: ({ webview, conversationId, userInput }) =>
                this._skillHandler.autoActivateSkill(webview, {
                  conversationId,
                  userInput,
                }),
            },
          },
        );
        this._dashboardWorkItems.updateDeps({
          platform: this._platform,
          taskManager: this._taskManager,
        });

        const skillLazySync = createRuntimeSkillLazySync({
          scanLazy: () => skillFileService.scanSkillsLazy(),
          populateLazy: (result) => skillRuntimeBootstrap.populateLazy(result),
          logger,
        });
        void skillLazySync.syncInitial();
        this._disposables.push(
          skillFileService.onSkillsChanged(() => {
            void skillLazySync.resync();
          }),
        );
        try {
          const capabilityDiscovery = getCapabilityDiscoveryService();
          this._disposables.push(
            capabilityDiscovery.onDidRegister(() => {
              this._capabilityRefreshRuntime?.handleCapabilityChanged();
            }),
            capabilityDiscovery.onDidUnregister(() => {
              this._capabilityRefreshRuntime?.handleCapabilityChanged();
            }),
          );
        } catch {
          // Capability discovery is optional in tests / partial bootstraps.
        }
        this._skillHandler.setDependencies({
          skillService,
          agentManager: this._agentManager,
        });

        // Bridge host effects into per-conversation skill providers for meta tools.
        if (this._agentManager) {
          const skillRuntime = this._skillHandler.getRuntime();
          this._agentManager.setSkillProviderFactory(
            skillRuntimeBootstrap.createSkillProviderFactory(skillRuntime),
          );
        }

        // Update handler dependencies via type-safe updateDeps()
        this._taskHandler.updateDeps({
          platform: this._platform,
          taskManager: this._taskManager,
          dashboardWorkItems: this._dashboardWorkItems,
          localResourceAccess: this._localResourceAccess,
        });
        this._fileOperationHandler.updateDeps({ platform: this._platform });
        this._planModeHandler.updateDeps({
          messages: this._messages,
        });
        this._settingsHandler.updateDeps({
          platform: this._platform,
        });
        this._contextHandler.updateDeps({ agentManager: this._agentManager });
        this._slashCommandHandler.updateDeps({
          agentManager: this._agentManager,
          messages: this._messages,
        });
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
   * Resolve the webview view when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._disposeWebviewBindings();
    this._view = webviewView;

    void this._initializeResolvedWebview(webviewView);
  }

  private async _initializeResolvedWebview(webviewView: vscode.WebviewView): Promise<void> {
    await this._localResourceAccess.configureChatWebview(webviewView.webview);
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setupMessageHandlers(webviewView.webview);

    // Reconcile the active conversation against the persisted tab state before the
    // webview's getActiveConversation/getTabState requests arrive. Without this,
    // a cold-start mismatch (e.g. persisted tab points to "conv-X" but the
    // ConversationManager has no active id yet) leaves activeTabConversationId !==
    // activeConversationId, which the input area treats as a "switching" window
    // and disables typing indefinitely.
    this._syncActiveConversationFromTabState();

    // Final guarantee: unless the user explicitly persisted an empty tab state,
    // the webview should have an active conversation before it asks for one.
    this._ensureActiveConversationAndTab();

    // Notify webview which neko-suite plugins are installed (ADR-5)
    postPluginsAvailable(webviewView.webview);

    this._webviewDisposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this._restoreState();
          this._replayUndeliveredTasks();
        } else {
          void this._setKeyboardFocused(false);
        }
      }),
    );

    this._replayUndeliveredTasks();
  }

  /**
   * Push the current canvas ambient selection to the webview so it can render
   * non-removable ambient chips in the input area.
   */
  public sendAmbientCanvasContext(
    nodes: import('../services/canvasAmbientContext').SelectedNodeSummary[],
    conversationId: string | null = this._conversations.getActiveId(),
  ): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(buildChatAmbientCanvasUpdateMessage({ nodes, conversationId }));
  }

  /**
   * Forward an arbitrary typed message to the webview.
   * Used for low-priority notifications (e.g. generation progress) that don't
   * require the panel to be focused.
   */
  public postMessage(message: unknown): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(message);
  }

  public get webview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  /** Expose the DnD broker so the command host can register query/clear commands. */
  get dndBroker(): DragDropBroker {
    return this._dndBroker;
  }

  /**
   * Attach an agent context payload to the chat panel.
   * Focuses the panel and injects the chip + optional intent prefill.
   */
  public async sendContextPayload(
    payload: import('@neko/shared').AgentContextPayload,
  ): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    if (this._webviewReady && this._view?.webview) {
      this._view.webview.postMessage(
        buildChatContextInjectionMessage(payload, {
          conversationId: this._conversations.getActiveId(),
        }),
      );
    } else {
      this._pendingContextPayload = payload;
    }
  }

  /**
   * Send a message to the AI assistant from external commands
   * Opens the assistant panel and prefills/sends the message
   */
  public async sendMessageToAssistant(message: string, autoSend: boolean = true): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);

    if (this._webviewReady && this._view?.webview) {
      this._view.webview.postMessage(buildChatExternalInputMessage({ message, autoSend }));
    } else {
      this._pendingExternalMessage = { message, autoSend };
    }
  }

  /**
   * Push the current plugin slash command list to the webview.
   * Called on initial load and whenever the SlashCommandRegistry changes.
   */
  public sendPluginSlashCommands(
    commands: Array<{
      id: string;
      name: string;
      description: string;
      icon?: string;
      extensionId: string;
    }>,
  ): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(buildChatPluginCommandsMessage(commands));
  }

  /**
   * Register a getter for plugin slash commands so _restoreState can push them
   * on panel visibility restore.
   */
  public setPluginCommandsGetter(
    getter: () => Array<{
      id: string;
      name: string;
      description: string;
      icon?: string;
      extensionId: string;
    }>,
  ): void {
    this._pluginCommandsGetter = getter;
  }

  /**
   * Set up message handlers for webview communication
   */
  private _setupMessageHandlers(webview: vscode.Webview) {
    // Register webview for broadcasts (skills, commands, etc.)
    const postMessageFn = (msg: unknown) => webview.postMessage(msg);
    if (this._configBridge) {
      this._webviewDisposables.push(this._configBridge.registerWebview(postMessageFn));
    }

    this._webviewDisposables.push(
      webview.onDidReceiveMessage(async (raw: unknown) => {
        const message = parseWebviewToExtensionMessage(raw);
        if (!message) {
          logger.warn('Rejected invalid webview message payload');
          webview.postMessage(buildInvalidWebviewPayloadMessage());
          return;
        }

        if (message.type === 'getConfig' || message.type === 'refreshConfigSnapshot') {
          postPluginsAvailable(webview);
        }

        if (message.type === 'webviewKeyboardFocus') {
          void this._setKeyboardFocused(message.focused);
          return;
        }

        if (message.type === 'webviewKeyboardEditable') {
          void this._setKeyboardEditable(message.editable);
          return;
        }

        if (!this._webviewReady) {
          this._webviewReady = true;
          this._flushPendingMessages();
          this._replayUndeliveredTasks();
        }

        // 1. Delegate config messages to ConfigBridge
        if (this._configBridge) {
          const handled = await this._configBridge.handleMessage(message, postMessageFn);
          if (handled) return;
        }

        handleChatWebviewMessage(message, {
          webview,
          messages: this._messages,
          characterDialogue: this._characterDialogue,
          embodyCharacter: this._embodyCharacter,
          taskHandler: this._taskHandler,
          skillHandler: this._skillHandler,
          fileOperationHandler: this._fileOperationHandler,
          planModeHandler: this._planModeHandler,
          settingsHandler: this._settingsHandler,
          contextHandler: this._contextHandler,
          slashCommandHandler: this._slashCommandHandler,
          conversationMessageHandler: this._conversationMessageHandler,
          dndBroker: this._dndBroker,
          refreshConfigSnapshot: () => this._refreshConfigSnapshot(webview, postMessageFn),
          sendTabState: () => this._sendTabState(),
          updateTabState: (openTabs, activeTabId) => this._updateTabState(openTabs, activeTabId),
          syncCanvasAmbientScopeFromActiveConversation: () =>
            this._syncCanvasAmbientScopeFromActiveConversation(),
        });
      }),
    );
  }

  private _refreshConfigSnapshot(
    webview: vscode.Webview,
    postMessage: (message: unknown) => Thenable<boolean>,
  ): void {
    if (!this._platform) return;
    this._platform.config.reloadConfig();
    this._settingsHandler.sendSettings(webview);
    void this._configBridge?.sendConfigState(postMessage);
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  private _restoreState(): void {
    const webview = this._view?.webview;
    const plan = buildChatRestorePlan({
      tabState: this._tabState,
      hasWebview: Boolean(webview),
      pluginCommands: this._pluginCommandsGetter?.(),
    });

    for (const action of plan.actions) {
      switch (action.type) {
        case 'syncActiveConversation':
          this._syncActiveConversationFromTabState();
          break;
        case 'syncCanvasAmbientScope':
          this._syncCanvasAmbientScopeFromActiveConversation();
          break;
        case 'sendConversationList':
          this._conversationMessageHandler.sendConversationList();
          break;
        case 'sendActiveConversation':
          this._conversationMessageHandler.sendActiveConversation();
          break;
        case 'sendSettings':
          if (webview) {
            this._settingsHandler.sendSettings(webview);
          }
          break;
        case 'postTabState':
          webview?.postMessage(action.message);
          break;
        case 'sendActiveConversationTasks':
          if (webview) {
            const conversationId = this._conversations.getActiveId();
            if (conversationId) {
              this._taskHandler.sendTasks(webview, conversationId);
            }
          }
          break;
        case 'sendAgentStateSnapshot':
          if (webview) {
            this._conversationMessageHandler.sendAgentStateSnapshot(webview);
          }
          break;
        case 'postPluginCommands':
          webview?.postMessage(action.message);
          break;
      }
    }
  }

  // ============================================================================
  // Tab State Methods
  // ============================================================================

  private _loadTabState(): void {
    const persistedTabState = this._context.workspaceState.get<unknown>(
      ChatViewProvider.TAB_STATE_KEY,
    );
    this._hasPersistedTabState = persistedTabState !== undefined;
    const restored = normalizeTabState(persistedTabState);

    // Drop tabs whose conversation no longer exists (e.g. user cleared all
    // conversations while the panel was closed). Otherwise the webview would
    // see activeTabConversationId pointing at a phantom conversation while
    // activeConversationId is null, locking the input area into the
    // "switching" state forever.
    const liveTabs = restored.openTabs.filter((tab) =>
      tab.kind === 'character-dialogue'
        ? this._characterDialogue.hasSession(tab.conversationId)
        : tab.kind === 'embody-character'
          ? this._embodyCharacter.hasSession(tab.conversationId)
          : Boolean(this._conversations.get(tab.conversationId)),
    );
    const liveActiveTabId =
      restored.activeTabId && liveTabs.some((tab) => tab.id === restored.activeTabId)
        ? restored.activeTabId
        : (liveTabs[0]?.id ?? null);

    this._tabState = { openTabs: liveTabs, activeTabId: liveActiveTabId };

    if (liveTabs.length !== restored.openTabs.length || liveActiveTabId !== restored.activeTabId) {
      this._saveTabState();
    }
  }

  private _syncActiveConversationFromTabState(): void {
    // Defensive sync for panel restore: normal tab switches send switchConversation
    // before updateTabState, but restored tab state can replay without that message.
    syncActiveConversationFromTabState(
      { tabState: this._tabState },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
      },
    );
  }

  private _ensureActiveConversationAndTab(): void {
    // Empty persisted tab state is intentional: the user closed every tab, so
    // reopening the panel must not resurrect the most recent history item.
    if (
      this._hasPersistedTabState &&
      this._tabState.openTabs.length === 0 &&
      this._tabState.activeTabId === null
    ) {
      this._conversations.clearActive();
      return;
    }

    // Make sure ConversationManager has at least one conversation and an active id.
    // ensureActive() creates a fresh conversation if none exists, then returns the
    // active id (creating or reusing).
    const activeId = this._conversations.ensureActive();

    // Make sure _tabState has a tab pointing at the active conversation.
    const hasTabForActive = this._tabState.openTabs.some((tab) => tab.conversationId === activeId);

    if (!hasTabForActive) {
      const conversation = this._conversations.get(activeId);
      const newTab: OpenTab = {
        id: `tab-${Date.now()}`,
        title: conversation?.title || 'New Chat',
        conversationId: activeId,
      };
      this._tabState = {
        openTabs: [...this._tabState.openTabs, newTab],
        activeTabId: newTab.id,
      };
      this._saveTabState();
      return;
    }

    // Tab exists for the active conversation — make sure it's the active tab.
    const tabForActive = this._tabState.openTabs.find((tab) => tab.conversationId === activeId);
    if (tabForActive && this._tabState.activeTabId !== tabForActive.id) {
      this._tabState = {
        openTabs: this._tabState.openTabs,
        activeTabId: tabForActive.id,
      };
      this._saveTabState();
    }
  }

  private _syncCanvasAmbientScopeFromActiveConversation(): void {
    const conversationId = this._conversations.getActiveId();
    const nodes = conversationId ? setActiveCanvasAmbientScope(conversationId) : [];
    if (!conversationId) {
      setActiveCanvasAmbientScope(null);
    }
    this.sendAmbientCanvasContext(nodes, conversationId);
  }

  private _saveTabState(): void {
    this._hasPersistedTabState = true;
    this._context.workspaceState.update(ChatViewProvider.TAB_STATE_KEY, this._tabState);
  }

  private _sendTabState(): void {
    if (!this._view) return;
    this._view.webview.postMessage(buildChatTabStateMessage(this._tabState));
  }

  private _updateTabState(openTabs: OpenTab[], activeTabId: string | null): void {
    const result = updateTabStateRuntime(
      { openTabs, activeTabId },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
        onConversationSwitched: () => this._syncCanvasAmbientScopeFromActiveConversation(),
      },
    );
    this._tabState = result.tabState;
    this._saveTabState();
  }

  public async startCharacterDialogue(
    request: import('@neko/shared').NpcTestBenchLaunchRequest,
  ): Promise<import('./characterDialogueController').CharacterDialogueLaunchResult | null> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    return this._characterDialogue.launch(request);
  }

  public async startCharacterDialogueFromSlash(args?: string): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    await this._characterDialogue.launchFromSlash({
      args,
      conversationId: this._conversations.getActiveId() ?? undefined,
    });
  }

  public exitCharacterDialogue(
    sessionId?: string,
  ): Promise<import('./characterDialogueController').CharacterDialogueExitResult | null> {
    return sessionId
      ? this._characterDialogue.exit(sessionId)
      : this._characterDialogue.exitActive();
  }

  public async startEmbodyCharacter(request: NpcAgentWorkflowRequest): Promise<{
    readonly ok: true;
    readonly sessionId: string;
  }> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    const result = await this._embodyCharacter.launch(request);
    return { ok: true, sessionId: result?.sessionId ?? '' };
  }

  private _getSelectedChatModelRef(): import('@neko-agent/types').ModelRef<'llm'> | undefined {
    const modelId = this._settings.selectedModelId;
    if (!modelId || modelId === 'auto') return undefined;
    const providerId = this._settings.selectedProviderId;
    if (!providerId) return undefined;
    return { providerId, modelId, category: 'llm' };
  }

  // ============================================================================
  // HTML Generation
  // ============================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;
    const assetVersion = encodeURIComponent(nonce);

    const scriptUri = appendWebviewAssetVersion(
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant.js'),
      ),
      assetVersion,
    );
    const styleUri = appendWebviewAssetVersion(
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant-style.css'),
      ),
      assetVersion,
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

  dispose(): void {
    this._disposeWebviewBindings();
    this._messages?.dispose();
    this._characterDialogue.dispose();
    this._embodyCharacter.dispose();
    this._conversations.dispose();
    this._localResourceAccess.dispose();
    this._configBridge?.dispose();
    this._configBridge = undefined;

    for (const disposable of this._disposables.splice(0)) {
      try {
        disposable.dispose();
      } catch (error) {
        logger.warn('Failed to dispose chat provider resource', error);
      }
    }
  }

  private _flushPendingMessages(): void {
    const webview = this._view?.webview;
    if (!webview) return;

    if (this._pendingContextPayload) {
      const payload = this._pendingContextPayload;
      this._pendingContextPayload = null;
      webview.postMessage(
        buildChatContextInjectionMessage(payload, {
          conversationId: this._conversations.getActiveId(),
        }),
      );
    }

    if (this._pendingExternalMessage) {
      const { message, autoSend } = this._pendingExternalMessage;
      this._pendingExternalMessage = null;
      webview.postMessage(buildChatExternalInputMessage({ message, autoSend }));
    }
  }

  private _replayUndeliveredTasks(): void {
    const webview = this._view?.webview;
    const conversationId = this._conversations.getActiveId();
    if (!webview || !conversationId) {
      return;
    }

    this._taskDeliveryBridge.replayConversation(conversationId, webview).catch((error) => {
      logger.warn('Failed to replay undelivered task results', error);
    });
  }

  private _disposeWebviewBindings(): void {
    this._webviewReady = false;
    void this._setKeyboardFocused(false);
    for (const disposable of this._webviewDisposables.splice(0)) {
      try {
        disposable.dispose();
      } catch (error) {
        logger.warn('Failed to dispose webview binding', error);
      }
    }
  }

  private async _setKeyboardFocused(focused: boolean): Promise<void> {
    if (this._keyboardFocused === focused) {
      if (!focused) {
        await this._setKeyboardEditable(false);
      }
      return;
    }

    this._keyboardFocused = focused;
    if (!focused) {
      await this._setKeyboardEditable(false);
    }
  }

  private async _setKeyboardEditable(editable: boolean): Promise<void> {
    const nextEditable = editable && this._keyboardFocused;
    if (this._keyboardEditable === nextEditable) {
      return;
    }

    this._keyboardEditable = nextEditable;
    const updateSequence = ++this._keyboardEditableUpdateSequence;

    try {
      await updateWebviewKeyboardEditableOwner(AGENT_KEYBOARD_EDITABLE_OWNER_ID, nextEditable);
    } catch (error) {
      logger.warn('Failed to update global Webview keyboard editable owner', error);
    }

    if (this._keyboardEditableUpdateSequence !== updateSequence) {
      return;
    }

    try {
      await vscode.commands.executeCommand(
        'setContext',
        AGENT_KEYBOARD_EDITABLE_CONTEXT,
        nextEditable,
      );
    } catch (error) {
      logger.warn('Failed to update agent keyboard editable context', error);
    }
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

function appendWebviewAssetVersion(uri: vscode.Uri, version: string): string {
  const uriText = uri.toString();
  const separator = uriText.includes('?') ? '&' : '?';
  return `${uriText}${separator}v=${version}`;
}
