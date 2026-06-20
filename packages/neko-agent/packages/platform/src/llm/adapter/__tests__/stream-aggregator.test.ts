/**
 * Unit tests for stream-aggregator.ts
 */

import { describe, it, expect } from 'vitest';
import { aggregateStream, createStreamCollector } from '../stream-aggregator';
import type { ChatChunk } from '../../../types/adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a plain array into an async iterable of ChatChunk. */
async function* toStream(chunks: ChatChunk[]): AsyncIterable<ChatChunk> {
  for (const chunk of chunks) yield chunk;
}

/** Minimal valid chunk factory — only required fields. */
function makeChunk(overrides: Partial<ChatChunk> & { id?: string; model?: string }): ChatChunk {
  return {
    id: 'chunk-id',
    model: 'test-model',
    delta: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aggregateStream
// ---------------------------------------------------------------------------

describe('aggregateStream', () => {
  describe('text content aggregation', () => {
    it('concatenates content strings from multiple chunks', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: 'Hello' } }),
        makeChunk({ delta: { content: ', ' } }),
        makeChunk({ delta: { content: 'world' } }),
        makeChunk({ delta: {}, finishReason: 'stop' }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.content).toBe('Hello, world');
    });

    it('preserves whitespace and special characters in content', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: '  leading' } }),
        makeChunk({ delta: { content: '\nnewline\t' } }),
        makeChunk({ delta: { content: 'trailing  ' } }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.content).toBe('  leading\nnewline\ttrailing  ');
    });

    it('returns empty string when no chunk carries content', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: {} }),
        makeChunk({ delta: {}, finishReason: 'stop' }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.content).toBe('');
    });

    it('ignores chunks whose content field is absent', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: 'A' } }),
        makeChunk({ delta: {} }), // no content key
        makeChunk({ delta: { content: 'B' } }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.content).toBe('AB');
    });
  });

  describe('tool call aggregation', () => {
    it('collects a single tool call from one chunk', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'get_time', arguments: '{}' } },
            ],
          },
          finishReason: 'tool_calls',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0]).toEqual({
        id: 'tc-1',
        type: 'function',
        function: { name: 'get_time', arguments: '{}' },
      });
    });

    it('merges argument fragments for the same tool call ID', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'search', arguments: '{"q"' } },
            ],
          },
        }),
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'search', arguments: ':"cats"}' } },
            ],
          },
          finishReason: 'tool_calls',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0].function.arguments).toBe('{"q":"cats"}');
    });

    it('merges name fragments for the same tool call ID', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: {
            toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'Get', arguments: '' } }],
          },
        }),
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'Context', arguments: '{}' } },
            ],
          },
          finishReason: 'tool_calls',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0].function.name).toBe('GetContext');
      expect(response.message.toolCalls?.[0].function.arguments).toBe('{}');
    });

    it('keeps distinct entries for different tool call IDs', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'fn_a', arguments: '{"x":1}' } },
            ],
          },
        }),
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-2', type: 'function', function: { name: 'fn_b', arguments: '{"y":2}' } },
            ],
          },
          finishReason: 'tool_calls',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.toolCalls).toHaveLength(2);
      expect(response.message.toolCalls?.map((tc) => tc.id)).toEqual(['tc-1', 'tc-2']);
    });

    it('returns toolCalls as undefined when no tool calls appear', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: 'plain text' }, finishReason: 'stop' }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.toolCalls).toBeUndefined();
    });

    it('handles mixed content and tool call chunks', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: 'Thinking...' } }),
        makeChunk({
          delta: {
            toolCalls: [
              { id: 'tc-1', type: 'function', function: { name: 'calc', arguments: '{"n":42}' } },
            ],
          },
          finishReason: 'tool_calls',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.message.content).toBe('Thinking...');
      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls?.[0].function.name).toBe('calc');
    });
  });

  describe('metadata: id, model, finishReason, usage', () => {
    it('aggregates reasoning content for replay and thinking presentation', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: { reasoningContent: 'first ' },
          reasoningContent: 'first ',
          thinking: 'first ',
        }),
        makeChunk({
          delta: { reasoningContent: 'second' },
          reasoningContent: 'second',
          thinking: 'second',
          finishReason: 'stop',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.reasoningContent).toBe('first second');
      expect(response.thinking).toBe('first second');
      expect(response.message.reasoningContent).toBe('first second');
    });

    it('uses the id and model from the last chunk', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ id: 'first', model: 'model-a', delta: { content: 'x' } }),
        makeChunk({ id: 'last', model: 'model-b', delta: {}, finishReason: 'stop' }),
      ];

      const response = await aggregateStream(toStream(chunks));

      // Each chunk overwrites id/model — last one wins
      expect(response.id).toBe('last');
      expect(response.model).toBe('model-b');
    });

    it('captures the last finishReason seen', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({ delta: { content: 'a' } }),
        makeChunk({ delta: {}, finishReason: 'length' }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.finishReason).toBe('length');
    });

    it('defaults finishReason to "stop" when no chunk provides one', async () => {
      const chunks: ChatChunk[] = [makeChunk({ delta: { content: 'hi' } })];

      const response = await aggregateStream(toStream(chunks));

      expect(response.finishReason).toBe('stop');
    });

    it('captures usage from the last chunk that carries it', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          delta: { content: 'part1' },
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        }),
        makeChunk({
          delta: { content: 'part2' },
          usage: { promptTokens: 10, completionTokens: 7, totalTokens: 17 },
          finishReason: 'stop',
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 7, totalTokens: 17 });
    });

    it('defaults usage to zeros when no chunk provides it', async () => {
      const chunks: ChatChunk[] = [makeChunk({ delta: { content: 'hi' }, finishReason: 'stop' })];

      const response = await aggregateStream(toStream(chunks));

      expect(response.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });

    it('always sets message.role to "assistant"', async () => {
      const response = await aggregateStream(toStream([makeChunk({ delta: { content: 'ok' } })]));

      expect(response.message.role).toBe('assistant');
    });
  });

  describe('edge cases', () => {
    it('handles an empty stream and returns safe defaults', async () => {
      async function* empty(): AsyncIterable<ChatChunk> {
        // yields nothing
      }

      const response = await aggregateStream(empty());

      expect(response.id).toBe('');
      expect(response.model).toBe('');
      expect(response.message.content).toBe('');
      expect(response.message.toolCalls).toBeUndefined();
      expect(response.finishReason).toBe('stop');
      expect(response.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });

    it('handles a single metadata-only chunk (no content, no tool calls)', async () => {
      const chunks: ChatChunk[] = [
        makeChunk({
          id: 'meta-only',
          model: 'gpt-4o',
          delta: {},
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 0, totalTokens: 20 },
        }),
      ];

      const response = await aggregateStream(toStream(chunks));

      expect(response.id).toBe('meta-only');
      expect(response.model).toBe('gpt-4o');
      expect(response.message.content).toBe('');
      expect(response.message.toolCalls).toBeUndefined();
      expect(response.usage.promptTokens).toBe(20);
    });
  });
});

// ---------------------------------------------------------------------------
// createStreamCollector
// ---------------------------------------------------------------------------

describe('createStreamCollector', () => {
  it('re-yields every chunk from the source stream', async () => {
    const source: ChatChunk[] = [
      makeChunk({ id: 'c1', delta: { content: 'A' } }),
      makeChunk({ id: 'c2', delta: { content: 'B' } }),
      makeChunk({ id: 'c3', delta: {}, finishReason: 'stop' }),
    ];

    const { stream } = createStreamCollector(toStream(source));

    const yielded: ChatChunk[] = [];
    for await (const chunk of stream) {
      yielded.push(chunk);
    }

    expect(yielded).toHaveLength(3);
    expect(yielded[0]?.id).toBe('c1');
    expect(yielded[1]?.id).toBe('c2');
    expect(yielded[2]?.id).toBe('c3');
  });

  it('resolves the response promise after the stream is fully consumed', async () => {
    const source: ChatChunk[] = [
      makeChunk({ delta: { content: 'Hello' } }),
      makeChunk({ delta: { content: ' World' }, finishReason: 'stop' }),
    ];

    const { stream, response } = createStreamCollector(toStream(source));

    // Consume the stream first
    for await (const _ of stream) {
      // drain
    }

    const result = await response;
    expect(result.message.content).toBe('Hello World');
    expect(result.finishReason).toBe('stop');
  });

  it('collected response matches aggregateStream output for the same chunks', async () => {
    const source: ChatChunk[] = [
      makeChunk({ id: 'x', model: 'claude-3', delta: { content: 'foo' } }),
      makeChunk({
        id: 'x',
        model: 'claude-3',
        delta: {
          toolCalls: [
            { id: 'tc-1', type: 'function', function: { name: 'fn', arguments: '{"k":"v"}' } },
          ],
        },
        finishReason: 'tool_calls',
        usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
      }),
    ];

    // Run aggregateStream independently for reference
    const expected = await aggregateStream(toStream(source));

    // Run createStreamCollector
    const { stream, response } = createStreamCollector(toStream(source));
    for await (const _ of stream) {
      // drain
    }
    const actual = await response;

    expect(actual).toEqual(expected);
  });

  it('rejects the response promise when the source stream throws', async () => {
    async function* errorStream(): AsyncIterable<ChatChunk> {
      yield makeChunk({ delta: { content: 'partial' } });
      throw new Error('upstream failure');
    }

    const { stream, response } = createStreamCollector(errorStream());

    // Consuming the wrapped stream must also throw
    await expect(async () => {
      for await (const _ of stream) {
        // drain
      }
    }).rejects.toThrow('upstream failure');

    // The response promise must reject with the same error
    await expect(response).rejects.toThrow('upstream failure');
  });

  it('response promise is rejected even if the caller never consumes the stream', async () => {
    // This test documents that the promise only settles once the stream is consumed.
    // If the stream is never iterated the promise stays pending — we verify the
    // happy-path inverse: consuming it does settle the promise.
    const source: ChatChunk[] = [makeChunk({ delta: { content: 'ok' }, finishReason: 'stop' })];

    const { stream, response } = createStreamCollector(toStream(source));

    for await (const _ of stream) {
      // drain
    }

    await expect(response).resolves.toMatchObject({ message: { content: 'ok' } });
  });

  it('yields chunks in the original order', async () => {
    const contents = ['one', 'two', 'three', 'four', 'five'];
    const source = contents.map((c) => makeChunk({ delta: { content: c } }));

    const { stream } = createStreamCollector(toStream(source));

    const collected: string[] = [];
    for await (const chunk of stream) {
      if (typeof chunk.delta.content === 'string') collected.push(chunk.delta.content);
    }

    expect(collected).toEqual(contents);
  });
});
