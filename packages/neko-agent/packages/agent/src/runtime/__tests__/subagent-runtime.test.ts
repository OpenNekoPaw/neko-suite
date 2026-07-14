import { describe, expect, it, vi } from 'vitest';

const { createAgentSessionWithRuntime } = vi.hoisted(() => ({
  createAgentSessionWithRuntime: vi.fn(() => ({
    async *execute() {
      yield { type: 'text', content: 'done' };
    },
    cancel: vi.fn(),
  })),
}));

vi.mock('../session/session-config-projection', () => ({
  createAgentSessionWithRuntime,
}));
import type { IService, IToolRegistry } from '@neko/shared';
import { SubAgentRuntimeCoordinator } from '../subagent-runtime';

function createService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  } as unknown as IService;
}

function createToolRegistry(): IToolRegistry {
  const tools: Array<{ name: string }> = [];
  return {
    register: vi.fn((tool: { name: string }) => {
      tools.push({ name: tool.name });
    }),
    has: vi.fn((name: string) => tools.some((tool) => tool.name === name)),
    list: vi.fn(() => tools),
    toToolDefinitions: vi.fn(() => []),
  } as unknown as IToolRegistry;
}

describe('SubAgentRuntimeCoordinator', () => {
  it('does not fall back to another conversation runtime when resolving model tiers', async () => {
    const coordinator = new SubAgentRuntimeCoordinator();
    const toolRegistry = createToolRegistry();
    coordinator.ensureSystem({
      createService,
      toolRegistry,
    });
    coordinator.registerRuntime({
      conversationId: 'conv-a',
      promptLocale: 'en',
      createService,
      toolRegistry,
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    const taskTool = (toolRegistry.register as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0].name === 'subagent',
    )?.[0];
    expect(taskTool).toBeDefined();

    const result = await taskTool.execute(
      {
        description: 'Check isolation',
        prompt: 'Do something',
      },
      {
        metadata: {
          conversationId: 'conv-b',
          runId: 'run-b',
          parentAgentId: 'agent-conv-b',
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: 'SubAgent runtime is not configured for conversation: conv-b',
    });
    expect(result.data).toMatchObject({
      parentAgentId: 'agent-conv-b',
      status: 'failed',
    });
  });

  it('propagates the parent runtime prompt locale into the child Agent session', async () => {
    const coordinator = new SubAgentRuntimeCoordinator();
    const toolRegistry = createToolRegistry();
    coordinator.ensureSystem({
      createService,
      toolRegistry,
    });
    coordinator.registerRuntime({
      conversationId: 'conv-zh',
      promptLocale: 'zh-cn',
      createService,
      toolRegistry,
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    const taskTool = (toolRegistry.register as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0].name === 'subagent',
    )?.[0];
    expect(taskTool).toBeDefined();

    const result = await taskTool.execute(
      {
        description: '检查本地化',
        prompt: '继续执行',
      },
      {
        metadata: {
          conversationId: 'conv-zh',
          runId: 'run-zh',
          parentAgentId: 'agent-conv-zh',
          locale: 'zh',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(createAgentSessionWithRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'zh' }),
    );
  });

  it('requires conversationId metadata before spawning a subagent task', async () => {
    const coordinator = new SubAgentRuntimeCoordinator();
    const toolRegistry = createToolRegistry();
    coordinator.ensureSystem({
      createService,
      toolRegistry,
    });
    coordinator.registerRuntime({
      conversationId: 'conv-a',
      promptLocale: 'en',
      createService,
      toolRegistry,
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    const taskTool = (toolRegistry.register as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0].name === 'subagent',
    )?.[0];
    expect(taskTool).toBeDefined();

    const result = await taskTool.execute(
      {
        description: 'Check metadata',
        prompt: 'Do something',
      },
      {
        metadata: {
          parentAgentId: 'agent-conv-a',
        },
      },
    );

    expect(result).toEqual({
      success: false,
      error: 'Tool execution requires conversationId ownership.',
    });
  });
});
