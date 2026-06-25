import { describe, expect, it, vi } from 'vitest';
import type { ExecutorHooks, IService, IToolRegistry } from '@neko/shared';
import { buildAgentRuntimeSessionFactoryConfig } from '../runtime-host-bindings';

function createService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  } as unknown as IService;
}

function createToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    has: vi.fn(),
  } as unknown as IToolRegistry;
}

describe('buildAgentRuntimeSessionFactoryConfig', () => {
  it('assembles host bindings into runtime session factory config', () => {
    const service = createService();
    const toolRegistry = createToolRegistry();
    const operationRegistry = { list: vi.fn(), findPlanner: vi.fn() };
    const fragments = [{ id: 'capability:test', content: 'capability prompt' }];
    const perceptionClients = { transcribe: { perception: { transcribe: vi.fn() } } };

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService: () => service,
      toolRegistry,
      systemPrompt: 'system',
      workspaceRoot: '/workspace',
      authorizedReadRoots: ['/media/library'],
      workspaceIgnoreRules: { gitignoreRules: ['ignored/'] },
      conversationId: 'conv-1',
      createDefaultOperationToolAdapterRegistry: () => operationRegistry,
      getCapabilityPromptFragments: () => fragments,
      getPerceptionClients: () => perceptionClients,
    });

    expect(config).toEqual(
      expect.objectContaining({
        service,
        createService: expect.any(Function),
        toolRegistry,
        systemPrompt: 'system',
        workspaceRoot: '/workspace',
        authorizedReadRoots: ['/media/library'],
        workspaceIgnoreRules: { gitignoreRules: ['ignored/'] },
        conversationId: 'conv-1',
        operationToolAdapterRegistry: operationRegistry,
        capabilityPromptFragments: fragments,
        perceptionClients,
      }),
    );
  });

  it('prefers explicit operation registry over previous/default registry', () => {
    const explicit = { list: vi.fn() };
    const previous = { list: vi.fn() };
    const createDefault = vi.fn(() => ({ list: vi.fn() }));

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      operationToolAdapterRegistry: explicit,
      previousOperationToolAdapterRegistry: previous,
      createDefaultOperationToolAdapterRegistry: createDefault,
    });

    expect(config.operationToolAdapterRegistry).toBe(explicit);
    expect(createDefault).not.toHaveBeenCalled();
  });

  it('falls back to previous operation registry before creating a default registry', () => {
    const previous = { list: vi.fn() };
    const createDefault = vi.fn(() => ({ list: vi.fn() }));

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      previousOperationToolAdapterRegistry: previous,
      createDefaultOperationToolAdapterRegistry: createDefault,
    });

    expect(config.operationToolAdapterRegistry).toBe(previous);
    expect(createDefault).not.toHaveBeenCalled();
  });

  it('creates the default operation registry inside runtime when none is injected', () => {
    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
    });

    expect(config.operationToolAdapterRegistry).toBeDefined();
    expect(config.operationToolAdapterRegistry?.list()).toEqual(expect.any(Array));
  });

  it('passes explicit executor hooks through to the session factory config', () => {
    const explicitHooks = [{ name: 'explicit' }] as unknown as readonly ExecutorHooks[];

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      hooks: explicitHooks,
    });

    expect(config.hooks).toBe(explicitHooks);
  });

  it('guards capability prompt fragment resolution failures', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      getCapabilityPromptFragments: () => {
        throw new Error('boom');
      },
      logger,
    });

    expect(config.capabilityPromptFragments).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to resolve capability prompt fragments:',
      expect.any(Error),
    );
  });
});
