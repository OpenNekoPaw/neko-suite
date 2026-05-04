/**
 * Webview ↔ Extension protocol contracts.
 *
 * This file is the shared schema for values that cross the VS Code webview
 * boundary. Keep it dependency-light and validate data at the Extension edge.
 */

import type {
  AgentContextPayload,
  ChatModelOption,
  ConfiguredHook,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredToolGroup,
  MessageAttachment,
  ModelType,
  SkillSummary,
} from '@neko/shared';
import type {
  InstallProgress,
  InstallResult,
  InstalledPackage,
  MarketSearchResult,
  UpdateInfo,
} from '@neko/shared';
import type { AgentPhase } from './phase';
import type { Message } from './message';
import type { Plan } from './plan';
import type { ConfiguredProvider } from './provider';
import type {
  ConversationSummary,
  OpenTab,
  PromptMode,
  SessionMode,
  SettingsState,
  SsoSession,
  TabState,
} from './ui';
import type { PluginSlashCommandInvocation } from './plugin-slash-command';
import type {
  AgentWorkItem,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  TaskWorkItem,
} from './work-item';

export type ProtocolModelCategory = ModelType;
export type MediaModelCategory = Exclude<ProtocolModelCategory, 'llm'>;
export type AgentMediaModelCategory = Extract<MediaModelCategory, 'image' | 'video' | 'audio'>;

export interface ModelRef<Category extends ProtocolModelCategory = ProtocolModelCategory> {
  providerId: string;
  modelId: string;
  category: Category;
}

export type AgentMediaModelSelections = Partial<{
  image: ModelRef<'image'>;
  video: ModelRef<'video'>;
  audio: ModelRef<'audio'>;
}>;

export type RuntimeMediaModelSelections = Partial<Record<MediaModelCategory, ModelRef>>;

export interface SendMessageWebviewMessage {
  type: 'sendMessage';
  conversationId: string;
  message: string;
  sessionMode: SessionMode;
  chatModel?: ModelRef<'llm'>;
  mediaModel?: ModelRef<MediaModelCategory>;
  mediaModels?: AgentMediaModelSelections;
  attachments?: MessageAttachment[];
  contextPayloads?: AgentContextPayload[];
  promptId?: string;
  messageTrackingId?: string;
}

export interface SearchProjectFilesWebviewMessage {
  type: 'searchProjectFiles';
  filter: string;
  conversationId: string;
}

export interface ConfirmToolWebviewMessage {
  type: 'confirmTool';
  toolCallId: string;
  approved: boolean;
  conversationId: string;
}

export interface ConversationOnlyWebviewMessage {
  type:
    | 'switchConversation'
    | 'deleteConversation'
    | 'clearHistory'
    | 'cancelMessage'
    | 'stopAgent'
    | 'getTasks'
    | 'clearCompletedTasks'
    | 'getContextTokenCount'
    | 'compressContext'
    | 'clearActiveSkill'
    | 'togglePlanMode'
    | 'getPromptMode';
  conversationId: string;
}

export interface EmptyWebviewMessage {
  type:
    | 'newConversation'
    | 'clearAllConversations'
    | 'getConversations'
    | 'getActiveConversation'
    | 'getAgentStates'
    | 'getSettings'
    | 'getConfig'
    | 'getConfigWithStatus'
    | 'getSkills'
    | 'getHooks'
    | 'getConnectionStates'
    | 'getToolSkills'
    | 'openUserConfigFile'
    | 'ssoLogout'
    | 'addMCPServer'
    | 'openConfigFile'
    | 'getTabState'
    | 'openMarketplace'
    | 'market:listInstalled'
    | 'market:checkUpdates'
    | 'market:getFeatured';
}

export interface PlanActionWebviewMessage {
  type: 'planApprove' | 'planReject';
  planId: string;
  conversationId: string;
  filePath?: string;
}

export interface PlanStepActionWebviewMessage {
  type: 'planStepApprove' | 'planStepReject' | 'planStepModify';
  planId: string;
  stepId: string;
  conversationId: string;
  newDescription?: string;
}

export interface UpdateSettingsWebviewMessage {
  type: 'updateSettings';
  settings: Record<string, unknown>;
}

export interface UpdateTabStateWebviewMessage {
  type: 'updateTabState';
  openTabs: OpenTab[];
  activeTabId: string | null;
}

export interface WebviewProviderConfig {
  type: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{ id: string; enabled: boolean }>;
}

export interface AddModelWebviewMessage {
  type: 'addModel';
  model: WebviewProviderConfig;
}

export interface RemoveModelWebviewMessage {
  type: 'removeModel';
  modelType: string;
}

export interface ToggleProviderWebviewMessage {
  type: 'toggleProvider';
  providerType: string;
  enabled: boolean;
}

export interface ToggleModelWebviewMessage {
  type: 'toggleModel';
  providerType: string;
  modelId: string;
  enabled: boolean;
}

export interface TestMcpServerWebviewMessage {
  type: 'testMCPServer';
  server: {
    id: string;
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    requestId?: string;
  };
}

export interface TaskActionWebviewMessage {
  type: 'cancelTask' | 'retryTask' | 'removeTask' | 'viewTaskResult';
  taskId: string;
  conversationId: string;
}

export interface OpenFileWebviewMessage {
  type: 'openFile';
  filePath: string;
  options?: { preview?: boolean; line?: number; column?: number };
}

export interface FilePathWebviewMessage {
  type: 'revealFile';
  filePath: string;
}

export interface OpenPromptConfigWebviewMessage {
  type: 'openPromptConfig';
  source: 'personal' | 'project';
  promptId?: string;
}

export interface SourceFileWebviewMessage {
  type: 'openAgentsFile';
  source: 'personal' | 'project';
}

export interface OpenSettingsFileWebviewMessage {
  type: 'openSettingsFile';
  source: 'personal' | 'project' | 'local';
}

export interface OpenSkillFileWebviewMessage {
  type: 'openSkillFile';
  skillName: string;
  source: 'personal' | 'project';
  fileType: 'skill' | 'reference' | 'script';
  filePath?: string;
}

export interface OpenCommandFileWebviewMessage {
  type: 'openCommandFile';
  commandName: string;
  source: 'personal' | 'project';
}

export interface OpenUrlWebviewMessage {
  type: 'openUrl';
  url: string;
}

export interface SetPromptModeWebviewMessage {
  type: 'setPromptMode';
  mode: 'default' | 'plan';
  conversationId: string;
}

export interface SendToPluginWebviewMessage {
  type: 'sendToPlugin';
  target: string;
  assetPath: string;
  mediaType?: string;
}

export interface DragStartWebviewMessage {
  type: 'dnd:start';
  asset: { path: string; mediaType: 'image' | 'video' | 'audio'; name: string };
}

export interface MermaidErrorWebviewMessage {
  type: 'mermaidError';
  error: string;
  code: string;
  feedbackMessage: string;
  conversationId: string;
}

export interface DownloadSvgWebviewMessage {
  type: 'downloadSvg';
  svg: string;
  filename: string;
}

export interface ExecuteSkillWebviewMessage {
  type: 'executeSkill';
  skillId: string;
  conversationId: string;
  input?: Record<string, unknown>;
}

export interface CancelSkillWebviewMessage {
  type: 'cancelSkill';
  skillId: string;
  conversationId: string;
}

export interface InvokeSlashCommandWebviewMessage {
  type: 'invokeSlashCommand';
  command: string;
  args?: string;
  conversationId: string;
}

export interface InvokePluginSlashCommandWebviewMessage {
  type: 'invokePluginSlashCommand';
  extensionId: string;
  commandId: string;
  conversationId: string;
  args?: string;
}

export interface SsoLoginWebviewMessage {
  type: 'ssoLogin';
  force?: boolean;
}

export interface MarketSearchWebviewMessage {
  type: 'market:search';
  query: { text?: string; tags?: string[]; page?: number; types?: string[] };
}

export interface MarketInstallWebviewMessage {
  type: 'market:install';
  packageId: string;
  version: string;
}

export interface MarketUninstallWebviewMessage {
  type: 'market:uninstall';
  packageId: string;
}

export type WebviewToExtensionMessage =
  | SendMessageWebviewMessage
  | SearchProjectFilesWebviewMessage
  | ConfirmToolWebviewMessage
  | ConversationOnlyWebviewMessage
  | EmptyWebviewMessage
  | PlanActionWebviewMessage
  | PlanStepActionWebviewMessage
  | UpdateSettingsWebviewMessage
  | UpdateTabStateWebviewMessage
  | AddModelWebviewMessage
  | RemoveModelWebviewMessage
  | ToggleProviderWebviewMessage
  | ToggleModelWebviewMessage
  | TestMcpServerWebviewMessage
  | TaskActionWebviewMessage
  | OpenFileWebviewMessage
  | FilePathWebviewMessage
  | OpenPromptConfigWebviewMessage
  | SourceFileWebviewMessage
  | OpenSettingsFileWebviewMessage
  | OpenSkillFileWebviewMessage
  | OpenCommandFileWebviewMessage
  | OpenUrlWebviewMessage
  | SetPromptModeWebviewMessage
  | SendToPluginWebviewMessage
  | DragStartWebviewMessage
  | MermaidErrorWebviewMessage
  | DownloadSvgWebviewMessage
  | ExecuteSkillWebviewMessage
  | CancelSkillWebviewMessage
  | InvokeSlashCommandWebviewMessage
  | InvokePluginSlashCommandWebviewMessage
  | SsoLoginWebviewMessage
  | MarketSearchWebviewMessage
  | MarketInstallWebviewMessage
  | MarketUninstallWebviewMessage;

export interface ProjectFileMentionInfo {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
}

export type ProjectMentionExtraType = 'canvas-node' | 'character' | 'scene';

export interface ProjectMentionExtra {
  type: ProjectMentionExtraType;
  id: string;
  label: string;
  summary: string;
}

export interface ProjectFilesWebviewMessage {
  type: 'projectFiles';
  conversationId: string;
  files?: ProjectFileMentionInfo[];
  mentionExtras?: ProjectMentionExtra[];
}

export interface PluginsAvailable {
  canvas?: boolean;
  cut?: boolean;
  sketch?: boolean;
}

export interface ThinkingMessage {
  type: 'thinking';
  conversationId: string;
}

export interface StreamTextMessage {
  type: 'streamText';
  content?: string;
  conversationId: string;
  messageId?: string;
}

export interface StreamCompleteMessage {
  type: 'streamComplete';
  conversationId: string;
  messageId?: string;
}

export interface StreamThinkingMessage {
  type: 'streamThinking';
  content?: string;
  conversationId: string;
  messageId?: string;
}

export interface MessageCancelledMessage {
  type: 'messageCancelled';
  conversationId: string;
}

export interface MessageQueuedMessage {
  type: 'messageQueued';
  content?: string;
  conversationId: string;
}

export interface AgentStoppedMessage {
  type: 'agentStopped';
  conversationId: string;
}

export interface AgentPhaseMessage {
  type: 'agentPhase';
  phase: AgentPhase;
  toolName?: string;
  timestamp?: number;
  conversationId: string;
}

export interface AgentStateSnapshotMessage {
  type: 'agentStateSnapshot';
  agentStates: Array<{
    conversationId: string;
    phase?: AgentPhase;
    toolName?: string;
    startedAt?: number;
  }>;
}

export interface ErrorMessage {
  type: 'error';
  message?: string;
  conversationId: string;
}

export interface GlobalErrorMessage {
  type: 'globalError';
  message: string;
}

export interface HistoryClearedMessage {
  type: 'historyCleared';
  conversationId: string;
}

export interface ConversationListMessage {
  type: 'conversationList';
  conversations: ConversationSummary[];
}

export interface ActiveConversationMessage {
  type: 'activeConversation';
  conversation?: {
    id: string;
    title?: string;
    messages?: Message[];
  };
}

export interface SettingsDataMessage {
  type: 'settingsData';
  providers?: SettingsState['providers'];
  configuredProviders?: ConfiguredProvider[];
  selectedProviderId?: string | null;
  selectedModelId?: string | null;
  customSystemPrompt?: string;
  systemPrompt?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  executionMode?: SettingsState['executionMode'];
  chatModelOptions?: ChatModelOption[];
  defaultMediaModels?: Partial<Record<MediaModelCategory, string>>;
}

export type ProjectFilesMessage = ProjectFilesWebviewMessage;

export interface ConfigStateMessage {
  type: 'configState';
  config?: {
    providers?: ConfiguredProvider[];
    configuredProviders?: ConfiguredProvider[];
  };
}

export type ProtocolConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProtocolConnectionState {
  status: ProtocolConnectionStatus;
  error?: string;
}

export type ProtocolConnectionStateMap = Record<string, ProtocolConnectionState>;

export interface ConfigStateWithStatusMessage {
  type: 'configStateWithStatus';
  config?: {
    providers?: ConfiguredProvider[];
    configuredProviders?: ConfiguredProvider[];
    connectionStates?: ProtocolConnectionStateMap;
  };
}

export interface ConfigChangedMessage {
  type: 'configChanged';
}

export interface SettingsUpdatedMessage {
  type: 'settingsUpdated';
  success: boolean;
  error?: string;
}

export interface ProviderMutationResultMessage {
  type: 'modelAdded' | 'modelRemoved';
  success: boolean;
  modelType: string;
  error?: string;
}

export interface McpServerTestResultMessage {
  type: 'mcpServerTestResult';
  requestId: string;
  serverId?: string;
  success: boolean;
  error?: string;
}

export interface PluginCommandsMessage {
  type: 'pluginCommands';
  commands?: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }>;
}

export interface PluginsAvailableMessage {
  type: 'pluginsAvailable';
  plugins?: PluginsAvailable;
}

export interface ConnectionStatesMessage {
  type: 'connectionStates';
  states?: ProtocolConnectionStateMap;
}

export interface ConnectionStateChangedMessage {
  type: 'connectionStateChanged';
  id: string;
  serviceType: 'mcp';
  status: ProtocolConnectionStatus;
  error?: string;
}

export interface SsoSessionChangedMessage {
  type: 'ssoSessionChanged';
  session: SsoSession | null;
}

export interface SsoErrorMessage {
  type: 'ssoError';
  error: string;
}

export interface SkillsDataMessage {
  type: 'skillsData';
  skills?: ConfiguredSkill[];
  commands?: ConfiguredSlashCommand[];
}

export interface HooksDataMessage {
  type: 'hooksData';
  hooks?: ConfiguredHook[];
}

export interface ToolSkillsDataMessage {
  type: 'toolSkillsData';
  toolSkills?: ConfiguredToolGroup[];
}

export interface ToolSkillsChangedMessage {
  type: 'toolSkillsChanged';
  toolSkills?: ConfiguredToolGroup[];
}

export interface ToolCallMessage {
  type: 'toolCall';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'toolResult';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  success: boolean;
  data?: unknown;
  error?: string;
  plan?: Plan;
}

export interface ToolConfirmationMessage {
  type: 'toolConfirmation';
  conversationId: string;
  toolCallId: string;
  toolName?: string;
  action?: string;
  description?: string;
  details?: Record<string, unknown>;
}

export interface PlanStepStatusUpdateMessage {
  type: 'planStepStatusUpdate';
  planId: string;
  stepId: string;
  status: string;
  newDescription?: string;
  conversationId: string;
}

export interface PlanStatusUpdateMessage {
  type: 'planStatusUpdate';
  planId: string;
  status: string;
  conversationId: string;
}

export interface PromptModeChangedMessage {
  type: 'promptModeChanged';
  conversationId: string;
  mode: PromptMode;
  isPlanMode: boolean;
}

export interface TasksUpdatedMessage {
  type: 'tasksUpdated';
  conversationId: string;
  workItems: AgentWorkItem[];
}

export interface TaskCreatedMessage {
  type: 'taskCreated';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  workItem: AgentWorkItem;
}

export interface TaskUpdatedMessage {
  type: 'taskUpdated';
  conversationId: string;
  workItem: AgentWorkItem;
}

export interface TaskRemovedMessage {
  type: 'taskRemoved';
  conversationId: string;
  taskId: string;
}

export interface SubAgentEventMessage {
  type: 'subagentEvent';
  conversationId: string;
  event: SubAgentWorkItemEvent;
  workItem: SubAgentWorkItem;
}

export interface TabStateMessage {
  type: 'tabState';
  tabState?: Partial<TabState>;
}

export interface SlashCommandResultMessage {
  type: 'slashCommandResult';
  conversationId: string;
  command: string;
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface SkillsListMessage {
  type: 'skillsList';
  skills?: SkillSummary[];
}

export interface SkillInjectionMessage {
  type: 'skillInjection';
  skillName: string;
  allowedTools?: string[];
  conversationId: string;
}

export interface ContextTokenCountMessage {
  type: 'contextTokenCount';
  conversationId: string;
  tokenCount?: number;
}

export interface CompressionResultMessage {
  type: 'compressionResult';
  conversationId: string;
  compressedTokens?: number;
}

export interface CompressionErrorMessage {
  type: 'compressionError';
  conversationId: string;
  error?: string;
}

export interface MediaTaskCreatedMessage {
  type: 'mediaTaskCreated';
  conversationId: string;
  workItem: TaskWorkItem;
}

export interface MediaTaskProgressMessage {
  type: 'mediaTaskProgress';
  conversationId: string;
  workItem: TaskWorkItem;
}

export interface ExternalMessage {
  type: 'externalMessage';
  message?: string;
}

export interface PrefillInputMessage {
  type: 'prefillInput';
  message?: string;
}

export interface InjectContextMessage {
  type: 'injectContext';
  conversationId?: string | null;
  payload?: AgentContextPayload;
}

export interface AmbientCanvasUpdateMessage {
  type: 'ambientCanvasUpdate';
  conversationId?: string | null;
  nodes?: Array<{ nodeId: string; type: string; summary: string }>;
}

export type GenerationProgressStatus = 'pending' | 'generating' | 'done' | 'error';

export interface GenerationProgressPayload {
  nodeId: string;
  taskId: string;
  cellId?: string;
  status: GenerationProgressStatus;
  count?: number;
  total?: number;
  error?: string;
}

export interface GenerationProgressMessage {
  type: 'generationProgress';
  progress?: GenerationProgressPayload;
}

export interface MarketSearchResultMessage {
  type: 'market:searchResult';
  data?: MarketSearchResult;
}

export interface MarketInstallProgressMessage {
  type: 'market:installProgress';
  data?: InstallProgress;
}

export interface MarketInstallResultMessage {
  type: 'market:installResult';
  data?: InstallResult;
}

export interface MarketUninstallResultMessage {
  type: 'market:uninstallResult';
  data?: { packageId: string; success: boolean };
}

export interface MarketInstalledListMessage {
  type: 'market:installedList';
  data?: InstalledPackage[];
}

export interface MarketUpdatesMessage {
  type: 'market:updates';
  data?: UpdateInfo[];
}

export interface MarketFeaturedMessage {
  type: 'market:featured';
  data?: MarketSearchResult;
}

export interface MarketErrorMessage {
  type: 'market:error';
  error: string;
}

export type ExtensionToWebviewMessage =
  | ThinkingMessage
  | StreamTextMessage
  | StreamCompleteMessage
  | StreamThinkingMessage
  | MessageCancelledMessage
  | MessageQueuedMessage
  | AgentStoppedMessage
  | AgentPhaseMessage
  | AgentStateSnapshotMessage
  | ErrorMessage
  | GlobalErrorMessage
  | HistoryClearedMessage
  | ConversationListMessage
  | ActiveConversationMessage
  | SettingsDataMessage
  | ProjectFilesMessage
  | ConfigStateMessage
  | ConfigStateWithStatusMessage
  | ConfigChangedMessage
  | SettingsUpdatedMessage
  | ProviderMutationResultMessage
  | McpServerTestResultMessage
  | PluginCommandsMessage
  | PluginsAvailableMessage
  | ConnectionStatesMessage
  | ConnectionStateChangedMessage
  | SsoSessionChangedMessage
  | SsoErrorMessage
  | SkillsDataMessage
  | HooksDataMessage
  | ToolSkillsDataMessage
  | ToolSkillsChangedMessage
  | ToolCallMessage
  | ToolResultMessage
  | ToolConfirmationMessage
  | PlanStepStatusUpdateMessage
  | PlanStatusUpdateMessage
  | PromptModeChangedMessage
  | TasksUpdatedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskRemovedMessage
  | SubAgentEventMessage
  | TabStateMessage
  | SlashCommandResultMessage
  | SkillsListMessage
  | SkillInjectionMessage
  | ContextTokenCountMessage
  | CompressionResultMessage
  | CompressionErrorMessage
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | ExternalMessage
  | PrefillInputMessage
  | InjectContextMessage
  | AmbientCanvasUpdateMessage
  | GenerationProgressMessage
  | MarketSearchResultMessage
  | MarketInstallProgressMessage
  | MarketInstallResultMessage
  | MarketUninstallResultMessage
  | MarketInstalledListMessage
  | MarketUpdatesMessage
  | MarketFeaturedMessage
  | MarketErrorMessage;

export type MessageOfType<T extends ExtensionToWebviewMessage['type']> = Extract<
  ExtensionToWebviewMessage,
  { type: T }
>;

const SESSION_MODES: readonly SessionMode[] = ['agent', 'image', 'video', 'audio'];
const MODEL_CATEGORIES: readonly ProtocolModelCategory[] = [
  'llm',
  'image',
  'video',
  'audio',
  'music',
];
const AGENT_MEDIA_CATEGORIES: readonly AgentMediaModelCategory[] = ['image', 'video', 'audio'];
const CONVERSATION_ONLY_MESSAGE_TYPES: readonly ConversationOnlyWebviewMessage['type'][] = [
  'switchConversation',
  'deleteConversation',
  'clearHistory',
  'cancelMessage',
  'stopAgent',
  'getTasks',
  'clearCompletedTasks',
  'getContextTokenCount',
  'compressContext',
  'clearActiveSkill',
  'togglePlanMode',
  'getPromptMode',
];
const EMPTY_MESSAGE_TYPES: readonly EmptyWebviewMessage['type'][] = [
  'newConversation',
  'clearAllConversations',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'getSettings',
  'getConfig',
  'getConfigWithStatus',
  'getSkills',
  'getHooks',
  'getConnectionStates',
  'getToolSkills',
  'openUserConfigFile',
  'ssoLogout',
  'addMCPServer',
  'openConfigFile',
  'getTabState',
  'openMarketplace',
  'market:listInstalled',
  'market:checkUpdates',
  'market:getFeatured',
];
const PLAN_ACTION_MESSAGE_TYPES: readonly PlanActionWebviewMessage['type'][] = [
  'planApprove',
  'planReject',
];
const PLAN_STEP_ACTION_MESSAGE_TYPES: readonly PlanStepActionWebviewMessage['type'][] = [
  'planStepApprove',
  'planStepReject',
  'planStepModify',
];
const TASK_ACTION_MESSAGE_TYPES: readonly TaskActionWebviewMessage['type'][] = [
  'cancelTask',
  'retryTask',
  'removeTask',
  'viewTaskResult',
];
export const WEBVIEW_TO_EXTENSION_MESSAGE_TYPES = [
  'sendMessage',
  'searchProjectFiles',
  'confirmTool',
  ...CONVERSATION_ONLY_MESSAGE_TYPES,
  ...EMPTY_MESSAGE_TYPES,
  ...PLAN_ACTION_MESSAGE_TYPES,
  ...PLAN_STEP_ACTION_MESSAGE_TYPES,
  'updateSettings',
  'updateTabState',
  'addModel',
  'removeModel',
  'toggleProvider',
  'toggleModel',
  'testMCPServer',
  ...TASK_ACTION_MESSAGE_TYPES,
  'openFile',
  'revealFile',
  'openPromptConfig',
  'openAgentsFile',
  'openSettingsFile',
  'openSkillFile',
  'openCommandFile',
  'openUrl',
  'setPromptMode',
  'sendToPlugin',
  'dnd:start',
  'mermaidError',
  'downloadSvg',
  'executeSkill',
  'cancelSkill',
  'invokeSlashCommand',
  'invokePluginSlashCommand',
  'ssoLogin',
  'market:search',
  'market:install',
  'market:uninstall',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

const SOURCE_TYPES: ReadonlyArray<OpenPromptConfigWebviewMessage['source']> = [
  'personal',
  'project',
];
const SETTINGS_SOURCE_TYPES: ReadonlyArray<OpenSettingsFileWebviewMessage['source']> = [
  'personal',
  'project',
  'local',
];
const SKILL_FILE_TYPES: ReadonlyArray<OpenSkillFileWebviewMessage['fileType']> = [
  'skill',
  'reference',
  'script',
];
const PROMPT_MODES: readonly SetPromptModeWebviewMessage['mode'][] = ['default', 'plan'];
const DRAG_MEDIA_TYPES: ReadonlyArray<DragStartWebviewMessage['asset']['mediaType']> = [
  'image',
  'video',
  'audio',
];

export function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === 'string' && SESSION_MODES.includes(value as SessionMode);
}

export function projectGenerationProgressMessage(
  progress: GenerationProgressPayload,
): GenerationProgressMessage {
  return { type: 'generationProgress', progress };
}

export function buildGlobalErrorMessage(message: string): GlobalErrorMessage {
  return { type: 'globalError', message };
}

export function buildThinkingMessage(conversationId: string): ThinkingMessage {
  return { type: 'thinking', conversationId };
}

export function buildErrorMessage(input: {
  readonly conversationId: string;
  readonly message?: string;
}): ErrorMessage {
  return {
    type: 'error',
    conversationId: input.conversationId,
    ...(input.message !== undefined ? { message: input.message } : {}),
  };
}

export function buildHistoryClearedMessage(conversationId: string): HistoryClearedMessage {
  return { type: 'historyCleared', conversationId };
}

export function buildMessageCancelledMessage(conversationId: string): MessageCancelledMessage {
  return { type: 'messageCancelled', conversationId };
}

export function buildAgentStoppedMessage(conversationId: string): AgentStoppedMessage {
  return { type: 'agentStopped', conversationId };
}

export function buildAgentPhaseMessage(input: {
  readonly conversationId: string;
  readonly phase: AgentPhase;
  readonly toolName?: string;
  readonly timestamp?: number;
}): AgentPhaseMessage {
  return {
    type: 'agentPhase',
    conversationId: input.conversationId,
    phase: input.phase,
    ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
    ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
  };
}

export function buildAgentStateSnapshotMessage(
  agentStates: AgentStateSnapshotMessage['agentStates'],
): AgentStateSnapshotMessage {
  return {
    type: 'agentStateSnapshot',
    agentStates: agentStates.map((state) => ({ ...state })),
  };
}

export function buildToolConfirmationMessage(input: {
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly action?: string;
  readonly description?: string;
  readonly details?: Record<string, unknown>;
}): ToolConfirmationMessage {
  return {
    type: 'toolConfirmation',
    conversationId: input.conversationId,
    toolCallId: input.toolCallId,
    ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
    ...(input.action !== undefined ? { action: input.action } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };
}

export function buildAmbientCanvasUpdateMessage(input: {
  readonly nodes?: AmbientCanvasUpdateMessage['nodes'];
  readonly conversationId?: string | null;
}): AmbientCanvasUpdateMessage {
  return {
    type: 'ambientCanvasUpdate',
    ...(input.nodes !== undefined ? { nodes: input.nodes } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
  };
}

export function buildInjectContextMessage(
  payload: AgentContextPayload,
  input: { readonly conversationId?: string | null } = {},
): InjectContextMessage {
  return {
    type: 'injectContext',
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    payload,
  };
}

export function buildExternalInputMessage(input: {
  readonly message: string;
  readonly autoSend: boolean;
}): ExternalMessage | PrefillInputMessage {
  if (input.autoSend) {
    return { type: 'externalMessage', message: input.message };
  }
  return { type: 'prefillInput', message: input.message };
}

export function buildPluginCommandsMessage(
  commands: NonNullable<PluginCommandsMessage['commands']>,
): PluginCommandsMessage {
  return { type: 'pluginCommands', commands };
}

export function buildPluginsAvailableMessage(plugins: PluginsAvailable): PluginsAvailableMessage {
  return { type: 'pluginsAvailable', plugins };
}

export function buildConfigStateMessage(config: ConfigStateMessage['config']): ConfigStateMessage {
  return { type: 'configState', config };
}

export function buildConfigStateWithStatusMessage(
  config: ConfigStateWithStatusMessage['config'],
): ConfigStateWithStatusMessage {
  return { type: 'configStateWithStatus', config };
}

export function buildConfigChangedMessage(): ConfigChangedMessage {
  return { type: 'configChanged' };
}

export function buildSkillsDataMessage(input: {
  readonly skills: readonly ConfiguredSkill[];
  readonly commands: readonly ConfiguredSlashCommand[];
}): SkillsDataMessage {
  return {
    type: 'skillsData',
    skills: [...input.skills],
    commands: [...input.commands],
  };
}

export function buildHooksDataMessage(hooks: readonly ConfiguredHook[]): HooksDataMessage {
  return { type: 'hooksData', hooks: [...hooks] };
}

export function buildToolSkillsDataMessage(
  toolSkills: readonly ConfiguredToolGroup[],
): ToolSkillsDataMessage {
  return { type: 'toolSkillsData', toolSkills: [...toolSkills] };
}

export function buildTabStateMessage(tabState: TabState): TabStateMessage {
  return {
    type: 'tabState',
    tabState: {
      openTabs: tabState.openTabs.map((tab) => ({ ...tab })),
      activeTabId: tabState.activeTabId,
    },
  };
}

export function buildConnectionStatesMessage(
  states: ProtocolConnectionStateMap,
): ConnectionStatesMessage {
  return { type: 'connectionStates', states };
}

export function buildConnectionStateChangedMessage(input: {
  readonly id: string;
  readonly serviceType: ConnectionStateChangedMessage['serviceType'];
  readonly status: ProtocolConnectionStatus;
  readonly error?: string;
}): ConnectionStateChangedMessage {
  return {
    type: 'connectionStateChanged',
    id: input.id,
    serviceType: input.serviceType,
    status: input.status,
    ...(input.error !== undefined ? { error: input.error } : {}),
  };
}

export function buildTasksUpdatedMessage(input: {
  readonly conversationId: string;
  readonly workItems: readonly AgentWorkItem[];
}): TasksUpdatedMessage {
  return {
    type: 'tasksUpdated',
    conversationId: input.conversationId,
    workItems: [...input.workItems],
  };
}

export function buildTaskCreatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: AgentWorkItem;
  readonly messageId?: string;
  readonly toolCallId?: string;
}): TaskCreatedMessage {
  return {
    type: 'taskCreated',
    conversationId: input.conversationId,
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
    workItem: input.workItem,
  };
}

export function buildTaskUpdatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: AgentWorkItem;
}): TaskUpdatedMessage {
  return {
    type: 'taskUpdated',
    conversationId: input.conversationId,
    workItem: input.workItem,
  };
}

export function buildTaskRemovedMessage(input: {
  readonly conversationId: string;
  readonly taskId: string;
}): TaskRemovedMessage {
  return {
    type: 'taskRemoved',
    conversationId: input.conversationId,
    taskId: input.taskId,
  };
}

export function buildMediaTaskCreatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: TaskWorkItem;
}): MediaTaskCreatedMessage {
  return {
    type: 'mediaTaskCreated',
    conversationId: input.conversationId,
    workItem: input.workItem,
  };
}

export function buildMediaTaskProgressMessage(input: {
  readonly conversationId: string;
  readonly workItem: TaskWorkItem;
}): MediaTaskProgressMessage {
  return {
    type: 'mediaTaskProgress',
    conversationId: input.conversationId,
    workItem: input.workItem,
  };
}

export function buildSubAgentEventMessage(input: {
  readonly event: SubAgentWorkItemEvent;
  readonly workItem: SubAgentWorkItem;
}): SubAgentEventMessage {
  return {
    type: 'subagentEvent',
    conversationId: input.event.conversationId,
    event: input.event,
    workItem: input.workItem,
  };
}

export function parseWebviewToExtensionMessage(raw: unknown): WebviewToExtensionMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;

  const type = raw.type;
  if (type === 'sendMessage') {
    return parseSendMessageWebviewMessage(raw);
  }
  if (isEmptyMessageType(type)) {
    return { type };
  }
  if (isConversationOnlyMessageType(type)) {
    const conversationId = requiredString(raw.conversationId);
    return conversationId ? { type, conversationId } : null;
  }
  if (isPlanActionMessageType(type)) {
    return parsePlanActionMessage(type, raw);
  }
  if (isPlanStepActionMessageType(type)) {
    return parsePlanStepActionMessage(type, raw);
  }
  if (isTaskActionMessageType(type)) {
    return parseTaskActionMessage(type, raw);
  }

  switch (type) {
    case 'searchProjectFiles':
      return parseSearchProjectFilesMessage(raw);
    case 'confirmTool':
      return parseConfirmToolMessage(raw);
    case 'updateSettings':
      return parseUpdateSettingsMessage(raw);
    case 'updateTabState':
      return parseUpdateTabStateMessage(raw);
    case 'addModel':
      return parseAddModelMessage(raw);
    case 'removeModel':
      return parseRemoveModelMessage(raw);
    case 'toggleProvider':
      return parseToggleProviderMessage(raw);
    case 'toggleModel':
      return parseToggleModelMessage(raw);
    case 'testMCPServer':
      return parseTestMcpServerMessage(raw);
    case 'openFile':
      return parseOpenFileMessage(raw);
    case 'revealFile':
      return parseFilePathMessage('revealFile', raw);
    case 'openPromptConfig':
      return parseOpenPromptConfigMessage(raw);
    case 'openAgentsFile':
      return parseSourceFileMessage(raw);
    case 'openSettingsFile':
      return parseOpenSettingsFileMessage(raw);
    case 'openSkillFile':
      return parseOpenSkillFileMessage(raw);
    case 'openCommandFile':
      return parseOpenCommandFileMessage(raw);
    case 'openUrl':
      return parseOpenUrlMessage(raw);
    case 'setPromptMode':
      return parseSetPromptModeMessage(raw);
    case 'sendToPlugin':
      return parseSendToPluginMessage(raw);
    case 'dnd:start':
      return parseDragStartMessage(raw);
    case 'mermaidError':
      return parseMermaidErrorMessage(raw);
    case 'downloadSvg':
      return parseDownloadSvgMessage(raw);
    case 'executeSkill':
      return parseExecuteSkillMessage(raw);
    case 'cancelSkill':
      return parseCancelSkillMessage(raw);
    case 'invokeSlashCommand':
      return parseInvokeSlashCommandMessage(raw);
    case 'invokePluginSlashCommand':
      return parseInvokePluginSlashCommandMessage(raw);
    case 'ssoLogin':
      return parseSsoLoginMessage(raw);
    case 'market:search':
      return parseMarketSearchMessage(raw);
    case 'market:install':
      return parseMarketInstallMessage(raw);
    case 'market:uninstall':
      return parseMarketUninstallMessage(raw);
    default:
      return null;
  }
}

export function parseSendMessageWebviewMessage(raw: unknown): SendMessageWebviewMessage | null {
  if (!isRecord(raw) || raw.type !== 'sendMessage') return null;
  if (!isNonEmptyString(raw.conversationId)) return null;
  if (typeof raw.message !== 'string') return null;
  if (!isSessionMode(raw.sessionMode)) return null;
  if (
    raw.providerId !== undefined ||
    raw.modelId !== undefined ||
    raw.mediaProviderId !== undefined ||
    raw.mediaModelId !== undefined ||
    raw.agentMediaModels !== undefined
  ) {
    return null;
  }

  const chatModel = raw.chatModel === undefined ? undefined : parseModelRef(raw.chatModel, 'llm');
  if (raw.chatModel !== undefined && !chatModel) return null;

  const mediaModel = raw.mediaModel === undefined ? undefined : parseMediaModelRef(raw.mediaModel);
  if (raw.mediaModel !== undefined && !mediaModel) return null;

  const mediaModels =
    raw.mediaModels === undefined ? undefined : parseAgentMediaModelSelections(raw.mediaModels);
  if (raw.mediaModels !== undefined && !mediaModels) return null;

  const attachments =
    raw.attachments === undefined
      ? undefined
      : Array.isArray(raw.attachments)
        ? (raw.attachments as MessageAttachment[])
        : null;
  if (attachments === null) return null;

  const contextPayloads =
    raw.contextPayloads === undefined
      ? undefined
      : Array.isArray(raw.contextPayloads)
        ? parseAgentContextPayloads(raw.contextPayloads)
        : null;
  if (contextPayloads === null) return null;

  const promptId = optionalString(raw.promptId);
  if (raw.promptId !== undefined && promptId === undefined) return null;

  const messageTrackingId = optionalString(raw.messageTrackingId);
  if (raw.messageTrackingId !== undefined && messageTrackingId === undefined) return null;

  if (raw.sessionMode === 'agent') {
    if (mediaModel) return null;
  } else {
    if (!mediaModel || mediaModel.category !== raw.sessionMode) return null;
    if (mediaModels) return null;
  }

  return {
    type: 'sendMessage',
    conversationId: raw.conversationId,
    message: raw.message,
    sessionMode: raw.sessionMode,
    ...(chatModel ? { chatModel } : {}),
    ...(mediaModel ? { mediaModel } : {}),
    ...(mediaModels ? { mediaModels } : {}),
    ...(attachments ? { attachments } : {}),
    ...(contextPayloads ? { contextPayloads } : {}),
    ...(promptId ? { promptId } : {}),
    ...(messageTrackingId ? { messageTrackingId } : {}),
  };
}

function parseAgentContextPayloads(raw: readonly unknown[]): AgentContextPayload[] | null {
  const payloads: AgentContextPayload[] = [];

  for (const item of raw) {
    if (!isAgentContextPayload(item)) {
      return null;
    }
    payloads.push(item);
  }

  return payloads;
}

function isAgentContextPayload(raw: unknown): raw is AgentContextPayload {
  return (
    isRecord(raw) &&
    isAgentContextPayloadType(raw.type) &&
    isNonEmptyString(raw.id) &&
    isNonEmptyString(raw.label) &&
    typeof raw.summary === 'string' &&
    'data' in raw &&
    (raw.intent === undefined || typeof raw.intent === 'string') &&
    (raw.generationParams === undefined || isRecord(raw.generationParams))
  );
}

function isAgentContextPayloadType(type: unknown): type is AgentContextPayload['type'] {
  return (
    type === 'canvas-node' ||
    type === 'cut-clip' ||
    type === 'story-selection' ||
    type === 'character' ||
    type === 'scene' ||
    type === 'sketch-layer' ||
    type === 'model-scene' ||
    type === 'audio-clip' ||
    type === 'file' ||
    type === 'image' ||
    type === 'document-selection'
  );
}

function parseSearchProjectFilesMessage(
  raw: Record<string, unknown>,
): SearchProjectFilesWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  if (!conversationId || typeof raw.filter !== 'string') return null;
  return { type: 'searchProjectFiles', filter: raw.filter, conversationId };
}

function parseConfirmToolMessage(raw: Record<string, unknown>): ConfirmToolWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  const toolCallId = requiredString(raw.toolCallId);
  if (!conversationId || !toolCallId || typeof raw.approved !== 'boolean') return null;
  return { type: 'confirmTool', toolCallId, approved: raw.approved, conversationId };
}

function parsePlanActionMessage(
  type: PlanActionWebviewMessage['type'],
  raw: Record<string, unknown>,
): PlanActionWebviewMessage | null {
  const planId = requiredString(raw.planId);
  const conversationId = requiredString(raw.conversationId);
  const filePath = optionalStringStrict(raw.filePath);
  if (!planId || !conversationId || filePath === null) return null;
  return { type, planId, conversationId, ...(filePath !== undefined ? { filePath } : {}) };
}

function parsePlanStepActionMessage(
  type: PlanStepActionWebviewMessage['type'],
  raw: Record<string, unknown>,
): PlanStepActionWebviewMessage | null {
  const planId = requiredString(raw.planId);
  const stepId = requiredString(raw.stepId);
  const conversationId = requiredString(raw.conversationId);
  const newDescription = optionalStringStrict(raw.newDescription);
  if (!planId || !stepId || !conversationId || newDescription === null) return null;
  if (type === 'planStepModify' && newDescription === undefined) return null;

  return {
    type,
    planId,
    stepId,
    conversationId,
    ...(newDescription !== undefined ? { newDescription } : {}),
  };
}

function parseUpdateSettingsMessage(
  raw: Record<string, unknown>,
): UpdateSettingsWebviewMessage | null {
  if (!isRecord(raw.settings)) return null;
  return { type: 'updateSettings', settings: raw.settings };
}

function parseUpdateTabStateMessage(
  raw: Record<string, unknown>,
): UpdateTabStateWebviewMessage | null {
  const openTabs = parseOpenTabs(raw.openTabs);
  if (!openTabs) return null;
  if (raw.activeTabId === null) {
    return { type: 'updateTabState', openTabs, activeTabId: null };
  }
  if (typeof raw.activeTabId !== 'string') return null;
  return { type: 'updateTabState', openTabs, activeTabId: raw.activeTabId };
}

function parseAddModelMessage(raw: Record<string, unknown>): AddModelWebviewMessage | null {
  const model = parseWebviewProviderConfig(raw.model);
  return model ? { type: 'addModel', model } : null;
}

function parseRemoveModelMessage(raw: Record<string, unknown>): RemoveModelWebviewMessage | null {
  const modelType = requiredString(raw.modelType);
  return modelType ? { type: 'removeModel', modelType } : null;
}

function parseToggleProviderMessage(
  raw: Record<string, unknown>,
): ToggleProviderWebviewMessage | null {
  const providerType = requiredString(raw.providerType);
  if (!providerType || typeof raw.enabled !== 'boolean') return null;
  return { type: 'toggleProvider', providerType, enabled: raw.enabled };
}

function parseToggleModelMessage(raw: Record<string, unknown>): ToggleModelWebviewMessage | null {
  const providerType = requiredString(raw.providerType);
  const modelId = requiredString(raw.modelId);
  if (!providerType || !modelId || typeof raw.enabled !== 'boolean') return null;
  return { type: 'toggleModel', providerType, modelId, enabled: raw.enabled };
}

function parseTestMcpServerMessage(
  raw: Record<string, unknown>,
): TestMcpServerWebviewMessage | null {
  if (!isRecord(raw.server)) return null;
  const id = requiredString(raw.server.id);
  const name = requiredString(raw.server.name);
  const command = requiredString(raw.server.command);
  const args = raw.server.args === undefined ? undefined : parseStringArray(raw.server.args);
  const env = raw.server.env === undefined ? undefined : parseStringRecord(raw.server.env);
  const requestId = optionalStringStrict(raw.server.requestId);
  if (!id || !name || !command || args === null || env === null || requestId === null) return null;

  return {
    type: 'testMCPServer',
    server: {
      id,
      name,
      command,
      ...(args !== undefined ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    },
  };
}

function parseTaskActionMessage(
  type: TaskActionWebviewMessage['type'],
  raw: Record<string, unknown>,
): TaskActionWebviewMessage | null {
  const taskId = requiredString(raw.taskId);
  const conversationId = requiredString(raw.conversationId);
  return taskId && conversationId ? { type, taskId, conversationId } : null;
}

function parseOpenFileMessage(raw: Record<string, unknown>): OpenFileWebviewMessage | null {
  const filePath = requiredString(raw.filePath);
  const options = raw.options === undefined ? undefined : parseOpenFileOptions(raw.options);
  if (!filePath || options === null) return null;
  return { type: 'openFile', filePath, ...(options !== undefined ? { options } : {}) };
}

function parseFilePathMessage(
  type: FilePathWebviewMessage['type'],
  raw: Record<string, unknown>,
): FilePathWebviewMessage | null {
  const filePath = requiredString(raw.filePath);
  return filePath ? { type, filePath } : null;
}

function parseOpenPromptConfigMessage(
  raw: Record<string, unknown>,
): OpenPromptConfigWebviewMessage | null {
  if (!isSource(raw.source)) return null;
  const promptId = optionalStringStrict(raw.promptId);
  if (promptId === null) return null;
  return {
    type: 'openPromptConfig',
    source: raw.source,
    ...(promptId !== undefined ? { promptId } : {}),
  };
}

function parseSourceFileMessage(raw: Record<string, unknown>): SourceFileWebviewMessage | null {
  if (!isSource(raw.source)) return null;
  return { type: 'openAgentsFile', source: raw.source };
}

function parseOpenSettingsFileMessage(
  raw: Record<string, unknown>,
): OpenSettingsFileWebviewMessage | null {
  if (!isSettingsSource(raw.source)) return null;
  return { type: 'openSettingsFile', source: raw.source };
}

function parseOpenSkillFileMessage(
  raw: Record<string, unknown>,
): OpenSkillFileWebviewMessage | null {
  const skillName = requiredString(raw.skillName);
  const filePath = optionalStringStrict(raw.filePath);
  if (!skillName || !isSource(raw.source) || !isSkillFileType(raw.fileType) || filePath === null) {
    return null;
  }
  return {
    type: 'openSkillFile',
    skillName,
    source: raw.source,
    fileType: raw.fileType,
    ...(filePath !== undefined ? { filePath } : {}),
  };
}

function parseOpenCommandFileMessage(
  raw: Record<string, unknown>,
): OpenCommandFileWebviewMessage | null {
  const commandName = requiredString(raw.commandName);
  if (!commandName || !isSource(raw.source)) return null;
  return { type: 'openCommandFile', commandName, source: raw.source };
}

function parseOpenUrlMessage(raw: Record<string, unknown>): OpenUrlWebviewMessage | null {
  const url = requiredString(raw.url);
  return url ? { type: 'openUrl', url } : null;
}

function parseSetPromptModeMessage(
  raw: Record<string, unknown>,
): SetPromptModeWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  if (!isPromptMode(raw.mode)) return null;
  return conversationId ? { type: 'setPromptMode', mode: raw.mode, conversationId } : null;
}

function parseSendToPluginMessage(raw: Record<string, unknown>): SendToPluginWebviewMessage | null {
  const target = requiredString(raw.target);
  const assetPath = requiredString(raw.assetPath);
  const mediaType = optionalStringStrict(raw.mediaType);
  if (!target || !assetPath || mediaType === null) return null;
  return {
    type: 'sendToPlugin',
    target,
    assetPath,
    ...(mediaType !== undefined ? { mediaType } : {}),
  };
}

function parseDragStartMessage(raw: Record<string, unknown>): DragStartWebviewMessage | null {
  if (!isRecord(raw.asset)) return null;
  const path = requiredString(raw.asset.path);
  const name = requiredString(raw.asset.name);
  if (!path || !name || !isDragMediaType(raw.asset.mediaType)) return null;
  return { type: 'dnd:start', asset: { path, mediaType: raw.asset.mediaType, name } };
}

function parseMermaidErrorMessage(raw: Record<string, unknown>): MermaidErrorWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  const feedbackMessage = requiredString(raw.feedbackMessage);
  if (
    !conversationId ||
    !feedbackMessage ||
    typeof raw.error !== 'string' ||
    typeof raw.code !== 'string'
  ) {
    return null;
  }
  return {
    type: 'mermaidError',
    error: raw.error,
    code: raw.code,
    feedbackMessage,
    conversationId,
  };
}

function parseDownloadSvgMessage(raw: Record<string, unknown>): DownloadSvgWebviewMessage | null {
  const filename = requiredString(raw.filename);
  if (!filename || typeof raw.svg !== 'string') return null;
  return { type: 'downloadSvg', svg: raw.svg, filename };
}

function parseExecuteSkillMessage(raw: Record<string, unknown>): ExecuteSkillWebviewMessage | null {
  const skillId = requiredString(raw.skillId);
  const conversationId = requiredString(raw.conversationId);
  const input = raw.input === undefined ? undefined : isRecord(raw.input) ? raw.input : null;
  if (!skillId || !conversationId || input === null) return null;
  return {
    type: 'executeSkill',
    skillId,
    conversationId,
    ...(input !== undefined ? { input } : {}),
  };
}

function parseCancelSkillMessage(raw: Record<string, unknown>): CancelSkillWebviewMessage | null {
  const skillId = requiredString(raw.skillId);
  const conversationId = requiredString(raw.conversationId);
  return skillId && conversationId ? { type: 'cancelSkill', skillId, conversationId } : null;
}

function parseInvokeSlashCommandMessage(
  raw: Record<string, unknown>,
): InvokeSlashCommandWebviewMessage | null {
  const command = requiredString(raw.command);
  const conversationId = requiredString(raw.conversationId);
  const args = optionalStringStrict(raw.args);
  if (!command || !conversationId || args === null) return null;
  return {
    type: 'invokeSlashCommand',
    command,
    conversationId,
    ...(args !== undefined ? { args } : {}),
  };
}

function parseInvokePluginSlashCommandMessage(
  raw: Record<string, unknown>,
): InvokePluginSlashCommandWebviewMessage | null {
  const extensionId = requiredString(raw.extensionId);
  const commandId = requiredString(raw.commandId);
  const conversationId = requiredString(raw.conversationId);
  const args = optionalStringStrict(raw.args);
  if (!extensionId || !commandId || !conversationId || args === null) return null;
  return {
    type: 'invokePluginSlashCommand',
    extensionId,
    commandId,
    conversationId,
    ...(args !== undefined ? { args } : {}),
  };
}

export function buildPluginSlashCommandInvocation(
  message: InvokePluginSlashCommandWebviewMessage,
): PluginSlashCommandInvocation {
  return {
    extensionId: message.extensionId,
    commandId: message.commandId,
    conversationId: message.conversationId,
    ...(message.args !== undefined ? { args: message.args } : {}),
  };
}

function parseSsoLoginMessage(raw: Record<string, unknown>): SsoLoginWebviewMessage | null {
  const force = raw.force;
  if (force === undefined) return { type: 'ssoLogin' };
  if (typeof force !== 'boolean') return null;
  return { type: 'ssoLogin', force };
}

function parseMarketSearchMessage(raw: Record<string, unknown>): MarketSearchWebviewMessage | null {
  const query = parseMarketSearchQuery(raw.query);
  return query ? { type: 'market:search', query } : null;
}

function parseMarketInstallMessage(
  raw: Record<string, unknown>,
): MarketInstallWebviewMessage | null {
  const packageId = requiredString(raw.packageId);
  const version = requiredString(raw.version);
  return packageId && version ? { type: 'market:install', packageId, version } : null;
}

function parseMarketUninstallMessage(
  raw: Record<string, unknown>,
): MarketUninstallWebviewMessage | null {
  const packageId = requiredString(raw.packageId);
  return packageId ? { type: 'market:uninstall', packageId } : null;
}

function parseAgentMediaModelSelections(value: unknown): AgentMediaModelSelections | null {
  if (!isRecord(value)) return null;

  const selections: AgentMediaModelSelections = {};
  for (const category of AGENT_MEDIA_CATEGORIES) {
    if (value[category] === undefined) continue;
    const model = parseModelRef(value[category], category);
    if (!model) return null;
    if (category === 'image') selections.image = model as ModelRef<'image'>;
    if (category === 'video') selections.video = model as ModelRef<'video'>;
    if (category === 'audio') selections.audio = model as ModelRef<'audio'>;
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

function parseModelRef<Category extends ProtocolModelCategory>(
  value: unknown,
  expectedCategory: Category | undefined,
): ModelRef<Category> | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.providerId) || !isNonEmptyString(value.modelId)) return null;
  if (!isModelCategory(value.category)) return null;
  if (expectedCategory && value.category !== expectedCategory) return null;

  return {
    providerId: value.providerId,
    modelId: value.modelId,
    category: value.category as Category,
  };
}

function parseMediaModelRef(value: unknown): ModelRef<MediaModelCategory> | null {
  const model = parseModelRef(value, undefined);
  if (!model || model.category === 'llm') return null;
  return model as ModelRef<MediaModelCategory>;
}

function parseOpenTabs(value: unknown): OpenTab[] | null {
  if (!Array.isArray(value)) return null;

  const tabs: OpenTab[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = requiredString(item.id);
    const title = typeof item.title === 'string' ? item.title : null;
    const conversationId = requiredString(item.conversationId);
    if (!id || title === null || !conversationId) return null;
    tabs.push({ id, title, conversationId });
  }
  return tabs;
}

function parseWebviewProviderConfig(value: unknown): WebviewProviderConfig | null {
  if (!isRecord(value)) return null;
  const type = requiredString(value.type);
  const name = optionalStringStrict(value.name);
  const apiKey = optionalStringStrict(value.apiKey);
  const baseUrl = optionalStringStrict(value.baseUrl);
  const models = value.models === undefined ? undefined : parseProviderModels(value.models);
  if (!type || name === null || apiKey === null || baseUrl === null || models === null) {
    return null;
  }
  return {
    type,
    ...(name !== undefined ? { name } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(models !== undefined ? { models } : {}),
  };
}

function parseProviderModels(value: unknown): WebviewProviderConfig['models'] | null {
  if (!Array.isArray(value)) return null;

  const models: Array<{ id: string; enabled: boolean }> = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = requiredString(item.id);
    if (!id || typeof item.enabled !== 'boolean') return null;
    models.push({ id, enabled: item.enabled });
  }
  return models;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    values.push(item);
  }
  return values;
}

function parseStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return null;
    result[key] = entry;
  }
  return result;
}

function parseOpenFileOptions(value: unknown): OpenFileWebviewMessage['options'] | null {
  if (!isRecord(value)) return null;
  const options: NonNullable<OpenFileWebviewMessage['options']> = {};
  if (value.preview !== undefined) {
    if (typeof value.preview !== 'boolean') return null;
    options.preview = value.preview;
  }
  if (value.line !== undefined) {
    if (!isFiniteNumber(value.line)) return null;
    options.line = value.line;
  }
  if (value.column !== undefined) {
    if (!isFiniteNumber(value.column)) return null;
    options.column = value.column;
  }
  return options;
}

function parseMarketSearchQuery(value: unknown): MarketSearchWebviewMessage['query'] | null {
  if (!isRecord(value)) return null;

  const text = optionalStringStrict(value.text);
  const tags = value.tags === undefined ? undefined : parseStringArray(value.tags);
  const types = value.types === undefined ? undefined : parseStringArray(value.types);
  const page = value.page;
  if (
    text === null ||
    tags === null ||
    types === null ||
    (page !== undefined && !isFiniteNumber(page))
  ) {
    return null;
  }

  return {
    ...(text !== undefined ? { text } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(isFiniteNumber(page) ? { page } : {}),
    ...(types !== undefined ? { types } : {}),
  };
}

function isConversationOnlyMessageType(
  value: string,
): value is ConversationOnlyWebviewMessage['type'] {
  return includesString(CONVERSATION_ONLY_MESSAGE_TYPES, value);
}

function isEmptyMessageType(value: string): value is EmptyWebviewMessage['type'] {
  return includesString(EMPTY_MESSAGE_TYPES, value);
}

function isPlanActionMessageType(value: string): value is PlanActionWebviewMessage['type'] {
  return includesString(PLAN_ACTION_MESSAGE_TYPES, value);
}

function isPlanStepActionMessageType(value: string): value is PlanStepActionWebviewMessage['type'] {
  return includesString(PLAN_STEP_ACTION_MESSAGE_TYPES, value);
}

function isTaskActionMessageType(value: string): value is TaskActionWebviewMessage['type'] {
  return includesString(TASK_ACTION_MESSAGE_TYPES, value);
}

function isSource(value: unknown): value is OpenPromptConfigWebviewMessage['source'] {
  return typeof value === 'string' && includesString(SOURCE_TYPES, value);
}

function isSettingsSource(value: unknown): value is OpenSettingsFileWebviewMessage['source'] {
  return typeof value === 'string' && includesString(SETTINGS_SOURCE_TYPES, value);
}

function isSkillFileType(value: unknown): value is OpenSkillFileWebviewMessage['fileType'] {
  return typeof value === 'string' && includesString(SKILL_FILE_TYPES, value);
}

function isPromptMode(value: unknown): value is SetPromptModeWebviewMessage['mode'] {
  return typeof value === 'string' && includesString(PROMPT_MODES, value);
}

function isDragMediaType(value: unknown): value is DragStartWebviewMessage['asset']['mediaType'] {
  return typeof value === 'string' && includesString(DRAG_MEDIA_TYPES, value);
}

function isModelCategory(value: unknown): value is ProtocolModelCategory {
  return typeof value === 'string' && MODEL_CATEGORIES.includes(value as ProtocolModelCategory);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredString(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

function optionalStringStrict(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesString<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}
