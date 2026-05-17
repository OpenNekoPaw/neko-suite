import type { AgentContextPayload, ChatModelOption, ModelCapability } from '@neko/shared';
import type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  ChatWorkspaceModelStateInput,
  ChatWorkspaceModelStateProjection,
  ConfigStateMessage,
  MediaModelCategory,
  MediaModelDefaults,
  MediaModelSelectionDefaultsProjection,
  MediaModelSelectionState,
  MessageModelProjection,
  MessageModelProjectionInput,
  ModelRef,
  PluginCommandsMessage,
  PluginSlashCommandProjection,
  PluginsAvailable,
  PluginsAvailableMessage,
  ProjectFileMentionInfo,
  ProjectFilesMessage,
  ProjectFilesProjection,
  ProjectMentionExtra,
  ProviderMutationResultMessage,
  SessionModeMediaSelectionProjection,
  SettingsDataMessage,
  SettingsDataProjection,
  SettingsState,
  SettingsUpdatedMessage,
  SsoErrorMessage,
  SsoErrorProjection,
  SsoSessionChangedMessage,
  SsoSessionProjection,
} from '@neko-agent/types';

const MODEL_CAPABILITIES: ReadonlySet<ModelCapability> = new Set([
  'chat',
  'completion',
  'vision',
  'function_calling',
  'json_mode',
  'streaming',
  'embedding',
  'code',
  'audio',
  'reasoning',
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'image_to_video',
  'video_to_video',
  'text_to_audio',
  'text_to_music',
  'workflow',
  'image_edit',
  'video_edit',
  'controlnet',
  'ip_adapter',
  'image_generation',
  'video_generation',
]);

export function projectSettingsDataMessage(message: SettingsDataMessage): SettingsDataProjection {
  const source = asRecord(message) ?? {};
  const selectedProviderId = readString(source, 'selectedProviderId') ?? null;
  const selectedModelId = readString(source, 'selectedModelId') ?? null;

  return {
    settingsPatch: {
      providers: readProviderViews(source.providers),
      selectedProviderId,
      selectedModelId,
      systemPrompt: readString(source, 'systemPrompt') ?? '',
      autoExecuteTools: readBoolean(source, 'autoExecuteTools') ?? true,
      streamResponses: readBoolean(source, 'streamResponses') ?? true,
      showToolCalls: readBoolean(source, 'showToolCalls') ?? true,
      temperature: readNumber(source, 'temperature') ?? 0.7,
      maxTokens: readNumber(source, 'maxTokens') ?? 4096,
      executionMode: readShellExecutionMode(source.executionMode) ?? 'ask',
      chatModelOptions: readChatModelOptions(source.chatModelOptions),
    },
    selectedModel:
      selectedProviderId && selectedModelId ? `${selectedProviderId}:${selectedModelId}` : null,
    defaultMediaModels: readMediaModelDefaults(source.defaultMediaModels),
  };
}

export function projectMediaModelSelectionDefaults(input: {
  selection: Readonly<MediaModelSelectionState>;
  defaults: MediaModelDefaults;
}): MediaModelSelectionDefaultsProjection {
  let updated = false;
  const selection: MediaModelSelectionState = {
    image: input.selection.image,
    video: input.selection.video,
    audio: input.selection.audio,
  };

  for (const category of ['image', 'video', 'audio'] as const) {
    const defaultModel = input.defaults[category];
    if (selection[category] === 'none' && defaultModel) {
      selection[category] = defaultModel;
      updated = true;
    }
  }

  return { selection, updated };
}

export function projectMessageModelSelection(
  input: MessageModelProjectionInput,
): MessageModelProjection {
  const chatModel = parseSelectedChatModel(input.selectedModel);
  const mediaModel = projectDirectMediaModel({
    sessionMode: input.sessionMode,
    providerId: input.mediaProviderId,
    modelId: input.mediaModelId,
  });

  return {
    ...(chatModel ? { chatModel } : {}),
    ...(mediaModel ? { mediaModel } : {}),
    ...(input.agentMediaModels ? { mediaModels: input.agentMediaModels } : {}),
  };
}

export function projectChatWorkspaceModelState(
  input: ChatWorkspaceModelStateInput,
): ChatWorkspaceModelStateProjection {
  const allModels = normalizeChatModelOptions(input.chatModelOptions);
  const availableModels = allModels.filter(isChatSelectableModel);
  const availableMediaModels = allModels.filter(isAgentMediaChatModelOption);
  let activeMediaModel: ChatModelOption | undefined;
  let agentMediaModels: AgentMediaModelSelections | undefined;

  if (input.sessionMode === 'agent') {
    agentMediaModels = projectAgentMediaModelSelections(
      input.mediaModelSelection,
      availableMediaModels,
    );
  } else {
    const sessionMode = input.sessionMode;
    activeMediaModel = availableMediaModels.find(
      (model) => model.id === input.mediaModelSelection[sessionMode],
    );
  }

  return {
    allModels,
    availableModels,
    availableMediaModels,
    ...(activeMediaModel ? { activeMediaModel } : {}),
    ...(agentMediaModels ? { agentMediaModels } : {}),
  };
}

export function projectMediaModelSelectionForSessionModeChange(input: {
  sessionMode: MessageModelProjectionInput['sessionMode'];
  mediaModelSelection: Readonly<MediaModelSelectionState>;
  chatModelOptions: readonly ChatModelOption[];
}): SessionModeMediaSelectionProjection {
  const mediaModelSelection: MediaModelSelectionState = {
    image: input.mediaModelSelection.image,
    video: input.mediaModelSelection.video,
    audio: input.mediaModelSelection.audio,
  };

  if (input.sessionMode === 'agent') {
    return {
      sessionMode: input.sessionMode,
      mediaModelSelection,
      updated: false,
    };
  }

  const allModels = normalizeChatModelOptions(input.chatModelOptions);
  const firstModel = allModels.find((model) => model.category === input.sessionMode);
  if (!firstModel || mediaModelSelection[input.sessionMode] === firstModel.id) {
    return {
      sessionMode: input.sessionMode,
      mediaModelSelection,
      updated: false,
    };
  }

  mediaModelSelection[input.sessionMode] = firstModel.id;
  return {
    sessionMode: input.sessionMode,
    mediaModelSelection,
    updated: true,
  };
}

export function projectProjectFilesMessage(message: ProjectFilesMessage): ProjectFilesProjection {
  const projectFiles = (message.files ?? []).filter(isProjectFileMentionInfo);
  const fileMentions = projectFiles.map((file) => ({
    id: `file:${file.path}`,
    kind: 'file' as const,
    label: file.name,
    description: file.path,
    filePath: file.path,
    ...(file.icon ? { icon: file.icon } : {}),
    ...(file.source ? { source: file.source } : {}),
    ...(file.mediaType ? { mediaType: file.mediaType } : {}),
  }));

  const extraMentions = (message.mentionExtras ?? [])
    .filter(isProjectMentionExtra)
    .map((extra) => ({
      id: `${extra.type}:${extra.id}`,
      kind: extra.type,
      label: extra.label,
      description: describeMentionExtra(extra),
      contextPayload: toAgentContextPayload(extra),
      ...(extra.icon ? { icon: extra.icon } : {}),
      ...(extra.source ? { source: extra.source } : {}),
      ...(extra.filePath ? { filePath: extra.filePath } : {}),
      ...(extra.mediaType ? { mediaType: extra.mediaType } : {}),
      ...(extra.entityType ? { entityType: extra.entityType } : {}),
      ...(extra.navigationData ? { navigationData: extra.navigationData } : {}),
      ...(extra.thumbnailUri ? { thumbnailUri: extra.thumbnailUri } : {}),
    }));

  return {
    projectFiles,
    mentionItems: [...fileMentions, ...extraMentions],
  };
}

export function projectConfigStateMessage(
  message: ConfigStateMessage,
): Partial<SettingsState> | null {
  if (!message.config) return null;
  return {
    configuredProviders: message.config.configuredProviders ?? [],
  };
}

export function projectPluginCommandsMessage(
  message: PluginCommandsMessage,
): PluginSlashCommandProjection[] {
  return (message.commands ?? []).filter(isPluginSlashCommandProjection);
}

export function projectPluginsAvailableMessage(message: PluginsAvailableMessage): PluginsAvailable {
  return message.plugins ?? {};
}

export function projectSsoSessionChangedMessage(
  message: SsoSessionChangedMessage,
): SsoSessionProjection {
  return {
    settingsPatch: { ssoSession: message.session },
    showOnboarding: message.session ? false : undefined,
  };
}

export function projectSsoErrorMessage(message: SsoErrorMessage): SsoErrorProjection {
  return {
    globalError: message.error,
    showOnboarding: true,
  };
}

export function projectSettingsMutationError(
  message: SettingsUpdatedMessage | ProviderMutationResultMessage,
): string | null {
  return message.success === false ? message.error || 'Settings update failed.' : null;
}

function readProviderViews(value: unknown): SettingsState['providers'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProviderView);
}

function readChatModelOptions(value: unknown): ChatModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isChatModelOption);
}

function readMediaModelDefaults(value: unknown): MediaModelDefaults {
  const record = asRecord(value);
  if (!record) return {};

  const defaults: MediaModelDefaults = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const model = readString(record, category);
    if (model) defaults[category] = model;
  }
  return defaults;
}

function parseSelectedChatModel(selectedModel: string): ModelRef<'llm'> | undefined {
  if (selectedModel === 'auto' || !selectedModel.includes(':')) return undefined;

  const parts = selectedModel.split(':');
  const providerId = parts[0];
  const modelId = parts.slice(1).join(':');
  if (!providerId || !modelId) return undefined;
  return { providerId, modelId, category: 'llm' };
}

function normalizeChatModelOptions(
  chatModelOptions: readonly ChatModelOption[],
): ChatModelOption[] {
  if (chatModelOptions.length > 0) return [...chatModelOptions];
  return [{ id: 'auto', label: 'Auto', providerId: '', modelId: '' }];
}

function isAgentMediaCategory(category: unknown): category is AgentMediaModelCategory {
  return category === 'image' || category === 'video' || category === 'audio';
}

function isChatSelectableModel(model: ChatModelOption): boolean {
  return model.id === 'auto' || !isAgentMediaCategory(model.category);
}

function isAgentMediaChatModelOption(model: ChatModelOption): model is ChatModelOption & {
  category: AgentMediaModelCategory;
} {
  return isAgentMediaCategory(model.category);
}

function projectAgentMediaModelSelections(
  mediaModelSelection: Readonly<MediaModelSelectionState>,
  availableMediaModels: readonly (ChatModelOption & { category: AgentMediaModelCategory })[],
): AgentMediaModelSelections | undefined {
  const result: AgentMediaModelSelections = {};

  const image = resolveAgentMediaModel('image', mediaModelSelection, availableMediaModels);
  if (image) result.image = image;
  const video = resolveAgentMediaModel('video', mediaModelSelection, availableMediaModels);
  if (video) result.video = video;
  const audio = resolveAgentMediaModel('audio', mediaModelSelection, availableMediaModels);
  if (audio) result.audio = audio;

  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveAgentMediaModel<Category extends AgentMediaModelCategory>(
  category: Category,
  mediaModelSelection: Readonly<MediaModelSelectionState>,
  availableMediaModels: readonly (ChatModelOption & { category: AgentMediaModelCategory })[],
): ModelRef<Category> | undefined {
  const selectedId = mediaModelSelection[category];
  if (!selectedId || selectedId === 'none') return undefined;

  const model = availableMediaModels.find((candidate) => candidate.id === selectedId);
  if (!model?.providerId || !model.modelId || model.category !== category) return undefined;

  return {
    providerId: model.providerId,
    modelId: model.modelId,
    category,
  };
}

function projectDirectMediaModel(input: {
  sessionMode: MessageModelProjectionInput['sessionMode'];
  providerId?: string;
  modelId?: string;
}): ModelRef<MediaModelCategory> | undefined {
  if (
    input.sessionMode === 'agent' ||
    !input.providerId ||
    !input.modelId ||
    input.modelId === 'none'
  ) {
    return undefined;
  }

  return {
    providerId: input.providerId,
    modelId: input.modelId,
    category: input.sessionMode,
  };
}

function readShellExecutionMode(value: unknown): SettingsState['executionMode'] | undefined {
  if (value === 'plan' || value === 'ask' || value === 'auto') return value;
  return undefined;
}

function toAgentContextPayload(extra: ProjectMentionExtra): AgentContextPayload {
  return {
    type: extra.type,
    id: extra.id,
    label: extra.label,
    summary: extra.summary,
    data: {
      type: extra.type,
      id: extra.id,
      label: extra.label,
      summary: extra.summary,
      ...(extra.source ? { source: extra.source } : {}),
      ...(extra.filePath ? { filePath: extra.filePath } : {}),
      ...(extra.mediaType ? { mediaType: extra.mediaType } : {}),
      ...(extra.entityType ? { entityType: extra.entityType } : {}),
      ...(extra.navigationData ? { navigationData: extra.navigationData } : {}),
      ...(extra.thumbnailUri ? { thumbnailUri: extra.thumbnailUri } : {}),
    },
  };
}

function describeMentionExtra(extra: ProjectMentionExtra): string {
  if (extra.type === 'canvas-node') return 'Canvas node';
  if (extra.type === 'character') return 'Character';
  if (extra.type === 'scene') return 'Scene';
  if (extra.type === 'asset') return extra.entityType ? `Asset · ${extra.entityType}` : 'Asset';
  if (extra.type === 'media') {
    return extra.mediaType ? `Media · ${extra.mediaType}` : 'Media';
  }
  if (extra.type === 'entity') {
    return extra.entityType ? `Entity · ${extra.entityType}` : 'Entity';
  }
  return extra.type;
}

function isProviderView(value: unknown): value is SettingsState['providers'][number] {
  const record = asRecord(value);
  if (!record) return false;
  if (!readString(record, 'id') || !readString(record, 'name')) return false;
  if (typeof record.isConfigured !== 'boolean') return false;
  if (!Array.isArray(record.models)) return false;
  return record.models.every(isProviderModelView);
}

function isProviderModelView(
  value: unknown,
): value is SettingsState['providers'][number]['models'][number] {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'id') &&
    readString(record, 'name') &&
    readString(record, 'description') !== undefined,
  );
}

function isChatModelOption(value: unknown): value is ChatModelOption {
  const record = asRecord(value);
  if (!record) return false;
  if (
    !readString(record, 'id') ||
    !readString(record, 'label') ||
    readString(record, 'providerId') === undefined ||
    readString(record, 'modelId') === undefined
  ) {
    return false;
  }
  const capabilities = record.capabilities;
  return !Array.isArray(capabilities) || capabilities.every(isModelCapability);
}

function isModelCapability(value: unknown): value is ModelCapability {
  return typeof value === 'string' && MODEL_CAPABILITIES.has(value as ModelCapability);
}

function isProjectFileMentionInfo(value: unknown): value is ProjectFileMentionInfo {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'path') &&
    readString(record, 'name') &&
    (record.type === 'file' || record.type === 'folder') &&
    (record.icon === undefined || typeof record.icon === 'string') &&
    (record.source === undefined || isProjectMentionSource(record.source)) &&
    (record.mediaType === undefined || isProjectMentionMediaType(record.mediaType)),
  );
}

function isProjectMentionExtra(value: unknown): value is ProjectMentionExtra {
  const record = asRecord(value);
  return Boolean(
    record &&
    isProjectMentionExtraType(record.type) &&
    readString(record, 'id') &&
    readString(record, 'label') &&
    readString(record, 'summary') &&
    (record.thumbnailUri === undefined || typeof record.thumbnailUri === 'string') &&
    (record.source === undefined || isProjectMentionSource(record.source)) &&
    (record.icon === undefined || typeof record.icon === 'string') &&
    (record.filePath === undefined || typeof record.filePath === 'string') &&
    (record.mediaType === undefined || isProjectMentionMediaType(record.mediaType)) &&
    (record.entityType === undefined || typeof record.entityType === 'string') &&
    (record.navigationData === undefined || isStringRecord(record.navigationData)),
  );
}

function isProjectMentionExtraType(value: unknown): value is ProjectMentionExtra['type'] {
  return (
    value === 'canvas-node' ||
    value === 'character' ||
    value === 'scene' ||
    value === 'asset' ||
    value === 'media' ||
    value === 'entity'
  );
}

function isProjectMentionSource(value: unknown): value is ProjectMentionExtra['source'] {
  return (
    value === 'workspace' ||
    value === 'asset-library' ||
    value === 'media-library' ||
    value === 'entity-graph' ||
    value === 'story' ||
    value === 'canvas'
  );
}

function isProjectMentionMediaType(value: unknown): value is ProjectMentionExtra['mediaType'] {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = asRecord(value);
  return Boolean(record && Object.values(record).every((item) => typeof item === 'string'));
}

function isPluginSlashCommandProjection(value: unknown): value is PluginSlashCommandProjection {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'id') &&
    readString(record, 'name') &&
    readString(record, 'description') &&
    readString(record, 'extensionId') &&
    (record.icon === undefined || typeof record.icon === 'string'),
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}
