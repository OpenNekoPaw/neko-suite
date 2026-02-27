/**
 * Shared Service Adapter
 *
 * Adapts Platform's Service (which implements platform IService)
 * to @neko/shared's IService interface for use by Agent layer.
 *
 * Key differences bridged:
 * - chatStream: ServiceStreamResponse → AsyncIterable<StreamChunk>
 * - ChatChunk.thinking → StreamChunk { type: 'thinking' }
 * - ChatChunk.finishReason → StreamChunk { type: 'done', finishReason }
 * - ServiceResponse: strips routing/timing metadata
 * - embed: EmbeddingResponse → { embeddings: number[][] }
 */

import type {
  IService as SharedIService,
  ChatMessage,
  ServiceOptions as SharedServiceOptions,
  ServiceResponse as SharedServiceResponse,
  StreamChunk,
} from '@neko/shared';
import type { Service } from './service';

/**
 * Wraps a Platform Service to conform to @neko/shared's IService interface.
 */
export class SharedServiceAdapter implements SharedIService {
  constructor(private readonly _service: Service) {}

  async chat(
    messages: ChatMessage[],
    options?: SharedServiceOptions
  ): Promise<SharedServiceResponse> {
    const response = await this._service.chat(messages, options);
    return {
      id: response.id,
      model: response.model,
      message: response.message,
      finishReason: response.finishReason,
      usage: response.usage,
      thinking: response.thinking,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: SharedServiceOptions
  ): AsyncIterable<StreamChunk> {
    const { stream, response } = this._service.chatStream(messages, options);

    // Prevent unhandled rejection from the response Promise
    response.catch(() => {});

    for await (const chunk of stream) {
      // Extended thinking (Claude)
      if (chunk.thinking) {
        yield { type: 'thinking', content: chunk.thinking };
      }
      // Content delta
      if (chunk.delta.content) {
        let content: string;
        if (typeof chunk.delta.content === 'string') {
          content = chunk.delta.content;
        } else {
          const parts = chunk.delta.content;
          const nonTextParts = parts.filter(p => p.type !== 'text');
          if (nonTextParts.length > 0) {
            console.warn(
              `[SharedServiceAdapter] chatStream: ${nonTextParts.length} non-text ContentPart(s) dropped (types: ${nonTextParts.map(p => p.type).join(', ')})`
            );
          }
          content = parts
            .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
            .map(p => p.text)
            .join('');
        }
        if (content) {
          yield { type: 'content', content };
        }
      }
      // Tool calls
      if (chunk.delta.toolCalls && chunk.delta.toolCalls.length > 0) {
        for (const tc of chunk.delta.toolCalls) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }
      // Usage (from finish chunk)
      if (chunk.usage) {
        yield { type: 'usage', usage: chunk.usage };
      }
      // Finish
      if (chunk.finishReason) {
        yield { type: 'done', finishReason: chunk.finishReason };
      }
    }
  }

  async embed(texts: string[]): Promise<{ embeddings: number[][] }> {
    const response = await this._service.embed(texts);
    return { embeddings: response.embeddings };
  }
}

/**
 * Wrap a Platform Service as @neko/shared IService
 */
export function toSharedService(service: Service): SharedIService {
  return new SharedServiceAdapter(service);
}
