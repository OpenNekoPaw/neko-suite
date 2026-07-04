import { SkillRegistry, ToolGroupRegistry } from '../skill';

export interface AgentCapabilityRuntimeRegistries {
  readonly skillRegistry: SkillRegistry;
  readonly toolGroupRegistry: ToolGroupRegistry;
}

/**
 * Create host-neutral runtime registries used by capability discovery.
 *
 * Hosts inject concrete skill and tool-group extensions after construction.
 */
export function createAgentCapabilityRuntimeRegistries(): AgentCapabilityRuntimeRegistries {
  const skillRegistry = new SkillRegistry();
  const toolGroupRegistry = new ToolGroupRegistry();

  return {
    skillRegistry,
    toolGroupRegistry,
  };
}
