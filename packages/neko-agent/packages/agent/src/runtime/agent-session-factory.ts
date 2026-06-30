import * as nodePath from 'node:path';
import type {
  ExecutorHooks,
  IOperationToolAdapterRegistry,
  IProjectMemoryManager,
  IService,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IToolRegistry,
  PromptFragment,
  ProviderCard,
} from '@neko/shared';
import {
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  type SystemPromptBuilder,
} from '../prompt';
import { createProviderExpressionPromptFragments } from '../provider';
import { createFileProjectMemoryManager } from '../memory';
import { createCoreTools } from '../tools';
import { createTaskManagerIdcTaskProjection, type IRuntimeTaskManager } from '../task';
import type {
  AgentSessionConfig,
  ExecutionMode,
  ValidationError,
  ValidationWarning,
  ToolConfirmationRequest,
} from '../session';
import { createAgentSessionWithRuntime } from './session-config-projection';
import { createNodeArtifactStore } from './node-artifact-store';
import type {
  AgentRuntimeConfig,
  IArtifactStore,
  ICapabilityRuntime,
  IFeedbackLoop,
} from './types';
import type { ProviderExpressionTargetConfig } from './message-runtime';
import {
  SubAgentRuntimeCoordinator,
  type AgentSubAgentRuntimeRegistration,
} from './subagent-runtime';
import type { ModelTierResolver } from '../subagent';
import type { WorkspaceFileIgnoreRules } from '../input/workspace-ignore';

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
  readonly artifactStore?: IArtifactStore;
  readonly feedbackLoop?: IFeedbackLoop;
  readonly projectMemoryFilePath?: string;
  readonly personalPath?: string;
  readonly perceptionClients?: AgentSessionConfig['perceptionClients'];
  readonly subAgentRuntime?: SubAgentRuntimeCoordinator;
  readonly modelTierResolver?: ModelTierResolver;
  readonly syncToolCategories?: (registry: IToolCategoryRegistry) => void;
  readonly onConfirmTool?: (request: ToolConfirmationRequest) => Promise<boolean>;
  readonly onValidationWarning?: (warning: ValidationWarning) => void;
  readonly onValidationError?: (error: ValidationError) => void;
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

  const toolCategoryRegistry =
    config.toolCategoryRegistry ?? config.capabilityRuntime?.toolCategoryRegistry;
  syncToolCategories(config, toolCategoryRegistry);

  const promptFragments = resolveAgentRuntimePromptFragments(config);
  const effectiveSystemPrompt = resolveSystemPrompt(promptBuilder, config.systemPrompt);
  const agentsOverride = promptBuilder.buildAgentsOverlay() ?? undefined;
  const feedbackLoop = buildFeedbackLoop(config.feedbackLoop, projectMemoryManager);

  registerSubAgentRuntime(config, promptFragments, toolCategoryRegistry, feedbackLoop);

  const session = createAgentSessionWithRuntime({
    service: config.service,
    toolRegistry: config.toolRegistry,
    systemPrompt: effectiveSystemPrompt,
    ...(agentsOverride !== undefined ? { agentsOverride } : {}),
    executionMode: config.executionMode ?? 'auto',
    maxIterations: config.maxIterations,
    temperature: config.temperature,
    topP: config.topP,
    maxTokens: config.maxTokens,
    thinkingBudget: config.thinkingBudget,
    providerOptions: config.providerOptions,
    providerId: config.providerId,
    modelId: config.modelId,
    modelCapabilities: config.modelCapabilities,
    hooks: config.hooks && config.hooks.length > 0 ? [...config.hooks] : undefined,
    runtime: buildAgentRuntimeConfig(config, promptFragments, toolCategoryRegistry, feedbackLoop),
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    ...(config.perceptionClients ? { perceptionClients: config.perceptionClients } : {}),
    ...(config.onConfirmTool ? { onConfirmTool: config.onConfirmTool } : {}),
    ...(config.onValidationWarning ? { onValidationWarning: config.onValidationWarning } : {}),
    ...(config.onValidationError ? { onValidationError: config.onValidationError } : {}),
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
  const toolCategoryRegistry =
    config.toolCategoryRegistry ?? config.capabilityRuntime?.toolCategoryRegistry;
  registerCoreRuntimeTools(
    config.toolRegistry,
    config.workspaceRoot,
    config.authorizedReadRoots,
    config.workspaceIgnoreRules,
    handle.projectMemoryManager,
  );
  syncToolCategories(config, toolCategoryRegistry);

  const promptFragments = resolveAgentRuntimePromptFragments(config);
  const feedbackLoop = buildFeedbackLoop(config.feedbackLoop, handle.projectMemoryManager);
  registerSubAgentRuntime(config, promptFragments, toolCategoryRegistry, feedbackLoop);

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
      thinkingBudget: config.thinkingBudget,
      providerOptions: config.providerOptions,
      maxIterations: config.maxIterations,
      executionMode: config.executionMode ?? 'auto',
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

export function resolveAgentRuntimePromptFragments(
  config: Pick<
    AgentRuntimeSessionFactoryConfig,
    'capabilityPromptFragments' | 'capabilityRuntime' | 'providerExpressionTargets'
  >,
): readonly PromptFragment[] | undefined {
  const capabilityFragments = config.capabilityPromptFragments ?? [];
  const providerCards = config.capabilityRuntime?.providerCardRegistry?.list() ?? [];
  const providerFragments = resolveProviderExpressionFragments(
    providerCards,
    config.providerExpressionTargets,
  );
  const fragments = [...capabilityFragments, ...providerFragments];
  return fragments.length > 0 ? fragments : undefined;
}

function resolveProviderExpressionFragments(
  providerCards: readonly ProviderCard[],
  targets: readonly ProviderExpressionTargetConfig[] | undefined,
): readonly PromptFragment[] {
  const selectedTargets = targets?.filter((target) => target.providerId || target.modelId) ?? [];
  if (selectedTargets.length === 0) {
    return createProviderExpressionPromptFragments({ cards: providerCards, mode: 'candidates' });
  }

  return selectedTargets.flatMap((target) =>
    createProviderExpressionPromptFragments({
      cards: providerCards,
      mode: 'selected',
      capability: target.capability,
      ...(target.providerId ? { providerId: target.providerId } : {}),
      ...(target.modelId ? { modelId: target.modelId } : {}),
      fragmentId: `provider:expression-context:${target.capability}`,
    }),
  );
}

function buildFeedbackLoop(
  feedbackLoop: IFeedbackLoop | undefined,
  projectMemoryManager: IProjectMemoryManager | undefined,
): IFeedbackLoop | undefined {
  const loop = {
    ...(feedbackLoop ?? {}),
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
  };
  return Object.keys(loop).length > 0 ? loop : undefined;
}

function buildAgentRuntimeConfig(
  config: AgentRuntimeSessionFactoryConfig,
  promptFragments: readonly PromptFragment[] | undefined,
  toolCategoryRegistry: IToolCategoryRegistry | undefined,
  feedbackLoop: IFeedbackLoop | undefined,
): AgentRuntimeConfig {
  return {
    workflowRuntime: {
      ...(config.capabilityRuntime?.skillRegistry ||
      config.capabilityRuntime?.skillService ||
      config.capabilityRuntime?.skillLifecycleRuntime
        ? {
            stageTracking: {
              ...(config.capabilityRuntime.skillRegistry
                ? { skillRegistry: config.capabilityRuntime.skillRegistry }
                : {}),
              ...(config.capabilityRuntime.skillService
                ? { skillService: config.capabilityRuntime.skillService }
                : {}),
              ...(config.capabilityRuntime.skillLifecycleRuntime
                ? { skillLifecycleRuntime: config.capabilityRuntime.skillLifecycleRuntime }
                : {}),
            },
          }
        : {}),
      ...(config.taskManager
        ? {
            idcTaskProjection: createTaskManagerIdcTaskProjection({
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
    ...(feedbackLoop ? { feedbackLoop } : {}),
  };
}

function registerSubAgentRuntime(
  config: AgentRuntimeSessionUpdateConfig,
  promptFragments: readonly PromptFragment[] | undefined,
  toolCategoryRegistry: IToolCategoryRegistry | undefined,
  feedbackLoop: IFeedbackLoop | undefined,
): void {
  const coordinator = config.subAgentRuntime;
  if (!coordinator) {
    return;
  }

  coordinator.ensureSystem({
    createService: config.createService,
    toolRegistry: config.toolRegistry,
    ...(config.capabilityRuntime ? { capabilityRuntime: config.capabilityRuntime } : {}),
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
    ...(feedbackLoop ? { feedbackLoop } : {}),
    ...(config.perceptionClients ? { perceptionClients: config.perceptionClients } : {}),
  };
  coordinator.registerRuntime(registration);
}
