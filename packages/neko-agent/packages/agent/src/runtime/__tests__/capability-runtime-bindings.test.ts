import { describe, expect, it, vi } from 'vitest';
import {
  createCapabilityRuntimeBindingStore,
  mergeCapabilityRuntimeBindings,
} from '../capability-runtime-bindings';

describe('capability-runtime-bindings', () => {
  it('keeps existing bindings when a later update passes undefined', () => {
    const logger = { warn: vi.fn() };
    const skillRegistry = { id: 'skill-registry' } as never;

    const merged = mergeCapabilityRuntimeBindings(
      { skillRegistry },
      { skillRegistry: undefined },
      logger,
    );

    expect(merged.skillRegistry).toBe(skillRegistry);
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
        reason: 'undefined-value-ignored',
      }),
    );
  });

  it('warns when a shared runtime binding is replaced', () => {
    const logger = { warn: vi.fn() };
    const previous = { id: 'previous' } as never;
    const next = { id: 'next' } as never;

    const merged = mergeCapabilityRuntimeBindings(
      { toolGroupRegistry: previous },
      { toolGroupRegistry: next },
      logger,
    );

    expect(merged.toolGroupRegistry).toBe(next);
    expect(logger.warn).toHaveBeenCalledWith(
      'Replacing a shared capability runtime binding reference.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-replaced',
        reason: 'shared-singleton-replaced',
      }),
    );
  });

  it('stores late-bound skill service without clearing it on undefined', () => {
    const logger = { warn: vi.fn() };
    const store = createCapabilityRuntimeBindingStore(logger);
    const skillService = { id: 'skill-service' } as never;

    store.setSkillService(skillService);
    store.setSkillService(undefined);

    expect(store.get().skillService).toBe(skillService);
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
      }),
    );
  });
});
