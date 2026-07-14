import {
  NEKO_COMMANDS,
  type NekoCommandExecutor,
  type NekoWorkspaceFileCandidate,
} from '@neko/host';
import {
  buildAgentStateSnapshotMessage,
  buildAgentCapabilityLifecycleResultMessage,
  buildAgentSessionDiagnosticMessage,
  buildConfigStateMessage,
  buildConversationLifecycleResultMessage,
  buildGlobalErrorMessage,
  buildMessageCancelledMessage,
  buildMessageQueueErrorMessage,
  buildMessageQueueSnapshotMessage,
  buildTabStateMessage,
  buildTasksUpdatedMessage,
  parseWebviewToExtensionMessage,
  type AgentMessageQueueSnapshot,
  type AgentWorkItem,
  type Message,
  type AgentStateSnapshotMessage,
  type ConversationSummary,
  type ExtensionToWebviewMessage,
  type PromptMode,
  type ProjectFileMentionInfo,
  type ProjectFilesWebviewMessage,
  type SendMessageWebviewMessage,
  type SettingsDataMessage,
  type SkillsListMessage,
  type TabState,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';
import {
  createAgentHostRouteCoverageDiagnostics,
  type AgentHostRouteSupport,
  type AgentWebviewToHostMessageType,
} from '@neko-agent/types/agent-host-runtime-adapter';
import type { AgentConfigDiagnostic } from '@neko-agent/types';
import {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type AssistantConfigState,
  type AssistantSettingsData,
} from '@neko/platform/config/index';
import {
  HOME_AGENT_RUNTIME_IDS,
  isKnownHomeAgentRuntimeId,
  normalizeHomeAgentRuntimeMessageRequest,
  type HomeAgentHostMessageResult,
  type HomeAgentRuntimeDiagnostic,
} from '../shared/contracts';
import type { HomeAgentProjectionRuntime } from './home-agent-projection-runtime';

export interface HomeAgentConfigManager {
  reloadConfig(): void;
  getAssistantSettingsData(): AssistantSettingsData;
  getAssistantConfigState(): AssistantConfigState;
  applyRuntimeAssistantSettingsFromWebview(settings: Record<string, unknown>): Promise<void>;
}

export interface HomeAgentWebviewHostDeps {
  readonly getConfigManager: () => HomeAgentConfigManager;
  readonly getConversationRuntime: () => HomeAgentConversationRuntime;
  readonly getCommandExecutor: () => NekoCommandExecutor;
  readonly getProjectionRuntime: () => HomeAgentProjectionRuntime;
  readonly getSnapshotRuntime: () => HomeAgentSnapshotRuntime;
}

export interface HomeAgentSnapshotRuntime {
  listAgentStates(): AgentStateSnapshotMessage['agentStates'];
  getSkillsSnapshot(): Promise<HomeAgentSkillsSnapshot>;
}

export interface HomeAgentSkillsSnapshot {
  readonly skills: NonNullable<SkillsListMessage['skills']>;
  readonly diagnostics: readonly string[];
}

export interface HomeAgentConversationRuntime {
  listConversations(): readonly ConversationSummary[];
  getActiveConversation(): HomeAgentConversationSnapshot | undefined;
  getConversation(conversationId: string): HomeAgentConversationSnapshot | undefined;
  hasConversation(conversationId: string): boolean;
  createConversation(): HomeAgentConversationSnapshot;
  sendMessage(message: SendMessageWebviewMessage): HomeAgentConversationSnapshot | undefined;
  activateConversation(
    conversationId: string,
    tabState: TabState,
  ): HomeAgentConversationSnapshot | undefined;
  deleteConversation(conversationId: string): void;
  clearAllConversations(): void;
  clearHistory(conversationId: string): boolean;
  getPromptMode(conversationId: string): PromptMode | undefined;
  setPromptMode(conversationId: string, mode: PromptMode): PromptMode | undefined;
  getMessageQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot | undefined;
  getTaskWorkItems(conversationId: string): readonly AgentWorkItem[] | undefined;
  getContextTokenCount(conversationId: string): number | undefined;
  getTabState(): TabState;
  getTabStateRevision(): number;
  updateTabState(tabState: TabState): void;
}

export interface HomeAgentConversationSnapshot {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly Message[];
}

export interface HomeAgentConversationRuntimeStorageSnapshot {
  readonly version: 1;
  readonly conversations: readonly HomeAgentConversationStorageRecord[];
  readonly promptModes: readonly (readonly [string, PromptMode])[];
  readonly messageQueueSnapshotVersions: readonly (readonly [string, number])[];
  readonly tabState: TabState;
  readonly nextConversationOrdinal: number;
  readonly activeConversationId?: string;
}

export interface HomeAgentConversationStorageRecord {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly Message[];
  readonly updatedAt: number;
  readonly nextMessageOrdinal: number;
}

export interface HomeAgentConversationRuntimeStorage {
  load(): HomeAgentConversationRuntimeStorageSnapshot | undefined;
  save(snapshot: HomeAgentConversationRuntimeStorageSnapshot): void;
}

export class InMemoryHomeAgentSnapshotRuntime implements HomeAgentSnapshotRuntime {
  listAgentStates(): AgentStateSnapshotMessage['agentStates'] {
    return [];
  }

  async getSkillsSnapshot(): Promise<HomeAgentSkillsSnapshot> {
    return { skills: [], diagnostics: [] };
  }
}

type AssistantSettingsRuntimeDataMessage = NonNullable<
  ReturnType<typeof buildAssistantSettingsRuntimeDataMessage>
>;

type AgentSettingsProviderView = NonNullable<SettingsDataMessage['providers']>[number];

export const HOME_AGENT_HOST_ROUTE_SUPPORT = {
  sendMessage: 'implemented',
  searchProjectFiles: 'implemented',
  confirmTool: 'implemented',
  clearActiveSkill: 'implemented',
  activateConversation: 'implemented',
  clearHistory: 'implemented',
  cancelMessage: 'implemented',
  getTasks: 'implemented',
  getContextTokenCount: 'implemented',
  compressContext: 'implemented',
  getPromptMode: 'implemented',
  getMessageQueue: 'implemented',
  promoteQueuedMessage: 'implemented',
  cancelQueuedMessage: 'implemented',
  editQueuedMessage: 'implemented',
  deleteConversation: 'implemented',
  conversationLifecycle: 'implemented',
  newConversation: 'implemented',
  clearAllConversations: 'implemented',
  getConversations: 'implemented',
  getActiveConversation: 'implemented',
  getAgentStates: 'implemented',
  getSettings: 'implemented',
  getConversationSnapshot: 'implemented',
  getConfig: 'implemented',
  refreshConfigSnapshot: 'implemented',
  getSkills: 'implemented',
  openUserConfigFile: 'implemented',
  ssoLogout: 'implemented',
  openConfigFile: 'implemented',
  getTabState: 'implemented',
  planApprove: 'implemented',
  planReject: 'implemented',
  planStepApprove: 'implemented',
  planStepReject: 'implemented',
  planStepModify: 'implemented',
  updateSettings: 'implemented',
  updateTabState: 'implemented',
  cancelTask: 'implemented',
  retryTask: 'implemented',
  viewTaskResult: 'implemented',
  openFile: 'implemented',
  revealDocumentLocator: 'implemented',
  revealFile: 'implemented',
  revealAsset: 'implemented',
  openUrl: 'implemented',
  setPromptMode: 'implemented',
  sendToPlugin: 'implemented',
  invokeAgentCapabilityLifecycle: 'implemented',
  requestCanvasAuthoringHandoff: 'implemented',
  'dnd:start': 'implemented',
  mermaidError: 'implemented',
  downloadSvg: 'implemented',
  invokeSlashCommand: 'implemented',
  invokeSkill: 'implemented',
  invokePluginSlashCommand: 'implemented',
  startCharacterDialogueFromSlash: 'implemented',
  exitCharacterDialogueSession: 'implemented',
  exitEmbodyCharacterSession: 'implemented',
  ssoLogin: 'implemented',
  revealContextSource: 'implemented',
  webviewKeyboardFocus: 'host-inapplicable',
  webviewKeyboardEditable: 'host-inapplicable',
  projectionEndpointDiscover: 'implemented',
  projectionAttach: 'implemented',
  projectionSnapshotAck: 'implemented',
  projectionDetach: 'implemented',
} as const satisfies Record<AgentWebviewToHostMessageType, AgentHostRouteSupport>;

const HOME_AGENT_ROUTE_COVERAGE_DIAGNOSTICS = createAgentHostRouteCoverageDiagnostics({
  hostKind: 'electron',
  routes: HOME_AGENT_HOST_ROUTE_SUPPORT,
});

if (HOME_AGENT_ROUTE_COVERAGE_DIAGNOSTICS.length > 0) {
  throw new Error(
    HOME_AGENT_ROUTE_COVERAGE_DIAGNOSTICS.map((diagnostic) => diagnostic.message).join('\n'),
  );
}

export async function handleRawHomeAgentRuntimeMessageRequest(
  rawRequest: unknown,
  deps: HomeAgentWebviewHostDeps,
): Promise<HomeAgentHostMessageResult> {
  let request;
  try {
    request = normalizeHomeAgentRuntimeMessageRequest(rawRequest);
  } catch (error: unknown) {
    return createDiagnosticResult({
      code: 'invalid-agent-runtime-request',
      message: `Home Agent runtime request is invalid: ${describeUnknownError(error)}`,
    });
  }

  if (!isKnownHomeAgentRuntimeId(request.runtimeId)) {
    return createDiagnosticResult({
      code: 'unknown-agent-runtime',
      runtimeId: request.runtimeId,
      message: `Home Agent runtime is not registered: ${request.runtimeId}`,
    });
  }

  const message = parseWebviewToExtensionMessage(request.message);
  if (!message) {
    return createDiagnosticResult({
      code: 'invalid-agent-webview-message',
      runtimeId: request.runtimeId,
      message: 'Home Agent runtime received an invalid Agent Webview message payload.',
    });
  }

  return {
    runtimeId: request.runtimeId,
    messages: await handleHomeAgentWebviewMessage(message, deps),
  };
}

export async function handleHomeAgentWebviewMessage(
  message: WebviewToExtensionMessage,
  deps: HomeAgentWebviewHostDeps,
): Promise<readonly ExtensionToWebviewMessage[]> {
  const support = (
    HOME_AGENT_HOST_ROUTE_SUPPORT as Readonly<
      Record<AgentWebviewToHostMessageType, AgentHostRouteSupport>
    >
  )[message.type];
  if (support === 'unsupported') {
    return [createUnsupportedRouteMessage(message.type)];
  }
  if (support === 'host-inapplicable') {
    return [];
  }

  switch (message.type) {
    case 'projectionEndpointDiscover':
    case 'projectionAttach':
    case 'projectionSnapshotAck':
    case 'projectionDetach':
      return deps
        .getProjectionRuntime()
        .handle(message, (conversationId) =>
          deps.getConversationRuntime().hasConversation(conversationId),
        );
    case 'searchProjectFiles':
      return [await createHomeProjectFilesMessage(message, deps.getCommandExecutor())];
    case 'getSettings':
      return createHomeAgentSettingsMessages(deps, {
        conversationId: message.conversationId,
        includeConfigState: false,
      });
    case 'getConversationSnapshot':
      return [
        createConversationSnapshotMessage(
          deps.getConversationRuntime().getConversation(message.conversationId),
          message.conversationId,
        ),
      ];
    case 'getConfig':
      return [createHomeAgentConfigStateMessage(deps, { reloadConfig: true })];
    case 'refreshConfigSnapshot':
      return createHomeAgentSettingsMessages(deps, {
        conversationId: deps.getConversationRuntime().getActiveConversation()?.id,
        includeConfigState: true,
        reloadConfig: true,
      });
    case 'updateSettings':
      return updateHomeAgentSettings(message.settings, message.conversationId, deps);
    case 'newConversation':
      return createConversationSnapshotMessages(deps.getConversationRuntime().createConversation(), deps);
    case 'sendMessage': {
      const conversation = deps.getConversationRuntime().sendMessage(message);
      if (!conversation) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return createConversationSnapshotMessages(conversation, deps);
    }
    case 'activateConversation': {
      const activationDiagnostic = validateHomeConversationActivation(
        message,
        deps.getConversationRuntime(),
      );
      if (activationDiagnostic) {
        return [activationDiagnostic, createHomeTabStateMessage(deps.getConversationRuntime())];
      }
      const conversation = deps
        .getConversationRuntime()
        .activateConversation(message.conversationId, message.tabState);
      if (!conversation) {
        return [
          buildAgentSessionDiagnosticMessage({
            code: 'unknown-conversation',
            action: message.type,
            conversationId: message.conversationId,
            tabId: message.tabId,
            message: `Home Agent conversation does not exist: ${message.conversationId}`,
          }),
        ];
      }
      const revision = deps.getConversationRuntime().getTabStateRevision();
      return [
        createActiveConversationMessage(conversation, {
          activationId: message.activationId,
          tabStateRevision: revision,
        }),
        createHomeTabStateMessage(deps.getConversationRuntime()),
      ];
    }
    case 'deleteConversation':
      deps.getConversationRuntime().deleteConversation(message.conversationId);
      return createConversationListAndActiveMessages(deps);
    case 'clearAllConversations':
      deps.getConversationRuntime().clearAllConversations();
      return createConversationListAndActiveMessages(deps);
    case 'clearHistory':
      if (!deps.getConversationRuntime().clearHistory(message.conversationId)) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [{ type: 'historyCleared', conversationId: message.conversationId }];
    case 'cancelMessage':
      if (!deps.getConversationRuntime().getMessageQueueSnapshot(message.conversationId)) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [buildMessageCancelledMessage(message.conversationId)];
    case 'confirmTool':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Tool approval requires the real Agent turn runtime and pending tool registry.',
        ),
      ];
    case 'clearActiveSkill':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Active Skill state is owned by the Agent skill runtime, which is not connected in Home yet.',
        ),
      ];
    case 'conversationLifecycle':
      return [
        buildConversationLifecycleResultMessage({
          conversationId: message.conversationId,
          action: message.action,
          success: false,
          diagnostics: [
            {
              severity: 'warning',
              code: 'home-agent-conversation-lifecycle-unsupported',
              message:
                'Home Agent host has conversation tabs but no creative conversation lifecycle runtime yet.',
            },
          ],
        }),
      ];
    case 'getConversations':
      return [
        {
          type: 'conversationList',
          conversations: [...deps.getConversationRuntime().listConversations()],
        },
      ];
    case 'getActiveConversation':
      return [createActiveConversationMessage(deps.getConversationRuntime().getActiveConversation())];
    case 'getAgentStates':
      return [buildAgentStateSnapshotMessage(deps.getSnapshotRuntime().listAgentStates())];
    case 'getPromptMode': {
      const mode = deps.getConversationRuntime().getPromptMode(message.conversationId);
      if (!mode) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [
        {
          type: 'promptModeChanged',
          conversationId: message.conversationId,
          mode,
          isPlanMode: mode === 'plan',
        },
      ];
    }
    case 'getMessageQueue': {
      const snapshot = deps.getConversationRuntime().getMessageQueueSnapshot(message.conversationId);
      if (!snapshot) {
        return [
          buildMessageQueueErrorMessage({
            conversationId: message.conversationId,
            code: 'conversation-not-found',
            message: `Home Agent conversation does not exist: ${message.conversationId}`,
          }),
        ];
      }
      return [buildMessageQueueSnapshotMessage(snapshot)];
    }
    case 'promoteQueuedMessage':
    case 'cancelQueuedMessage':
    case 'editQueuedMessage': {
      const snapshot = deps.getConversationRuntime().getMessageQueueSnapshot(message.conversationId);
      if (!snapshot) {
        return [
          buildMessageQueueErrorMessage({
            conversationId: message.conversationId,
            code: 'conversation-not-found',
            queueItemId: message.queueItemId,
            message: `Home Agent conversation does not exist: ${message.conversationId}`,
          }),
        ];
      }
      return [
        buildMessageQueueErrorMessage({
          conversationId: message.conversationId,
          code: 'invalid-queue-operation',
          queueItemId: message.queueItemId,
          message:
            'Home Agent message queue actions require the real Agent turn queue runtime.',
          snapshot,
        }),
      ];
    }
    case 'getTasks': {
      const workItems = deps.getConversationRuntime().getTaskWorkItems(message.conversationId);
      if (!workItems) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [buildTasksUpdatedMessage({ conversationId: message.conversationId, workItems })];
    }
    case 'cancelTask':
    case 'retryTask':
    case 'viewTaskResult':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Task actions require the Agent task runtime and result observer.',
        ),
      ];
    case 'getContextTokenCount': {
      const tokenCount = deps.getConversationRuntime().getContextTokenCount(message.conversationId);
      if (tokenCount === undefined) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [
        {
          type: 'contextTokenCount',
          conversationId: message.conversationId,
          tokenCount,
        },
      ];
    }
    case 'compressContext':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Context compression requires the real Agent context runtime.',
        ),
      ];
    case 'getSkills': {
      const snapshot = await deps.getSnapshotRuntime().getSkillsSnapshot();
      return [
        {
          type: 'skillsList',
          skills: snapshot.skills.map((skill) => ({ ...skill })),
        },
        ...snapshot.diagnostics.map((diagnostic) => buildGlobalErrorMessage(diagnostic)),
      ];
    }
    case 'setPromptMode': {
      const mode = deps.getConversationRuntime().setPromptMode(message.conversationId, message.mode);
      if (!mode) {
        return [
          buildGlobalErrorMessage(
            `Home Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [
        {
          type: 'promptModeChanged',
          conversationId: message.conversationId,
          mode,
          isPlanMode: mode === 'plan',
        },
      ];
    }
    case 'getTabState':
      return [createHomeTabStateMessage(deps.getConversationRuntime())];
    case 'updateTabState': {
      const runtime = deps.getConversationRuntime();
      if (message.expectedTabStateRevision !== runtime.getTabStateRevision()) {
        return [
          createStaleTabStateRevisionDiagnostic(
            message.type,
            message.expectedTabStateRevision,
            runtime.getTabStateRevision(),
          ),
          createHomeTabStateMessage(runtime),
        ];
      }
      deps.getConversationRuntime().updateTabState({
        openTabs: message.openTabs,
        activeTabId: message.activeTabId,
      });
      return [createHomeTabStateMessage(deps.getConversationRuntime())];
    }
    case 'openUserConfigFile':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(NEKO_COMMANDS.configOpenUser, {}, { actor: 'agent' }),
      );
    case 'openConfigFile':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(NEKO_COMMANDS.configOpenWorkspace, {}, { actor: 'agent' }),
      );
    case 'openFile':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceOpenFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealDocumentLocator':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceRevealFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealFile':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceRevealFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealAsset':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.resourceReveal,
          { resourceId: message.assetId },
          { actor: 'agent' },
        ),
      );
    case 'openUrl':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.externalOpenUrl,
          { url: message.url },
          { actor: 'agent' },
        ),
      );
    case 'downloadSvg':
      return runHomeAgentHostCommand(message.type, async () => {
        await deps.getCommandExecutor().execute(
          NEKO_COMMANDS.resourceDownloadSvg,
          { svg: message.svg, ...(message.filename ? { filename: message.filename } : {}) },
          { actor: 'agent' },
        );
      });
    case 'dnd:start':
      return runHomeAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.dragStart,
          {
            path: message.asset.path,
            name: message.asset.name,
            ...(message.asset.mediaType ? { mediaType: message.asset.mediaType } : {}),
          },
          { actor: 'agent' },
        ),
      );
    case 'planApprove':
    case 'planReject':
    case 'planStepApprove':
    case 'planStepReject':
    case 'planStepModify':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Plan review actions require the real Agent plan-mode runtime.',
        ),
      ];
    case 'sendToPlugin':
    case 'invokePluginSlashCommand':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Plugin routing requires the Home plugin host runtime.',
        ),
      ];
    case 'invokeAgentCapabilityLifecycle':
      return [
        buildAgentCapabilityLifecycleResultMessage({
          requestId: message.requestId,
          conversationId: message.conversationId,
          success: false,
          error: 'Home Agent capability runtime is not connected yet.',
        }),
      ];
    case 'requestCanvasAuthoringHandoff':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Canvas authoring handoff requires the real Agent turn runtime and Canvas capability host.',
        ),
      ];
    case 'mermaidError':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Mermaid repair feedback requires the real Agent turn runtime.',
        ),
      ];
    case 'invokeSlashCommand':
      return [
        {
          type: 'slashCommandResult',
          conversationId: message.conversationId,
          command: message.command,
          success: false,
          error: 'Home Agent slash command runtime is not connected yet.',
        },
      ];
    case 'invokeSkill':
      return [
        {
          type: 'slashCommandResult',
          conversationId: message.conversationId,
          command: `$${message.skillName}`,
          success: false,
          error: 'Home Agent skill invocation runtime is not connected yet.',
        },
      ];
    case 'startCharacterDialogueFromSlash':
    case 'exitCharacterDialogueSession':
    case 'exitEmbodyCharacterSession':
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Character roleplay sessions require the Home character dialogue runtime.',
        ),
      ];
    case 'ssoLogin':
    case 'ssoLogout':
      return [
        {
          type: 'ssoError',
          error: 'Home account SSO runtime is not connected yet.',
        },
      ];
    case 'revealContextSource': {
      const filePath = message.navigationData?.['filePath'] ?? message.navigationData?.['path'];
      if (filePath) {
        return runHomeAgentHostCommand(message.type, () =>
          deps.getCommandExecutor().execute(
            NEKO_COMMANDS.workspaceOpenFile,
            { path: filePath },
            { actor: 'agent' },
          ),
        );
      }
      return [
        createHomeAgentRuntimePendingMessage(
          message.type,
          'Context source routing requires a file path or the domain resource reveal runtime.',
        ),
      ];
    }
    default:
      return [
        buildGlobalErrorMessage(
          `Home Agent host route classification is missing an implementation branch: ${message.type}`,
        ),
      ];
  }
}

export class InMemoryHomeAgentConversationRuntime implements HomeAgentConversationRuntime {
  private readonly conversations = new Map<string, HomeAgentConversationRecord>();
  private readonly promptModes = new Map<string, PromptMode>();
  private readonly messageQueueSnapshotVersions = new Map<string, number>();
  private tabState: TabState = { openTabs: [], activeTabId: null };
  private tabStateRevision = 0;
  private activeConversationId: string | undefined;
  private nextConversationOrdinal = 1;
  private readonly now: () => number;

  constructor(
    private readonly options: {
      readonly storage?: HomeAgentConversationRuntimeStorage;
      readonly now?: () => number;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    const snapshot = options.storage?.load();
    if (snapshot) {
      this.hydrate(snapshot);
    }
  }

  listConversations(): readonly ConversationSummary[] {
    return [...this.conversations.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        messageCount: conversation.messages.length,
        updatedAt: conversation.updatedAt,
      }));
  }

  getActiveConversation(): HomeAgentConversationSnapshot | undefined {
    if (!this.activeConversationId) return undefined;
    const conversation = this.conversations.get(this.activeConversationId);
    return conversation ? cloneConversationSnapshot(conversation) : undefined;
  }

  getConversation(conversationId: string): HomeAgentConversationSnapshot | undefined {
    const conversation = this.conversations.get(conversationId);
    return conversation ? cloneConversationSnapshot(conversation) : undefined;
  }

  hasConversation(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }

  createConversation(): HomeAgentConversationSnapshot {
    const id = `home-conversation-${this.nextConversationOrdinal}`;
    this.nextConversationOrdinal += 1;
    const conversation: HomeAgentConversationRecord = {
      id,
      title: `Conversation ${this.nextConversationOrdinal - 1}`,
      messages: [],
      updatedAt: this.now(),
      nextMessageOrdinal: 1,
    };
    this.conversations.set(id, conversation);
    this.activeConversationId = id;
    this.promptModes.set(id, 'default');
    this.tabState = {
      openTabs: [
        ...this.tabState.openTabs.filter((tab) => tab.conversationId !== id),
        { id, title: conversation.title, conversationId: id, kind: 'chat' },
      ],
      activeTabId: id,
    };
    this.tabStateRevision += 1;
    this.persist();
    return cloneConversationSnapshot(conversation);
  }

  sendMessage(message: SendMessageWebviewMessage): HomeAgentConversationSnapshot | undefined {
    const conversation = this.conversations.get(message.conversationId);
    if (!conversation) return undefined;

    const timestamp = this.now();
    const userMessage = createHomeUserMessage(conversation, message, timestamp);
    const diagnosticMessage = createHomeAgentTurnRuntimeDiagnosticMessage(
      conversation,
      message,
      timestamp + 1,
    );
    conversation.messages.push(userMessage, diagnosticMessage);
    conversation.title = resolveHomeConversationTitle(conversation.title, message.message);
    conversation.updatedAt = diagnosticMessage.timestamp;
    this.activeConversationId = conversation.id;
    this.tabState = {
      openTabs: this.ensureTab(conversation),
      activeTabId: conversation.id,
    };
    this.tabStateRevision += 1;
    this.persist();
    return cloneConversationSnapshot(conversation);
  }

  activateConversation(
    conversationId: string,
    tabState: TabState,
  ): HomeAgentConversationSnapshot | undefined {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return undefined;
    this.activeConversationId = conversationId;
    this.tabState = {
      openTabs: tabState.openTabs.map((tab) => ({ ...tab })),
      activeTabId: tabState.activeTabId,
    };
    this.tabStateRevision += 1;
    this.persist();
    return cloneConversationSnapshot(conversation);
  }

  deleteConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
    this.promptModes.delete(conversationId);
    this.messageQueueSnapshotVersions.delete(conversationId);
    const openTabs = this.tabState.openTabs.filter((tab) => tab.conversationId !== conversationId);
    const nextActiveId =
      this.activeConversationId === conversationId
        ? openTabs[0]?.conversationId
        : this.activeConversationId;
    this.activeConversationId =
      nextActiveId && this.conversations.has(nextActiveId) ? nextActiveId : undefined;
    this.tabState = {
      openTabs,
      activeTabId: this.activeConversationId ?? null,
    };
    this.tabStateRevision += 1;
    this.persist();
  }

  clearAllConversations(): void {
    this.conversations.clear();
    this.promptModes.clear();
    this.messageQueueSnapshotVersions.clear();
    this.activeConversationId = undefined;
    this.tabState = { openTabs: [], activeTabId: null };
    this.tabStateRevision += 1;
    this.persist();
  }

  clearHistory(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return false;
    conversation.messages = [];
    conversation.updatedAt = this.now();
    this.persist();
    return true;
  }

  getPromptMode(conversationId: string): PromptMode | undefined {
    if (!this.conversations.has(conversationId)) return undefined;
    return this.promptModes.get(conversationId) ?? 'default';
  }

  setPromptMode(conversationId: string, mode: PromptMode): PromptMode | undefined {
    if (!this.conversations.has(conversationId)) return undefined;
    this.promptModes.set(conversationId, mode);
    this.persist();
    return mode;
  }

  getMessageQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot | undefined {
    if (!this.conversations.has(conversationId)) return undefined;
    return {
      conversationId,
      items: [],
      pendingCount: 0,
      version: this.nextMessageQueueSnapshotVersion(conversationId),
    };
  }

  getTaskWorkItems(conversationId: string): readonly AgentWorkItem[] | undefined {
    if (!this.conversations.has(conversationId)) return undefined;
    return [];
  }

  getContextTokenCount(conversationId: string): number | undefined {
    if (!this.conversations.has(conversationId)) return undefined;
    return 0;
  }

  getTabState(): TabState {
    return cloneTabState(this.tabState);
  }

  getTabStateRevision(): number {
    return this.tabStateRevision;
  }

  updateTabState(tabState: TabState): void {
    const openTabs = tabState.openTabs.filter((tab) =>
      this.conversations.has(tab.conversationId),
    );
    const activeTabId =
      tabState.activeTabId && openTabs.some((tab) => tab.id === tabState.activeTabId)
        ? tabState.activeTabId
        : null;
    this.tabState = { openTabs: openTabs.map((tab) => ({ ...tab })), activeTabId };
    const activeTab = activeTabId
      ? this.tabState.openTabs.find((tab) => tab.id === activeTabId)
      : undefined;
    this.activeConversationId = activeTab?.conversationId;
    this.tabStateRevision += 1;
    this.persist();
  }

  private ensureTab(conversation: HomeAgentConversationSnapshot): TabState['openTabs'] {
    const existing = this.tabState.openTabs.find(
      (tab) => tab.conversationId === conversation.id,
    );
    const withoutConversation = this.tabState.openTabs.filter(
      (tab) => tab.conversationId !== conversation.id,
    );
    return [
      ...withoutConversation,
      {
        id: existing?.id ?? conversation.id,
        title: conversation.title,
        conversationId: conversation.id,
        kind: existing?.kind ?? 'chat',
        ...(existing?.characterDialogueSession
          ? { characterDialogueSession: existing.characterDialogueSession }
          : {}),
        ...(existing?.embodyCharacterSession
          ? { embodyCharacterSession: existing.embodyCharacterSession }
          : {}),
      },
    ];
  }

  private nextMessageQueueSnapshotVersion(conversationId: string): number {
    const nextVersion = (this.messageQueueSnapshotVersions.get(conversationId) ?? 0) + 1;
    this.messageQueueSnapshotVersions.set(conversationId, nextVersion);
    this.persist();
    return nextVersion;
  }

  private hydrate(snapshot: HomeAgentConversationRuntimeStorageSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported Home Agent conversation snapshot version: ${snapshot.version}`);
    }
    this.conversations.clear();
    for (const conversation of snapshot.conversations) {
      this.conversations.set(conversation.id, {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages.map((message) => ({ ...message })),
        updatedAt: conversation.updatedAt,
        nextMessageOrdinal: conversation.nextMessageOrdinal,
      });
    }
    this.promptModes.clear();
    for (const [conversationId, mode] of snapshot.promptModes) {
      if (this.conversations.has(conversationId)) {
        this.promptModes.set(conversationId, mode);
      }
    }
    this.messageQueueSnapshotVersions.clear();
    for (const [conversationId, version] of snapshot.messageQueueSnapshotVersions) {
      if (this.conversations.has(conversationId)) {
        this.messageQueueSnapshotVersions.set(conversationId, version);
      }
    }
    const openTabs = snapshot.tabState.openTabs.filter((tab) =>
      this.conversations.has(tab.conversationId),
    );
    this.tabState = {
      openTabs,
      activeTabId:
        snapshot.tabState.activeTabId &&
        openTabs.some((tab) => tab.id === snapshot.tabState.activeTabId)
          ? snapshot.tabState.activeTabId
          : null,
    };
    this.activeConversationId =
      snapshot.activeConversationId && this.conversations.has(snapshot.activeConversationId)
        ? snapshot.activeConversationId
        : undefined;
    this.nextConversationOrdinal = Math.max(snapshot.nextConversationOrdinal, 1);
  }

  private persist(): void {
    this.options.storage?.save({
      version: 1,
      conversations: [...this.conversations.values()].map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages.map((message) => ({ ...message })),
        updatedAt: conversation.updatedAt,
        nextMessageOrdinal: conversation.nextMessageOrdinal,
      })),
      promptModes: [...this.promptModes.entries()],
      messageQueueSnapshotVersions: [...this.messageQueueSnapshotVersions.entries()],
      tabState: cloneTabState(this.tabState),
      nextConversationOrdinal: this.nextConversationOrdinal,
      ...(this.activeConversationId ? { activeConversationId: this.activeConversationId } : {}),
    });
  }
}

interface HomeAgentConversationRecord {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  nextMessageOrdinal: number;
}

function createHomeAgentSettingsMessages(
  deps: HomeAgentWebviewHostDeps,
  options: {
    readonly conversationId?: string;
    readonly includeConfigState: boolean;
    readonly reloadConfig?: boolean;
  },
): readonly ExtensionToWebviewMessage[] {
  try {
    const configManager = deps.getConfigManager();
    if (options.reloadConfig) {
      configManager.reloadConfig();
    }

    const messages: ExtensionToWebviewMessage[] = [];
    const settingsMessage = buildAssistantSettingsRuntimeDataMessage({
      getSettingsData: () => configManager.getAssistantSettingsData(),
    });
    if (settingsMessage && options.conversationId) {
      messages.push(
        projectHomeAgentSettingsDataMessage(settingsMessage, options.conversationId),
      );
    }
    if (options.includeConfigState) {
      messages.push(buildConfigStateMessage(configManager.getAssistantConfigState()));
    }
    return messages;
  } catch (error: unknown) {
    return createHomeAgentConfigFailureMessages(error);
  }
}

function createHomeAgentConfigStateMessage(
  deps: HomeAgentWebviewHostDeps,
  options: {
    readonly reloadConfig?: boolean;
  },
): ExtensionToWebviewMessage {
  try {
    const configManager = deps.getConfigManager();
    if (options.reloadConfig) {
      configManager.reloadConfig();
    }
    return buildConfigStateMessage(configManager.getAssistantConfigState());
  } catch (error: unknown) {
    return buildConfigStateMessage({
      providers: [],
      configuredProviders: [],
      modelGroups: [],
      configDiagnostic: createConfigLoadFailedDiagnostic(error),
    });
  }
}

async function updateHomeAgentSettings(
  settings: Record<string, unknown>,
  conversationId: string,
  deps: HomeAgentWebviewHostDeps,
): Promise<readonly ExtensionToWebviewMessage[]> {
  try {
    const configManager = deps.getConfigManager();
    const updateMessage = await runAssistantSettingsUpdateRuntime(settings, {
      updateSettingsFromWebview: (updates) =>
        configManager.applyRuntimeAssistantSettingsFromWebview(updates),
    });
    return [
      updateMessage,
      ...createHomeAgentSettingsMessages(deps, {
        conversationId,
        includeConfigState: true,
        reloadConfig: false,
      }),
    ];
  } catch (error: unknown) {
    return [
      {
        type: 'settingsUpdated',
        success: false,
        error: describeUnknownError(error),
      },
      ...createHomeAgentConfigFailureMessages(error),
    ];
  }
}

function projectHomeAgentSettingsDataMessage(
  message: AssistantSettingsRuntimeDataMessage,
  conversationId: string,
): SettingsDataMessage {
  const configuredProviderIds = new Set(
    message.configuredProviders.map((provider) => provider.id),
  );
  return {
    ...message,
    conversationId,
    providers: message.providers.map((provider): AgentSettingsProviderView => {
      return {
        id: provider.id,
        name: provider.name,
        isConfigured: configuredProviderIds.has(provider.id),
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          description: '',
        })),
      };
    }),
  };
}

function createHomeUserMessage(
  conversation: HomeAgentConversationRecord,
  message: SendMessageWebviewMessage,
  timestamp: number,
): Message {
  return {
    id: nextHomeAgentMessageId(conversation),
    role: 'user',
    content: message.message,
    timestamp,
    ...(message.attachments && message.attachments.length > 0
      ? { attachments: [...message.attachments] }
      : {}),
    ...createHomeUserMessageContext(message),
  };
}

function createHomeUserMessageContext(
  message: SendMessageWebviewMessage,
): Pick<Message, 'contextReferences'> {
  const contextReferences = [
    ...(message.contextPayloads ?? []).map((payload) => ({
      type: payload.type,
      id: payload.id,
      label: payload.label,
      summary: payload.summary,
    })),
    ...(message.fileReferences ?? []).map((reference) => ({
      type: mapHomeAgentFileReferenceContextType(reference.mediaType),
      id: reference.id,
      label: reference.label,
      summary: reference.path,
      ...(reference.thumbnailUri ? { thumbnailUri: reference.thumbnailUri } : {}),
      ...(reference.mediaType ? { mediaType: reference.mediaType } : {}),
      navigationData: { path: reference.path },
    })),
  ] satisfies NonNullable<Message['contextReferences']>;

  return contextReferences.length > 0 ? { contextReferences } : {};
}

function mapHomeAgentFileReferenceContextType(
  mediaType: NonNullable<SendMessageWebviewMessage['fileReferences']>[number]['mediaType'],
): NonNullable<Message['contextReferences']>[number]['type'] {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'sequence') return 'media';
  if (mediaType === 'document' || mediaType === 'text') return 'document-selection';
  return 'file';
}

function createHomeAgentTurnRuntimeDiagnosticMessage(
  conversation: HomeAgentConversationRecord,
  message: SendMessageWebviewMessage,
  timestamp: number,
): Message {
  return {
    id: nextHomeAgentMessageId(conversation),
    role: 'assistant',
    content:
      `Home Agent turn runtime is not connected for ${message.sessionMode} sessions yet. ` +
      'Your message was saved in the local Home conversation, but no provider was invoked.',
    timestamp,
    isError: true,
  };
}

const GENERATED_CONVERSATION_TITLE_PREFIX = 'Conversation ';
const CONVERSATION_TITLE_MAX_LENGTH = 50;

function resolveHomeConversationTitle(currentTitle: string, message: string): string {
  if (!currentTitle.startsWith(GENERATED_CONVERSATION_TITLE_PREFIX)) {
    return currentTitle;
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return currentTitle;
  }
  const sliced = trimmed.slice(0, CONVERSATION_TITLE_MAX_LENGTH).trim();
  return trimmed.length > CONVERSATION_TITLE_MAX_LENGTH ? `${sliced}...` : sliced;
}

function nextHomeAgentMessageId(conversation: HomeAgentConversationRecord): string {
  const id = `${conversation.id}-message-${conversation.nextMessageOrdinal}`;
  conversation.nextMessageOrdinal += 1;
  return id;
}

function cloneConversationSnapshot(
  conversation: HomeAgentConversationRecord,
): HomeAgentConversationSnapshot {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) => ({ ...message })),
  };
}

function createConversationSnapshotMessages(
  conversation: HomeAgentConversationSnapshot,
  deps: HomeAgentWebviewHostDeps,
): readonly ExtensionToWebviewMessage[] {
  return [
    {
      type: 'conversationList',
      conversations: [...deps.getConversationRuntime().listConversations()],
    },
    createActiveConversationMessage(conversation),
    createHomeTabStateMessage(deps.getConversationRuntime()),
  ];
}

function createConversationListAndActiveMessages(
  deps: HomeAgentWebviewHostDeps,
): readonly ExtensionToWebviewMessage[] {
  return [
    {
      type: 'conversationList',
      conversations: [...deps.getConversationRuntime().listConversations()],
    },
    createActiveConversationMessage(deps.getConversationRuntime().getActiveConversation()),
    createHomeTabStateMessage(deps.getConversationRuntime()),
  ];
}

function createActiveConversationMessage(
  conversation: HomeAgentConversationSnapshot | undefined,
  activation?: {
    readonly activationId: number;
    readonly tabStateRevision: number;
  },
): ExtensionToWebviewMessage {
  return {
    type: 'activeConversation',
    ...(activation ? { activation } : {}),
    ...(conversation
      ? {
          conversation: {
            id: conversation.id,
            title: conversation.title,
            messages: conversation.messages.map((message) => ({ ...message })),
          },
        }
      : {}),
  };
}

function createConversationSnapshotMessage(
  conversation: HomeAgentConversationSnapshot | undefined,
  conversationId: string,
): ExtensionToWebviewMessage {
  if (!conversation) {
    return buildGlobalErrorMessage(`Home Agent conversation does not exist: ${conversationId}`);
  }
  return {
    type: 'conversationSnapshot',
    conversation: {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.map((message) => ({ ...message })),
    },
  };
}

function createHomeTabStateMessage(
  runtime: HomeAgentConversationRuntime,
): ExtensionToWebviewMessage {
  return buildTabStateMessage(runtime.getTabState(), runtime.getTabStateRevision());
}

function validateHomeConversationActivation(
  message: Extract<WebviewToExtensionMessage, { readonly type: 'activateConversation' }>,
  runtime: HomeAgentConversationRuntime,
): ExtensionToWebviewMessage | undefined {
  const activeTab = message.tabState.openTabs.find((tab) => tab.id === message.tabId);
  if (
    message.tabState.activeTabId !== message.tabId ||
    !activeTab ||
    activeTab.conversationId !== message.conversationId ||
    (activeTab.kind !== undefined && activeTab.kind !== 'chat')
  ) {
    return buildAgentSessionDiagnosticMessage({
      code: 'invalid-conversation-activation',
      action: message.type,
      conversationId: message.conversationId,
      tabId: message.tabId,
      activeConversationId: runtime.getActiveConversation()?.id ?? null,
      message: 'Home Agent conversation activation does not match the requested Tab state.',
    });
  }
  if (message.expectedTabStateRevision !== runtime.getTabStateRevision()) {
    return createStaleTabStateRevisionDiagnostic(
      message.type,
      message.expectedTabStateRevision,
      runtime.getTabStateRevision(),
    );
  }
  return undefined;
}

function createStaleTabStateRevisionDiagnostic(
  action: 'activateConversation' | 'updateTabState',
  expectedRevision: number,
  currentRevision: number,
): ExtensionToWebviewMessage {
  return buildAgentSessionDiagnosticMessage({
    code: 'stale-tab-state-revision',
    action,
    message: `Home Agent Tab state revision mismatch: expected ${expectedRevision}, current ${currentRevision}.`,
  });
}

function createUnsupportedRouteMessage(
  messageType: AgentWebviewToHostMessageType,
): ExtensionToWebviewMessage {
  return buildGlobalErrorMessage(`Home Agent host route is unsupported: ${messageType}`);
}

async function createHomeProjectFilesMessage(
  message: Extract<WebviewToExtensionMessage, { readonly type: 'searchProjectFiles' }>,
  commandExecutor: NekoCommandExecutor,
): Promise<ProjectFilesWebviewMessage> {
  const result = await commandExecutor.execute(
    NEKO_COMMANDS.workspaceSearchFiles,
    { filter: message.filter, limit: 30 },
    { actor: 'agent' },
  );
  return {
    type: 'projectFiles',
    filter: message.filter,
    ...(message.conversationId ? { conversationId: message.conversationId } : {}),
    ...(message.purpose ? { purpose: message.purpose } : {}),
    files: result.files.map(projectHomeWorkspaceFileCandidate),
    mentionExtras: [],
  };
}

function projectHomeWorkspaceFileCandidate(
  file: NekoWorkspaceFileCandidate,
): ProjectFileMentionInfo {
  return {
    path: file.path,
    name: file.name,
    type: file.type,
    ...(file.icon ? { icon: file.icon } : {}),
    ...(file.source ? { source: file.source } : {}),
    ...(file.mediaType ? { mediaType: file.mediaType } : {}),
  };
}

async function runHomeAgentHostCommand(
  messageType: AgentWebviewToHostMessageType,
  run: () => Promise<void>,
): Promise<readonly ExtensionToWebviewMessage[]> {
  try {
    await run();
    return [];
  } catch (error: unknown) {
    return [
      buildGlobalErrorMessage(
        `Home Agent host route '${messageType}' failed: ${describeUnknownError(error)}`,
      ),
    ];
  }
}

function createHomeAgentRuntimePendingMessage(
  messageType: AgentWebviewToHostMessageType,
  detail: string,
): ExtensionToWebviewMessage {
  return buildGlobalErrorMessage(`Home Agent host route '${messageType}' is pending: ${detail}`);
}

function createDiagnosticResult(
  diagnostic: HomeAgentRuntimeDiagnostic,
): HomeAgentHostMessageResult {
  return {
    runtimeId: diagnostic.runtimeId,
    messages: [buildGlobalErrorMessage(diagnostic.message)],
    diagnostics: [diagnostic],
  };
}

function createHomeAgentConfigFailureMessages(
  error: unknown,
): readonly ExtensionToWebviewMessage[] {
  const diagnostic = createConfigLoadFailedDiagnostic(error);
  return [
    buildGlobalErrorMessage(diagnostic.message),
    buildConfigStateMessage({
      providers: [],
      configuredProviders: [],
      modelGroups: [],
      configDiagnostic: diagnostic,
    }),
  ];
}

function createConfigLoadFailedDiagnostic(error: unknown): AgentConfigDiagnostic {
  return {
    code: 'readError',
    filePath: '<home-agent-config>',
    message: `Home Agent config load failed: ${describeUnknownError(error)}`,
  };
}

function cloneTabState(tabState: TabState): TabState {
  return {
    openTabs: tabState.openTabs.map((tab) => ({ ...tab })),
    activeTabId: tabState.activeTabId,
  };
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
