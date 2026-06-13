/**
 * Executor Integration Tests
 *
 * Verifies cross-module behavior:
 * 1. execute() vs executeStream() produce consistent step sequences
 * 2. AgentSessionInitializer creates properly wired components
 * 3. SkillInjectionCoordinator rollback under multi-track failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IService,
  IToolRegistry,
  AgentStep,
  ServiceResponse,
  ChatMessage,
  StreamChunk,
} from '@neko/shared';
import { AgentExecutor, type AgentExecutorOptions } from '../executor/agent-executor';
import { initializeSession, type SessionCallbacks } from '../session/agent-session-initializer';
import type { AgentSessionConfig } from '../session/types';
import { SkillInjectionCoordinator } from '../skill/skill-injection-coordinator';
import { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import type { ISystemPromptComposer } from '../prompt/system-prompt-composer-types';
import type { IPermissionManager } from '../permission/permission-manager-types';

// =============================================================================
// Shared Helpers
// =============================================================================

async function collectSteps(iterable: AsyncIterable<AgentStep>): Promise<AgentStep[]> {
  const steps: AgentStep[] = [];
  for await (const step of iterable) {
    steps.push(step);
  }
  return steps;
}

function textResponse(content: string): ServiceResponse {
  return {
    id: 'resp_1',
    model: 'test-model',
    message: { role: 'assistant', content } as ChatMessage,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

function toolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
  callId = 'call_1',
): ServiceResponse {
  return {
    id: 'resp_tc',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: callId,
          type: 'function' as const,
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    } as ChatMessage,
    finishReason: 'tool_calls',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

/** Create a streaming version of a ServiceResponse */
async function* responseToStream(resp: ServiceResponse): AsyncIterable<StreamChunk> {
  const content = typeof resp.message.content === 'string' ? resp.message.content : '';
  if (content) {
    yield { type: 'content', content };
  }
  if (resp.message.toolCalls) {
    for (const tc of resp.message.toolCalls) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: tc.id,
          type: tc.type,
          function: tc.function,
        },
      };
    }
  }
  yield {
    type: 'done',
    finishReason: resp.finishReason,
    usage: resp.usage,
  };
}

function createMockService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}

function createMockToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
    toToolDefinitions: vi.fn().mockReturnValue([]),
  };
}

function createExecutorOptions(
  service: IService,
  toolRegistry: IToolRegistry,
): AgentExecutorOptions {
  return {
    service,
    toolRegistry,
    config: {
      name: 'integration-test',
      systemPrompt: 'You are a test agent.',
      tools: [],
      maxIterations: 5,
    },
  };
}

// =============================================================================
// 1. execute() vs executeStream() consistency
// =============================================================================

describe('Executor: execute vs executeStream consistency', () => {
  let service: IService;
  let toolRegistry: IToolRegistry;

  beforeEach(() => {
    service = createMockService();
    toolRegistry = createMockToolRegistry();
  });

  it('should produce same final response for text-only reply', async () => {
    const resp = textResponse('Hello, world!');
    (service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
    (service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue(responseToStream(resp));

    const options = createExecutorOptions(service, toolRegistry);

    // execute()
    const executor1 = new AgentExecutor(options);
    const result = await executor1.execute('Hi');

    // executeStream()
    const executor2 = new AgentExecutor(options);
    const steps = await collectSteps(executor2.executeStream('Hi'));

    expect(result.response).toBe('Hello, world!');
    // Stream should contain at least one step with the response content
    const thinkSteps = steps.filter((s) => s.type === 'think' || s.type === 'respond');
    expect(thinkSteps.length).toBeGreaterThan(0);

    // The final respond/think step should have the same content
    const lastContent = thinkSteps[thinkSteps.length - 1]?.content;
    expect(lastContent).toBe('Hello, world!');
  });

  it('should produce same tool call steps for tool-calling flow', async () => {
    const tcResp = toolCallResponse('Bash', { command: 'ls' });
    const finalResp = textResponse('Done!');

    // execute: first call → tool, second call → final
    (service.chat as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(tcResp)
      .mockResolvedValueOnce(finalResp);

    // executeStream: same sequence
    (service.chatStream as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(responseToStream(tcResp))
      .mockReturnValueOnce(responseToStream(finalResp));

    const options = createExecutorOptions(service, toolRegistry);

    // execute()
    const executor1 = new AgentExecutor(options);
    const result = await executor1.execute('Run ls');

    // executeStream()
    const executor2 = new AgentExecutor(options);
    const steps = await collectSteps(executor2.executeStream('Run ls'));

    // Both should complete successfully
    expect(result.success).toBe(true);
    expect(result.response).toBe('Done!');

    // Stream should have think(with tool calls) → act → think/respond
    const stepTypes = steps.map((s) => s.type);
    expect(stepTypes).toContain('think');
    expect(stepTypes).toContain('act');
  });
});

// =============================================================================
// 2. AgentSessionInitializer
// =============================================================================

describe('AgentSessionInitializer', () => {
  it('should create all required components', () => {
    const service = createMockService();
    const toolRegistry = createMockToolRegistry();

    const config: AgentSessionConfig = {
      service,
      toolRegistry,
      systemPrompt: 'Test prompt',
      modelId: 'test-model',
    };

    const callbacks: SessionCallbacks = {
      onToolConfirmation: vi.fn(),
    };

    const components = initializeSession(config, callbacks);

    expect(components.compressor).toBeDefined();
    expect(components.toolGroupRegistry).toBeDefined();
    expect(components.toolCategoryRegistry).toBeDefined();
    expect(components.toolInjectionManager).toBeDefined();
    expect(components.promptComposer).toBeDefined();
    expect(components.executor).toBeDefined();
    expect(components.permissionHooks).toBeDefined();
    expect(components.history).toHaveLength(1);
    expect(components.history[0]?.role).toBe('system');
  });

  it('should use custom registries when provided', async () => {
    const service = createMockService();
    const toolRegistry = createMockToolRegistry();

    // Import actual classes for custom registry testing
    const { ToolGroupRegistry } = await import('../skill');
    const { ToolCategoryRegistry } = await import('../tools');

    const customGroupRegistry = new ToolGroupRegistry();
    const customCategoryRegistry = new ToolCategoryRegistry();

    const config: AgentSessionConfig = {
      service,
      toolRegistry,
      systemPrompt: 'Test prompt',
      modelId: 'test-model',
      toolGroupRegistry: customGroupRegistry as any,
      toolCategoryRegistry: customCategoryRegistry as any,
    };

    const components = initializeSession(config, { onToolConfirmation: vi.fn() });

    // Should use the provided registries, not create new ones
    expect(components.toolGroupRegistry).toBe(customGroupRegistry);
    expect(components.toolCategoryRegistry).toBe(customCategoryRegistry);
  });

  it('should set default execution mode to auto', () => {
    const service = createMockService();
    const toolRegistry = createMockToolRegistry();

    const config: AgentSessionConfig = {
      service,
      toolRegistry,
      systemPrompt: 'Test prompt',
      modelId: 'test-model',
    };

    const components = initializeSession(config, { onToolConfirmation: vi.fn() });

    // Permission hooks should be in 'auto' mode
    expect(components.permissionHooks.getMode()).toBe('auto');
  });
});

// =============================================================================
// 3. SkillInjectionCoordinator — multi-track atomicity
// =============================================================================

describe('SkillInjectionCoordinator: multi-track atomicity', () => {
  function createMockComposer(): ISystemPromptComposer {
    return {
      setBase: vi.fn(),
      setSection: vi.fn(),
      removeSection: vi.fn().mockReturnValue(true),
      hasSection: vi.fn().mockReturnValue(false),
      getSection: vi.fn(),
      compose: vi.fn().mockReturnValue('composed'),
      getTotalTokens: vi.fn().mockReturnValue(0),
      getLayerUsage: vi.fn(),
      reset: vi.fn(),
    };
  }

  function createMockPermissionManager(): IPermissionManager {
    return {
      setMode: vi.fn(),
      getMode: vi.fn().mockReturnValue('auto'),
      updateRules: vi.fn(),
      addAllowRule: vi.fn(),
      removeAllowRule: vi.fn(),
      getRules: vi.fn().mockReturnValue({}),
      confirmTool: vi.fn(),
      getPendingConfirmations: vi.fn().mockReturnValue([]),
    };
  }

  it('should atomically apply and remove across all 3 tracks', () => {
    const composer = createMockComposer();
    const permission = createMockPermissionManager();
    const syncCalls: number[] = [];
    let callCount = 0;

    const coordinator = new SkillInjectionCoordinator({
      promptComposer: composer,
      getPermissionHooks: () => permission,
      syncSystemPrompt: () => {
        syncCalls.push(++callCount);
      },
      skillInjectionModule: new SkillInjectionModule(),
    });

    // Apply
    coordinator.apply({
      name: 'test-skill',
      systemPrompt: 'Do something',
      type: 'skill',
      allowedTools: ['Read', 'Write'],
    });

    expect(composer.setSection).toHaveBeenCalledTimes(1);
    expect(permission.addAllowRule).toHaveBeenCalledTimes(2);
    expect(coordinator.hasActiveInjection()).toBe(true);
    expect(coordinator.getActiveSkillAllowedTools()).toEqual(['Read', 'Write']);

    // Remove
    coordinator.remove('test-skill');

    expect(composer.removeSection).toHaveBeenCalledWith('skill:test-skill');
    expect(permission.removeAllowRule).toHaveBeenCalledWith('Read');
    expect(permission.removeAllowRule).toHaveBeenCalledWith('Write');
    expect(coordinator.hasActiveInjection()).toBe(false);
    expect(coordinator.getActiveSkillAllowedTools()).toBeUndefined();
  });

  it('should leave no side effects after rollback on Track B failure', () => {
    const composer = createMockComposer();
    let addCallCount = 0;
    const permission = createMockPermissionManager();
    (permission.addAllowRule as ReturnType<typeof vi.fn>).mockImplementation(() => {
      addCallCount++;
      if (addCallCount === 2) throw new Error('Track B failure');
    });

    const coordinator = new SkillInjectionCoordinator({
      promptComposer: composer,
      getPermissionHooks: () => permission,
      syncSystemPrompt: vi.fn(),
      skillInjectionModule: new SkillInjectionModule(),
    });

    expect(() =>
      coordinator.apply({
        name: 'fail-skill',
        systemPrompt: 'Will fail',
        type: 'skill',
        allowedTools: ['Read', 'Write'],
      }),
    ).toThrow('Track B failure');

    // Prompt section should be added then rolled back
    expect(composer.setSection).toHaveBeenCalledTimes(1);
    expect(composer.removeSection).toHaveBeenCalledWith('skill:fail-skill');

    // First rule added should be rolled back
    expect(permission.removeAllowRule).toHaveBeenCalledWith('Read');

    // No active injection
    expect(coordinator.hasActiveInjection()).toBe(false);
    expect(coordinator.getActiveSkillAllowedTools()).toBeUndefined();
  });
});
