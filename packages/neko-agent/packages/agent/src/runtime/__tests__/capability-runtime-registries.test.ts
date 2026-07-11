import { describe, expect, it } from 'vitest';
import { MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID } from '@neko/shared';
import { createAgentCapabilityRuntimeRegistries } from '../capability/capability-runtime-registries';

describe('createAgentCapabilityRuntimeRegistries', () => {
  it('creates host-neutral capability registries without concrete skill extensions', () => {
    const registries = createAgentCapabilityRuntimeRegistries();

    expect(registries.skillRegistry.listAllSkills()).toEqual([]);
    expect(registries.toolGroupRegistry.list()).toEqual([]);
    expect(registries.toolGroupRegistry.listEnabled()).toEqual([]);
    expect(
      registries.artifactProfileRegistry.get(MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID, 1),
    ).toEqual(
      expect.objectContaining({
        profileId: MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
        source: 'builtin',
      }),
    );
    expect(registries.artifactProfileRegistry.get('comic-shot-asset-prep', 1)).toBeUndefined();
    expect(registries.creationProfileRegistry.get('idc.default', '1.0.0')).toEqual(
      expect.objectContaining({ profileId: 'idc.default', source: 'builtin' }),
    );
    expect(registries.providerExpressionProfileRegistry.list()).toEqual([]);
  });
});
