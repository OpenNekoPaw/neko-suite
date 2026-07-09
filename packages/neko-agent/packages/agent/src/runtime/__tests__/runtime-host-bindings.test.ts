import { describe, expect, it, vi } from 'vitest';
import type {
  ExecutorHooks,
  IOperationToolAdapterRegistry,
  IService,
  IToolRegistry,
} from '@neko/shared';
import {
  buildAgentRuntimeSessionFactoryConfig,
  buildAgentWorkspaceRuntimeSessionAssemblyInput,
} from '../session/runtime-host-bindings';

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

function createOperationRegistry(): IOperationToolAdapterRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    findPlanner: vi.fn(),
  };
}

describe('buildAgentRuntimeSessionFactoryConfig', () => {
  it('assembles host bindings into runtime session factory config', () => {
    const service = createService();
    const toolRegistry = createToolRegistry();
    const operationRegistry = createOperationRegistry();
    const fragments = [{ id: 'capability:test', content: 'capability prompt' }];
    const perceptionClients = { transcribe: { perception: { transcribe: vi.fn() } } };
    const perceptionPipeline = { perceive: vi.fn() };

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService: () => service,
      toolRegistry,
      systemPrompt: 'system',
      workspaceRoot: '/workspace',
      authorizedReadRoots: ['/media/library'],
      workspaceIgnoreRules: { gitignoreRules: ['ignored/'] },
      conversationId: 'conv-1',
      operationToolAdapterRegistry: operationRegistry,
      getCapabilityPromptFragments: () => fragments,
      getPerceptionClients: () => perceptionClients,
      getPerceptionPipeline: () => perceptionPipeline,
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
        perceptionPipeline,
      }),
    );
  });

  it('prefers explicit operation registry over previous registry', () => {
    const explicit = createOperationRegistry();
    const previous = createOperationRegistry();

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      operationToolAdapterRegistry: explicit,
      previousOperationToolAdapterRegistry: previous,
    });

    expect(config.operationToolAdapterRegistry).toBe(explicit);
  });

  it('falls back to previous operation registry when no explicit registry is injected', () => {
    const previous = createOperationRegistry();

    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
      previousOperationToolAdapterRegistry: previous,
    });

    expect(config.operationToolAdapterRegistry).toBe(previous);
  });

  it('does not create a domain operation registry when none is injected', () => {
    const config = buildAgentRuntimeSessionFactoryConfig({
      createService,
      toolRegistry: createToolRegistry(),
    });

    expect(config.operationToolAdapterRegistry).toBeUndefined();
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

  it('projects effective workspace config into host-neutral session assembly input', () => {
    const service = createService();
    const toolRegistry = createToolRegistry();

    const input = buildAgentWorkspaceRuntimeSessionAssemblyInput({
      surface: 'tui',
      effectiveConfig: {
        providerId: 'explicit-user',
        modelId: 'user-chat',
        modelCapabilities: ['chat', 'function_calling'],
        temperature: 0.2,
        maxTokens: 2048,
        thinkingBudget: 256,
        executionMode: 'ask',
      },
      createService: () => service,
      toolRegistry,
      workspaceRoot: '/workspace',
      conversationId: 'workspace-conversation',
    });

    expect(input).toEqual(
      expect.objectContaining({
        providerId: 'explicit-user',
        modelId: 'user-chat',
        modelCapabilities: ['chat', 'function_calling'],
        temperature: 0.2,
        maxTokens: 2048,
        thinkingBudget: 256,
        executionMode: 'ask',
        workspaceRoot: '/workspace',
        conversationId: 'workspace-conversation',
      }),
    );
    expect('effectiveConfig' in input).toBe(false);
    expect('surface' in input).toBe(false);
  });
});
