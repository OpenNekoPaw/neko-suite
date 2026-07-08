import type {
  ActiveSkillLifecycleRecordProjection,
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProviderAvailabilitySummary,
  ChatModelOption,
  SkillLifecycleSlot,
  Task,
  TaskStatus,
} from '@neko/shared';
import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';
import type { AgentLlmAdvancedParams, AgentLlmConfig } from '@neko-agent/types';
import type { TuiArtifactReference } from './artifact-reference-formatter';
import { formatTuiArtifactReference } from './artifact-reference-formatter';
import type { CLIConfig } from './types';
import { getProviderModels } from './config';
import { formatTuiQueueError, formatTuiQueueSnapshot } from './message-queue';
import {
  handleSlashCommand,
  type MediaModelOverrides,
  type SlashCommandContext,
  type SlashCommandResult,
} from './slash-commands';

export type TuiExecutionMode = 'plan' | 'ask' | 'auto';
export type TuiSessionMode = 'agent' | 'image' | 'video' | 'audio';
const TUI_SESSION_MODES: readonly TuiSessionMode[] = ['agent', 'image', 'video', 'audio'];
type TuiMediaCategory = 'image' | 'video' | 'audio';
const TUI_MEDIA_CATEGORIES: readonly TuiMediaCategory[] = ['image', 'video', 'audio'];
const TUI_TASK_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly TaskStatus[];
type TuiParamPresetKey = 'reasoning' | 'verbosity' | 'creativity';
const TUI_PARAM_PRESET_KEYS: readonly TuiParamPresetKey[] = [
  'reasoning',
  'verbosity',
  'creativity',
];
const TUI_PARAM_ADVANCED_KEYS: readonly (keyof AgentLlmAdvancedParams)[] = [
  'temperature',
  'topP',
  'maxOutputTokens',
  'reasoningEffort',
  'thinkingBudget',
  'verbosity',
  'serviceTier',
];

export interface TuiSelectionItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly active?: boolean;
}

export interface TuiStatusSnapshot {
  readonly executionMode: TuiExecutionMode;
  readonly sessionMode?: TuiSessionMode;
  readonly agentStatus: string;
  readonly tokensTotal?: number;
  readonly activeSkillSummary?: string;
  readonly queueCount?: number;
  readonly runningTaskSummary?: string;
  readonly chatModelIdentity?: string;
  readonly mediaModelSummary?: string;
  readonly llmParameterSummary?: string;
}

export interface TuiModelPorts {
  readonly listChatModels?: () => readonly string[];
  readonly listChatModelOptions?: () => readonly ChatModelOption[];
  readonly selectChatModel?: (model: string | TuiModelIdentity) => void | Promise<void>;
  readonly selectModelFromMenu?: (input: {
    readonly title: string;
    readonly models: readonly string[];
    readonly currentModel: string;
  }) => Promise<string | null>;
  readonly selectMenuItem?: (input: {
    readonly title: string;
    readonly items: readonly TuiSelectionItem[];
  }) => Promise<string | null>;
}

export interface TuiModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly optionId?: string;
  readonly label?: string;
  readonly category?: ChatModelOption['category'];
  readonly capabilities?: readonly string[];
}

export interface TuiMediaModelPorts {
  readonly listMediaModelOptions?: () => readonly ChatModelOption[];
  readonly getCurrentMediaModels?: () => Partial<Record<TuiMediaCategory, string>>;
  readonly setMediaModel?: (
    category: TuiMediaCategory,
    model: TuiModelIdentity | 'none',
  ) => void | Promise<void>;
  readonly resetMediaModels?: () => void | Promise<void>;
}

export interface TuiParameterValidationResult {
  readonly config: AgentLlmConfig;
  readonly chatOptions?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly thinkingBudget?: number;
  };
  readonly providerOptions?: Record<string, unknown>;
  readonly diagnostics?: readonly string[];
  readonly summary?: string;
}

export interface TuiParameterPorts {
  readonly getConfig?: () => AgentLlmConfig | undefined;
  readonly validate?: (config: AgentLlmConfig) => TuiParameterValidationResult;
  readonly apply?: (result: TuiParameterValidationResult) => void | Promise<void>;
}

export interface TuiSkillClearTarget {
  readonly recordId?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly skillName?: string;
}

export interface TuiSkillPorts {
  readonly activate?: (skillName: string, args?: string) => boolean | Promise<boolean>;
  readonly deactivate?: (target?: TuiSkillClearTarget) => boolean | Promise<boolean>;
  readonly listEnabled?: () => readonly TuiSkillOption[];
  readonly getActiveSkillName?: () => string | null;
  readonly getActiveRecords?: () => readonly ActiveSkillLifecycleRecordProjection[];
  readonly selectSkillFromMenu?: (input: {
    readonly title: string;
    readonly items: readonly TuiSelectionItem[];
  }) => Promise<string | null>;
}

export interface TuiSkillOption {
  readonly name: string;
  readonly description?: string;
}

export interface TuiContextPorts {
  readonly getTokenCount?: () => number;
  readonly compact?: () => Promise<TuiCompressionResult>;
}

export interface TuiQueuePorts {
  readonly getSnapshot: () => AgentMessageQueueSnapshot;
  readonly promote: (queueItemId: string) => AgentQueuedMessageItem;
  readonly cancel: (queueItemId: string) => AgentQueuedMessageItem;
  readonly edit: (queueItemId: string, content: string) => AgentQueuedMessageItem;
}

export interface TuiTaskPorts {
  readonly list: (status?: TaskStatus) => readonly Task[] | Promise<readonly Task[]>;
}

export interface TuiMcpServerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly transport?: string;
  readonly toolCount?: number;
}

export interface TuiMcpPorts {
  readonly listServers: () => readonly TuiMcpServerSnapshot[];
  readonly listTools?: (serverId?: string) => readonly string[] | Promise<readonly string[]>;
  readonly connect?: (serverId: string) => void | Promise<void>;
  readonly disconnect?: (serverId: string) => void | Promise<void>;
  readonly reconnect?: (serverId: string) => void | Promise<void>;
}

export interface TuiCapabilityPorts {
  readonly getProviderSummaries: () => readonly AgentCapabilityProviderAvailabilitySummary[];
  readonly getDiagnostics: () => readonly AgentCapabilityAvailabilityDiagnostic[];
  readonly listTools: (providerId?: string) => readonly string[];
}

export interface TuiCompressionResult {
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}

export interface TuiArtifactPorts {
  readonly list?: () => readonly TuiArtifactReference[];
  readonly show?: (artifactId: string) => TuiArtifactReference | null | undefined;
  readonly open?: (artifactId: string) => string | void | Promise<string | void>;
  readonly send?: (target: string, artifactId: string) => string | void | Promise<string | void>;
}

export interface TuiCommandRouterPorts {
  readonly mode?: {
    readonly setExecutionMode: (mode: TuiExecutionMode) => string | void | Promise<string | void>;
    readonly getSessionMode?: () => TuiSessionMode;
    readonly setSessionMode?: (mode: TuiSessionMode) => string | void | Promise<string | void>;
  };
  readonly model?: TuiModelPorts;
  readonly media?: TuiMediaModelPorts;
  readonly parameters?: TuiParameterPorts;
  readonly skill?: TuiSkillPorts;
  readonly context?: TuiContextPorts;
  readonly queue?: TuiQueuePorts;
  readonly task?: TuiTaskPorts;
  readonly mcp?: TuiMcpPorts;
  readonly capability?: TuiCapabilityPorts;
  readonly artifact?: TuiArtifactPorts;
  readonly status?: {
    readonly getSnapshot: () => TuiStatusSnapshot;
  };
  readonly history?: {
    readonly clear: () => string | void | Promise<string | void>;
  };
  readonly lifecycle?: {
    readonly exit: () => void | Promise<void>;
  };
  readonly output: {
    readonly info: (message: string) => void;
    readonly error: (message: string) => void;
  };
}

export interface TuiCommandRouterContext {
  readonly slash: SlashCommandContext;
  readonly ports: TuiCommandRouterPorts;
}

export interface TuiCommandRouterResult extends SlashCommandResult {
  readonly source: 'tui-router' | 'slash-core';
}

export async function handleTuiControlCommand(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const commandText = input.trim();
  const commandName = commandText.split(/\s+/)[0]?.slice(1).toLowerCase() ?? '';

  switch (commandName) {
    case 'exit':
    case 'quit':
    case 'q':
      await context.ports.lifecycle?.exit();
      return handled({ continueExecution: false, output: 'Goodbye!' });

    case 'clear':
    case 'cls':
      return handleClear(context);

    case 'model':
      return handleModel(commandText, context);

    case 'media':
      return handleMedia(commandText, context);

    case 'param':
      return handleParam(commandText, context);

    case 'mode':
      return handleSessionMode(commandText, context);

    case 'skill':
      return handleSkill(commandText, context);

    case 'status':
    case 's':
      return handleStatus(context);

    case 'compact':
      return handleCompact(context);

    case 'queue':
      return handleQueue(commandText, context);

    case 'task':
    case 'tasks':
      return handleTasks(commandText, context);

    case 'mcp':
      return handleMcp(commandText, context);

    case 'capability':
      return handleCapability(commandText, context);

    case 'artifact':
      return handleArtifact(commandText, context);

    case 'plan':
      return setMode('plan', 'Plan mode enabled', context);

    case 'auto':
      return setMode('auto', 'Auto mode enabled', context);

    case 'ask':
      return setMode('ask', 'Ask mode enabled', context);

    default: {
      const result = await handleSlashCommand(input, context.slash);
      return { ...result, source: 'slash-core' };
    }
  }
}

function handled(overrides: Partial<TuiCommandRouterResult> = {}): TuiCommandRouterResult {
  return {
    handled: true,
    continueExecution: true,
    source: 'tui-router',
    ...overrides,
  };
}

async function handleClear(context: TuiCommandRouterContext): Promise<TuiCommandRouterResult> {
  const output = await context.ports.history?.clear();
  return handled({ ...(output ? { output } : {}) });
}

async function handleModel(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = input.slice('/model'.length).trim().split(/\s+/).filter(Boolean);
  const forceList = args.length === 0 || args[0] === 'list' || args[0] === 'status';
  const modelPorts = context.ports.model;
  const mediaPorts = context.ports.media;
  const allOptions = modelPorts?.listChatModelOptions?.() ?? [];
  const chatOptions = allOptions.filter((option) => !isMediaModelCategory(option.category));
  const mediaOptions =
    mediaPorts?.listMediaModelOptions?.() ??
    allOptions.filter((option) => isMediaModelCategory(option.category));

  if (forceList) {
    return handled({
      output: formatUnifiedModelStatus({
        config: context.slash.config,
        chatOptions,
        mediaOptions,
        currentMediaModels: {
          ...(context.slash.defaultMediaModels ?? {}),
          ...(context.slash.currentMediaOverrides ?? {}),
          ...(mediaPorts?.getCurrentMediaModels?.() ?? {}),
        },
      }),
    });
  }

  const target = args[0]?.toLowerCase();
  if (target === 'set') {
    return handleChatModelSelection(args.slice(1).join(' '), chatOptions, context);
  }

  if (target === 'chat') {
    const chatArg = args.slice(1).join(' ');
    return handleChatModelSelection(chatArg, chatOptions, context);
  }

  if (isTuiMediaCategory(target)) {
    return handleModelMediaSelection(target, args.slice(1).join(' '), mediaOptions, context);
  }

  return handleChatModelSelection(args.join(' '), chatOptions, context);
}

async function handleChatModelSelection(
  modelArg: string,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const config = context.slash.config;
  const modelPorts = context.ports.model;

  if (modelArg) {
    const identity = resolveModelIdentity(modelArg, options, config.provider);
    if (!identity) {
      return handled({
        error: `Unknown chat model identity: ${modelArg}. Use /model chat to list available chat models.`,
      });
    }
    await modelPorts?.selectChatModel?.(identity);
    return handled({ output: `Chat model switched to: ${formatModelIdentity(identity)}` });
  }

  if (options.length > 0) {
    const currentIdentity = readCurrentChatModelIdentity(config, options);

    if (!modelPorts?.selectMenuItem) {
      return handled({ output: formatModelOptionList(currentIdentity, options) });
    }

    const selected = await modelPorts.selectMenuItem({
      title: 'Chat Model',
      items: options.map((option) => ({
        id: option.id,
        label: option.label,
        description: `${option.providerId}/${option.modelId}`,
        active: sameModelIdentity(option, currentIdentity),
      })),
    });
    if (!selected) {
      return handled();
    }

    const identity = resolveModelIdentity(selected, options, config.provider);
    if (!identity) {
      return handled({ error: `Unknown model identity selected: ${selected}` });
    }
    await modelPorts.selectChatModel?.(identity);
    return handled({ output: `Chat model switched to: ${formatModelIdentity(identity)}` });
  }

  const chatModels = [
    ...(modelPorts?.listChatModels?.() ?? getProviderModels(config.provider, config.workDir)),
  ];
  if (!chatModels.includes(config.model)) {
    chatModels.unshift(config.model);
  }
  const hasChatModels = chatModels.length > 0;

  if (hasChatModels) {
    if (!modelPorts?.selectModelFromMenu) {
      return handled({ output: formatChatModelList(config.model, chatModels, config.provider) });
    }
    const selected = await modelPorts?.selectModelFromMenu?.({
      title: 'Chat Model',
      models: chatModels,
      currentModel: config.model,
    });
    if (selected) {
      await modelPorts?.selectChatModel?.(selected);
      return handled({ output: `Chat model switched to: ${selected}` });
    }
    return handled();
  }

  return handled({ output: 'No chat models configured.' });
}

async function handleModelMediaSelection(
  category: TuiMediaCategory,
  modelArg: string,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const mediaPorts = context.ports.media;
  const currentModels = {
    ...(context.slash.defaultMediaModels ?? {}),
    ...(context.slash.currentMediaOverrides ?? {}),
    ...(mediaPorts?.getCurrentMediaModels?.() ?? {}),
  };
  const modelsForCategory = options.filter((option) => option.category === category);

  if (!modelArg) {
    const menuResult = await handleMediaModelMenuSelection(
      category,
      currentModels[category],
      modelsForCategory,
      context,
    );
    if (menuResult) {
      return menuResult;
    }
    return handled({
      output: formatMediaCategoryList(
        category,
        currentModels[category],
        modelsForCategory,
        context.slash.config.mediaModels,
      ),
    });
  }

  if (modelArg === 'list' || modelArg === 'status') {
    return handled({
      output: formatMediaCategoryList(
        category,
        currentModels[category],
        modelsForCategory,
        context.slash.config.mediaModels,
      ),
    });
  }

  if (modelArg === 'none') {
    if (!mediaPorts?.setMediaModel && !context.slash.onUpdateMediaOverrides) {
      return handled({ error: 'Media model selection is not available for this session.' });
    }
    await mediaPorts?.setMediaModel?.(category, 'none');
    if (!mediaPorts?.setMediaModel) {
      context.slash.onUpdateMediaOverrides?.({ [category]: 'none' });
    }
    return handled({ output: `${category} media generation disabled for this session.` });
  }

  const identity = resolveMediaModelIdentity(
    category,
    modelArg,
    modelsForCategory,
    context.slash.config.provider,
    context.slash.config.mediaModels,
  );
  if (!identity) {
    return handled({
      error: `Unknown ${category} model identity: ${modelArg}. Use /model ${category} to list available models.`,
    });
  }

  if (!mediaPorts?.setMediaModel && !context.slash.onUpdateMediaOverrides) {
    return handled({ error: 'Media model selection is not available for this session.' });
  }

  await mediaPorts?.setMediaModel?.(category, identity);
  if (!mediaPorts?.setMediaModel) {
    context.slash.onUpdateMediaOverrides?.({ [category]: identity.optionId ?? identity.modelId });
  }
  return handled({ output: `${category} model set to: ${formatModelIdentity(identity)}` });
}

async function handleMediaModelMenuSelection(
  category: TuiMediaCategory,
  current: string | undefined,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult | null> {
  const selectMenuItem = context.ports.model?.selectMenuItem;
  if (!selectMenuItem || options.length === 0) {
    return null;
  }

  const selected = await selectMenuItem({
    title: `${capitalize(category)} Model`,
    items: [
      ...options.map((option) => ({
        id: option.id,
        label: option.label,
        description: `${option.providerId}/${option.modelId}`,
        active: option.id === current || option.modelId === current,
      })),
      {
        id: '__none__',
        label: 'None',
        description: `Disable ${category} generation for this session`,
        active: current === 'none' || !current,
      },
    ],
  });
  if (!selected) {
    return handled();
  }

  if (selected === '__none__') {
    return setMediaModelSelection(category, 'none', context);
  }

  const identity = resolveMediaModelIdentity(
    category,
    selected,
    options,
    context.slash.config.provider,
    context.slash.config.mediaModels,
  );
  if (!identity) {
    return handled({ error: `Unknown ${category} model identity selected: ${selected}` });
  }
  return setMediaModelSelection(category, identity, context);
}

async function setMediaModelSelection(
  category: TuiMediaCategory,
  model: TuiModelIdentity | 'none',
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const mediaPorts = context.ports.media;
  if (!mediaPorts?.setMediaModel && !context.slash.onUpdateMediaOverrides) {
    return handled({ error: 'Media model selection is not available for this session.' });
  }

  await mediaPorts?.setMediaModel?.(category, model);
  if (!mediaPorts?.setMediaModel) {
    context.slash.onUpdateMediaOverrides?.({
      [category]: model === 'none' ? 'none' : (model.optionId ?? model.modelId),
    });
  }

  return handled({
    output:
      model === 'none'
        ? `${category} media generation disabled for this session.`
        : `${category} model set to: ${formatModelIdentity(model)}`,
  });
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function formatModelOptionList(
  currentModel: TuiModelIdentity,
  options: readonly ChatModelOption[],
): string {
  return [
    `Current: ${formatModelIdentity(currentModel)}`,
    'Available chat models:',
    ...options.map((option) => {
      const marker = sameModelIdentity(option, currentModel) ? '* ' : '  ';
      return `  ${marker}${option.id}  ${option.label}`;
    }),
    'Usage: /model chat <provider:model|provider/model|model-id>',
  ].join('\n');
}

function formatUnifiedModelStatus(input: {
  readonly config: CLIConfig;
  readonly chatOptions: readonly ChatModelOption[];
  readonly mediaOptions: readonly ChatModelOption[];
  readonly currentMediaModels: Partial<Record<TuiMediaCategory, string>>;
}): string {
  const currentChat = readCurrentChatModelIdentity(input.config, input.chatOptions);
  const lines = ['Model Selection:', `  chat: ${formatModelIdentity(currentChat)}`];

  lines.push('', 'Media Models:');
  for (const category of TUI_MEDIA_CATEGORIES) {
    const current = input.currentMediaModels[category];
    const option = current ? resolveMediaOption(category, current, input.mediaOptions) : undefined;
    const label = option ? `${option.id} (${option.label})` : (current ?? '(none)');
    const source = contextMediaSource(
      category,
      input.config.defaultMediaModels,
      input.currentMediaModels,
    );
    lines.push(`  ${category}: ${label} [${source}]`);
  }

  if (input.chatOptions.length > 0) {
    lines.push('', 'Available chat models:');
    for (const option of input.chatOptions) {
      const marker = sameModelIdentity(option, currentChat) ? '* ' : '  ';
      lines.push(`  ${marker}${option.id}  ${option.label}`);
    }
  }

  if (input.mediaOptions.length > 0) {
    lines.push('', 'Available media models:');
    for (const option of input.mediaOptions) {
      const category = isMediaModelCategory(option.category) ? option.category : 'media';
      lines.push(`  ${category} ${option.id}  ${option.label}`);
    }
  } else if (input.config.mediaModels.length > 0) {
    lines.push('', 'Available media models:');
    for (const model of input.config.mediaModels) {
      lines.push(`  ${model}`);
    }
  }

  lines.push(
    '',
    'Usage:',
    '  /model chat <provider:model|provider/model|model-id>',
    '  /model <image|video|audio> <provider:model|provider/model|model-id|none>',
    '  /media <image|video|audio> <provider:model|provider/model|model-id|none>',
  );
  return lines.join('\n');
}

function readCurrentChatModelIdentity(
  config: CLIConfig,
  options: readonly ChatModelOption[] = [],
): TuiModelIdentity {
  const providerId = config.chatModel?.providerId ?? config.provider;
  const modelId = config.chatModel?.modelId ?? config.model;
  const resolved =
    resolveModelIdentity(`${providerId}:${modelId}`, options, providerId) ??
    resolveModelIdentity(modelId, options, providerId);
  return (
    resolved ?? {
      providerId,
      modelId,
      optionId: `${providerId}:${modelId}`,
      label: `${providerId} / ${modelId}`,
    }
  );
}

function isMediaModelCategory(
  category: ChatModelOption['category'] | undefined,
): category is TuiMediaCategory {
  return category === 'image' || category === 'video' || category === 'audio';
}

function resolveModelIdentity(
  rawIdentity: string,
  options: readonly ChatModelOption[],
  defaultProviderId: string,
): TuiModelIdentity | null {
  const identity = rawIdentity.trim();
  if (!identity) return null;
  const byOption = options.find(
    (option) =>
      option.id === identity ||
      `${option.providerId}/${option.modelId}` === identity ||
      option.modelId === identity,
  );
  if (byOption) {
    return chatModelOptionToIdentity(byOption);
  }

  if (options.length > 0) {
    return null;
  }

  const explicit = parseExplicitModelIdentity(identity);
  if (explicit) {
    return explicit;
  }

  return {
    providerId: defaultProviderId,
    modelId: identity,
    optionId: `${defaultProviderId}:${identity}`,
    label: `${defaultProviderId} / ${identity}`,
  };
}

function parseExplicitModelIdentity(rawIdentity: string): TuiModelIdentity | null {
  const separator = rawIdentity.includes('/') ? '/' : rawIdentity.includes(':') ? ':' : null;
  if (!separator) return null;
  const [providerId, modelId] = rawIdentity.split(separator, 2);
  if (!providerId || !modelId) return null;
  return {
    providerId,
    modelId,
    optionId: `${providerId}:${modelId}`,
    label: `${providerId} / ${modelId}`,
  };
}

function chatModelOptionToIdentity(option: ChatModelOption): TuiModelIdentity {
  return {
    providerId: option.providerId,
    modelId: option.modelId,
    optionId: option.id,
    label: option.label,
    category: option.category,
    ...(option.capabilities ? { capabilities: option.capabilities } : {}),
  };
}

function sameModelIdentity(
  option: Pick<ChatModelOption, 'providerId' | 'modelId' | 'id'>,
  identity: TuiModelIdentity,
): boolean {
  return (
    option.id === identity.optionId ||
    (option.providerId === identity.providerId && option.modelId === identity.modelId)
  );
}

function formatModelIdentity(identity: TuiModelIdentity): string {
  const label = identity.label ? ` (${identity.label})` : '';
  return `${identity.providerId}:${identity.modelId}${label}`;
}

function formatChatModelList(
  currentModel: string,
  models: readonly string[],
  provider: string,
): string {
  const lines = [`Current: ${currentModel}`];
  if (models.length > 0) {
    lines.push(`Available (${provider}):`);
    for (const model of models) {
      const marker = model === currentModel ? '* ' : '  ';
      lines.push(`  ${marker}${model}`);
    }
  }
  return lines.join('\n');
}

async function handleMedia(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = input.slice('/media'.length).trim().split(/\s+/).filter(Boolean);
  const mediaPorts = context.ports.media;
  const options = mediaPorts?.listMediaModelOptions?.() ?? [];
  const currentModels = {
    ...(context.slash.defaultMediaModels ?? {}),
    ...(context.slash.currentMediaOverrides ?? {}),
    ...(mediaPorts?.getCurrentMediaModels?.() ?? {}),
  };

  if (args.length === 0 || args[0] === 'list' || args[0] === 'status') {
    return handled({ output: formatMediaStatus(currentModels, options, context.slash.config) });
  }

  const subcommand = args[0]?.toLowerCase();
  if (subcommand === 'reset') {
    if (!mediaPorts?.resetMediaModels && !context.slash.onResetMediaOverrides) {
      return handled({ error: 'Media model reset is not available for this session.' });
    }
    await mediaPorts?.resetMediaModels?.();
    if (!mediaPorts?.resetMediaModels) {
      context.slash.onResetMediaOverrides?.();
    }
    return handled({ output: 'Media model overrides reset to config defaults.' });
  }

  if (!isTuiMediaCategory(subcommand)) {
    return handled({
      error: `Unknown media category: "${subcommand ?? ''}". Valid: ${TUI_MEDIA_CATEGORIES.join(', ')}, reset`,
    });
  }

  const category = subcommand;
  const modelArg = args[1];
  const modelsForCategory = options.filter((option) => option.category === category);

  if (!modelArg) {
    return handled({
      output: formatMediaCategoryList(
        category,
        currentModels[category],
        modelsForCategory,
        context.slash.config.mediaModels,
      ),
    });
  }

  if (modelArg === 'none') {
    if (!mediaPorts?.setMediaModel && !context.slash.onUpdateMediaOverrides) {
      return handled({ error: 'Media model selection is not available for this session.' });
    }
    await mediaPorts?.setMediaModel?.(category, 'none');
    if (!mediaPorts?.setMediaModel) {
      context.slash.onUpdateMediaOverrides?.({ [category]: 'none' });
    }
    return handled({ output: `${category} media generation disabled for this session.` });
  }

  const identity = resolveMediaModelIdentity(
    category,
    modelArg,
    modelsForCategory,
    context.slash.config.provider,
    context.slash.config.mediaModels,
  );
  if (!identity) {
    return handled({
      error: `Unknown ${category} media model identity: ${modelArg}. Use /media ${category} to list available models.`,
    });
  }

  if (!mediaPorts?.setMediaModel && !context.slash.onUpdateMediaOverrides) {
    return handled({ error: 'Media model selection is not available for this session.' });
  }

  await mediaPorts?.setMediaModel?.(category, identity);
  if (!mediaPorts?.setMediaModel) {
    context.slash.onUpdateMediaOverrides?.({ [category]: identity.optionId ?? identity.modelId });
  }
  return handled({ output: `${category} model set to: ${formatModelIdentity(identity)}` });
}

function formatMediaStatus(
  currentModels: Partial<Record<TuiMediaCategory, string>>,
  options: readonly ChatModelOption[],
  config: CLIConfig,
): string {
  const lines = ['Media Model Selection:'];
  for (const category of TUI_MEDIA_CATEGORIES) {
    const current = currentModels[category];
    const option = current ? resolveMediaOption(category, current, options) : undefined;
    const label = option ? `${option.id} (${option.label})` : (current ?? '(none)');
    const source = contextMediaSource(category, config.defaultMediaModels, currentModels);
    lines.push(`  ${category}: ${label} [${source}]`);
  }
  if (options.length > 0) {
    lines.push('', 'Available media models:');
    for (const option of options) {
      lines.push(`  ${option.category ?? 'media'} ${option.id}  ${option.label}`);
    }
  } else if (config.mediaModels.length > 0) {
    lines.push('', 'Available media models:');
    for (const model of config.mediaModels) {
      lines.push(`  ${model}`);
    }
  }
  lines.push('', 'Usage: /media <image|video|audio> <provider:model|provider/model|model-id|none>');
  lines.push('       /media reset');
  return lines.join('\n');
}

function contextMediaSource(
  category: TuiMediaCategory,
  defaults: SlashCommandContext['defaultMediaModels'],
  currentModels: Partial<Record<TuiMediaCategory, string>>,
): string {
  if (currentModels[category] && currentModels[category] !== defaults?.[category]) {
    return 'session override';
  }
  return defaults?.[category] ? 'config default' : 'not set';
}

function formatMediaCategoryList(
  category: TuiMediaCategory,
  current: string | undefined,
  options: readonly ChatModelOption[],
  configuredModels: readonly string[],
): string {
  const lines = [`${category} models (current: ${current ?? '(none)'}):`];
  if (options.length > 0) {
    for (const option of options) {
      const marker =
        option.id === current ||
        option.modelId === current ||
        `${option.providerId}/${option.modelId}` === current
          ? '* '
          : '  ';
      lines.push(`  ${marker}${option.id}  ${option.label}`);
    }
  } else {
    const modelsForCategory = configuredModels.filter(
      (id) => id.toLowerCase().includes(category) || configuredModels.length <= 5,
    );
    if (modelsForCategory.length === 0) {
      lines.push('  (no models available for this category)');
    } else {
      for (const model of modelsForCategory) {
        const marker = model === current ? '* ' : '  ';
        lines.push(`  ${marker}${model}`);
      }
    }
  }
  lines.push('', `Use "/media ${category} none" to disable this category.`);
  return lines.join('\n');
}

function resolveMediaModelIdentity(
  category: TuiMediaCategory,
  rawIdentity: string,
  options: readonly ChatModelOption[],
  defaultProviderId: string,
  configuredModels: readonly string[],
): TuiModelIdentity | null {
  const option = resolveMediaOption(category, rawIdentity, options);
  if (option) {
    return chatModelOptionToIdentity(option);
  }
  if (options.length > 0) {
    return null;
  }
  const explicit = parseExplicitModelIdentity(rawIdentity);
  if (explicit) {
    return { ...explicit, category };
  }
  if (configuredModels.includes(rawIdentity) || options.length === 0) {
    return {
      providerId: defaultProviderId,
      modelId: rawIdentity,
      optionId: `${defaultProviderId}:${rawIdentity}`,
      label: `${defaultProviderId} / ${rawIdentity}`,
      category,
    };
  }
  return null;
}

function resolveMediaOption(
  category: TuiMediaCategory,
  identity: string,
  options: readonly ChatModelOption[],
): ChatModelOption | undefined {
  return options.find(
    (option) =>
      option.category === category &&
      (option.id === identity ||
        option.modelId === identity ||
        `${option.providerId}/${option.modelId}` === identity),
  );
}

function isTuiMediaCategory(value: string | undefined): value is TuiMediaCategory {
  return TUI_MEDIA_CATEGORIES.includes(value as TuiMediaCategory);
}

async function handleParam(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const parameterPorts = context.ports.parameters;
  if (!parameterPorts) {
    return handled({ error: 'Parameter control is not available for this session.' });
  }

  const args = input.slice('/param'.length).trim().split(/\s+/).filter(Boolean);
  const currentConfig = parameterPorts.getConfig?.() ?? {};

  if (args.length === 0 || args[0] === 'status' || args[0] === 'list') {
    return handled({ output: formatLlmParameterStatus(currentConfig) });
  }

  const subcommand = args[0]?.toLowerCase();
  if (subcommand === 'clear' || subcommand === 'reset') {
    const result = validateLlmParameters({}, parameterPorts);
    if (result.diagnostics?.length) {
      return handled({ error: formatParameterDiagnostics(result.diagnostics) });
    }
    await parameterPorts.apply?.(result);
    return handled({ output: 'LLM parameters reset.' });
  }

  if (subcommand !== 'set') {
    return handled({ error: 'Usage: /param set <name> <value> | /param status | /param reset' });
  }

  const key = args[1];
  const value = args[2];
  if (!key || value === undefined) {
    return handled({ error: 'Usage: /param set <name> <value>' });
  }

  const nextConfigResult = buildUpdatedLlmParameterConfig(currentConfig, key, value);
  if (!nextConfigResult.ok) {
    return handled({ error: nextConfigResult.error });
  }

  const result = validateLlmParameters(nextConfigResult.config, parameterPorts);
  if (result.diagnostics?.length) {
    return handled({ error: formatParameterDiagnostics(result.diagnostics) });
  }

  await parameterPorts.apply?.(result);
  return handled({
    output: `Parameter updated: ${key} = ${value}${result.summary ? `\n${result.summary}` : ''}`,
  });
}

function validateLlmParameters(
  config: AgentLlmConfig,
  parameterPorts: TuiParameterPorts,
): TuiParameterValidationResult {
  return parameterPorts.validate?.(config) ?? { config };
}

function buildUpdatedLlmParameterConfig(
  config: AgentLlmConfig,
  key: string,
  value: string,
): { ok: true; config: AgentLlmConfig } | { ok: false; error: string } {
  if (isTuiParamPresetKey(key)) {
    return updatePresetParameter(config, key, value);
  }

  if (!isTuiParamAdvancedKey(key)) {
    return {
      ok: false,
      error: `Unsupported parameter: ${key}. Valid: ${[
        ...TUI_PARAM_PRESET_KEYS,
        ...TUI_PARAM_ADVANCED_KEYS,
      ].join(', ')}`,
    };
  }

  const parsed = parseAdvancedParameterValue(key, value);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    config: {
      ...config,
      advanced: {
        ...(config.advanced ?? {}),
        [key]: parsed.value,
      },
    },
  };
}

function updatePresetParameter(
  config: AgentLlmConfig,
  key: TuiParamPresetKey,
  value: string,
): { ok: true; config: AgentLlmConfig } | { ok: false; error: string } {
  if (key === 'reasoning') {
    if (!isReasoningPreset(value)) {
      return { ok: false, error: 'Invalid reasoning preset. Valid: fast, balanced, deep' };
    }
    return { ok: true, config: { ...config, reasoningPreset: value } };
  }
  if (key === 'verbosity') {
    if (!isVerbosityPreset(value)) {
      return { ok: false, error: 'Invalid verbosity preset. Valid: brief, standard, detailed' };
    }
    return { ok: true, config: { ...config, verbosityPreset: value } };
  }
  if (!isCreativityPreset(value)) {
    return { ok: false, error: 'Invalid creativity preset. Valid: stable, creative, wild' };
  }
  return { ok: true, config: { ...config, creativityPreset: value } };
}

function parseAdvancedParameterValue(
  key: keyof AgentLlmAdvancedParams,
  rawValue: string,
): { ok: true; value: string | number } | { ok: false; error: string } {
  switch (key) {
    case 'temperature':
    case 'topP': {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        return { ok: false, error: `${key} must be a number between 0 and 2` };
      }
      return { ok: true, value };
    }
    case 'maxOutputTokens':
    case 'thinkingBudget': {
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value <= 0) {
        return { ok: false, error: `${key} must be a positive integer` };
      }
      return { ok: true, value };
    }
    case 'reasoningEffort':
      if (!isReasoningEffort(rawValue)) {
        return {
          ok: false,
          error: 'Invalid reasoningEffort. Valid: none, minimal, low, medium, high, xhigh',
        };
      }
      return { ok: true, value: rawValue };
    case 'verbosity':
      if (!isTextVerbosity(rawValue)) {
        return { ok: false, error: 'Invalid verbosity. Valid: low, medium, high' };
      }
      return { ok: true, value: rawValue };
    case 'serviceTier':
      if (!isServiceTier(rawValue)) {
        return {
          ok: false,
          error: 'Invalid serviceTier. Valid: auto, default, fast, flex, priority',
        };
      }
      return { ok: true, value: rawValue };
  }
}

function formatLlmParameterStatus(config: AgentLlmConfig): string {
  const lines = ['LLM Parameters:'];
  lines.push(`  reasoning: ${config.reasoningPreset ?? '(default)'}`);
  lines.push(`  verbosity: ${config.verbosityPreset ?? '(default)'}`);
  lines.push(`  creativity: ${config.creativityPreset ?? '(default)'}`);
  const advanced = config.advanced ?? {};
  if (Object.keys(advanced).length > 0) {
    lines.push('  advanced:');
    for (const key of TUI_PARAM_ADVANCED_KEYS) {
      const value = advanced[key];
      if (value !== undefined) {
        lines.push(`    ${key}: ${value}`);
      }
    }
  }
  lines.push(
    '',
    'Usage: /param set <reasoning|verbosity|creativity|temperature|topP|maxOutputTokens|reasoningEffort|thinkingBudget|serviceTier> <value>',
  );
  return lines.join('\n');
}

function formatParameterDiagnostics(diagnostics: readonly string[]): string {
  return diagnostics.join('\n');
}

function isTuiParamPresetKey(value: string): value is TuiParamPresetKey {
  return TUI_PARAM_PRESET_KEYS.includes(value as TuiParamPresetKey);
}

function isTuiParamAdvancedKey(value: string): value is keyof AgentLlmAdvancedParams {
  return TUI_PARAM_ADVANCED_KEYS.includes(value as keyof AgentLlmAdvancedParams);
}

function isReasoningPreset(value: string): value is NonNullable<AgentLlmConfig['reasoningPreset']> {
  return value === 'fast' || value === 'balanced' || value === 'deep';
}

function isVerbosityPreset(value: string): value is NonNullable<AgentLlmConfig['verbosityPreset']> {
  return value === 'brief' || value === 'standard' || value === 'detailed';
}

function isCreativityPreset(
  value: string,
): value is NonNullable<AgentLlmConfig['creativityPreset']> {
  return value === 'stable' || value === 'creative' || value === 'wild';
}

function isReasoningEffort(
  value: string,
): value is NonNullable<AgentLlmAdvancedParams['reasoningEffort']> {
  return (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  );
}

function isTextVerbosity(value: string): value is NonNullable<AgentLlmAdvancedParams['verbosity']> {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isServiceTier(value: string): value is NonNullable<AgentLlmAdvancedParams['serviceTier']> {
  return (
    value === 'auto' ||
    value === 'default' ||
    value === 'fast' ||
    value === 'flex' ||
    value === 'priority'
  );
}

async function handleSkill(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const skillArg = input.slice('/skill'.length).trim();
  const skillPorts = context.ports.skill;

  if (!skillPorts) {
    return handled({ output: 'No skills loaded from the standard Neko Skill catalog.' });
  }

  const skills = skillPorts.listEnabled?.() ?? [];
  if (skills.length === 0) {
    return handled({ output: 'No skills available in the standard Neko Skill catalog.' });
  }

  if (skillArg === 'off' || skillArg.startsWith('off ')) {
    const clearTarget = skillArg.slice(3).trim();
    const records = skillPorts.getActiveRecords?.() ?? [];
    if (!clearTarget && records.length > 1) {
      return handled({
        output: `Multiple active Skill lifecycle records. Use /skill off <recordId|slot|skillName>. Active: ${records
          .map((record) => `${record.id} ${record.skillName}[${record.slot}]`)
          .join(', ')}`,
      });
    }
    const scopedTarget = parseSkillClearTarget(clearTarget, records);
    const ok = (await skillPorts.deactivate?.(scopedTarget)) ?? false;
    return handled({ ...(ok ? { output: 'Skill lifecycle record deactivated.' } : {}) });
  }

  if (skillArg) {
    const ok = (await skillPorts.activate?.(skillArg)) ?? false;
    return handled({
      output: ok
        ? `Skill activated: ${skillArg}`
        : `Skill not found: "${skillArg}". Use /skill to browse.`,
    });
  }

  const activeSkillName = skillPorts.getActiveSkillName?.() ?? null;
  const selectedId = await skillPorts.selectSkillFromMenu?.({
    title: 'Select Skill',
    items: [
      ...skills.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
        active: skill.name === activeSkillName,
      })),
      { id: '__off__', label: 'Deactivate', description: 'Clear active skill' },
    ],
  });
  if (!selectedId) {
    return handled();
  }

  if (selectedId === '__off__') {
    const ok = (await skillPorts.deactivate?.()) ?? false;
    return handled({ ...(ok ? { output: 'Skill lifecycle record deactivated.' } : {}) });
  }

  const ok = (await skillPorts.activate?.(selectedId)) ?? false;
  return handled({ ...(ok ? { output: `Skill activated: ${selectedId}` } : {}) });
}

function handleQueue(input: string, context: TuiCommandRouterContext): TuiCommandRouterResult {
  const queuePorts = context.ports.queue;
  if (!queuePorts) {
    return handled({ error: 'Message queue controls are not available for this session.' });
  }

  const args = input.slice('/queue'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';

  try {
    if (subcommand === 'list' || subcommand === 'status') {
      return handled({ output: formatTuiQueueSnapshot(queuePorts.getSnapshot()) });
    }

    const queueItemId = args[1];
    if (!queueItemId) {
      return handled({
        error:
          'Usage: /queue list | /queue promote <id> | /queue cancel <id> | /queue edit <id> <text>',
      });
    }

    if (subcommand === 'promote') {
      const item = queuePorts.promote(queueItemId);
      return handled({ output: `Queued message promoted: ${item.id}` });
    }

    if (subcommand === 'cancel') {
      const item = queuePorts.cancel(queueItemId);
      return handled({ output: `Queued message cancelled: ${item.id}` });
    }

    if (subcommand === 'edit') {
      const content = input
        .slice('/queue'.length)
        .trim()
        .replace(/^edit\s+\S+\s*/i, '')
        .trim();
      if (!content) {
        return handled({ error: 'Usage: /queue edit <id> <text>' });
      }
      const item = queuePorts.edit(queueItemId, content);
      return handled({ output: `Queued message edited: ${item.id}` });
    }
  } catch (error) {
    return handled({ error: formatTuiQueueError(error) });
  }

  return handled({
    error: `Unknown queue command: ${subcommand}. Usage: /queue list | /queue promote <id> | /queue cancel <id> | /queue edit <id> <text>`,
  });
}

async function handleTasks(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const taskPorts = context.ports.task;
  if (!taskPorts) {
    return handled({ error: 'Task status is not available for this session.' });
  }

  const args = input.trim().split(/\s+/).slice(1);
  const subcommand = args[0]?.toLowerCase();
  const statusArg =
    subcommand === 'list' || subcommand === 'status' ? args[1]?.toLowerCase() : subcommand;

  if (statusArg && statusArg !== 'all' && !isTuiTaskStatus(statusArg)) {
    return handled({
      error:
        'Usage: /tasks [pending|running|completed|failed|cancelled|all] or /tasks status [status]',
    });
  }

  const status = isTuiTaskStatus(statusArg) ? statusArg : undefined;
  const tasks = await taskPorts.list(status);
  return handled({ output: formatTaskList(tasks, status) });
}

function isTuiTaskStatus(value: string | undefined): value is TaskStatus {
  return TUI_TASK_STATUSES.includes(value as TaskStatus);
}

function formatTaskList(tasks: readonly Task[], status?: TaskStatus): string {
  if (tasks.length === 0) {
    return status ? `No ${status} tasks.` : 'No tasks.';
  }

  const sortedTasks = [...tasks].sort((left, right) => right.updatedAt - left.updatedAt);
  return [
    status ? `Tasks (${status}):` : 'Tasks:',
    ...sortedTasks.map(formatTaskLine),
    '',
    'Usage: /tasks [pending|running|completed|failed|cancelled|all]',
  ].join('\n');
}

function formatTaskLine(task: Task): string {
  const progress = Number.isFinite(task.progress) ? Math.round(task.progress) : 0;
  const runMode = task.lifecycle?.runMode ?? task.input.lifecycle?.runMode ?? 'foreground';
  const title = readTaskTitle(task);
  const error = task.error ?? task.output?.error;
  return [
    `  ${task.id}`,
    task.status,
    `${progress}%`,
    runMode,
    title,
    error ? `error=${error}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join('  ');
}

function readTaskTitle(task: Task): string {
  const payload = task.input.payload;
  for (const key of ['prompt', 'title', 'name', 'description', 'content'] as const) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return trimTaskTitle(value.trim());
    }
  }
  return task.type;
}

function trimTaskTitle(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

async function handleMcp(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const mcpPorts = context.ports.mcp;
  if (!mcpPorts) {
    return handled({ error: 'MCP controls are not available for this session.' });
  }

  const args = input.slice('/mcp'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'status';

  if (subcommand === 'status' || subcommand === 'list') {
    return handled({ output: formatMcpServerStatus(mcpPorts.listServers()) });
  }

  if (subcommand === 'tools') {
    const serverId = args[1];
    if (serverId && !findMcpServer(mcpPorts.listServers(), serverId)) {
      return handled({ error: `Unknown MCP server: ${serverId}` });
    }
    const listTools = mcpPorts.listTools;
    if (!listTools) {
      return handled({ error: 'MCP tool listing is not available for this session.' });
    }
    const tools = await listTools(serverId);
    return handled({ output: formatMcpTools(tools, serverId) });
  }

  const serverId = args[1];
  if (!serverId) {
    return handled({
      error:
        'Usage: /mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
    });
  }

  const server = findMcpServer(mcpPorts.listServers(), serverId);
  if (!server) {
    return handled({ error: `Unknown MCP server: ${serverId}` });
  }

  try {
    if (subcommand === 'connect') {
      if (!server.enabled) {
        return handled({ error: `MCP server is disabled: ${serverId}` });
      }
      if (!mcpPorts.connect) {
        return handled({ error: 'MCP connect is not available for this session.' });
      }
      await mcpPorts.connect(serverId);
      return handled({ output: `MCP server connected: ${serverId}` });
    }

    if (subcommand === 'disconnect') {
      if (!mcpPorts.disconnect) {
        return handled({ error: 'MCP disconnect is not available for this session.' });
      }
      await mcpPorts.disconnect(serverId);
      return handled({ output: `MCP server disconnected: ${serverId}` });
    }

    if (subcommand === 'reconnect') {
      if (!server.enabled) {
        return handled({ error: `MCP server is disabled: ${serverId}` });
      }
      if (mcpPorts.reconnect) {
        await mcpPorts.reconnect(serverId);
      } else {
        if (!mcpPorts.disconnect || !mcpPorts.connect) {
          return handled({ error: 'MCP reconnect is not available for this session.' });
        }
        await mcpPorts.disconnect(serverId);
        await mcpPorts.connect(serverId);
      }
      return handled({ output: `MCP server reconnected: ${serverId}` });
    }
  } catch (error) {
    return handled({ error: error instanceof Error ? error.message : String(error) });
  }

  return handled({
    error: `Unknown MCP command: ${subcommand}. Usage: /mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>`,
  });
}

function findMcpServer(
  servers: readonly TuiMcpServerSnapshot[],
  serverId: string,
): TuiMcpServerSnapshot | undefined {
  return servers.find((server) => server.id === serverId);
}

function formatMcpServerStatus(servers: readonly TuiMcpServerSnapshot[]): string {
  if (servers.length === 0) {
    return 'No MCP servers configured.';
  }
  const lines = ['MCP Servers:'];
  for (const server of servers) {
    const status = !server.enabled ? 'disabled' : server.connected ? 'connected' : 'disconnected';
    const details = [
      `transport=${server.transport ?? 'unknown'}`,
      server.toolCount !== undefined ? `tools=${server.toolCount}` : undefined,
      server.name !== server.id ? server.name : undefined,
    ].filter((value): value is string => Boolean(value));
    lines.push(`  ${server.id}  ${status}${details.length > 0 ? `  ${details.join('  ')}` : ''}`);
  }
  lines.push(
    '',
    'Usage: /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  );
  return lines.join('\n');
}

function formatMcpTools(tools: readonly string[], serverId: string | undefined): string {
  const scope = serverId ? ` for ${serverId}` : '';
  if (tools.length === 0) {
    return `No MCP tools${scope}.`;
  }
  return [`MCP Tools${scope}:`, ...tools.map((tool) => `  ${tool}`)].join('\n');
}

function handleCapability(input: string, context: TuiCommandRouterContext): TuiCommandRouterResult {
  const capabilityPorts = context.ports.capability;
  if (!capabilityPorts) {
    return handled({ error: 'Capability diagnostics are not available for this session.' });
  }

  const args = input.slice('/capability'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';

  if (subcommand === 'list' || subcommand === 'status') {
    return handled({
      output: formatCapabilityProviderList(
        capabilityPorts.getProviderSummaries(),
        capabilityPorts.getDiagnostics(),
      ),
    });
  }

  if (subcommand === 'show') {
    const providerId = args[1];
    if (!providerId) {
      return handled({ error: 'Usage: /capability show <providerId>' });
    }
    const summary = capabilityPorts
      .getProviderSummaries()
      .find((provider) => provider.providerId === providerId);
    if (!summary) {
      return handled({ error: `Unknown capability provider: ${providerId}` });
    }
    return handled({ output: formatCapabilityProviderSummary(summary) });
  }

  if (subcommand === 'tools') {
    const providerId = args[1];
    if (providerId && !hasCapabilityProvider(capabilityPorts.getProviderSummaries(), providerId)) {
      return handled({ error: `Unknown capability provider: ${providerId}` });
    }
    return handled({
      output: formatCapabilityTools(capabilityPorts.listTools(providerId), providerId),
    });
  }

  return handled({
    error: `Unknown capability command: ${subcommand}. Usage: /capability list | /capability show <providerId> | /capability tools [providerId]`,
  });
}

function hasCapabilityProvider(
  providers: readonly AgentCapabilityProviderAvailabilitySummary[],
  providerId: string,
): boolean {
  return providers.some((provider) => provider.providerId === providerId);
}

function formatCapabilityProviderList(
  providers: readonly AgentCapabilityProviderAvailabilitySummary[],
  diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[],
): string {
  if (providers.length === 0) {
    return diagnostics.length === 0
      ? 'No TUI capability providers registered.'
      : formatCapabilityDiagnostics(diagnostics);
  }

  const lines = ['TUI Capability Providers:'];
  for (const provider of providers) {
    const loadedCount = provider.loaded.length;
    const skippedCount = provider.skipped.length;
    const state = loadedCount > 0 ? 'loaded' : skippedCount > 0 ? 'skipped' : 'empty';
    lines.push(`  ${provider.providerId}  ${state}  loaded=${loadedCount} skipped=${skippedCount}`);
  }
  if (diagnostics.length > 0) {
    lines.push('', ...formatCapabilityDiagnostics(diagnostics).split('\n'));
  }
  lines.push('', 'Usage: /capability show <providerId> | /capability tools [providerId]');
  return lines.join('\n');
}

function formatCapabilityProviderSummary(
  provider: AgentCapabilityProviderAvailabilitySummary,
): string {
  const lines = [`Capability Provider: ${provider.providerId}`];
  if (provider.version) {
    lines.push(`Version: ${provider.version}`);
  }
  lines.push('Loaded:');
  if (provider.loaded.length === 0) {
    lines.push('  (none)');
  } else {
    for (const contribution of provider.loaded) {
      lines.push(`  ${contribution.kind}  ${contribution.name}`);
    }
  }
  lines.push('Skipped:');
  if (provider.skipped.length === 0) {
    lines.push('  (none)');
  } else {
    for (const diagnostic of provider.skipped) {
      lines.push(`  ${formatCapabilityDiagnosticLine(diagnostic)}`);
    }
  }
  return lines.join('\n');
}

function formatCapabilityTools(tools: readonly string[], providerId: string | undefined): string {
  const scope = providerId ? ` for ${providerId}` : '';
  if (tools.length === 0) {
    return `No capability tools${scope}.`;
  }
  return [`Capability Tools${scope}:`, ...tools.map((tool) => `  ${tool}`)].join('\n');
}

function formatCapabilityDiagnostics(
  diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[],
): string {
  if (diagnostics.length === 0) {
    return 'No capability diagnostics.';
  }
  return ['Capability Diagnostics:', ...diagnostics.map(formatCapabilityDiagnosticLine)].join('\n');
}

function formatCapabilityDiagnosticLine(diagnostic: AgentCapabilityAvailabilityDiagnostic): string {
  const name = diagnostic.contributionName ? ` ${diagnostic.contributionName}` : '';
  const requirement = diagnostic.requirement ? ` requirement=${diagnostic.requirement}` : '';
  return `${diagnostic.level} ${diagnostic.providerId} ${diagnostic.contributionKind}${name}: ${diagnostic.reason}${requirement}`;
}

async function handleArtifact(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const artifactPorts = context.ports.artifact;
  if (!artifactPorts) {
    return handled({ error: 'Artifact controls are not available for this session.' });
  }

  const args = input.slice('/artifact'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';

  if (subcommand === 'list') {
    const list = artifactPorts.list;
    if (!list) {
      return handled({ error: 'Artifact listing is not available for this session.' });
    }
    const references = list();
    return handled({ output: formatArtifactList(references) });
  }

  if (subcommand === 'show') {
    const artifactId = args[1];
    if (!artifactId) {
      return handled({ error: 'Usage: /artifact show <id>' });
    }
    const show = artifactPorts.show;
    if (!show) {
      return handled({ error: 'Artifact details are not available for this session.' });
    }
    const reference = show(artifactId);
    if (!reference) {
      return handled({ error: `Unknown artifact reference: ${artifactId}` });
    }
    return handled({ output: formatTuiArtifactReference(reference) });
  }

  if (subcommand === 'open') {
    const artifactId = args[1];
    if (!artifactId) {
      return handled({ error: 'Usage: /artifact open <id>' });
    }
    const open = artifactPorts.open;
    if (!open) {
      return handled({ error: 'Artifact open is not available for this session.' });
    }
    const output = await open(artifactId);
    return handled({ output: output ?? `Artifact open requested: ${artifactId}` });
  }

  if (subcommand === 'send') {
    const target = args[1];
    const artifactId = args[2];
    if (!target || !artifactId) {
      return handled({ error: 'Usage: /artifact send <target> <id>' });
    }
    const send = artifactPorts.send;
    if (!send) {
      return handled({ error: 'Artifact send is not available for this session.' });
    }
    const output = await send(target, artifactId);
    return handled({ output: output ?? `Artifact ${artifactId} sent to ${target}` });
  }

  return handled({
    error: `Unknown artifact command: ${subcommand}. Usage: /artifact list | /artifact show <id> | /artifact open <id> | /artifact send <target> <id>`,
  });
}

function formatArtifactList(references: readonly TuiArtifactReference[]): string {
  if (references.length === 0) {
    return 'No artifact references.';
  }
  return references
    .map((reference) => {
      const id = reference.assetId ?? reference.artifactId ?? reference.ref ?? reference.id;
      const details = [
        reference.path,
        reference.dimensions,
        reference.duration,
        reference.probe,
      ].filter(Boolean);
      return `${id}  ${reference.kind}${details.length > 0 ? `  ${details.join('  ')}` : ''}`;
    })
    .join('\n');
}

function handleStatus(context: TuiCommandRouterContext): TuiCommandRouterResult {
  const snapshot = context.ports.status?.getSnapshot();
  const contextLines = formatContextStatus(context.ports.context?.getTokenCount);

  if (!snapshot) {
    return handled({
      output: [`Model: ${context.slash.config.model}`, ...contextLines].join('\n'),
    });
  }

  return handled({
    output: [
      `Model: ${context.slash.config.model}`,
      ...(snapshot.chatModelIdentity ? [`Model Identity: ${snapshot.chatModelIdentity}`] : []),
      ...(snapshot.sessionMode ? [`Session: ${snapshot.sessionMode}`] : []),
      `Mode: ${snapshot.executionMode}`,
      `Status: ${snapshot.agentStatus}`,
      ...(snapshot.mediaModelSummary ? [`Media: ${snapshot.mediaModelSummary}`] : []),
      ...(snapshot.llmParameterSummary ? [`Params: ${snapshot.llmParameterSummary}`] : []),
      ...(typeof snapshot.tokensTotal === 'number' ? [`Tokens: ${snapshot.tokensTotal}`] : []),
      ...contextLines,
      ...(snapshot.activeSkillSummary ? [`Skills: ${snapshot.activeSkillSummary}`] : []),
      ...(typeof snapshot.queueCount === 'number' ? [`Queue: ${snapshot.queueCount}`] : []),
      ...(snapshot.runningTaskSummary ? [`Task: ${snapshot.runningTaskSummary}`] : []),
    ].join('\n'),
  });
}

async function handleSessionMode(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const modeArg = input.slice('/mode'.length).trim().toLowerCase();
  const modePorts = context.ports.mode;

  if (!modeArg) {
    const current = modePorts?.getSessionMode?.() ?? 'agent';
    return handled({
      output: [
        `Session mode: ${current}`,
        `Available: ${TUI_SESSION_MODES.join(', ')}`,
        'Usage: /mode agent|image|video|audio',
      ].join('\n'),
    });
  }

  if (!isTuiSessionMode(modeArg)) {
    return handled({
      error: `Unsupported session mode: ${modeArg}. Valid: ${TUI_SESSION_MODES.join(', ')}`,
    });
  }

  const setSessionMode = modePorts?.setSessionMode;
  if (!setSessionMode) {
    return handled({ error: 'Session mode switching is not available for this session.' });
  }

  const output = await setSessionMode(modeArg);
  return handled({ output: output ?? `Session mode set to: ${modeArg}` });
}

function isTuiSessionMode(value: string): value is TuiSessionMode {
  return TUI_SESSION_MODES.includes(value as TuiSessionMode);
}

function formatContextStatus(getTokenCount: (() => number) | undefined): string[] {
  if (!getTokenCount) {
    return ['Context: token estimate unavailable'];
  }
  try {
    return [`Context Tokens: ${getTokenCount()}`];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`Context: token estimate unavailable (${reason})`];
  }
}

async function handleCompact(context: TuiCommandRouterContext): Promise<TuiCommandRouterResult> {
  const compact = context.ports.context?.compact;
  if (!compact) {
    return handled({ error: 'Context compaction is not available for this session.' });
  }

  const result = await compact();
  return handled({
    output: `Context compressed: ${result.originalTokens} -> ${result.compressedTokens} tokens (${(result.ratio * 100).toFixed(1)}%)`,
  });
}

async function setMode(
  mode: TuiExecutionMode,
  message: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const setExecutionMode = context.ports.mode?.setExecutionMode;
  if (!setExecutionMode) {
    return handled({ error: `Execution mode switching is not available for this session.` });
  }
  const output = await setExecutionMode(mode);
  return handled({ output: output ?? message });
}

function parseSkillClearTarget(
  target: string,
  records: readonly ActiveSkillLifecycleRecordProjection[],
): TuiSkillClearTarget | undefined {
  if (!target) {
    return undefined;
  }
  const slot = parseLifecycleSlot(target);
  if (slot) {
    return { slot };
  }
  if (records.some((record) => record.id === target)) {
    return { recordId: target };
  }
  return { skillName: target };
}

function parseLifecycleSlot(value: string): SkillLifecycleSlot | null {
  switch (value) {
    case 'stagePersona':
    case 'domainSkill':
    case 'referenceSkill':
    case 'ephemeralSkill':
    case 'promptChainSkill':
      return value;
    default:
      return null;
  }
}

export function createSlashContextWithMedia(
  base: SlashCommandContext,
  input: {
    readonly currentMediaOverrides?: MediaModelOverrides;
    readonly availableMediaModels?: readonly string[];
    readonly defaultMediaModels?: SlashCommandContext['defaultMediaModels'];
  },
): SlashCommandContext {
  return {
    ...base,
    currentMediaOverrides: input.currentMediaOverrides,
    availableMediaModels: input.availableMediaModels ? [...input.availableMediaModels] : undefined,
    defaultMediaModels: input.defaultMediaModels,
  };
}
