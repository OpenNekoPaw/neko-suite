import { describe, expect, it } from 'vitest';
import { createAgentCapabilityRuntimeRegistries } from '../capability/capability-runtime-registries';

describe('createAgentCapabilityRuntimeRegistries', () => {
  it('creates host-neutral capability registries without concrete skill extensions', () => {
    const registries = createAgentCapabilityRuntimeRegistries();

    expect(registries.skillRegistry.listAllSkills()).toEqual([]);
    expect(registries.toolGroupRegistry.list()).toEqual([]);
    expect(registries.toolGroupRegistry.listEnabled()).toEqual([]);
  });
});
