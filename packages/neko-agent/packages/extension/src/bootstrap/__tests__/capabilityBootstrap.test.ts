import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
}));

const bootstrapLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const activateMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('../../base', () => ({
  getLogger: () => bootstrapLogger,
}));

vi.mock('../../services/capabilityDiscoveryService', () => ({
  CapabilityDiscoveryService: class {
    constructor(_deps: unknown) {}
    activate = activateMock;
    dispose = disposeMock;
  },
}));

describe('capabilityBootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    activateMock.mockReset();
    disposeMock.mockReset();
    bootstrapLogger.info.mockReset();
    bootstrapLogger.warn.mockReset();
    bootstrapLogger.error.mockReset();
    bootstrapLogger.debug.mockReset();
  });

  it('does not clear existing runtime bindings when a later bootstrap omits them', async () => {
    const module = await import('../capabilityBootstrap');

    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;
    const skillRegistry = { id: 'skill-registry-a' } as never;
    const toolGroupRegistry = { id: 'tool-group-registry-a' } as never;
    const context = { subscriptions: [] } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
        skillRegistry,
        toolGroupRegistry,
      },
      context,
    );

    module.bootstrapCapabilities(
      {
        toolRegistry,
      },
      { subscriptions: [] } as never,
    );

    expect(module.getCapabilityRuntimeBindings()).toEqual(
      expect.objectContaining({
        skillRegistry,
        toolGroupRegistry,
      }),
    );
    expect(bootstrapLogger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
        reason: 'undefined-value-ignored',
      }),
    );
  });

  it('does not clear skillService when undefined is passed through late binding', async () => {
    const module = await import('../capabilityBootstrap');

    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;
    const skillService = { id: 'skill-service-a' } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
      },
      { subscriptions: [] } as never,
    );

    module.setCapabilityRuntimeSkillService(skillService);
    module.setCapabilityRuntimeSkillService(undefined);

    expect(module.getCapabilityRuntimeBindings()).toEqual(
      expect.objectContaining({
        skillService,
      }),
    );
    expect(bootstrapLogger.warn).toHaveBeenCalledWith(
      'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
      expect.objectContaining({
        code: 'extension.capability-runtime.binding-update-ignored',
        reason: 'undefined-value-ignored',
      }),
    );
  });
});
