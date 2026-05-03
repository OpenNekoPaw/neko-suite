import type {
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
import type { IArtifactStore, ICapabilityRuntime, IFeedbackLoop } from './types';
import type { ModelTierResolver } from '../subagent';
import { createDefaultOperationToolAdapterRegistry } from './operation-adapters';

export interface AgentRuntimeHookSource {
  getHooks(): readonly ExecutorHooks[];
}

export interface AgentRuntimeHostBindings {
  readonly createService: () => IService;
  readonly toolRegistry: IToolRegistry;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly getCapabilityPromptFragments?: () => readonly PromptFragment[] | undefined;
  readonly syncToolCategories?: (registry: IToolCategoryRegistry) => void;
  readonly getPerceptionClients?: () => AgentSessionConfig['perceptionClients'];
  readonly subAgentRuntime?: SubAgentRuntimeCoordinator;
  readonly modelTierResolver?: ModelTierResolver;
}

export interface AgentRuntimeSessionAssemblyInput extends AgentRuntimeHostBindings {
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly modelId?: string;
  readonly thinkingBudget?: number;
  readonly executionMode?: ExecutionMode;
  readonly hooks?: readonly ExecutorHooks[];
  readonly hookSource?: AgentRuntimeHookSource;
  readonly workspaceRoot?: string;
  readonly taskManager?: IRuntimeTaskManager;
  readonly conversationId?: string;
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly previousOperationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly createDefaultOperationToolAdapterRegistry?: () => IOperationToolAdapterRegistry;
  readonly locale?: 'en' | 'zh';
  readonly providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly artifactStore?: IArtifactStore;
  readonly feedbackLoop?: IFeedbackLoop;
  readonly projectMemoryFilePath?: string;
  readonly personalPath?: string;
  readonly onConfirmTool?: (request: ToolConfirmationRequest) => Promise<boolean>;
  readonly onValidationWarning?: (warning: ValidationWarning) => void;
  readonly onValidationError?: (error: ValidationError) => void;
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
    maxTokens: input.maxTokens,
    modelId: input.modelId,
    thinkingBudget: input.thinkingBudget,
    executionMode: input.executionMode,
    hooks,
    workspaceRoot: input.workspaceRoot,
    taskManager: input.taskManager,
    conversationId: input.conversationId,
    operationToolAdapterRegistry,
    locale: input.locale,
    providerExpressionTargets: input.providerExpressionTargets,
    capabilityRuntime: input.capabilityRuntime,
    capabilityPromptFragments,
    toolCategoryRegistry: input.toolCategoryRegistry,
    artifactStore: input.artifactStore,
    feedbackLoop: input.feedbackLoop,
    projectMemoryFilePath: input.projectMemoryFilePath,
    personalPath: input.personalPath,
    perceptionClients,
    subAgentRuntime: input.subAgentRuntime,
    modelTierResolver: input.modelTierResolver,
    syncToolCategories: input.syncToolCategories,
    onConfirmTool: input.onConfirmTool,
    onValidationWarning: input.onValidationWarning,
    onValidationError: input.onValidationError,
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
  input: Pick<AgentRuntimeSessionAssemblyInput, 'hooks' | 'hookSource'>,
): readonly ExecutorHooks[] {
  return input.hooks ?? input.hookSource?.getHooks() ?? [];
}
