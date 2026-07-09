import {
  NEKO_COMMANDS,
  type NekoCommandExecutor,
  type NekoWorkspaceFileCandidate,
} from '@neko/host';
import {
  buildAgentStateSnapshotMessage,
  buildAgentCapabilityLifecycleResultMessage,
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
  DESKTOP_AGENT_RUNTIME_IDS,
  isKnownDesktopAgentRuntimeId,
  normalizeDesktopAgentRuntimeMessageRequest,
  type DesktopAgentHostMessageResult,
  type DesktopAgentRuntimeDiagnostic,
} from '../shared/contracts';

export interface DesktopAgentConfigManager {
  reloadConfig(): void;
  getAssistantSettingsData(): AssistantSettingsData;
  getAssistantConfigState(): AssistantConfigState;
  applyRuntimeAssistantSettingsFromWebview(settings: Record<string, unknown>): Promise<void>;
}

export interface DesktopAgentWebviewHostDeps {
  readonly getConfigManager: () => DesktopAgentConfigManager;
  readonly getConversationRuntime: () => DesktopAgentConversationRuntime;
  readonly getCommandExecutor: () => NekoCommandExecutor;
  readonly getSnapshotRuntime: () => DesktopAgentSnapshotRuntime;
}

export interface DesktopAgentSnapshotRuntime {
  listAgentStates(): AgentStateSnapshotMessage['agentStates'];
  getSkillsSnapshot(): Promise<DesktopAgentSkillsSnapshot>;
}

export interface DesktopAgentSkillsSnapshot {
  readonly skills: NonNullable<SkillsListMessage['skills']>;
  readonly diagnostics: readonly string[];
}

export interface DesktopAgentConversationRuntime {
  listConversations(): readonly ConversationSummary[];
  getActiveConversation(): DesktopAgentConversationSnapshot | undefined;
  createConversation(): DesktopAgentConversationSnapshot;
  sendMessage(message: SendMessageWebviewMessage): DesktopAgentConversationSnapshot | undefined;
  switchConversation(conversationId: string): DesktopAgentConversationSnapshot | undefined;
  deleteConversation(conversationId: string): void;
  clearAllConversations(): void;
  clearHistory(conversationId: string): boolean;
  getPromptMode(conversationId: string): PromptMode | undefined;
  setPromptMode(conversationId: string, mode: PromptMode): PromptMode | undefined;
  getMessageQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot | undefined;
  getTaskWorkItems(conversationId: string): readonly AgentWorkItem[] | undefined;
  getContextTokenCount(conversationId: string): number | undefined;
  getTabState(): TabState;
  updateTabState(tabState: TabState): void;
}

export interface DesktopAgentConversationSnapshot {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly Message[];
}

export interface DesktopAgentConversationRuntimeStorageSnapshot {
  readonly version: 1;
  readonly conversations: readonly DesktopAgentConversationStorageRecord[];
  readonly promptModes: readonly (readonly [string, PromptMode])[];
  readonly messageQueueSnapshotVersions: readonly (readonly [string, number])[];
  readonly tabState: TabState;
  readonly nextConversationOrdinal: number;
  readonly activeConversationId?: string;
}

export interface DesktopAgentConversationStorageRecord {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly Message[];
  readonly updatedAt: number;
  readonly nextMessageOrdinal: number;
}

export interface DesktopAgentConversationRuntimeStorage {
  load(): DesktopAgentConversationRuntimeStorageSnapshot | undefined;
  save(snapshot: DesktopAgentConversationRuntimeStorageSnapshot): void;
}

export class InMemoryDesktopAgentSnapshotRuntime implements DesktopAgentSnapshotRuntime {
  listAgentStates(): AgentStateSnapshotMessage['agentStates'] {
    return [];
  }

  async getSkillsSnapshot(): Promise<DesktopAgentSkillsSnapshot> {
    return { skills: [], diagnostics: [] };
  }
}

type AssistantSettingsRuntimeDataMessage = NonNullable<
  ReturnType<typeof buildAssistantSettingsRuntimeDataMessage>
>;

type AgentSettingsProviderView = NonNullable<SettingsDataMessage['providers']>[number];

export const DESKTOP_AGENT_HOST_ROUTE_SUPPORT = {
  sendMessage: 'implemented',
  searchProjectFiles: 'implemented',
  confirmTool: 'implemented',
  clearActiveSkill: 'implemented',
  switchConversation: 'implemented',
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
} as const satisfies Record<AgentWebviewToHostMessageType, AgentHostRouteSupport>;

const DESKTOP_AGENT_ROUTE_COVERAGE_DIAGNOSTICS = createAgentHostRouteCoverageDiagnostics({
  hostKind: 'electron',
  routes: DESKTOP_AGENT_HOST_ROUTE_SUPPORT,
});

if (DESKTOP_AGENT_ROUTE_COVERAGE_DIAGNOSTICS.length > 0) {
  throw new Error(
    DESKTOP_AGENT_ROUTE_COVERAGE_DIAGNOSTICS.map((diagnostic) => diagnostic.message).join('\n'),
  );
}

export async function handleRawDesktopAgentRuntimeMessageRequest(
  rawRequest: unknown,
  deps: DesktopAgentWebviewHostDeps,
): Promise<DesktopAgentHostMessageResult> {
  let request;
  try {
    request = normalizeDesktopAgentRuntimeMessageRequest(rawRequest);
  } catch (error: unknown) {
    return createDiagnosticResult({
      code: 'invalid-agent-runtime-request',
      message: `Desktop Agent runtime request is invalid: ${describeUnknownError(error)}`,
    });
  }

  if (!isKnownDesktopAgentRuntimeId(request.runtimeId)) {
    return createDiagnosticResult({
      code: 'unknown-agent-runtime',
      runtimeId: request.runtimeId,
      message: `Desktop Agent runtime is not registered: ${request.runtimeId}`,
    });
  }

  const message = parseWebviewToExtensionMessage(request.message);
  if (!message) {
    return createDiagnosticResult({
      code: 'invalid-agent-webview-message',
      runtimeId: request.runtimeId,
      message: 'Desktop Agent runtime received an invalid Agent Webview message payload.',
    });
  }

  return {
    runtimeId: request.runtimeId,
    messages: await handleDesktopAgentWebviewMessage(message, deps),
  };
}

export async function handleDesktopAgentWebviewMessage(
  message: WebviewToExtensionMessage,
  deps: DesktopAgentWebviewHostDeps,
): Promise<readonly ExtensionToWebviewMessage[]> {
  const support = (
    DESKTOP_AGENT_HOST_ROUTE_SUPPORT as Readonly<
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
    case 'searchProjectFiles':
      return [await createDesktopProjectFilesMessage(message, deps.getCommandExecutor())];
    case 'getSettings':
      return createDesktopAgentSettingsMessages(deps, { includeConfigState: false });
    case 'getConfig':
      return [createDesktopAgentConfigStateMessage(deps, { reloadConfig: true })];
    case 'refreshConfigSnapshot':
      return createDesktopAgentSettingsMessages(deps, {
        includeConfigState: true,
        reloadConfig: true,
      });
    case 'updateSettings':
      return updateDesktopAgentSettings(message.settings, deps);
    case 'newConversation':
      return createConversationSnapshotMessages(deps.getConversationRuntime().createConversation(), deps);
    case 'sendMessage': {
      const conversation = deps.getConversationRuntime().sendMessage(message);
      if (!conversation) {
        return [
          buildGlobalErrorMessage(
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return createConversationSnapshotMessages(conversation, deps);
    }
    case 'switchConversation': {
      const conversation = deps.getConversationRuntime().switchConversation(message.conversationId);
      if (!conversation) {
        return [
          buildGlobalErrorMessage(
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return createConversationSnapshotMessages(conversation, deps);
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
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [{ type: 'historyCleared', conversationId: message.conversationId }];
    case 'cancelMessage':
      if (!deps.getConversationRuntime().getMessageQueueSnapshot(message.conversationId)) {
        return [
          buildGlobalErrorMessage(
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [buildMessageCancelledMessage(message.conversationId)];
    case 'confirmTool':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Tool approval requires the real Agent turn runtime and pending tool registry.',
        ),
      ];
    case 'clearActiveSkill':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Active Skill state is owned by the Agent skill runtime, which is not connected in Desktop yet.',
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
              code: 'desktop-agent-conversation-lifecycle-unsupported',
              message:
                'Desktop Agent host has conversation tabs but no creative conversation lifecycle runtime yet.',
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
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
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
            message: `Desktop Agent conversation does not exist: ${message.conversationId}`,
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
            message: `Desktop Agent conversation does not exist: ${message.conversationId}`,
          }),
        ];
      }
      return [
        buildMessageQueueErrorMessage({
          conversationId: message.conversationId,
          code: 'invalid-queue-operation',
          queueItemId: message.queueItemId,
          message:
            'Desktop Agent message queue actions require the real Agent turn queue runtime.',
          snapshot,
        }),
      ];
    }
    case 'getTasks': {
      const workItems = deps.getConversationRuntime().getTaskWorkItems(message.conversationId);
      if (!workItems) {
        return [
          buildGlobalErrorMessage(
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
          ),
        ];
      }
      return [buildTasksUpdatedMessage({ conversationId: message.conversationId, workItems })];
    }
    case 'cancelTask':
    case 'retryTask':
    case 'viewTaskResult':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Task actions require the Agent task runtime and result observer.',
        ),
      ];
    case 'getContextTokenCount': {
      const tokenCount = deps.getConversationRuntime().getContextTokenCount(message.conversationId);
      if (tokenCount === undefined) {
        return [
          buildGlobalErrorMessage(
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
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
        createDesktopAgentRuntimePendingMessage(
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
            `Desktop Agent conversation does not exist: ${message.conversationId}`,
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
      return [buildTabStateMessage(deps.getConversationRuntime().getTabState())];
    case 'updateTabState':
      deps.getConversationRuntime().updateTabState({
        openTabs: message.openTabs,
        activeTabId: message.activeTabId,
      });
      return [buildTabStateMessage(deps.getConversationRuntime().getTabState())];
    case 'openUserConfigFile':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(NEKO_COMMANDS.configOpenUser, {}, { actor: 'agent' }),
      );
    case 'openConfigFile':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(NEKO_COMMANDS.configOpenWorkspace, {}, { actor: 'agent' }),
      );
    case 'openFile':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceOpenFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealDocumentLocator':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceRevealFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealFile':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.workspaceRevealFile,
          { path: message.filePath },
          { actor: 'agent' },
        ),
      );
    case 'revealAsset':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.resourceReveal,
          { resourceId: message.assetId },
          { actor: 'agent' },
        ),
      );
    case 'openUrl':
      return runDesktopAgentHostCommand(message.type, () =>
        deps.getCommandExecutor().execute(
          NEKO_COMMANDS.externalOpenUrl,
          { url: message.url },
          { actor: 'agent' },
        ),
      );
    case 'downloadSvg':
      return runDesktopAgentHostCommand(message.type, async () => {
        await deps.getCommandExecutor().execute(
          NEKO_COMMANDS.resourceDownloadSvg,
          { svg: message.svg, ...(message.filename ? { filename: message.filename } : {}) },
          { actor: 'agent' },
        );
      });
    case 'dnd:start':
      return runDesktopAgentHostCommand(message.type, () =>
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
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Plan review actions require the real Agent plan-mode runtime.',
        ),
      ];
    case 'sendToPlugin':
    case 'invokePluginSlashCommand':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Plugin routing requires the Desktop plugin host runtime.',
        ),
      ];
    case 'invokeAgentCapabilityLifecycle':
      return [
        buildAgentCapabilityLifecycleResultMessage({
          requestId: message.requestId,
          conversationId: message.conversationId,
          success: false,
          error: 'Desktop Agent capability runtime is not connected yet.',
        }),
      ];
    case 'requestCanvasAuthoringHandoff':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Canvas authoring handoff requires the real Agent turn runtime and Canvas capability host.',
        ),
      ];
    case 'mermaidError':
      return [
        createDesktopAgentRuntimePendingMessage(
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
          error: 'Desktop Agent slash command runtime is not connected yet.',
        },
      ];
    case 'invokeSkill':
      return [
        {
          type: 'slashCommandResult',
          conversationId: message.conversationId,
          command: `$${message.skillName}`,
          success: false,
          error: 'Desktop Agent skill invocation runtime is not connected yet.',
        },
      ];
    case 'startCharacterDialogueFromSlash':
    case 'exitCharacterDialogueSession':
    case 'exitEmbodyCharacterSession':
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Character roleplay sessions require the Desktop character dialogue runtime.',
        ),
      ];
    case 'ssoLogin':
    case 'ssoLogout':
      return [
        {
          type: 'ssoError',
          error: 'Desktop account SSO runtime is not connected yet.',
        },
      ];
    case 'revealContextSource': {
      const filePath = message.navigationData?.['filePath'] ?? message.navigationData?.['path'];
      if (filePath) {
        return runDesktopAgentHostCommand(message.type, () =>
          deps.getCommandExecutor().execute(
            NEKO_COMMANDS.workspaceOpenFile,
            { path: filePath },
            { actor: 'agent' },
          ),
        );
      }
      return [
        createDesktopAgentRuntimePendingMessage(
          message.type,
          'Context source routing requires a file path or the domain resource reveal runtime.',
        ),
      ];
    }
    default:
      return [
        buildGlobalErrorMessage(
          `Desktop Agent host route classification is missing an implementation branch: ${message.type}`,
        ),
      ];
  }
}

export class InMemoryDesktopAgentConversationRuntime implements DesktopAgentConversationRuntime {
  private readonly conversations = new Map<string, DesktopAgentConversationRecord>();
  private readonly promptModes = new Map<string, PromptMode>();
  private readonly messageQueueSnapshotVersions = new Map<string, number>();
  private tabState: TabState = { openTabs: [], activeTabId: null };
  private activeConversationId: string | undefined;
  private nextConversationOrdinal = 1;
  private readonly now: () => number;

  constructor(
    private readonly options: {
      readonly storage?: DesktopAgentConversationRuntimeStorage;
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

  getActiveConversation(): DesktopAgentConversationSnapshot | undefined {
    if (!this.activeConversationId) return undefined;
    const conversation = this.conversations.get(this.activeConversationId);
    return conversation ? cloneConversationSnapshot(conversation) : undefined;
  }

  createConversation(): DesktopAgentConversationSnapshot {
    const id = `desktop-conversation-${this.nextConversationOrdinal}`;
    this.nextConversationOrdinal += 1;
    const conversation: DesktopAgentConversationRecord = {
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
    this.persist();
    return cloneConversationSnapshot(conversation);
  }

  sendMessage(message: SendMessageWebviewMessage): DesktopAgentConversationSnapshot | undefined {
    const conversation = this.conversations.get(message.conversationId);
    if (!conversation) return undefined;

    const timestamp = this.now();
    const userMessage = createDesktopUserMessage(conversation, message, timestamp);
    const diagnosticMessage = createDesktopAgentTurnRuntimeDiagnosticMessage(
      conversation,
      message,
      timestamp + 1,
    );
    conversation.messages.push(userMessage, diagnosticMessage);
    conversation.title = resolveDesktopConversationTitle(conversation.title, message.message);
    conversation.updatedAt = diagnosticMessage.timestamp;
    this.activeConversationId = conversation.id;
    this.tabState = {
      openTabs: this.ensureTab(conversation),
      activeTabId: conversation.id,
    };
    this.persist();
    return cloneConversationSnapshot(conversation);
  }

  switchConversation(conversationId: string): DesktopAgentConversationSnapshot | undefined {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return undefined;
    this.activeConversationId = conversationId;
    this.tabState = {
      openTabs: this.ensureTab(conversation),
      activeTabId: conversationId,
    };
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
    this.persist();
  }

  clearAllConversations(): void {
    this.conversations.clear();
    this.promptModes.clear();
    this.messageQueueSnapshotVersions.clear();
    this.activeConversationId = undefined;
    this.tabState = { openTabs: [], activeTabId: null };
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
    this.persist();
  }

  private ensureTab(conversation: DesktopAgentConversationSnapshot): TabState['openTabs'] {
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

  private hydrate(snapshot: DesktopAgentConversationRuntimeStorageSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported Desktop Agent conversation snapshot version: ${snapshot.version}`);
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

interface DesktopAgentConversationRecord {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  nextMessageOrdinal: number;
}

function createDesktopAgentSettingsMessages(
  deps: DesktopAgentWebviewHostDeps,
  options: {
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
    if (settingsMessage) {
      messages.push(projectDesktopAgentSettingsDataMessage(settingsMessage));
    }
    if (options.includeConfigState) {
      messages.push(buildConfigStateMessage(configManager.getAssistantConfigState()));
    }
    return messages;
  } catch (error: unknown) {
    return createDesktopAgentConfigFailureMessages(error);
  }
}

function createDesktopAgentConfigStateMessage(
  deps: DesktopAgentWebviewHostDeps,
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

async function updateDesktopAgentSettings(
  settings: Record<string, unknown>,
  deps: DesktopAgentWebviewHostDeps,
): Promise<readonly ExtensionToWebviewMessage[]> {
  try {
    const configManager = deps.getConfigManager();
    const updateMessage = await runAssistantSettingsUpdateRuntime(settings, {
      updateSettingsFromWebview: (updates) =>
        configManager.applyRuntimeAssistantSettingsFromWebview(updates),
    });
    return [
      updateMessage,
      ...createDesktopAgentSettingsMessages(deps, {
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
      ...createDesktopAgentConfigFailureMessages(error),
    ];
  }
}

function projectDesktopAgentSettingsDataMessage(
  message: AssistantSettingsRuntimeDataMessage,
): SettingsDataMessage {
  const configuredProviderIds = new Set(
    message.configuredProviders.map((provider) => provider.id),
  );
  return {
    ...message,
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

function createDesktopUserMessage(
  conversation: DesktopAgentConversationRecord,
  message: SendMessageWebviewMessage,
  timestamp: number,
): Message {
  return {
    id: nextDesktopAgentMessageId(conversation),
    role: 'user',
    content: message.message,
    timestamp,
    ...(message.attachments && message.attachments.length > 0
      ? { attachments: [...message.attachments] }
      : {}),
    ...createDesktopUserMessageContext(message),
  };
}

function createDesktopUserMessageContext(
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
      type: mapDesktopAgentFileReferenceContextType(reference.mediaType),
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

function mapDesktopAgentFileReferenceContextType(
  mediaType: NonNullable<SendMessageWebviewMessage['fileReferences']>[number]['mediaType'],
): NonNullable<Message['contextReferences']>[number]['type'] {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'sequence') return 'media';
  if (mediaType === 'document' || mediaType === 'text') return 'document-selection';
  return 'file';
}

function createDesktopAgentTurnRuntimeDiagnosticMessage(
  conversation: DesktopAgentConversationRecord,
  message: SendMessageWebviewMessage,
  timestamp: number,
): Message {
  return {
    id: nextDesktopAgentMessageId(conversation),
    role: 'assistant',
    content:
      `Desktop Agent turn runtime is not connected for ${message.sessionMode} sessions yet. ` +
      'Your message was saved in the local Desktop conversation, but no provider was invoked.',
    timestamp,
    isError: true,
  };
}

const GENERATED_CONVERSATION_TITLE_PREFIX = 'Conversation ';
const CONVERSATION_TITLE_MAX_LENGTH = 50;

function resolveDesktopConversationTitle(currentTitle: string, message: string): string {
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

function nextDesktopAgentMessageId(conversation: DesktopAgentConversationRecord): string {
  const id = `${conversation.id}-message-${conversation.nextMessageOrdinal}`;
  conversation.nextMessageOrdinal += 1;
  return id;
}

function cloneConversationSnapshot(
  conversation: DesktopAgentConversationRecord,
): DesktopAgentConversationSnapshot {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) => ({ ...message })),
  };
}

function createConversationSnapshotMessages(
  conversation: DesktopAgentConversationSnapshot,
  deps: DesktopAgentWebviewHostDeps,
): readonly ExtensionToWebviewMessage[] {
  return [
    {
      type: 'conversationList',
      conversations: [...deps.getConversationRuntime().listConversations()],
    },
    createActiveConversationMessage(conversation),
    buildTabStateMessage(deps.getConversationRuntime().getTabState()),
  ];
}

function createConversationListAndActiveMessages(
  deps: DesktopAgentWebviewHostDeps,
): readonly ExtensionToWebviewMessage[] {
  return [
    {
      type: 'conversationList',
      conversations: [...deps.getConversationRuntime().listConversations()],
    },
    createActiveConversationMessage(deps.getConversationRuntime().getActiveConversation()),
    buildTabStateMessage(deps.getConversationRuntime().getTabState()),
  ];
}

function createActiveConversationMessage(
  conversation: DesktopAgentConversationSnapshot | undefined,
): ExtensionToWebviewMessage {
  return {
    type: 'activeConversation',
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

function createUnsupportedRouteMessage(
  messageType: AgentWebviewToHostMessageType,
): ExtensionToWebviewMessage {
  return buildGlobalErrorMessage(`Desktop Agent host route is unsupported: ${messageType}`);
}

async function createDesktopProjectFilesMessage(
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
    files: result.files.map(projectDesktopWorkspaceFileCandidate),
    mentionExtras: [],
  };
}

function projectDesktopWorkspaceFileCandidate(
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

async function runDesktopAgentHostCommand(
  messageType: AgentWebviewToHostMessageType,
  run: () => Promise<void>,
): Promise<readonly ExtensionToWebviewMessage[]> {
  try {
    await run();
    return [];
  } catch (error: unknown) {
    return [
      buildGlobalErrorMessage(
        `Desktop Agent host route '${messageType}' failed: ${describeUnknownError(error)}`,
      ),
    ];
  }
}

function createDesktopAgentRuntimePendingMessage(
  messageType: AgentWebviewToHostMessageType,
  detail: string,
): ExtensionToWebviewMessage {
  return buildGlobalErrorMessage(`Desktop Agent host route '${messageType}' is pending: ${detail}`);
}

function createDiagnosticResult(
  diagnostic: DesktopAgentRuntimeDiagnostic,
): DesktopAgentHostMessageResult {
  return {
    runtimeId: diagnostic.runtimeId,
    messages: [buildGlobalErrorMessage(diagnostic.message)],
    diagnostics: [diagnostic],
  };
}

function createDesktopAgentConfigFailureMessages(
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
    filePath: '<desktop-agent-config>',
    message: `Desktop Agent config load failed: ${describeUnknownError(error)}`,
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
