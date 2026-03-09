/**
 * Stream Aggregator - Aggregates streaming responses
 */

import type { ChatChunk, ChatResponse, ChatMessage } from '../../types/adapter';

/**
 * Aggregate streaming chunks into a complete response
 */
export async function aggregateStream(stream: AsyncIterable<ChatChunk>): Promise<ChatResponse> {
  let content = '';
  let id = '';
  let modelName = '';
  let finishReason: ChatResponse['finishReason'] = 'stop';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolCalls: NonNullable<ChatMessage['toolCalls']> = [];

  for await (const chunk of stream) {
    id = chunk.id;
    modelName = chunk.model;

    if (chunk.delta.content) {
      if (typeof chunk.delta.content === 'string') {
        content += chunk.delta.content;
      }
    }

    if (chunk.delta.toolCalls) {
      for (const tc of chunk.delta.toolCalls) {
        const existing = toolCalls.find((t) => t.id === tc.id);
        if (existing) {
          existing.function.arguments += tc.function.arguments;
        } else {
          toolCalls.push({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          });
        }
      }
    }

    if (chunk.usage) {
      usage = chunk.usage;
    }

    if (chunk.finishReason) {
      finishReason = chunk.finishReason;
    }
  }

  return {
    id,
    model: modelName,
    message: {
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    finishReason,
    usage,
  };
}

/**
 * Create a stream that emits chunks and collects the final response
 */
export function createStreamCollector(stream: AsyncIterable<ChatChunk>): {
  stream: AsyncIterable<ChatChunk>;
  response: Promise<ChatResponse>;
} {
  const chunks: ChatChunk[] = [];
  let resolveResponse: (response: ChatResponse) => void;
  let rejectResponse: (error: Error) => void;

  const responsePromise = new Promise<ChatResponse>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  async function* wrappedStream(): AsyncIterable<ChatChunk> {
    try {
      for await (const chunk of stream) {
        chunks.push(chunk);
        yield chunk;
      }

      // Aggregate after stream completes
      const response = await aggregateStreamFromChunks(chunks);
      resolveResponse(response);
    } catch (error) {
      rejectResponse(error as Error);
      throw error;
    }
  }

  return {
    stream: wrappedStream(),
    response: responsePromise,
  };
}

/**
 * Aggregate from collected chunks
 */
function aggregateStreamFromChunks(chunks: ChatChunk[]): ChatResponse {
  let content = '';
  let id = '';
  let modelName = '';
  let finishReason: ChatResponse['finishReason'] = 'stop';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolCalls: NonNullable<ChatMessage['toolCalls']> = [];

  for (const chunk of chunks) {
    id = chunk.id;
    modelName = chunk.model;

    if (chunk.delta.content) {
      if (typeof chunk.delta.content === 'string') {
        content += chunk.delta.content;
      }
    }

    if (chunk.delta.toolCalls) {
      for (const tc of chunk.delta.toolCalls) {
        const existing = toolCalls.find((t) => t.id === tc.id);
        if (existing) {
          existing.function.arguments += tc.function.arguments;
        } else {
          toolCalls.push({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          });
        }
      }
    }

    if (chunk.usage) {
      usage = chunk.usage;
    }

    if (chunk.finishReason) {
      finishReason = chunk.finishReason;
    }
  }

  return {
    id,
    model: modelName,
    message: {
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    finishReason,
    usage,
  };
}
