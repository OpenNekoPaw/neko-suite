/**
 * Act Phase Unit Tests
 *
 * Tests the extracted act/observe/buildToolResultMessages functions
 * independently from AgentExecutor.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, observe, buildToolResultMessages, type ActDeps } from '../act-phase';
import type { IToolRegistry, ToolResultWithMeta } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

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

function createDeps(overrides?: Partial<ActDeps>): ActDeps {
  return {
    toolRegistry: createMockToolRegistry(),
    hooks: [],
    abortController: new AbortController(),
    ...overrides,
  };
}

// =============================================================================
// act
// =============================================================================

describe('act', () => {
  it('should execute tool calls and return act step', async () => {
    const deps = createDeps();
    const toolCalls = [{ id: 'call_1', name: 'Read', arguments: { path: '/tmp' } }];

    const step = await act(deps, toolCalls);

    expect(step.type).toBe('act');
    expect(step.toolResults).toHaveLength(1);
    expect((step.toolResults as ToolResultWithMeta[])[0]!.success).toBe(true);
    expect(deps.toolRegistry.execute).toHaveBeenCalledWith('Read', { path: '/tmp' });
  });

  it('should handle tool execution failure gracefully', async () => {
    const deps = createDeps();
    (deps.toolRegistry.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Tool failed'),
    );

    const step = await act(deps, [{ id: 'call_1', name: 'Bash', arguments: {} }]);

    expect(step.toolResults).toHaveLength(1);
    expect((step.toolResults as ToolResultWithMeta[])[0]!.success).toBe(false);
    expect((step.toolResults as ToolResultWithMeta[])[0]!.error).toBe('Tool failed');
  });

  it('should return aborted result when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = createDeps({ abortController: controller });

    const step = await act(deps, [{ id: 'call_1', name: 'Read', arguments: {} }]);

    expect((step.toolResults as ToolResultWithMeta[])[0]!.success).toBe(false);
    expect((step.toolResults as ToolResultWithMeta[])[0]!.error).toBe('Execution aborted');
  });

  it('should run beforeAct and afterAct hooks', async () => {
    const beforeAct = vi.fn();
    const afterAct = vi.fn();
    const deps = createDeps({ hooks: [{ name: 'test-hook', beforeAct, afterAct }] });

    await act(deps, [{ id: 'call_1', name: 'Read', arguments: {} }]);

    expect(beforeAct).toHaveBeenCalledTimes(1);
    expect(afterAct).toHaveBeenCalledTimes(1);
  });

  it('should allow hook to intercept tool call via onToolCall', async () => {
    const customResult: ToolResultWithMeta = {
      success: true,
      data: 'intercepted',
      callId: 'call_1',
      name: 'Read',
    };
    const onToolCall = vi.fn().mockResolvedValue(customResult);
    const deps = createDeps({ hooks: [{ name: 'interceptor', onToolCall }] });

    const step = await act(deps, [{ id: 'call_1', name: 'Read', arguments: {} }]);

    expect((step.toolResults as ToolResultWithMeta[])[0]!.data).toBe('intercepted');
    // Original execute should NOT be called
    expect(deps.toolRegistry.execute).not.toHaveBeenCalled();
  });
});

// =============================================================================
// observe
// =============================================================================

describe('observe', () => {
  it('should summarize successful results', () => {
    const results: ToolResultWithMeta[] = [
      { success: true, data: 'ok', callId: 'c1', name: 'Read' },
    ];

    const step = observe(results);

    expect(step.type).toBe('observe');
    expect(step.content).toContain('Read');
    expect(step.content).toContain('Success');
  });

  it('should summarize failed results with error', () => {
    const results: ToolResultWithMeta[] = [
      { success: false, error: 'Not found', callId: 'c1', name: 'Read' },
    ];

    const step = observe(results);

    expect(step.content).toContain('Failed');
    expect(step.content).toContain('Not found');
  });

  it('should include retry info', () => {
    const results: ToolResultWithMeta[] = [
      { success: true, data: 'ok', callId: 'c1', name: 'Bash', retryCount: 2 },
    ];

    const step = observe(results);

    expect(step.content).toContain('retried 2x');
  });
});

// =============================================================================
// buildToolResultMessages
// =============================================================================

describe('buildToolResultMessages', () => {
  it('should build tool messages from results', () => {
    const results: ToolResultWithMeta[] = [
      { success: true, data: { output: 'hello' }, callId: 'c1', name: 'Read' },
      { success: false, error: 'fail', callId: 'c2', name: 'Write' },
    ];

    const messages = buildToolResultMessages(results);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('tool');
    expect(messages[0]!.content).toBe(JSON.stringify({ output: 'hello' }));
    expect(messages[1]!.content).toBe(JSON.stringify({ error: 'fail' }));
  });
});
