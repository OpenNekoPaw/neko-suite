import type { AgentCapabilityDiagnostic } from '@neko-agent/types';
import type {
  ArtifactProfileDescriptor,
  CreationProfileDescriptor,
  IArtifactProfileRegistry,
  ICreationProfileRegistry,
  IProviderExpressionProfileRegistry,
  ProviderExpressionProfileDescriptor,
  Skill,
  SkillProfileReference,
} from '@neko/shared';
import { collectSkillProfileReferences } from '@neko/shared';

export interface AgentProfileCompositionInput {
  readonly skill?: Pick<Skill, 'name' | 'profileReferences' | 'mediaWorkflow'>;
  readonly creationProfileId?: string;
  readonly artifactProfileIds?: readonly string[];
  readonly providerExpressionProfileIds?: readonly string[];
  readonly artifactProfileRegistry?: Pick<IArtifactProfileRegistry, 'get'>;
  readonly creationProfileRegistry?: Pick<ICreationProfileRegistry, 'get'>;
  readonly providerExpressionProfileRegistry?: Pick<IProviderExpressionProfileRegistry, 'get'>;
}

export interface AgentProfileCompositionResult {
  readonly skillProfileReferences: readonly SkillProfileReference[];
  readonly artifactProfiles: readonly ArtifactProfileDescriptor[];
  readonly creationProfile?: CreationProfileDescriptor;
  readonly providerExpressionProfiles: readonly ProviderExpressionProfileDescriptor[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
}

export function composeAgentProfiles(
  input: AgentProfileCompositionInput,
): AgentProfileCompositionResult {
  const diagnostics: AgentCapabilityDiagnostic[] = [];
  const skillProfileReferences = input.skill ? collectSkillProfileReferences(input.skill) : [];
  const artifactProfileIds = new Set(input.artifactProfileIds ?? []);
  const providerExpressionProfileIds = new Set(input.providerExpressionProfileIds ?? []);
  let creationProfileId = input.creationProfileId;

  for (const reference of skillProfileReferences) {
    if (reference.kind === 'artifact') {
      artifactProfileIds.add(reference.profileId);
    } else if (reference.kind === 'creation' && !creationProfileId) {
      creationProfileId = reference.profileId;
    } else if (reference.kind === 'provider-expression') {
      providerExpressionProfileIds.add(reference.profileId);
    }
  }

  const artifactProfiles = Array.from(artifactProfileIds)
    .map((profileId) =>
      resolveArtifactProfile(profileId, input.artifactProfileRegistry, diagnostics),
    )
    .filter((profile): profile is ArtifactProfileDescriptor => profile !== undefined);
  const creationProfile = creationProfileId
    ? resolveCreationProfile(creationProfileId, input.creationProfileRegistry, diagnostics)
    : undefined;
  const providerExpressionProfiles = Array.from(providerExpressionProfileIds)
    .map((profileId) =>
      resolveProviderExpressionProfile(
        profileId,
        input.providerExpressionProfileRegistry,
        diagnostics,
      ),
    )
    .filter((profile): profile is ProviderExpressionProfileDescriptor => profile !== undefined);

  return {
    skillProfileReferences,
    artifactProfiles,
    ...(creationProfile ? { creationProfile } : {}),
    providerExpressionProfiles,
    diagnostics,
  };
}

function resolveArtifactProfile(
  profileId: string,
  registry: Pick<IArtifactProfileRegistry, 'get'> | undefined,
  diagnostics: AgentCapabilityDiagnostic[],
): ArtifactProfileDescriptor | undefined {
  const profile = registry?.get(profileId);
  if (!profile) {
    diagnostics.push(createMissingProfileDiagnostic('artifact', profileId));
  }
  return profile;
}

function resolveCreationProfile(
  profileId: string,
  registry: Pick<ICreationProfileRegistry, 'get'> | undefined,
  diagnostics: AgentCapabilityDiagnostic[],
): CreationProfileDescriptor | undefined {
  const profile = registry?.get(profileId);
  if (!profile) {
    diagnostics.push(createMissingProfileDiagnostic('creation', profileId));
  }
  return profile;
}

function resolveProviderExpressionProfile(
  profileId: string,
  registry: Pick<IProviderExpressionProfileRegistry, 'get'> | undefined,
  diagnostics: AgentCapabilityDiagnostic[],
): ProviderExpressionProfileDescriptor | undefined {
  const profile = registry?.get(profileId);
  if (!profile) {
    diagnostics.push(createMissingProfileDiagnostic('provider-expression', profileId));
  }
  return profile;
}

function createMissingProfileDiagnostic(
  kind: 'artifact' | 'creation' | 'provider-expression',
  profileId: string,
): AgentCapabilityDiagnostic {
  return {
    phase: 'injection',
    code: `agent.profile.${kind}.missing`,
    reason: 'missing-profile-descriptor',
    message: `Referenced ${kind} profile "${profileId}" is not registered.`,
    metadata: {
      profileId,
      kind,
    },
  };
}
