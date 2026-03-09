/**
 * AgentStreamProcessor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentStreamProcessor } from '../agentStreamProcessor';

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: any) => ({ toString: () => `webview-uri:${uri.fsPath}` })),
  };
}

function createMockCallbacks() {
  return {
    onPhaseChange: vi.fn(),
  };
}

/**
 * Helper to create an async iterable from an array of events
 */
async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('AgentStreamProcessor', () => {
  let processor: AgentStreamProcessor;
  let webview: ReturnType<typeof createMockWebview>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    callbacks = createMockCallbacks();
    processor = new AgentStreamProcessor({});
  });

  describe('processStream', () => {
    it('should return empty result for empty stream', async () => {
      const events = toAsyncIterable([]);
      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('');
      expect(result.accumulatedThinking).toBe('');
      expect(result.hasError).toBe(false);
      expect(result.collectedToolCalls).toEqual([]);
      expect(result.contentBlocks).toEqual([]);
    });

    it('should handle thinking_content events', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Let me think...' },
        { type: 'thinking_content', thinking: ' about this.' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Let me think... about this.');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.thinking).toBe('Let me think... about this.');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('thinking', undefined);

      // Should have sent streamThinking messages
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamThinking', content: 'Let me think...' }),
      );
    });

    it('should handle text events', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Hello ' },
        { type: 'text_delta', content: 'world!' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('Hello world!');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('text');
      expect(result.contentBlocks[0]!.content).toBe('Hello world!');
      expect(result.contentBlocks[0]!.isStreaming).toBe(false); // Marked complete at end
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('streaming', undefined);
    });

    it('should mark thinking complete when text starts', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Thinking...' },
        { type: 'text', content: 'Response' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.isThinkingComplete).toBe(true);
      expect(result.contentBlocks[1]!.type).toBe('text');
    });

    it('should handle tool_call events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.collectedToolCalls[0]!.name).toBe('read_file');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('tool_call');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('acting', 'read_file');
    });

    it('should stop text streaming when tool_call arrives', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Let me read that file.' },
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      // Text block should be finalized (not streaming)
      expect(result.contentBlocks[0]!.isStreaming).toBe(false);
    });

    it('should handle tool_result events and update tool call data', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tc-1', success: true, data: 'file content' },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.result).toEqual({
        success: true,
        data: 'file content',
        error: undefined,
      });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResult', toolCallId: 'tc-1', success: true }),
      );
    });

    it('should handle tool_confirmation events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_confirmation',
          toolConfirmation: {
            toolCall: { id: 'tc-1', name: 'write_file' },
            action: 'confirm',
            description: 'Writing file',
            details: { path: '/tmp/out.ts' },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolConfirmation',
          toolName: 'write_file',
          action: 'confirm',
        }),
      );
    });

    it('should handle error events', async () => {
      // Start with a non-idle phase so the phase transition to idle is triggered
      const events = toAsyncIterable([
        { type: 'text', content: 'Partial response' },
        { type: 'error', error: { message: 'Rate limited' } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.hasError).toBe(true);
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'Rate limited' }),
      );
    });

    it('should handle messageQueued events', async () => {
      const events = toAsyncIterable([{ type: 'messageQueued', content: 'Queued message' }]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'messageQueued', content: 'Queued message' }),
      );
    });

    it('should handle done event with usage', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Done!' },
        { type: 'done', usage: { totalTokens: 1500 } },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount', tokenCount: 1500 }),
      );
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
    });

    it('should handle done event without usage', async () => {
      const events = toAsyncIterable([{ type: 'done' }]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      // Should not send token count
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount' }),
      );
    });

    it('should detect plan mode in tool results', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-plan', name: 'ExitPlanMode', arguments: {} },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-plan',
            success: true,
            data: {
              planMode: { status: 'awaiting_approval' },
              title: 'Refactor Auth',
              plan: '## Step 1\nDo X\n## Step 2\nDo Y',
              filePath: '/tmp/plan.md',
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      const planBlocks = result.contentBlocks.filter((b) => b.type === 'plan');
      expect(planBlocks).toHaveLength(1);
      expect(planBlocks[0]!.plan!.title).toBe('Refactor Auth');
      expect(planBlocks[0]!.plan!.steps).toHaveLength(2);
      expect(planBlocks[0]!.plan!.steps[0]!.description).toContain('Step 1');
      expect(planBlocks[0]!.plan!.filePath).toBe('/tmp/plan.md');
    });

    it('should handle full conversation flow', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Analyzing...' },
        { type: 'text', content: 'I will read the file.' },
        { type: 'tool_call', toolCall: { id: 'tc-1', name: 'read', arguments: { p: '/f.ts' } } },
        { type: 'tool_result', toolResult: { toolCallId: 'tc-1', success: true, data: 'content' } },
        { type: 'text', content: ' Here is the result.' },
        { type: 'done', usage: { totalTokens: 500 } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Analyzing...');
      expect(result.accumulatedResponse).toBe('I will read the file. Here is the result.');
      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.hasError).toBe(false);
      // thinking + text + tool_call + text
      expect(result.contentBlocks).toHaveLength(4);
    });
  });

  describe('updateToolResultWithUrls', () => {
    it('should do nothing without conversations', () => {
      processor = new AgentStreamProcessor({});
      // Should not throw
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/path/to/file.png']);
    });

    it('should update tool results matching taskId in toolCalls', () => {
      const messages = [
        {
          toolCalls: [
            {
              id: 'tc-1',
              result: {
                success: true,
                data: { taskId: 'task-1', backgroundMode: true },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        manager: { updateMessages: vi.fn() },
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/output/file.png']);

      expect(conversations.manager.updateMessages).toHaveBeenCalledWith(
        'conv-1',
        expect.arrayContaining([
          expect.objectContaining({
            toolCalls: expect.arrayContaining([
              expect.objectContaining({
                result: expect.objectContaining({
                  data: expect.objectContaining({
                    status: 'completed',
                    url: '/output/file.png',
                    urls: ['/output/file.png'],
                  }),
                }),
              }),
            ]),
          }),
        ]),
      );
    });

    it('should update tool results matching taskId in contentBlocks', () => {
      const messages = [
        {
          contentBlocks: [
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'generate',
                arguments: {},
                result: {
                  success: true,
                  data: { taskId: 'task-2', backgroundMode: true },
                },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        manager: { updateMessages: vi.fn() },
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-2', ['/out/video.mp4']);

      expect(conversations.manager.updateMessages).toHaveBeenCalled();
    });

    it('should not update when taskId does not match', () => {
      const messages = [
        {
          toolCalls: [
            {
              id: 'tc-1',
              result: {
                success: true,
                data: { taskId: 'task-99', backgroundMode: true },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        manager: { updateMessages: vi.fn() },
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/out/file.png']);

      expect(conversations.manager.updateMessages).not.toHaveBeenCalled();
    });

    it('should handle missing conversation gracefully', () => {
      const conversations = {
        get: vi.fn().mockReturnValue(undefined),
        manager: { updateMessages: vi.fn() },
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      // Should not throw
      processor.updateToolResultWithUrls('conv-missing', 'task-1', ['/file.png']);
      expect(conversations.manager.updateMessages).not.toHaveBeenCalled();
    });
  });
});
