import * as nodePath from 'node:path';
import type {
  AgentCapabilityActivationProgressEvent,
  ExecutorHooks,
  IOperationToolAdapterRegistry,
  IProjectMemoryManager,
  IProviderExpressionProfileRegistry,
  IService,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IToolRegistry,
  PromptFragment,
  ProviderCard,
  ProviderExpressionProfileDescriptor,
} from '@neko/shared';
import {
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  type SystemPromptBuilder,
} from '../../prompt';
import { createProviderExpressionPromptFragments } from '../../provider';
import { createFileProjectMemoryManager } from '../../memory';
import { createCoreTools } from '../../tools';
import { createTaskManagerCreationTaskProjection, type IRuntimeTaskManager } from '../../task';
import type {
  AgentSessionConfig,
  ExecutionMode,
  ValidationError,
  ValidationWarning,
  ToolConfirmationRequest,
} from '../../session';
import { createAgentSessionWithRuntime } from './session-config-projection';
import { createNodeArtifactStore } from '../../artifact/node-artifact-store';
import type {
  AgentRuntimeConfig,
  IArtifactStore,
  ICapabilityRuntime,
  ICreationGuidanceRuntime,
  IValidationLoop,
} from '../types';
import type { ProviderExpressionTargetConfig } from '../turn/message-runtime';
import {
  SubAgentRuntimeCoordinator,
  type AgentSubAgentRuntimeRegistration,
} from '../subagent-runtime';
import type { ModelTierResolver, SpecializedAgentPreset } from '../../subagent';
import type { WorkspaceFileIgnoreRules } from '../../input/workspace-ignore';

export interface AgentRuntimeSessionFactoryLogger {
  warn(message: string, error?: unknown): void;
  error?(message: string, details?: unknown): void;
}

export interface AgentRuntimeSessionFactoryConfig {
  readonly service: IService;
  readonly createService: () => IService;
  readonly toolRegistry: IToolRegistry;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly contextSettings?: AgentSessionConfig['contextSettings'];
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelCapabilities?: readonly string[];
  readonly thinkingBudget?: number;
  readonly providerOptions?: Record<string, unknown>;
  readonly executionMode?: ExecutionMode;
  readonly hooks?: readonly ExecutorHooks[];
  readonly workspaceRoot?: string;
  readonly authorizedReadRoots?: readonly string[];
  readonly workspaceIgnoreRules?: WorkspaceFileIgnoreRules;
  readonly taskManager?: IRuntimeTaskManager;
  readonly conversationId?: string;
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly locale?: 'en' | 'zh';
  readonly providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly capabilityPromptFragments?: readonly PromptFragment[];
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly creationGuidance?: ICreationGuidanceRuntime;
  readonly artifactStore?: IArtifactStore;
  readonly validationLoop?: IValidationLoop;
  readonly projectMemoryFilePath?: string;
  readonly personalPath?: string;
  readonly perceptionClients?: AgentSessionConfig['perceptionClients'];
  readonly subAgentRuntime?: SubAgentRuntimeCoordinator;
  readonly modelTierResolver?: ModelTierResolver;
  readonly specializedSubAgentPresets?: Readonly<Record<string, SpecializedAgentPreset>>;
  readonly syncToolCategories?: (registry: IToolCategoryRegistry) => void;
  readonly onConfirmTool?: (request: ToolConfirmationRequest) => Promise<boolean>;
  readonly onValidationWarning?: (warning: ValidationWarning) => void;
  readonly onValidationError?: (error: ValidationError) => void;
  readonly onActivationProgress?: (
    conversationId: string,
    events: readonly AgentCapabilityActivationProgressEvent[],
  ) => void;
  readonly logger?: AgentRuntimeSessionFactoryLogger;
}

export interface AgentRuntimeSessionUpdateConfig extends Omit<
  AgentRuntimeSessionFactoryConfig,
  'service' | 'hooks' | 'onConfirmTool'
> {}

export interface AgentRuntimeSessionHandle {
  session: ReturnType<typeof createAgentSessionWithRuntime>;
  promptBuilder: SystemPromptBuilder;
  projectMemoryManager?: IProjectMemoryManager;
  toolGroupRegistry?: IToolGroupRegistry;
  toolCategoryRegistry?: IToolCategoryRegistry;
  operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  promptFragments?: readonly PromptFragment[];
  conversationId?: string;
  effectiveSystemPrompt: string;
  agentsOverride?: string;
  subAgentRuntime?: SubAgentRuntimeCoordinator;
}

export interface AgentRuntimeSessionUpdate {
  readonly sessionConfig: Partial<AgentSessionConfig>;
  readonly promptFragments?: readonly PromptFragment[];
}

export async function createAgentRuntimeSession(
  config: AgentRuntimeSessionFactoryConfig,
): Promise<AgentRuntimeSessionHandle> {
  const promptBuilder = createSystemPromptBuilder({
    locale: config.locale ?? 'en',
    mode: config.executionMode === 'plan' ? 'plan' : 'default',
  });

  if (config.workspaceRoot) {
    try {
      await promptBuilder.loadAgentsFile(
        config.workspaceRoot,
        config.personalPath ?? getDefaultPersonalPath(),
      );
    } catch (err) {
      config.logger?.warn('Failed to load AGENTS.md:', err);
    }
  }

  const projectMemoryManager = await initializeProjectMemory(config);
  registerCoreRuntimeTools(
    config.toolRegistry,
    config.workspaceRoot,
    config.authorizedReadRoots,
    config.workspaceIgnoreRules,
    projectMemoryManager,
  );

  const toolCategoryRegistry = resolveRuntimeToolCategoryRegistry(config);
  syncToolCategories(config, toolCategoryRegistry);

  const promptFragments = resolveAgentRuntimePromptFragments(config);
  const effectiveSystemPrompt = resolveSystemPrompt(promptBuilder, config.systemPrompt);
  const agentsOverride = promptBuilder.buildAgentsOverlay() ?? undefined;
  const validationLoop = buildValidationLoop(config.validationLoop, projectMemoryManager);

  registerSubAgentRuntime(config, promptFragments, toolCategoryRegistry, validationLoop);

  const session = createAgentSessionWithRuntime({
    service: config.service,
    toolRegistry: config.toolRegistry,
    systemPrompt: effectiveSystemPrompt,
    locale: config.locale ?? 'en',
    ...(agentsOverride !== undefined ? { agentsOverride } : {}),
    executionMode: config.executionMode ?? 'auto',
    maxIterations: config.maxIterations,
    temperature: config.temperature,
    topP: config.topP,
    maxTokens: config.maxTokens,
    contextSettings: config.contextSettings,
    thinkingBudget: config.thinkingBudget,
    providerOptions: config.providerOptions,
    providerId: config.providerId,
    modelId: config.modelId,
    modelCapabilities: config.modelCapabilities,
    hooks: config.hooks && config.hooks.length > 0 ? [...config.hooks] : undefined,
    runtime: buildAgentRuntimeConfig(config, promptFragments, toolCategoryRegistry, validationLoop),
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    ...(config.perceptionClients ? { perceptionClients: config.perceptionClients } : {}),
    ...(config.onConfirmTool ? { onConfirmTool: config.onConfirmTool } : {}),
    ...(config.onValidationWarning ? { onValidationWarning: config.onValidationWarning } : {}),
    ...(config.onValidationError ? { onValidationError: config.onValidationError } : {}),
    ...(config.onActivationProgress ? { onActivationProgress: config.onActivationProgress } : {}),
  });

  return {
    session,
    promptBuilder,
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
    ...(config.capabilityRuntime?.toolGroupRegistry
      ? { toolGroupRegistry: config.capabilityRuntime.toolGroupRegistry }
      : {}),
    ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
    ...(config.operationToolAdapterRegistry
      ? { operationToolAdapterRegistry: config.operationToolAdapterRegistry }
      : {}),
    ...(promptFragments ? { promptFragments } : {}),
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    effectiveSystemPrompt,
    ...(agentsOverride !== undefined ? { agentsOverride } : {}),
    ...(config.subAgentRuntime ? { subAgentRuntime: config.subAgentRuntime } : {}),
  };
}

export function updateAgentRuntimeSession(
  handle: AgentRuntimeSessionHandle,
  config: AgentRuntimeSessionUpdateConfig,
): AgentRuntimeSessionUpdate {
  const toolCategoryRegistry = resolveRuntimeToolCategoryRegistry(config);
  registerCoreRuntimeTools(
    config.toolRegistry,
    config.workspaceRoot,
    config.authorizedReadRoots,
    config.workspaceIgnoreRules,
    handle.projectMemoryManager,
  );
  syncToolCategories(config, toolCategoryRegistry);

  const promptFragments = resolveAgentRuntimePromptFragments(config);
  const validationLoop = buildValidationLoop(config.validationLoop, handle.projectMemoryManager);
  registerSubAgentRuntime(config, promptFragments, toolCategoryRegistry, validationLoop);

  handle.promptFragments = promptFragments;
  handle.toolCategoryRegistry = toolCategoryRegistry;
  handle.toolGroupRegistry = config.capabilityRuntime?.toolGroupRegistry;
  handle.operationToolAdapterRegistry = config.operationToolAdapterRegistry;
  handle.conversationId = config.conversationId;
  handle.effectiveSystemPrompt = resolveSystemPrompt(handle.promptBuilder, config.systemPrompt);
  handle.agentsOverride = handle.promptBuilder.buildAgentsOverlay() ?? undefined;

  return {
    sessionConfig: {
      systemPrompt: handle.effectiveSystemPrompt,
      providerId: config.providerId,
      modelId: config.modelId,
      modelCapabilities: config.modelCapabilities,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      contextSettings: config.contextSettings,
      thinkingBudget: config.thinkingBudget,
      providerOptions: config.providerOptions,
      locale: config.locale,
      maxIterations: config.maxIterations,
      executionMode: config.executionMode ?? 'auto',
      onActivationProgress: config.onActivationProgress,
    },
    ...(promptFragments ? { promptFragments } : {}),
  };
}

export function unregisterAgentRuntimeSession(handle: AgentRuntimeSessionHandle): void {
  handle.subAgentRuntime?.unregisterRuntime(handle.conversationId);
}

function resolveSystemPrompt(builder: SystemPromptBuilder, override: string | undefined): string {
  if (override) {
    return override;
  }
  return builder.buildBaseOnly();
}

async function initializeProjectMemory(
  config: AgentRuntimeSessionFactoryConfig,
): Promise<IProjectMemoryManager | undefined> {
  if (!config.workspaceRoot && !config.projectMemoryFilePath) {
    return undefined;
  }

  try {
    const memoryFilePath =
      config.projectMemoryFilePath ??
      nodePath.join(config.workspaceRoot ?? '', '.neko', 'memory.md');
    const memoryManager = createFileProjectMemoryManager(memoryFilePath);
    await memoryManager.load();
    return memoryManager;
  } catch (err) {
    config.logger?.warn('Failed to initialize project memory:', err);
    return undefined;
  }
}

function registerCoreRuntimeTools(
  toolRegistry: IToolRegistry,
  workspaceRoot: string | undefined,
  authorizedReadRoots: readonly string[] | undefined,
  workspaceIgnoreRules: WorkspaceFileIgnoreRules | undefined,
  projectMemoryManager: IProjectMemoryManager | undefined,
): void {
  const coreTools = createCoreTools({
    defaultCwd: workspaceRoot,
    authorizedReadRoots,
    workspaceIgnoreRules,
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
  });

  for (const tool of coreTools) {
    toolRegistry.register(tool);
  }
}

function syncToolCategories(
  config: Pick<AgentRuntimeSessionFactoryConfig, 'syncToolCategories' | 'logger'>,
  registry: IToolCategoryRegistry | undefined,
): void {
  if (!registry) {
    return;
  }

  try {
    config.syncToolCategories?.(registry);
  } catch (err) {
    config.logger?.warn('Failed to sync capability tool categories:', err);
  }
}

function resolveRuntimeToolCategoryRegistry(
  config: Pick<AgentRuntimeSessionFactoryConfig, 'capabilityRuntime' | 'toolCategoryRegistry'>,
): IToolCategoryRegistry | undefined {
  return config.capabilityRuntime?.toolCategoryRegistry ?? config.toolCategoryRegistry;
}

export function resolveAgentRuntimePromptFragments(
  config: Pick<
    AgentRuntimeSessionFactoryConfig,
    'capabilityPromptFragments' | 'capabilityRuntime' | 'providerExpressionTargets' | 'locale'
  >,
): readonly PromptFragment[] | undefined {
  const capabilityFragments = config.capabilityPromptFragments ?? [];
  const providerCards = config.capabilityRuntime?.providerCardRegistry?.list() ?? [];
  const providerFragments = resolveProviderExpressionFragments(
    providerCards,
    config.providerExpressionTargets,
    config.locale,
  );
  const profileFragments = resolveProviderExpressionProfileFragments(
    config.providerExpressionTargets,
    config.capabilityRuntime?.providerExpressionProfileRegistry,
  );
  const fragments = [...capabilityFragments, ...providerFragments, ...profileFragments];
  return fragments.length > 0 ? fragments : undefined;
}

function resolveProviderExpressionFragments(
  providerCards: readonly ProviderCard[],
  targets: readonly ProviderExpressionTargetConfig[] | undefined,
  locale: AgentRuntimeSessionFactoryConfig['locale'],
): readonly PromptFragment[] {
  const selectedTargets = targets?.filter((target) => target.providerId || target.modelId) ?? [];
  if (selectedTargets.length === 0) {
    return createProviderExpressionPromptFragments({
      cards: providerCards,
      mode: 'candidates',
      locale,
    });
  }

  return selectedTargets.flatMap((target) =>
    createProviderExpressionPromptFragments({
      cards: providerCards,
      mode: 'selected',
      capability: target.capability,
      ...(target.providerId ? { providerId: target.providerId } : {}),
      ...(target.modelId ? { modelId: target.modelId } : {}),
      fragmentId: `provider:expression-context:${target.capability}`,
      locale,
    }),
  );
}

function resolveProviderExpressionProfileFragments(
  targets: readonly ProviderExpressionTargetConfig[] | undefined,
  registry: Pick<IProviderExpressionProfileRegistry, 'get'> | undefined,
): readonly PromptFragment[] {
  const selectedTargets =
    targets?.filter((target) => target.providerExpressionProfileId) ?? [];
  if (selectedTargets.length === 0) return [];

  return selectedTargets.map((target) => {
    const profileId = target.providerExpressionProfileId as string;
    const profile = registry?.get(profileId);
    if (!profile) {
      return createProviderExpressionProfileDiagnosticFragment(
        profileId,
        'missing-profile-descriptor',
        `Referenced provider expression profile "${profileId}" is not registered.`,
      );
    }
    if (!matchesProviderExpressionTarget(profile, target)) {
      return createProviderExpressionProfileDiagnosticFragment(
        profileId,
        'incompatible-profile-target',
        `Provider expression profile "${profileId}" does not match selected target ${target.providerId}/${target.modelId}.`,
      );
    }
    return createProviderExpressionProfileFragment(profile, target);
  });
}

function createProviderExpressionProfileFragment(
  profile: ProviderExpressionProfileDescriptor,
  target: ProviderExpressionTargetConfig,
): PromptFragment {
  const targetName = `${target.providerId}/${target.modelId}`;
  return {
    id: `provider:expression-profile:${sanitizeFragmentId(profile.profileId)}:${target.capability}`,
    priority: 86,
    content: [
      `Provider expression profile resolved: ${profile.profileId}@${profile.version}.`,
      `Selected target: ${targetName}; capability: ${target.capability}.`,
      ...(profile.syntaxProfile.notes.length > 0
        ? [`Syntax notes: ${profile.syntaxProfile.notes.join(' ')}`]
        : []),
    ].join('\n'),
  };
}

function createProviderExpressionProfileDiagnosticFragment(
  profileId: string,
  reason: 'missing-profile-descriptor' | 'incompatible-profile-target',
  message: string,
): PromptFragment {
  return {
    id: `provider:expression-profile:diagnostic:${sanitizeFragmentId(profileId)}`,
    priority: 86,
    content: [
      'Provider expression profile diagnostic.',
      `Reason: ${reason}.`,
      message,
      'Continue only with provider-neutral expression guidance for this target.',
    ].join('\n'),
  };
}

function matchesProviderExpressionTarget(
  profile: ProviderExpressionProfileDescriptor,
  target: ProviderExpressionTargetConfig,
): boolean {
  if (profile.providerId !== target.providerId) return false;
  return !profile.modelId || profile.modelId === target.modelId;
}

function sanitizeFragmentId(value: string): string {
  return value.replace(/[^a-z0-9._:-]+/gi, '-');
}

function buildValidationLoop(
  validationLoop: IValidationLoop | undefined,
  projectMemoryManager: IProjectMemoryManager | undefined,
): IValidationLoop | undefined {
  const loop = {
    ...(validationLoop ?? {}),
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
  };
  return Object.keys(loop).length > 0 ? loop : undefined;
}

function buildAgentRuntimeConfig(
  config: AgentRuntimeSessionFactoryConfig,
  promptFragments: readonly PromptFragment[] | undefined,
  toolCategoryRegistry: IToolCategoryRegistry | undefined,
  validationLoop: IValidationLoop | undefined,
): AgentRuntimeConfig {
  const runtimeStageTracking =
    config.capabilityRuntime?.skillRegistry ||
    config.capabilityRuntime?.skillService ||
    config.capabilityRuntime?.skillLifecycleRuntime
      ? {
          ...(config.creationGuidance?.stageTracking ?? {}),
          ...(config.capabilityRuntime.skillRegistry
            ? { skillRegistry: config.capabilityRuntime.skillRegistry }
            : {}),
          ...(config.capabilityRuntime.skillService
            ? { skillService: config.capabilityRuntime.skillService }
            : {}),
          ...(config.capabilityRuntime.skillLifecycleRuntime
            ? { skillLifecycleRuntime: config.capabilityRuntime.skillLifecycleRuntime }
            : {}),
        }
      : config.creationGuidance?.stageTracking;

  return {
    creationGuidance: {
      ...(config.creationGuidance ?? {}),
      ...(runtimeStageTracking ? { stageTracking: runtimeStageTracking } : {}),
      ...(config.taskManager
        ? {
            creationTaskProjection: createTaskManagerCreationTaskProjection({
              store: config.taskManager,
            }),
          }
        : {}),
    },
    capabilityRuntime: {
      ...(config.capabilityRuntime?.skillService
        ? { skillService: config.capabilityRuntime.skillService }
        : {}),
      ...(config.capabilityRuntime?.skillLifecycleRuntime
        ? { skillLifecycleRuntime: config.capabilityRuntime.skillLifecycleRuntime }
        : {}),
      ...(config.capabilityRuntime?.skillRegistry
        ? { skillRegistry: config.capabilityRuntime.skillRegistry }
        : {}),
      ...(config.capabilityRuntime?.toolGroupRegistry
        ? { toolGroupRegistry: config.capabilityRuntime.toolGroupRegistry }
        : {}),
      ...(promptFragments !== undefined ? { promptFragments } : {}),
      ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
      ...(config.capabilityRuntime?.providerCardRegistry
        ? { providerCardRegistry: config.capabilityRuntime.providerCardRegistry }
        : {}),
      ...(config.capabilityRuntime?.artifactProfileRegistry
        ? { artifactProfileRegistry: config.capabilityRuntime.artifactProfileRegistry }
        : {}),
      ...(config.capabilityRuntime?.creationProfileRegistry
        ? { creationProfileRegistry: config.capabilityRuntime.creationProfileRegistry }
        : {}),
      ...(config.capabilityRuntime?.providerExpressionProfileRegistry
        ? {
            providerExpressionProfileRegistry:
              config.capabilityRuntime.providerExpressionProfileRegistry,
          }
        : {}),
      ...(config.capabilityRuntime?.externalProcessorRuntime
        ? { externalProcessorRuntime: config.capabilityRuntime.externalProcessorRuntime }
        : {}),
      ...(config.capabilityRuntime?.contentAccessRuntime
        ? { contentAccessRuntime: config.capabilityRuntime.contentAccessRuntime }
        : {}),
      ...(config.operationToolAdapterRegistry
        ? { operationToolAdapterRegistry: config.operationToolAdapterRegistry }
        : {}),
    },
    artifactStore:
      config.artifactStore ??
      createNodeArtifactStore({
        ...(config.workspaceRoot ? { workspaceRoot: config.workspaceRoot } : {}),
      }),
    ...(validationLoop ? { validationLoop } : {}),
  };
}

function registerSubAgentRuntime(
  config: AgentRuntimeSessionUpdateConfig,
  promptFragments: readonly PromptFragment[] | undefined,
  toolCategoryRegistry: IToolCategoryRegistry | undefined,
  validationLoop: IValidationLoop | undefined,
): void {
  const coordinator = config.subAgentRuntime;
  if (!coordinator) {
    return;
  }

  coordinator.ensureSystem({
    createService: config.createService,
    toolRegistry: config.toolRegistry,
    ...(config.capabilityRuntime ? { capabilityRuntime: config.capabilityRuntime } : {}),
    ...(config.specializedSubAgentPresets
      ? { specializedPresets: config.specializedSubAgentPresets }
      : {}),
  });

  const registration: AgentSubAgentRuntimeRegistration = {
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    ...(config.workspaceRoot ? { workspaceRoot: config.workspaceRoot } : {}),
    ...(config.authorizedReadRoots ? { authorizedReadRoots: config.authorizedReadRoots } : {}),
    ...(config.workspaceIgnoreRules ? { workspaceIgnoreRules: config.workspaceIgnoreRules } : {}),
    createService: config.createService,
    toolRegistry: config.toolRegistry,
    ...(config.providerId ? { providerId: config.providerId } : {}),
    ...(config.modelId ? { modelId: config.modelId } : {}),
    ...(config.modelTierResolver ? { modelTierResolver: config.modelTierResolver } : {}),
    ...(config.capabilityRuntime ? { capabilityRuntime: config.capabilityRuntime } : {}),
    ...(promptFragments !== undefined ? { promptFragments } : {}),
    ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
    ...(config.operationToolAdapterRegistry
      ? { operationToolAdapterRegistry: config.operationToolAdapterRegistry }
      : {}),
    ...(config.artifactStore ? { artifactStore: config.artifactStore } : {}),
    ...(validationLoop ? { validationLoop } : {}),
    ...(config.perceptionClients ? { perceptionClients: config.perceptionClients } : {}),
  };
  coordinator.registerRuntime(registration);
}
