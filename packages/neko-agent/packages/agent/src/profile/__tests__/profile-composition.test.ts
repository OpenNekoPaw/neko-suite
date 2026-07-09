import { describe, expect, it } from 'vitest';
import type {
  ArtifactProfileDescriptor,
  CreationProfileDescriptor,
  ProviderExpressionProfileDescriptor,
  Skill,
} from '@neko/shared';
import {
  ArtifactProfileRegistry,
  CreationProfileRegistry,
  ProviderExpressionProfileRegistry,
} from '../profile-registry';
import { composeAgentProfiles } from '../profile-composition';

describe('composeAgentProfiles', () => {
  it('resolves Skill profile references through registries with visible diagnostics', () => {
    const artifactProfileRegistry = new ArtifactProfileRegistry();
    const creationProfileRegistry = new CreationProfileRegistry();
    const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();
    const artifactProfile = makeArtifactProfile();
    const creationProfile = makeCreationProfile();
    const providerExpressionProfile = makeProviderExpressionProfile();
    artifactProfileRegistry.register(artifactProfile);
    creationProfileRegistry.register(creationProfile);
    providerExpressionProfileRegistry.register(providerExpressionProfile);
    const skill: Pick<Skill, 'name' | 'profileReferences' | 'mediaWorkflow'> = {
      name: 'studio-skill',
      profileReferences: [
        { profileId: 'studio.creation.review', kind: 'creation', relationship: 'requires' },
        {
          profileId: 'provider-expression:flux',
          kind: 'provider-expression',
          relationship: 'prefers',
        },
      ],
      mediaWorkflow: {
        artifactProfiles: ['studio.shot-review', 'studio.missing-table'],
      },
    };

    const result = composeAgentProfiles({
      skill,
      artifactProfileRegistry,
      creationProfileRegistry,
      providerExpressionProfileRegistry,
    });

    expect(result.creationProfile).toBe(creationProfile);
    expect(result.artifactProfiles).toEqual([artifactProfile]);
    expect(result.providerExpressionProfiles).toEqual([providerExpressionProfile]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'agent.profile.artifact.missing',
        reason: 'missing-profile-descriptor',
      }),
    ]);
  });
});

function makeArtifactProfile(): ArtifactProfileDescriptor {
  return {
    profileId: 'studio.shot-review',
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
  };
}

function makeCreationProfile(): CreationProfileDescriptor {
  return {
    profileId: 'studio.creation.review',
    kind: 'creation',
    version: '1.0.0',
    source: 'package',
    defaultStageId: 'research',
    stages: [
      { stageId: 'research', purpose: 'Research source context.' },
      { stageId: 'review', purpose: 'Review output.' },
    ],
  };
}

function makeProviderExpressionProfile(): ProviderExpressionProfileDescriptor {
  return {
    profileId: 'provider-expression:flux',
    kind: 'provider-expression',
    source: 'package',
    providerId: 'flux',
    displayName: 'Flux',
    version: '1.0.0',
    sourceLayer: 'builtin',
    capabilities: ['image.generate'],
    syntaxProfile: { notes: [] },
    conceptCoverage: { entries: [] },
    trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
  };
}
