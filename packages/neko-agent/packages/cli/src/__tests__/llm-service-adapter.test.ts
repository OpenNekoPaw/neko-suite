import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILLMClient, LLMClientResponse, LLMClientStreamChunk } from '../llm-client';
import type { CLIConfig } from '../types';

// Mock llm-client module
const mockClient: {
  chat: ReturnType<typeof vi.fn>;
  chatStream: ReturnType<typeof vi.fn>;
  getProvider: ReturnType<typeof vi.fn>;
  getModel: ReturnType<typeof vi.fn>;
} = {
  chat: vi.fn(),
  chatStream: vi.fn(),
  getProvider: vi.fn().mockReturnValue('anthropic'),
  getModel: vi.fn().mockReturnValue('claude-sonnet-4'),
};

vi.mock('../llm-client', () => ({
  createLLMClient: vi.fn(() => mockClient),
}));

// Import after mock setup
import { LLMServiceAdapter, createLLMServiceAdapter } from '../llm-service-adapter';

const baseConfig: CLIConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4',
  apiKey: 'test-key',
  maxTokens: 4096,
  temperature: 0.5,
  verbose: false,
  workDir: '/tmp',
  mcpServers: [],
  outputFormat: 'text',
};

describe('LLMServiceAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chat()', () => {
    it('converts text-only response to ServiceResponse', async () => {
      const clientResponse: LLMClientResponse = {
        content: 'Hello world',
        usage: { inputTokens: 10, outputTokens: 20 },
      };
      mockClient.chat.mockResolvedValue(clientResponse);

      const adapter = new LLMServiceAdapter(baseConfig);
      const result = await adapter.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.id).toMatch(/^cli-\d+$/);
      expect(result.model).toBe('claude-sonnet-4');
      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello world');
      expect(result.message.toolCalls).toBeUndefined();
      expect(result.finishReason).toBe('stop');
    });

    it('maps tool calls correctly', async () => {
      const clientResponse: LLMClientResponse = {
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'readFile', arguments: { path: '/a.ts' } },
        ],
        usage: { inputTokens: 5, outputTokens: 15 },
      };
      mockClient.chat.mockResolvedValue(clientResponse);

      const adapter = new LLMServiceAdapter(baseConfig);
      const result = await adapter.chat([{ role: 'user', content: 'read' }]);

      expect(result.message.toolCalls).toHaveLength(1);
      const tc = result.message.toolCalls![0]!;
      expect(tc.id).toBe('tc-1');
      expect(tc.type).toBe('function');
      expect(tc.function.name).toBe('readFile');
      expect(tc.function.arguments).toBe(JSON.stringify({ path: '/a.ts' }));
    });

    it('sets finishReason to tool_calls when tool calls present', async () => {
      const clientResponse: LLMClientResponse = {
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'run', arguments: {} }],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
      mockClient.chat.mockResolvedValue(clientResponse);

      const adapter = new LLMServiceAdapter(baseConfig);
      const result = await adapter.chat([{ role: 'user', content: 'go' }]);

      expect(result.finishReason).toBe('tool_calls');
    });

    it('maps usage tokens correctly', async () => {
      const clientResponse: LLMClientResponse = {
        content: 'ok',
        usage: { inputTokens: 100, outputTokens: 200 },
      };
      mockClient.chat.mockResolvedValue(clientResponse);

      const adapter = new LLMServiceAdapter(baseConfig);
      const result = await adapter.chat([{ role: 'user', content: 'x' }]);

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      });
    });
  });

  describe('chatStream()', () => {
    async function collectChunks(
      iterable: AsyncIterable<unknown>
    ): Promise<unknown[]> {
      const chunks: unknown[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('converts content chunks', async () => {
      const streamChunks: LLMClientStreamChunk[] = [
        { type: 'content', content: 'Hello' },
      ];
      mockClient.chatStream.mockReturnValue(
        (async function* () { for (const c of streamChunks) yield c; })()
      );

      const adapter = new LLMServiceAdapter(baseConfig);
      const chunks = await collectChunks(
        adapter.chatStream([{ role: 'user', content: 'hi' }])
      );

      expect(chunks).toEqual([{ type: 'content', content: 'Hello' }]);
    });

    it('converts tool_call chunks', async () => {
      const streamChunks: LLMClientStreamChunk[] = [
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'search', arguments: { q: 'test' } },
        },
      ];
      mockClient.chatStream.mockReturnValue(
        (async function* () { for (const c of streamChunks) yield c; })()
      );

      const adapter = new LLMServiceAdapter(baseConfig);
      const chunks = await collectChunks(
        adapter.chatStream([{ role: 'user', content: 'find' }])
      );

      expect(chunks).toEqual([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: JSON.stringify({ q: 'test' }),
            },
          },
        },
      ]);
    });

    it('converts usage chunks (inputTokens -> promptTokens)', async () => {
      const streamChunks: LLMClientStreamChunk[] = [
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 75 } },
      ];
      mockClient.chatStream.mockReturnValue(
        (async function* () { for (const c of streamChunks) yield c; })()
      );

      const adapter = new LLMServiceAdapter(baseConfig);
      const chunks = await collectChunks(
        adapter.chatStream([{ role: 'user', content: 'x' }])
      );

      expect(chunks).toEqual([
        {
          type: 'usage',
          usage: { promptTokens: 50, completionTokens: 75, totalTokens: 125 },
        },
      ]);
    });

    it('converts done chunks', async () => {
      const streamChunks: LLMClientStreamChunk[] = [{ type: 'done' }];
      mockClient.chatStream.mockReturnValue(
        (async function* () { for (const c of streamChunks) yield c; })()
      );

      const adapter = new LLMServiceAdapter(baseConfig);
      const chunks = await collectChunks(
        adapter.chatStream([{ role: 'user', content: 'x' }])
      );

      expect(chunks).toEqual([{ type: 'done' }]);
    });
  });

  describe('embed()', () => {
    it('throws not supported error', async () => {
      const adapter = new LLMServiceAdapter(baseConfig);
      await expect(adapter.embed(['test'])).rejects.toThrow(
        'Embedding not supported in CLI mode'
      );
    });
  });
});

describe('createLLMServiceAdapter()', () => {
  it('returns existingService when provided', () => {
    const existing = { chat: vi.fn(), chatStream: vi.fn(), embed: vi.fn() } as any;
    const result = createLLMServiceAdapter(baseConfig, existing);
    expect(result).toBe(existing);
  });

  it('creates new LLMServiceAdapter when no existingService', () => {
    const result = createLLMServiceAdapter(baseConfig);
    expect(result).toBeInstanceOf(LLMServiceAdapter);
  });
});
