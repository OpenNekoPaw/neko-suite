import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
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
const discoveryDeps: unknown[] = [];
const registerRuntimeProviderCardDirectoriesMock = vi.fn(() =>
  Promise.resolve({ market: [], project: [] }),
);

vi.mock('@neko/agent', () => ({
  ProviderCardRegistry: class ProviderCardRegistry {
    readonly id = 'default-provider-card-registry';
  },
  ToolCategoryRegistry: class ToolCategoryRegistry {
    readonly id = 'default-tool-category-registry';
  },
  createCapabilityRuntimeBindingStore: (logger: {
    warn: (message: string, data?: unknown) => void;
  }) => {
    let bindings: Record<string, unknown> = {};
    const update = (next: Record<string, unknown>) => {
      const merged = { ...bindings };
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined) {
          if (merged[key] !== undefined) {
            logger.warn(
              'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
              {
                code: 'extension.capability-runtime.binding-update-ignored',
                reason: 'undefined-value-ignored',
                message:
                  'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
                context: { binding: key },
              },
            );
          }
          continue;
        }
        merged[key] = value;
      }
      bindings = merged;
      return bindings;
    };
    return {
      get: () => bindings,
      update,
      setSkillService: (skillService: unknown) => update({ skillService }),
    };
  },
  registerRuntimeProviderCardDirectories: registerRuntimeProviderCardDirectoriesMock,
}));

vi.mock('../../base', () => ({
  getLogger: () => bootstrapLogger,
}));

vi.mock('../../services/capabilityDiscoveryService', () => ({
  CapabilityDiscoveryService: class {
    constructor(deps: unknown) {
      discoveryDeps.push(deps);
    }
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
    discoveryDeps.length = 0;
    registerRuntimeProviderCardDirectoriesMock.mockClear();
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

  it('creates and shares a ProviderCardRegistry when none is provided', async () => {
    const module = await import('../capabilityBootstrap');
    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
      },
      { subscriptions: [] } as never,
    );

    const bindings = module.getCapabilityRuntimeBindings();
    expect(bindings.providerCardRegistry).toBeDefined();
    expect(discoveryDeps[0]).toEqual(
      expect.objectContaining({
        providerCardRegistry: bindings.providerCardRegistry,
      }),
    );
  });

  it('delegates provider card directory registration to the agent runtime', async () => {
    const module = await import('../capabilityBootstrap');
    const toolRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as never;

    module.bootstrapCapabilities(
      {
        toolRegistry,
        workspaceRoot: '/workspace/project',
      },
      { subscriptions: [] } as never,
    );

    expect(registerRuntimeProviderCardDirectoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: '/workspace/project',
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
