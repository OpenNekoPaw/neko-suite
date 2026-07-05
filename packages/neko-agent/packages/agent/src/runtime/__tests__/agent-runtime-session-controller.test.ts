import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IService, IToolRegistry, PromptFragment } from '@neko/shared';
import { createAgentRuntimeSessionController } from '../session/agent-runtime-session-controller';

const sessionFactoryMocks = vi.hoisted(() => ({
  createAgentRuntimeSession: vi.fn(),
  updateAgentRuntimeSession: vi.fn(),
  unregisterAgentRuntimeSession: vi.fn(),
}));

vi.mock('../session/agent-session-factory', () => sessionFactoryMocks);

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

function createTarget() {
  let session: unknown;
  return {
    getSession: vi.fn(() => session as never),
    setSession: vi.fn((next: unknown) => {
      session = next;
    }),
    configureSession: vi.fn(),
    setPromptFragments: vi.fn(),
  };
}

describe('AgentRuntimeSessionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the runtime session on first configure and wires it into the target', async () => {
    const target = createTarget();
    const session = { kind: 'session' };
    const handle = {
      session,
      effectiveSystemPrompt: 'system',
    };
    sessionFactoryMocks.createAgentRuntimeSession.mockResolvedValue(handle);

    const controller = createAgentRuntimeSessionController(target);
    await controller.configure({
      createService,
      toolRegistry: createToolRegistry(),
      systemPrompt: 'system',
    });

    expect(sessionFactoryMocks.createAgentRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        service: expect.any(Object),
        createService,
        systemPrompt: 'system',
      }),
    );
    expect(target.setSession).toHaveBeenCalledWith(session);
    expect(controller.getHandle()).toBe(handle);
  });

  it('updates an existing runtime session and reuses the previous operation registry', async () => {
    const target = createTarget();
    const session = { kind: 'session' };
    const operationToolAdapterRegistry = { list: vi.fn(), findPlanner: vi.fn() };
    const handle = {
      session,
      operationToolAdapterRegistry,
      effectiveSystemPrompt: 'system',
    };
    const promptFragments: readonly PromptFragment[] = [{ id: 'capability', content: 'prompt' }];
    sessionFactoryMocks.createAgentRuntimeSession.mockResolvedValue(handle);
    sessionFactoryMocks.updateAgentRuntimeSession.mockReturnValue({
      sessionConfig: { systemPrompt: 'updated' },
      promptFragments,
    });

    const controller = createAgentRuntimeSessionController(target);
    await controller.configure({
      createService,
      toolRegistry: createToolRegistry(),
      systemPrompt: 'system',
    });
    await controller.configure({
      createService,
      toolRegistry: createToolRegistry(),
      systemPrompt: 'updated',
    });

    expect(sessionFactoryMocks.updateAgentRuntimeSession).toHaveBeenCalledWith(
      handle,
      expect.objectContaining({
        systemPrompt: 'updated',
        operationToolAdapterRegistry,
      }),
    );
    expect(target.setPromptFragments).toHaveBeenCalledWith(promptFragments);
    expect(target.configureSession).toHaveBeenCalledWith({ systemPrompt: 'updated' });
  });

  it('unregisters the runtime handle on dispose', async () => {
    const target = createTarget();
    const handle = {
      session: { kind: 'session' },
      conversationId: 'conv-1',
      effectiveSystemPrompt: 'system',
    };
    sessionFactoryMocks.createAgentRuntimeSession.mockResolvedValue(handle);

    const controller = createAgentRuntimeSessionController(target);
    await controller.configure({
      createService,
      toolRegistry: createToolRegistry(),
    });
    controller.dispose();

    expect(sessionFactoryMocks.unregisterAgentRuntimeSession).toHaveBeenCalledWith(handle);
    expect(controller.getHandle()).toBeUndefined();
  });

  it('projects tool skills from the runtime session handle', async () => {
    const target = createTarget();
    const group = {
      name: 'media',
      description: 'Media tools',
      tools: ['media.generateImage'],
      source: 'builtin',
      enabled: true,
      dependencies: ['core'],
    };
    sessionFactoryMocks.createAgentRuntimeSession.mockResolvedValue({
      session: { kind: 'session' },
      effectiveSystemPrompt: 'system',
      toolGroupRegistry: {
        list: () => [group],
      },
    });

    const controller = createAgentRuntimeSessionController(target);
    await controller.configure({
      createService,
      toolRegistry: createToolRegistry(),
    });

    const toolSkills = controller.getToolSkills();

    expect(toolSkills).toEqual([
      expect.objectContaining({
        name: 'media',
        tools: ['media.generateImage'],
        dependencies: ['core'],
      }),
    ]);
    expect(toolSkills[0]?.tools).not.toBe(group.tools);
  });
});
