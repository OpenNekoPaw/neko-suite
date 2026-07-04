import type {
  AgentCapabilityActivationProgressEvent,
  ExecutorHooks,
  IOperationToolAdapterRegistry,
  IService,
  IToolCategoryRegistry,
  IToolRegistry,
  PromptFragment,
} from '@neko/shared';
import type {
  AgentSessionConfig,
  ExecutionMode,
  ToolConfirmationRequest,
  ValidationError,
  ValidationWarning,
} from '../session';
import type { IRuntimeTaskManager } from '../task';
import type {
  AgentRuntimeSessionFactoryConfig,
  AgentRuntimeSessionFactoryLogger,
} from './agent-session-factory';
import type { ProviderExpressionTargetConfig } from './message-runtime';
import type { SubAgentRuntimeCoordinator } from './subagent-runtime';
import type {
  IArtifactStore,
  ICapabilityRuntime,
  ICreationGuidanceRuntime,
  IFeedbackLoop,
} from './types';
import type { ModelTierResolver, SpecializedAgentPreset } from '../subagent';
import { createDefaultOperationToolAdapterRegistry } from './operation-adapters';
import type { WorkspaceFileIgnoreRules } from '../input/workspace-ignore';

export interface AgentRuntimeHostBindings {
  readonly createService: () => IService;
  readonly toolRegistry: IToolRegistry;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly getCapabilityPromptFragments?: () => readonly PromptFragment[] | undefined;
  readonly syncToolCategories?: (registry: IToolCategoryRegistry) => void;
  readonly getPerceptionClients?: () => AgentSessionConfig['perceptionClients'];
  readonly subAgentRuntime?: SubAgentRuntimeCoordinator;
  readonly modelTierResolver?: ModelTierResolver;
  readonly specializedSubAgentPresets?: Readonly<Record<string, SpecializedAgentPreset>>;
}

export interface AgentRuntimeSessionAssemblyInput extends AgentRuntimeHostBindings {
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
  readonly previousOperationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly createDefaultOperationToolAdapterRegistry?: () => IOperationToolAdapterRegistry;
  readonly locale?: 'en' | 'zh';
  readonly providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly creationGuidance?: ICreationGuidanceRuntime;
  readonly artifactStore?: IArtifactStore;
  readonly feedbackLoop?: IFeedbackLoop;
  readonly projectMemoryFilePath?: string;
  readonly personalPath?: string;
  readonly onConfirmTool?: (request: ToolConfirmationRequest) => Promise<boolean>;
  readonly onValidationWarning?: (warning: ValidationWarning) => void;
  readonly onValidationError?: (error: ValidationError) => void;
  readonly onActivationProgress?: (
    conversationId: string,
    events: readonly AgentCapabilityActivationProgressEvent[],
  ) => void;
  readonly logger?: AgentRuntimeSessionFactoryLogger;
}

/**
 * Assemble the runtime-session factory config from host bindings.
 *
 * Hosts own IO adapters such as VSCode commands, workspace state, and engine
 * clients. The runtime owns the business decision of how those bindings become
 * a configured AgentSession.
 */
export function buildAgentRuntimeSessionFactoryConfig(
  input: AgentRuntimeSessionAssemblyInput,
): AgentRuntimeSessionFactoryConfig {
  const operationToolAdapterRegistry = resolveOperationToolAdapterRegistry(input);
  const capabilityPromptFragments = resolveCapabilityPromptFragments(input);
  const hooks = resolveHooks(input);
  const perceptionClients = input.getPerceptionClients?.();

  return {
    service: input.createService(),
    createService: input.createService,
    toolRegistry: input.toolRegistry,
    systemPrompt: input.systemPrompt,
    maxIterations: input.maxIterations,
    temperature: input.temperature,
    topP: input.topP,
    maxTokens: input.maxTokens,
    providerId: input.providerId,
    modelId: input.modelId,
    modelCapabilities: input.modelCapabilities,
    thinkingBudget: input.thinkingBudget,
    providerOptions: input.providerOptions,
    executionMode: input.executionMode,
    hooks,
    workspaceRoot: input.workspaceRoot,
    authorizedReadRoots: input.authorizedReadRoots,
    workspaceIgnoreRules: input.workspaceIgnoreRules,
    taskManager: input.taskManager,
    conversationId: input.conversationId,
    operationToolAdapterRegistry,
    locale: input.locale,
    providerExpressionTargets: input.providerExpressionTargets,
    capabilityRuntime: input.capabilityRuntime,
    capabilityPromptFragments,
    toolCategoryRegistry: input.toolCategoryRegistry,
    creationGuidance: input.creationGuidance,
    artifactStore: input.artifactStore,
    feedbackLoop: input.feedbackLoop,
    projectMemoryFilePath: input.projectMemoryFilePath,
    personalPath: input.personalPath,
    perceptionClients,
    subAgentRuntime: input.subAgentRuntime,
    modelTierResolver: input.modelTierResolver,
    specializedSubAgentPresets: input.specializedSubAgentPresets,
    syncToolCategories: input.syncToolCategories,
    onConfirmTool: input.onConfirmTool,
    onValidationWarning: input.onValidationWarning,
    onValidationError: input.onValidationError,
    onActivationProgress: input.onActivationProgress,
    logger: input.logger,
  };
}

function resolveOperationToolAdapterRegistry(
  input: AgentRuntimeSessionAssemblyInput,
): IOperationToolAdapterRegistry | undefined {
  if (input.operationToolAdapterRegistry) {
    return input.operationToolAdapterRegistry;
  }
  if (input.previousOperationToolAdapterRegistry) {
    return input.previousOperationToolAdapterRegistry;
  }
  return (
    input.createDefaultOperationToolAdapterRegistry?.() ??
    createDefaultOperationToolAdapterRegistry()
  );
}

function resolveCapabilityPromptFragments(
  input: AgentRuntimeSessionAssemblyInput,
): readonly PromptFragment[] | undefined {
  try {
    const fragments = input.getCapabilityPromptFragments?.();
    return fragments && fragments.length > 0 ? fragments : undefined;
  } catch (error) {
    input.logger?.warn('Failed to resolve capability prompt fragments:', error);
    return undefined;
  }
}

function resolveHooks(
  input: Pick<AgentRuntimeSessionAssemblyInput, 'hooks'>,
): readonly ExecutorHooks[] {
  return input.hooks ?? [];
}
