import { describe, expect, it, vi } from 'vitest';
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
      createService,
      toolRegistry,
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    const taskTool = (toolRegistry.register as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0].name === 'task',
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

  it('requires conversationId metadata before spawning a subagent task', async () => {
    const coordinator = new SubAgentRuntimeCoordinator();
    const toolRegistry = createToolRegistry();
    coordinator.ensureSystem({
      createService,
      toolRegistry,
    });
    coordinator.registerRuntime({
      conversationId: 'conv-a',
      createService,
      toolRegistry,
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    const taskTool = (toolRegistry.register as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0].name === 'task',
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
      error: 'Missing conversationId for SubAgent task',
    });
  });
});
