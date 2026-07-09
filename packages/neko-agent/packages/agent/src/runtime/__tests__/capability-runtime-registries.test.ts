import { describe, expect, it } from 'vitest';
import { createAgentCapabilityRuntimeRegistries } from '../capability/capability-runtime-registries';

describe('createAgentCapabilityRuntimeRegistries', () => {
  it('creates host-neutral capability registries without concrete skill extensions', () => {
    const registries = createAgentCapabilityRuntimeRegistries();

    expect(registries.skillRegistry.listAllSkills()).toEqual([]);
    expect(registries.toolGroupRegistry.list()).toEqual([]);
    expect(registries.toolGroupRegistry.listEnabled()).toEqual([]);
    expect(registries.artifactProfileRegistry.get('comic-shot-asset-prep', 1)).toEqual(
      expect.objectContaining({ profileId: 'comic-shot-asset-prep', source: 'builtin' }),
    );
    expect(registries.creationProfileRegistry.get('idc.default', '1.0.0')).toEqual(
      expect.objectContaining({ profileId: 'idc.default', source: 'builtin' }),
    );
    expect(registries.providerExpressionProfileRegistry.list()).toEqual([]);
  });
});
