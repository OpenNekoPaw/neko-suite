export {
  BUILTIN_ARTIFACT_PROFILES,
  BUILTIN_CREATION_PROFILES,
  IDC_DEFAULT_CREATION_PROFILE,
} from './builtin-profiles';

export {
  AgentProfileRegistry,
  ArtifactProfileRegistry,
  CreationProfileRegistry,
  ProviderExpressionProfileRegistry,
  createArtifactProfileRegistry,
  createCreationProfileRegistry,
  createProviderExpressionProfileRegistry,
  type AgentProfileDescriptor,
  type AgentProfileRegistryOptions,
} from './profile-registry';

export {
  composeAgentProfiles,
  type AgentProfileCompositionInput,
  type AgentProfileCompositionResult,
} from './profile-composition';
