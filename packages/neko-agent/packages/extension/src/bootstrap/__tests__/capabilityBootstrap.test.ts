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
const registerProviderCardDirectoryMock = vi.fn(() => Promise.resolve([]));

vi.mock('@neko/agent', () => ({
  ProviderCardRegistry: class ProviderCardRegistry {
    readonly id = 'default-provider-card-registry';
  },
  ToolCategoryRegistry: class ToolCategoryRegistry {
    readonly id = 'default-tool-category-registry';
  },
  registerProviderCardDirectory: registerProviderCardDirectoryMock,
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
    registerProviderCardDirectoryMock.mockClear();
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

  it('loads market and project provider card directories into the shared registry', async () => {
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

    expect(registerProviderCardDirectoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLayer: 'market',
        sourceRefPrefix: '${NEKO_HOME}/providers',
      }),
    );
    expect(registerProviderCardDirectoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        root: '/workspace/project/.neko/providers',
        sourceLayer: 'project',
        sourceRefPrefix: '.neko/providers',
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
