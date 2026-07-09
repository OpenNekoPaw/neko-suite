import { describe, expect, it } from 'vitest';
import type {
  ArtifactProfileDescriptor,
  CreationProfileDescriptor,
  ProviderExpressionProfileDescriptor,
} from '@neko/shared';
import {
  ArtifactProfileRegistry,
  CreationProfileRegistry,
  ProviderExpressionProfileRegistry,
} from '../profile-registry';

describe('Agent profile registries', () => {
  it('records duplicate diagnostics without silently hiding source layers', () => {
    const registry = new ArtifactProfileRegistry();
    registry.register(makeArtifactProfile({ source: 'builtin' }));
    const result = registry.register(makeArtifactProfile({ source: 'market' }));

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-profile-id', severity: 'warning' }),
      ]),
    );
    expect(registry.get('studio.shot-review', 1)).toEqual(
      expect.objectContaining({ source: 'market' }),
    );
    expect(registry.getDiagnostics()).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'duplicate-profile-id' })]),
    );
  });

  it('allows explicit project override and unregisters only the contributing source', () => {
    const registry = new ArtifactProfileRegistry();
    registry.register(makeArtifactProfile({ source: 'builtin' }));
    registry.register(
      makeArtifactProfile({
        source: 'project',
        override: { sources: ['builtin'], reason: 'project-specific review table' },
      }),
    );

    expect(registry.get('studio.shot-review', 1)).toEqual(
      expect.objectContaining({ source: 'project' }),
    );

    registry.register(makeArtifactProfile({ source: 'market', profileId: 'studio.alt-review' }));
    registry.unregister('studio.shot-review', 'project', 1);

    expect(registry.get('studio.shot-review', 1)).toEqual(
      expect.objectContaining({ source: 'builtin' }),
    );
    expect(registry.get('studio.alt-review', 1)).toEqual(
      expect.objectContaining({ source: 'market' }),
    );
  });

  it('supports creation and provider expression profile families', () => {
    const creationRegistry = new CreationProfileRegistry();
    const providerExpressionRegistry = new ProviderExpressionProfileRegistry();
    const creationProfile: CreationProfileDescriptor = {
      profileId: 'studio.creation.review',
      kind: 'creation',
      version: '1.0.0',
      source: 'package',
      defaultStageId: 'research',
      stages: [{ stageId: 'research', purpose: 'Research source context.' }],
    };
    const expressionProfile: ProviderExpressionProfileDescriptor = {
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

    expect(creationRegistry.register(creationProfile).ok).toBe(true);
    expect(providerExpressionRegistry.register(expressionProfile).ok).toBe(true);

    expect(creationRegistry.get('studio.creation.review')).toEqual(creationProfile);
    expect(providerExpressionRegistry.get('provider-expression:flux')).toEqual(expressionProfile);
  });
});

function makeArtifactProfile(
  overrides: Partial<ArtifactProfileDescriptor> = {},
): ArtifactProfileDescriptor {
  return {
    profileId: 'studio.shot-review',
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    ...overrides,
  };
}
