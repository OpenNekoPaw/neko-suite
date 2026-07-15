import { SkillRegistry, ToolGroupRegistry } from '../../skill';
import {
  BUILTIN_ARTIFACT_PROFILES,
  ArtifactProfileRegistry,
  ProviderExpressionProfileRegistry,
} from '../../profile';

export interface AgentCapabilityRuntimeRegistries {
  readonly skillRegistry: SkillRegistry;
  readonly toolGroupRegistry: ToolGroupRegistry;
  readonly artifactProfileRegistry: ArtifactProfileRegistry;
  readonly providerExpressionProfileRegistry: ProviderExpressionProfileRegistry;
}

/**
 * Create host-neutral runtime registries used by capability discovery.
 *
 * Hosts inject concrete skill and tool-group extensions after construction.
 */
export function createAgentCapabilityRuntimeRegistries(): AgentCapabilityRuntimeRegistries {
  const skillRegistry = new SkillRegistry();
  const toolGroupRegistry = new ToolGroupRegistry();
  const artifactProfileRegistry = new ArtifactProfileRegistry();
  const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();

  for (const profile of BUILTIN_ARTIFACT_PROFILES) {
    artifactProfileRegistry.register(profile);
  }
  return {
    skillRegistry,
    toolGroupRegistry,
    artifactProfileRegistry,
    providerExpressionProfileRegistry,
  };
}
