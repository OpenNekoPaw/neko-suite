import {
  ToolGroupRegistry,
  createTaskManagerCreationTaskProjection,
  type IRuntimeTaskManager,
  type SkillLifecycleRuntime,
  type SkillService,
} from '@neko/agent';
import { createNodeArtifactStore, type AgentRuntimeConfig } from '@neko/agent/runtime';
import { createQualityReviewFeedbackAdapter, registerBuiltinToolGroups } from '@neko/skills';
import type { IProjectMemoryManager, IProviderCardRegistry, PromptFragment } from '@neko/shared';

export interface CliAgentRuntimeConfig {
  readonly workspaceRoot: string;
  readonly taskManager: IRuntimeTaskManager;
  readonly skillService?: SkillService;
  readonly skillLifecycleRuntime?: SkillLifecycleRuntime;
  readonly toolGroupRegistry?: ToolGroupRegistry;
  readonly providerCardRegistry?: IProviderCardRegistry;
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

  return {
    creationGuidance: {
      ...(skillService || skillLifecycleRuntime
        ? {
            stageTracking: {
              ...(skillService ? { skillService, skillRegistry: skillService.registry } : {}),
              ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
            },
          }
        : {}),
      creationTaskProjection: createTaskManagerCreationTaskProjection({
        store: config.taskManager,
      }),
    },
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
      ...(config.promptFragments !== undefined ? { promptFragments: config.promptFragments } : {}),
    },
    artifactStore: createNodeArtifactStore({ workspaceRoot: config.workspaceRoot }),
    feedbackLoop: {
      ...(config.projectMemoryManager ? { projectMemoryManager: config.projectMemoryManager } : {}),
      toolResultFeedbackAdapters: [createQualityReviewFeedbackAdapter()],
    },
  };
}
