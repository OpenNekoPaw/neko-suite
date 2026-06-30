import {
  ToolGroupRegistry,
  createTaskManagerIdcTaskProjection,
  registerBuiltinToolGroups,
  type IRuntimeTaskManager,
  type SkillLifecycleRuntime,
  type SkillService,
} from '@neko/agent';
import { createNodeArtifactStore, type AgentRuntimeConfig } from '@neko/agent/runtime';
import type { IProjectMemoryManager } from '@neko/shared';

export interface CliAgentRuntimeConfig {
  readonly workspaceRoot: string;
  readonly taskManager: IRuntimeTaskManager;
  readonly skillService?: SkillService;
  readonly skillLifecycleRuntime?: SkillLifecycleRuntime;
  readonly projectMemoryManager?: IProjectMemoryManager;
}

export function createCliToolGroupRegistry(): ToolGroupRegistry {
  const registry = new ToolGroupRegistry();
  registerBuiltinToolGroups(registry);
  return registry;
}

export function createCliAgentRuntime(config: CliAgentRuntimeConfig): AgentRuntimeConfig {
  const toolGroupRegistry = createCliToolGroupRegistry();
  const skillService = config.skillService;
  const skillLifecycleRuntime = config.skillLifecycleRuntime;

  return {
    workflowRuntime: {
      ...(skillService || skillLifecycleRuntime
        ? {
            stageTracking: {
              ...(skillService ? { skillService, skillRegistry: skillService.registry } : {}),
              ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
            },
          }
        : {}),
      idcTaskProjection: createTaskManagerIdcTaskProjection({ store: config.taskManager }),
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
    },
    artifactStore: createNodeArtifactStore({ workspaceRoot: config.workspaceRoot }),
    ...(config.projectMemoryManager
      ? {
          feedbackLoop: {
            projectMemoryManager: config.projectMemoryManager,
          },
        }
      : {}),
  };
}
