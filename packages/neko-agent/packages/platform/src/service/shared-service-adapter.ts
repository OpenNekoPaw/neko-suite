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
  ProviderInputModalities,
  ServiceOptions as SharedServiceOptions,
  ServiceResponse as SharedServiceResponse,
  ServiceCallContext as SharedServiceCallContext,
  StreamChunk,
} from '@neko/shared';
import {
  projectMultimodalPacketToChatMessageAsync,
  type PerceptionAssetLoader,
  type ProjectionDiagnostic,
  type VisionPreprocessPolicy,
} from '@neko/ai-sdk';
import type { Service } from './service';
import { getLogger } from '../utils/logger';
import { PlatformError } from '../provider/platform-error';

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
      reasoningContent: response.reasoningContent ?? response.message.reasoningContent,
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
        yield {
          type: 'thinking',
          content: chunk.thinking,
          ...(chunk.reasoningContent ? { reasoningContent: chunk.reasoningContent } : {}),
        };
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
        const sourceMessages = options?.messageProjector
          ? await options.messageProjector(input)
          : input.messages;
        const projected = await projectProviderAwareMessages({
          messages: sourceMessages,
          providerId: input.providerId,
          modelId: input.modelId,
          modelCapabilities: input.modelCapabilities,
          locale: input.locale ?? options?.locale,
          providerCardRegistry: this._options.providerCardRegistry,
          assetLoader: this._options.assetLoader,
          visionPolicy: this._options.visionPolicy,
        });
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
  readonly modelCapabilities?: readonly string[];
  readonly locale?: string;
  readonly providerCardRegistry?: Pick<IProviderCardRegistry, 'get'>;
  readonly assetLoader?: PerceptionAssetLoader;
  readonly visionPolicy?: VisionPreprocessPolicy;
}

export async function projectProviderAwareMessages(
  input: ProviderAwareMessageProjectionInput,
): Promise<readonly ChatMessage[]> {
  const perceptionCards = collectPerceptionCards(input.messages);
  const packet =
    readLatestMultimodalContextPacket(input.messages) ??
    createPacketForPerceptionCards(perceptionCards);
  if (!packet || !needsProviderAwareProjection(packet, perceptionCards)) {
    return input.messages;
  }

  const result = await projectMultimodalPacketToChatMessageAsync(packet, {
    provider: {
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.modelCapabilities
        ? { runtime: projectModelCapabilitiesToInputModalities(input.modelCapabilities) }
        : {}),
      ...(input.providerCardRegistry && input.providerId
        ? { providerCard: input.providerCardRegistry.get(input.providerId, input.modelId) }
        : {}),
    },
    perceptionCards,
    assetLoader: input.assetLoader,
    visionPolicy: input.visionPolicy,
    locale: input.locale,
  });

  let projectedMessage = result.message;
  if (result.diagnostics.length > 0) {
    logger.warn('Provider-aware perception projection degraded', {
      diagnostics: result.diagnostics,
    });
    assertNoUnsupportedNativeMultimodalInputs(packet, result.diagnostics);
    assertNoUnavailableNativeMultimodalAssets(result.diagnostics);
    projectedMessage = appendToolPerceptionRecoveryDiagnostics(
      projectedMessage,
      packet,
      perceptionCards,
      result.diagnostics,
    );
  }

  return [
    ...input.messages.filter((message) => readMultimodalContextPacket(message) === undefined),
    projectedMessage,
  ];
}

function needsProviderAwareProjection(
  packet: import('@neko/shared').MultimodalContextPacket,
  perceptionCards: readonly PerceptionCard[],
): boolean {
  return (
    perceptionCards.length > 0 ||
    packet.perceptionInputs.some(
      (input) => input.modality === 'image' || input.modality === 'video',
    )
  );
}

function projectModelCapabilitiesToInputModalities(
  capabilities: readonly string[],
): Partial<ProviderInputModalities> {
  const capabilitySet = new Set(capabilities);
  return {
    text: capabilitySet.has('chat') || capabilitySet.has('llm.chat') || capabilities.length > 0,
    image:
      capabilitySet.has('image.understand') ||
      capabilitySet.has('vision') ||
      capabilitySet.has('llm.vision'),
    video: capabilitySet.has('vision_video') || capabilitySet.has('video.understand'),
    audio:
      capabilitySet.has('audio') ||
      capabilitySet.has('audio.understand') ||
      capabilitySet.has('audio.asr'),
  };
}

function assertNoUnsupportedNativeMultimodalInputs(
  packet: import('@neko/shared').MultimodalContextPacket,
  diagnostics: readonly ProjectionDiagnostic[],
): void {
  const unsupported = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === 'provider-input-modality-unsupported' &&
      packet.perceptionInputs.some((input) => input.modality === diagnostic.modality),
  );
  if (!unsupported) {
    return;
  }

  throw new PlatformError({
    category: 'validation',
    code: 'CHAT_MODEL_NATIVE_MULTIMODAL_UNSUPPORTED',
    message: unsupported.message,
    retryable: false,
    context: {
      ...(unsupported.modality ? { modality: unsupported.modality } : {}),
      diagnostics,
    },
  });
}

function appendToolPerceptionRecoveryDiagnostics(
  message: ChatMessage,
  packet: import('@neko/shared').MultimodalContextPacket,
  perceptionCards: readonly PerceptionCard[],
  diagnostics: readonly ProjectionDiagnostic[],
): ChatMessage {
  if (perceptionCards.length === 0) {
    return message;
  }

  const toolOnlyUnsupported = diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === 'provider-input-modality-unsupported' &&
      !packet.perceptionInputs.some((input) => input.modality === diagnostic.modality),
  );
  if (toolOnlyUnsupported.length === 0) {
    return message;
  }

  const recoveryText = [
    ...toolOnlyUnsupported.map((diagnostic) => diagnostic.message),
    'The tool-provided structural or semantic evidence above remains available as text. When visual evidence is missing or stale, use runtime perception with the stable asset or resource reference before assessing visual quality.',
  ].join('\n');
  const content = Array.isArray(message.content)
    ? [...message.content, { type: 'text' as const, text: recoveryText }]
    : [
        { type: 'text' as const, text: message.content },
        { type: 'text' as const, text: recoveryText },
      ];

  return { ...message, content };
}

function assertNoUnavailableNativeMultimodalAssets(
  diagnostics: readonly ProjectionDiagnostic[],
): void {
  const unavailable = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === 'asset-load-failed' ||
      diagnostic.code === 'asset-loader-missing' ||
      diagnostic.code === 'asset-ref-missing',
  );
  if (!unavailable) {
    return;
  }

  throw new PlatformError({
    category: 'validation',
    code: 'CHAT_MODEL_NATIVE_MULTIMODAL_ASSET_UNAVAILABLE',
    message:
      unavailable.message ||
      'The selected chat model supports native multimodal input, but Neko could not prepare the referenced asset for provider input.',
    retryable: false,
    context: {
      ...(unavailable.assetId ? { assetId: unavailable.assetId } : {}),
      ...(unavailable.modality ? { modality: unavailable.modality } : {}),
      diagnostics,
    },
  });
}

function createPacketForPerceptionCards(
  cards: readonly PerceptionCard[],
): import('@neko/shared').MultimodalContextPacket | undefined {
  if (cards.length === 0) {
    return undefined;
  }

  return {
    id: `tool-perception-${cards.map((card) => card.assetId).join('-')}`,
    selection: [],
    artifactRefs: [],
    projectRefs: [],
    perceptionInputs: [],
    uiContext: {
      activePanel: 'unknown',
      selectionIds: [],
    },
    createdAt: Math.max(...cards.map((card) => card.createdAt)),
  };
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
