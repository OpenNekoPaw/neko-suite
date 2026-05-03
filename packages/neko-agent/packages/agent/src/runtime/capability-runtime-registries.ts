import { SkillRegistry, ToolGroupRegistry, registerBuiltinToolGroups } from '../skill';

export interface AgentCapabilityRuntimeRegistries {
  readonly skillRegistry: SkillRegistry;
  readonly toolGroupRegistry: ToolGroupRegistry;
}

/**
 * Create the default runtime registries used by capability discovery.
 *
 * Hosts inject the returned registries into their discovery bridge; agent owns
 * the business decision that built-in tool groups are resident by default.
 */
export function createAgentCapabilityRuntimeRegistries(): AgentCapabilityRuntimeRegistries {
  const skillRegistry = new SkillRegistry();
  const toolGroupRegistry = new ToolGroupRegistry();
  registerBuiltinToolGroups(toolGroupRegistry);

  return {
    skillRegistry,
    toolGroupRegistry,
  };
}
