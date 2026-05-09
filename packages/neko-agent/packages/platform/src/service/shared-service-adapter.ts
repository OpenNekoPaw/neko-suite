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
  IProviderCardRegistry,
  PerceptionCard,
  ServiceOptions as SharedServiceOptions,
  ServiceResponse as SharedServiceResponse,
  ServiceCallContext as SharedServiceCallContext,
  StreamChunk,
} from '@neko/shared';
import {
  projectMultimodalPacketToChatMessageAsync,
  type PerceptionAssetLoader,
  type VisionPreprocessPolicy,
} from '@neko/ai-sdk';
import type { Service } from './service';
import { getLogger } from '../utils/logger';

const logger = getLogger('SharedServiceAdapter');

export interface SharedServiceAdapterOptions {
  readonly providerCardRegistry?: Pick<IProviderCardRegistry, 'get'>;
  readonly assetLoader?: PerceptionAssetLoader;
  readonly visionPolicy?: VisionPreprocessPolicy;
}

/**
 * Wraps a Platform Service to conform to @neko/shared's IService interface.
 */
export class SharedServiceAdapter implements SharedIService {
  constructor(
    private readonly _service: Service,
    private readonly _options: SharedServiceAdapterOptions = {},
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: SharedServiceOptions,
    context?: SharedServiceCallContext,
  ): Promise<SharedServiceResponse> {
    const projectedOptions = this.withMessageProjector(options);
    const response =
      context === undefined
        ? await this._service.chat(messages, projectedOptions)
        : await this._service.chat(messages, projectedOptions, context);
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
    options?: SharedServiceOptions,
    context?: SharedServiceCallContext,
  ): AsyncIterable<StreamChunk> {
    const projectedOptions = this.withMessageProjector(options);
    const { stream, response } =
      context === undefined
        ? this._service.chatStream(messages, projectedOptions)
        : this._service.chatStream(messages, projectedOptions, context);

    // Prevent unhandled rejection from the response Promise.
    // The error is already propagated via the stream iterator (re-thrown from AI SDK error parts).
    response.catch((error) => {
      logger.warn('Stream response promise rejected (error already propagated via stream)', {
        message: error instanceof Error ? error.message : String(error),
      });
    });

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
          const nonTextParts = parts.filter((p) => p.type !== 'text');
          if (nonTextParts.length > 0) {
            logger.warn('chatStream: non-text ContentPart(s) dropped', {
              count: nonTextParts.length,
              types: nonTextParts.map((p) => p.type).join(', '),
            });
          }
          content = parts
            .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
            .map((p) => p.text)
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

  private withMessageProjector(options?: SharedServiceOptions): SharedServiceOptions | undefined {
    if (!this._options.assetLoader) {
      return options;
    }

    return {
      ...options,
      messageProjector: async (input) => {
        const projected = await projectProviderAwareMessages({
          messages: input.messages,
          providerId: input.providerId,
          modelId: input.modelId,
          providerCardRegistry: this._options.providerCardRegistry,
          assetLoader: this._options.assetLoader,
          visionPolicy: this._options.visionPolicy,
        });
        if (options?.messageProjector) {
          return options.messageProjector({
            ...input,
            messages: projected,
          });
        }
        return projected;
      },
    };
  }
}

/**
 * Wrap a Platform Service as @neko/shared IService
 */
export function toSharedService(
  service: Service,
  options?: SharedServiceAdapterOptions,
): SharedIService {
  return new SharedServiceAdapter(service, options);
}

interface ProviderAwareMessageProjectionInput {
  readonly messages: readonly ChatMessage[];
  readonly providerId?: string;
  readonly modelId?: string;
  readonly providerCardRegistry?: Pick<IProviderCardRegistry, 'get'>;
  readonly assetLoader?: PerceptionAssetLoader;
  readonly visionPolicy?: VisionPreprocessPolicy;
}

export async function projectProviderAwareMessages(
  input: ProviderAwareMessageProjectionInput,
): Promise<readonly ChatMessage[]> {
  const packet = readLatestMultimodalContextPacket(input.messages);
  const perceptionCards = collectPerceptionCards(input.messages);
  if (!packet || perceptionCards.length === 0) {
    return input.messages;
  }

  const result = await projectMultimodalPacketToChatMessageAsync(packet, {
    provider: {
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.providerCardRegistry && input.providerId
        ? { providerCard: input.providerCardRegistry.get(input.providerId, input.modelId) }
        : {}),
    },
    perceptionCards,
    assetLoader: input.assetLoader,
    visionPolicy: input.visionPolicy,
  });

  if (result.diagnostics.length > 0) {
    logger.warn('Provider-aware perception projection degraded', {
      diagnostics: result.diagnostics,
    });
  }

  return [...input.messages, result.message];
}

function readLatestMultimodalContextPacket(
  messages: readonly ChatMessage[],
): import('@neko/shared').MultimodalContextPacket | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const packet = readMultimodalContextPacket(message);
    if (packet) {
      return packet;
    }
  }
  return undefined;
}

function readMultimodalContextPacket(
  message: ChatMessage | undefined,
): import('@neko/shared').MultimodalContextPacket | undefined {
  if (!message || message.role !== 'user' || typeof message.content !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as { readonly id?: unknown }).id === 'string' &&
      Array.isArray((parsed as { readonly perceptionInputs?: unknown }).perceptionInputs)
    ) {
      return parsed as import('@neko/shared').MultimodalContextPacket;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function collectPerceptionCards(messages: readonly ChatMessage[]): PerceptionCard[] {
  const cardsByKey = new Map<string, PerceptionCard>();
  for (const message of messages) {
    if (message.role !== 'tool' || typeof message.content !== 'string') {
      continue;
    }
    for (const card of readToolResultPerceptionCards(message.content)) {
      cardsByKey.set(getPerceptionCardKey(card), card);
    }
  }
  return Array.from(cardsByKey.values());
}

function readToolResultPerceptionCards(content: string): readonly PerceptionCard[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { readonly schema?: unknown }).schema === 'neko.tool-result.v1' &&
      Array.isArray((parsed as { readonly perceptionCards?: unknown }).perceptionCards)
    ) {
      return (parsed as { readonly perceptionCards: readonly unknown[] }).perceptionCards.filter(
        isPerceptionCard,
      );
    }
  } catch {
    return [];
  }

  return [];
}

function isPerceptionCard(value: unknown): value is PerceptionCard {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { readonly assetId?: unknown }).assetId === 'string' &&
    typeof (value as { readonly modality?: unknown }).modality === 'string',
  );
}

function getPerceptionCardKey(card: PerceptionCard): string {
  return [card.assetId, card.version, card.cacheKey ?? ''].join(':');
}
