import {
  ToolGroupRegistry,
  type IRuntimeTaskManager,
  type SkillLifecycleRuntime,
  type SkillService,
} from '@neko/agent';
import {
  createAgentCapabilityRuntimeRegistries,
  createNodeWorkspaceRuntimeStore,
  type AgentRuntimeConfig,
} from '@neko/agent/runtime';
import {
  createAutohealChain,
  createValidationCoordinatorFactory,
  createQualityReviewValidationAdapter,
  registerBuiltinToolGroups,
} from '@neko/skills';
import type {
  IArtifactProfileRegistry,
  IProjectMemoryManager,
  IProviderCardRegistry,
  IProviderExpressionProfileRegistry,
  PromptFragment,
} from '@neko/shared';

export interface CliAgentRuntimeConfig {
  readonly workspaceRoot: string;
  readonly taskManager: IRuntimeTaskManager;
  readonly skillService?: SkillService;
  readonly skillLifecycleRuntime?: SkillLifecycleRuntime;
  readonly toolGroupRegistry?: ToolGroupRegistry;
  readonly providerCardRegistry?: IProviderCardRegistry;
  readonly artifactProfileRegistry?: IArtifactProfileRegistry;
  readonly providerExpressionProfileRegistry?: IProviderExpressionProfileRegistry;
  readonly promptFragments?: readonly PromptFragment[];
  readonly projectMemoryManager?: IProjectMemoryManager;
}

export function createCliToolGroupRegistry(): ToolGroupRegistry {
  const registry = new ToolGroupRegistry();
  registerBuiltinToolGroups(registry);
  return registry;
}

export function createCliAgentRuntime(config: CliAgentRuntimeConfig): AgentRuntimeConfig {
  const toolGroupRegistry = config.toolGroupRegistry ?? createCliToolGroupRegistry();
  const skillService = config.skillService;
  const skillLifecycleRuntime = config.skillLifecycleRuntime;
  const defaultCapabilityRegistries =
    config.artifactProfileRegistry &&
    config.providerExpressionProfileRegistry
      ? undefined
      : createAgentCapabilityRuntimeRegistries();
  const artifactProfileRegistry =
    config.artifactProfileRegistry ?? defaultCapabilityRegistries?.artifactProfileRegistry;
  const providerExpressionProfileRegistry =
    config.providerExpressionProfileRegistry ??
    defaultCapabilityRegistries?.providerExpressionProfileRegistry;

  return {
    capabilityRuntime: {
      ...(skillService
        ? {
            skillService,
            skillRegistry: skillService.registry,
          }
        : {}),
      ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
      toolGroupRegistry,
      ...(config.providerCardRegistry ? { providerCardRegistry: config.providerCardRegistry } : {}),
      ...(artifactProfileRegistry ? { artifactProfileRegistry } : {}),
      ...(providerExpressionProfileRegistry ? { providerExpressionProfileRegistry } : {}),
      ...(config.promptFragments !== undefined ? { promptFragments: config.promptFragments } : {}),
    },
    workspaceStore: createNodeWorkspaceRuntimeStore({ workspaceRoot: config.workspaceRoot }),
    validationLoop: {
      autohealChainFactory: createAutohealChain,
      ...(config.projectMemoryManager ? { projectMemoryManager: config.projectMemoryManager } : {}),
      validationCoordinatorFactory: createValidationCoordinatorFactory(),
      toolResultValidationAdapters: [createQualityReviewValidationAdapter()],
    },
  };
}
