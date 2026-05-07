import type {
  ChatMessage,
  ContentPart,
  MultimodalContextPacket,
  PerceptionCard,
  PerceptualAssetRef,
  ProviderInputModalities,
} from '@neko/shared';
import type { AgentMultimodalEvidenceRef } from '@neko-agent/types';

export type { ProviderInputModalities } from '@neko/shared';

export interface MultimodalMessageProjectionOptions {
  readonly includeTextInputs?: boolean;
  readonly imageDetail?: 'auto' | 'low' | 'high';
}

export interface ProviderInputModalityResolverInput {
  readonly providerId?: string;
  readonly runtime?: Partial<ProviderInputModalities>;
  readonly providerCard?: {
    readonly inputModalities?: Partial<ProviderInputModalities>;
  };
}

export interface ProjectionDiagnostic {
  readonly code: 'asset-load-failed' | 'unsupported-modality';
  readonly message: string;
  readonly assetId?: string;
}

export interface VisionPreprocessPolicy {
  readonly maxBytes?: number;
  readonly imageDetail?: 'auto' | 'low' | 'high';
}

export interface ProviderReadyAssetPayload {
  readonly kind: 'image' | 'video';
  readonly url: string;
  readonly mimeType?: string;
}

export interface PerceptionAssetLoader {
  load(
    ref: PerceptualAssetRef,
    policy?: VisionPreprocessPolicy,
  ): Promise<ProviderReadyAssetPayload>;
}

export interface AsyncMultimodalMessageProjectionOptions extends MultimodalMessageProjectionOptions {
  readonly provider?: ProviderInputModalityResolverInput;
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly assetLoader?: PerceptionAssetLoader;
  readonly visionPolicy?: VisionPreprocessPolicy;
}

export interface AsyncMultimodalMessageProjectionResult {
  readonly message: ChatMessage;
  readonly diagnostics: readonly ProjectionDiagnostic[];
}

const TEXT_ONLY_MODALITIES: ProviderInputModalities = {
  text: true,
  image: false,
  video: false,
  audio: false,
};

const BUILT_IN_PROVIDER_MODALITIES: Record<string, ProviderInputModalities> = {
  openai: { text: true, image: true, video: false, audio: false },
  anthropic: { text: true, image: true, video: false, audio: false },
  gemini: { text: true, image: true, video: true, audio: false },
  google: { text: true, image: true, video: true, audio: false },
};

export function projectMultimodalPacketToChatMessage(
  packet: MultimodalContextPacket,
  options: MultimodalMessageProjectionOptions = {},
): ChatMessage {
  const parts: ContentPart[] = [];
  const includeTextInputs = options.includeTextInputs ?? true;

  for (const input of packet.perceptionInputs) {
    if (input.modality === 'text' && includeTextInputs) {
      const text = input.metadata?.['text'];
      if (typeof text === 'string' && text.trim().length > 0) {
        parts.push({ type: 'text', text });
      }
      continue;
    }

    if (input.modality === 'image' && input.uri) {
      parts.push({ type: 'image', imageUrl: input.uri, detail: options.imageDetail ?? 'auto' });
      continue;
    }

    if (input.modality === 'video' && input.uri) {
      parts.push({
        type: 'video',
        videoUrl: input.uri,
        ...(readMimeType(input.metadata) ? { mimeType: readMimeType(input.metadata) } : {}),
      });
      continue;
    }

    if (input.modality === 'audio') {
      parts.push({ type: 'text', text: summarizeAudioInput(input) });
    }
  }

  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet));
  if (evidenceSummary) {
    parts.push({ type: 'text', text: evidenceSummary });
  }

  if (parts.length === 0) {
    return { role: 'user', content: summarizePacket(packet) };
  }

  return { role: 'user', content: parts };
}

export function resolveProviderInputModalities(
  input: ProviderInputModalityResolverInput = {},
): ProviderInputModalities {
  return {
    ...TEXT_ONLY_MODALITIES,
    ...(input.providerId ? BUILT_IN_PROVIDER_MODALITIES[input.providerId] : undefined),
    ...input.providerCard?.inputModalities,
    ...input.runtime,
  };
}

export async function projectMultimodalPacketToChatMessageAsync(
  packet: MultimodalContextPacket,
  options: AsyncMultimodalMessageProjectionOptions = {},
): Promise<AsyncMultimodalMessageProjectionResult> {
  const baseMessage = projectMultimodalPacketToChatMessage(packet, options);
  const hasPerceptionCards = (options.perceptionCards?.length ?? 0) > 0;
  const baseParts = projectBaseMessageParts(packet, baseMessage, hasPerceptionCards);
  const diagnostics: ProjectionDiagnostic[] = [];
  const providerModalities = resolveProviderInputModalities(options.provider);

  for (const card of options.perceptionCards ?? []) {
    const projected = await projectPerceptionCardToContentParts(card, {
      providerModalities,
      assetLoader: options.assetLoader,
      visionPolicy: options.visionPolicy,
      imageDetail: options.imageDetail,
    });
    baseParts.push(...projected.parts);
    diagnostics.push(...projected.diagnostics);
  }

  return {
    message: { role: 'user', content: baseParts },
    diagnostics,
  };
}

function projectBaseMessageParts(
  packet: MultimodalContextPacket,
  baseMessage: ChatMessage,
  hasPerceptionCards: boolean,
): ContentPart[] {
  if (Array.isArray(baseMessage.content)) {
    return [...baseMessage.content];
  }

  if (hasPerceptionCards && isEmptyPacketSummaryOnly(packet)) {
    return [];
  }

  return [{ type: 'text', text: baseMessage.content }];
}

export async function projectPerceptionCardToContentParts(
  card: PerceptionCard,
  options: {
    readonly providerModalities?: ProviderInputModalities;
    readonly assetLoader?: PerceptionAssetLoader;
    readonly visionPolicy?: VisionPreprocessPolicy;
    readonly imageDetail?: 'auto' | 'low' | 'high';
  } = {},
): Promise<{
  readonly parts: ContentPart[];
  readonly diagnostics: readonly ProjectionDiagnostic[];
}> {
  const providerModalities = options.providerModalities ?? TEXT_ONLY_MODALITIES;
  const diagnostics: ProjectionDiagnostic[] = [];
  const parts: ContentPart[] = [{ type: 'text', text: summarizePerceptionCard(card) }];

  if (card.modality === 'image' && providerModalities.image) {
    const imageRef = selectImagePerceptualRef(card);
    if (imageRef && options.assetLoader) {
      try {
        const loaded = await options.assetLoader.load(imageRef, options.visionPolicy);
        parts.push({
          type: 'image',
          imageUrl: loaded.url,
          detail: options.imageDetail ?? options.visionPolicy?.imageDetail ?? 'auto',
        });
      } catch (error) {
        diagnostics.push({
          code: 'asset-load-failed',
          assetId: imageRef.assetId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (card.modality === 'video' && providerModalities.video) {
    const videoRef = selectVideoPerceptualRef(card);
    if (videoRef && options.assetLoader) {
      try {
        const loaded = await options.assetLoader.load(videoRef, options.visionPolicy);
        parts.push({
          type: 'video',
          videoUrl: loaded.url,
          ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
        });
      } catch (error) {
        diagnostics.push({
          code: 'asset-load-failed',
          assetId: videoRef.assetId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (card.modality === 'audio' && providerModalities.audio !== true) {
    diagnostics.push({
      code: 'unsupported-modality',
      assetId: card.assetId,
      message:
        providerModalities.audio === 'realtime-only'
          ? 'Stored audio assets use text fallback for realtime-only providers.'
          : 'Audio payloads are not supported by this provider.',
    });
  }

  return { parts, diagnostics };
}

function summarizePerceptionCard(card: PerceptionCard): string {
  const structural = [
    card.structural.mimeType,
    card.structural.width && card.structural.height
      ? `${card.structural.width}x${card.structural.height}`
      : undefined,
    card.structural.durationMs !== undefined
      ? `durationMs=${card.structural.durationMs}`
      : undefined,
    card.structural.channels !== undefined ? `channels=${card.structural.channels}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const evidence = card.semantic?.evidences
    .map((entry) => `${entry.kind}(${entry.confidence}): ${stringifyEvidenceValue(entry.value)}`)
    .join('; ');

  return [
    `PerceptionCard ${card.assetId} [${card.modality}] ${structural}`.trim(),
    evidence ? `Evidence: ${evidence}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

function selectImagePerceptualRef(card: PerceptionCard): PerceptualAssetRef | undefined {
  return card.perceptual?.thumbnailRef ?? card.perceptual?.keyframeRefs?.[0];
}

function selectVideoPerceptualRef(card: PerceptionCard): PerceptualAssetRef | undefined {
  return card.perceptual?.keyframeRefs?.[0] ?? card.perceptual?.thumbnailRef;
}

function stringifyEvidenceValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizePacket(packet: MultimodalContextPacket): string {
  const modalities = Array.from(new Set(packet.perceptionInputs.map((input) => input.modality)));
  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet));
  return [
    `Multimodal context packet ${packet.id}: ${modalities.join(', ') || 'no inputs'}`,
    evidenceSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function isEmptyPacketSummaryOnly(packet: MultimodalContextPacket): boolean {
  return packet.perceptionInputs.length === 0 && readEvidenceRefs(packet).length === 0;
}

function readMimeType(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = metadata?.['mimeType'];
  return typeof value === 'string' ? value : undefined;
}

function summarizeAudioInput(input: {
  readonly id: string;
  readonly uri?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string {
  return [
    `Audio context: ${input.id}`,
    input.uri ? `uri=${input.uri}` : undefined,
    readMimeType(input.metadata) ? `mimeType=${readMimeType(input.metadata)}` : undefined,
    readDurationMs(input.metadata) ? `durationMs=${readDurationMs(input.metadata)}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function readDurationMs(
  metadata: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  const value = metadata?.['durationMs'];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readEvidenceRefs(packet: MultimodalContextPacket): readonly AgentMultimodalEvidenceRef[] {
  const value = packet.metadata?.['evidenceRefs'];
  return Array.isArray(value)
    ? value.filter((item): item is AgentMultimodalEvidenceRef => isEvidenceRef(item))
    : [];
}

function isEvidenceRef(value: unknown): value is AgentMultimodalEvidenceRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { readonly id?: unknown }).id === 'string' &&
    typeof (value as { readonly modality?: unknown }).modality === 'string',
  );
}

function summarizeEvidenceRefs(evidenceRefs: readonly AgentMultimodalEvidenceRef[]): string {
  if (evidenceRefs.length === 0) return '';
  const included = evidenceRefs.filter((evidence) => !evidence.withheld);
  const withheld = evidenceRefs.filter((evidence) => evidence.withheld);
  return [
    included.length > 0
      ? `Included feedback evidence: ${included.map(formatEvidenceRef).join('; ')}`
      : 'Included feedback evidence: none',
    withheld.length > 0
      ? `Withheld feedback evidence: ${withheld
          .map(
            (evidence) => `${formatEvidenceRef(evidence)} (${evidence.withheldReason ?? 'policy'})`,
          )
          .join('; ')}`
      : 'Withheld feedback evidence: none',
  ].join('\n');
}

function formatEvidenceRef(evidence: AgentMultimodalEvidenceRef): string {
  return `${evidence.id} [${evidence.modality}]${evidence.summary ? ` ${evidence.summary}` : ''}`;
}
