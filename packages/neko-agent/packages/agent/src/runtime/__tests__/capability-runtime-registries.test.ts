import { describe, expect, it } from 'vitest';
import { createAgentCapabilityRuntimeRegistries } from '../capability-runtime-registries';

describe('createAgentCapabilityRuntimeRegistries', () => {
  it('creates shared capability registries with built-in tool groups', () => {
    const registries = createAgentCapabilityRuntimeRegistries();

    expect(registries.skillRegistry.listAllSkills()).toEqual([]);
    expect(registries.toolGroupRegistry.list().length).toBeGreaterThan(0);
    expect(registries.toolGroupRegistry.listEnabled().length).toBeGreaterThan(0);
  });
});
