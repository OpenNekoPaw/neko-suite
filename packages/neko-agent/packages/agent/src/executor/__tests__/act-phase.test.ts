/**
 * Act Phase Unit Tests
 *
 * Tests the extracted act/observe/buildToolResultMessages functions
 * independently from AgentExecutor.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  act,
  observe,
  buildToolResultMessages,
  type ActDeps,
  type ToolProgressEvent,
} from '../act-phase';
import type { IToolRegistry, ToolResultWithMeta, ToolProgress, AgentStep } from '@neko/shared';

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
    expect(deps.toolRegistry.execute).toHaveBeenCalledWith(
      'Read',
      { path: '/tmp' },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
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
// act — ToolProgress collection
// =============================================================================

describe('act — progress collection', () => {
  it('should collect progress events from tool execution', async () => {
    const mockRegistry = createMockToolRegistry();
    // Mock execute to call onProgress before resolving
    (mockRegistry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _name: string,
        _args: Record<string, unknown>,
        options?: { onProgress?: (p: ToolProgress) => void },
      ) => {
        if (options?.onProgress) {
          options.onProgress({ percent: 50, stage: 'Processing' });
          options.onProgress({ percent: 100, stage: 'Complete' });
        }
        return { success: true, data: 'done' };
      },
    );

    const deps = createDeps({ toolRegistry: mockRegistry });
    const step = await act(deps, [{ id: 'call_1', name: 'GenerateImage', arguments: {} }]);

    expect(step.toolProgress).toBeDefined();
    expect(step.toolProgress).toHaveLength(2);
    expect(step.toolProgress![0]).toEqual({
      toolCallId: 'call_1',
      toolName: 'GenerateImage',
      percent: 50,
      stage: 'Processing',
      preview: undefined,
    });
    expect(step.toolProgress![1]!.percent).toBe(100);
  });

  it('should not include toolProgress when no progress events emitted', async () => {
    const deps = createDeps();
    const step = await act(deps, [{ id: 'call_1', name: 'Read', arguments: {} }]);

    expect(step.toolProgress).toBeUndefined();
  });

  it('should collect progress from multiple concurrent tools', async () => {
    const mockRegistry = createMockToolRegistry();
    let callCount = 0;
    (mockRegistry.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _name: string,
        _args: Record<string, unknown>,
        options?: { onProgress?: (p: ToolProgress) => void },
      ) => {
        callCount++;
        if (options?.onProgress) {
          options.onProgress({ percent: 100, stage: `Done ${callCount}` });
        }
        return { success: true, data: `result_${callCount}` };
      },
    );

    // Mark tools as concurrency-safe so they run in parallel
    mockRegistry.get = vi.fn().mockReturnValue({ isConcurrencySafe: true });

    const deps = createDeps({ toolRegistry: mockRegistry });
    const step = await act(deps, [
      { id: 'call_1', name: 'GenA', arguments: {} },
      { id: 'call_2', name: 'GenB', arguments: {} },
    ]);

    expect(step.toolProgress).toBeDefined();
    expect(step.toolProgress!.length).toBeGreaterThanOrEqual(2);
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

  it('should return plain string content when no attachments', () => {
    const results: ToolResultWithMeta[] = [
      { success: true, data: 'ok', callId: 'c1', name: 'Read' },
    ];

    const messages = buildToolResultMessages(results);

    expect(typeof messages[0]!.content).toBe('string');
  });

  it('should return ContentPart[] when image attachments are present', () => {
    const results: ToolResultWithMeta[] = [
      {
        success: true,
        data: { url: '/output.png' },
        callId: 'c1',
        name: 'GenerateImage',
        attachments: [{ type: 'image', path: '/tmp/output.png', mimeType: 'image/png' }],
      },
    ];

    const messages = buildToolResultMessages(results);
    const content = messages[0]!.content;

    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string; text?: string; imageUrl?: string }>;
    expect(parts).toHaveLength(2);
    expect(parts[0]!.type).toBe('text');
    expect(parts[0]!.text).toBe(JSON.stringify({ url: '/output.png' }));
    expect(parts[1]!.type).toBe('image');
    expect(parts[1]!.imageUrl).toBe('file:///tmp/output.png');
  });

  it('should handle audio/video attachments as text references', () => {
    const results: ToolResultWithMeta[] = [
      {
        success: true,
        data: 'generated',
        callId: 'c1',
        name: 'GenerateMusic',
        attachments: [
          { type: 'audio', path: '/tmp/music.mp3', mimeType: 'audio/mpeg' },
          { type: 'video', path: '/tmp/clip.mp4' },
        ],
      },
    ];

    const messages = buildToolResultMessages(results);
    const parts = messages[0]!.content as Array<{ type: string; text?: string }>;

    expect(parts).toHaveLength(3); // text + audio ref + video ref
    expect(parts[1]!.text).toContain('audio');
    expect(parts[1]!.text).toContain('audio/mpeg');
    expect(parts[1]!.text).toContain('/tmp/music.mp3');
    expect(parts[2]!.text).toContain('video');
    expect(parts[2]!.text).toContain('/tmp/clip.mp4');
  });

  it('should handle mixed image and non-image attachments', () => {
    const results: ToolResultWithMeta[] = [
      {
        success: true,
        data: 'done',
        callId: 'c1',
        name: 'GenerateVideo',
        attachments: [
          { type: 'image', path: '/tmp/thumb.jpg' },
          { type: 'video', path: '/tmp/output.mp4', mimeType: 'video/mp4' },
        ],
      },
    ];

    const messages = buildToolResultMessages(results);
    const parts = messages[0]!.content as Array<{ type: string; text?: string; imageUrl?: string }>;

    expect(parts).toHaveLength(3);
    expect(parts[0]!.type).toBe('text');
    expect(parts[1]!.type).toBe('image');
    expect(parts[1]!.imageUrl).toBe('file:///tmp/thumb.jpg');
    expect(parts[2]!.type).toBe('text');
    expect(parts[2]!.text).toContain('video');
  });
});
