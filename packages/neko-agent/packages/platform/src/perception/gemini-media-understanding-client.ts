import type {
  ChatMessage,
  ContentPart,
  IService,
  ModelRefConfig,
  PerceptionEvidenceEntry,
  PerceptionFocus,
  PerceptualAssetRef,
} from '@neko/shared';
import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
import type { ConfigManager } from '../config/config-manager';
import { PlatformError } from '../provider/platform-error';

export const IMAGE_UNDERSTANDING_PURPOSE = 'image.understand';
export const AUDIO_UNDERSTANDING_PURPOSE = 'audio.understand';
export const VIDEO_UNDERSTANDING_PURPOSE = 'video.understand';

type MediaUnderstandingModality = 'image' | 'audio' | 'video';

interface MediaUnderstandingModelOverride {
  readonly providerId: string;
  readonly modelId: string;
}

interface MediaUnderstandingModelOverrides {
  readonly image?: MediaUnderstandingModelOverride;
  readonly audio?: MediaUnderstandingModelOverride;
  readonly video?: MediaUnderstandingModelOverride;
}

export interface MediaUnderstandingPerceptionAsset {
  readonly assetId: string;
  readonly ref?: PerceptualAssetRef;
  readonly modality: string;
  readonly mimeType: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly frameRate?: number;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MediaUnderstandingPerceptionRequest {
  readonly asset: MediaUnderstandingPerceptionAsset;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly understandingModels?: MediaUnderstandingModelOverrides;
}

export interface GeminiMediaUnderstandingClientConfig {
  readonly service: IService;
  readonly configManager: Pick<ConfigManager, 'resolveModelRefForPurpose' | 'getModel'>;
  readonly assetLoader: PerceptionAssetLoader;
  readonly now?: () => number;
}

interface VisualUnderstandingAnalysis {
  readonly summary: string;
  readonly aestheticScore: number;
  readonly cinematicScore: number;
  readonly technicalQualityScore: number;
  readonly strengths: readonly string[];
  readonly issues: readonly string[];
  readonly recommendations: readonly string[];
  readonly tags: readonly string[];
  readonly notes: {
    readonly aesthetic: string;
    readonly cinematic: string;
    readonly technicalQuality: string;
  };
}

interface AudioUnderstandingAnalysis {
  readonly summary: string;
  readonly transcript: string;
  readonly speechClarityScore: number;
  readonly soundQualityScore: number;
  readonly mixQualityScore: number;
  readonly strengths: readonly string[];
  readonly issues: readonly string[];
  readonly recommendations: readonly string[];
  readonly tags: readonly string[];
  readonly notes: {
    readonly speech: string;
    readonly soundQuality: string;
    readonly mix: string;
  };
}

export class GeminiMediaUnderstandingClient {
  private readonly now: () => number;

  constructor(private readonly config: GeminiMediaUnderstandingClientConfig) {
    this.now = config.now ?? (() => Date.now());
  }

  async describe(
    request: MediaUnderstandingPerceptionRequest,
  ): Promise<PerceptionEvidenceEntry | undefined> {
    if (request.asset.modality === 'image') {
      return this.analyzeVisual(request, 'image');
    }
    if (request.asset.modality === 'video') {
      return this.analyzeVisual(request, 'video');
    }
    return undefined;
  }

  async transcribe(
    request: MediaUnderstandingPerceptionRequest,
  ): Promise<PerceptionEvidenceEntry | undefined> {
    if (request.asset.modality !== 'audio') {
      return undefined;
    }
    return this.analyzeAudio(request);
  }

  private async analyzeVisual(
    request: MediaUnderstandingPerceptionRequest,
    modality: 'image' | 'video',
  ): Promise<PerceptionEvidenceEntry> {
    const modelRef = this.resolveModelRef(modality, request);
    const model = this.requireModel(modelRef, modality);
    const loaded = await this.loadAsset(request, modality);

    const response = await this.config.service.chat(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildVisualUnderstandingPrompt(request, modality) },
            createMediaContentPart(modality, loaded, request.asset.mimeType),
          ],
        } satisfies ChatMessage,
      ],
      {
        providerId: modelRef.providerId,
        modelId: modelRef.modelId,
        modelCapabilities: model.capabilities,
        temperature: 0.2,
        maxTokens: 1800,
        responseFormat: { type: 'json_object' },
      },
    );

    const analysis = parseVisualUnderstandingAnalysis(response.message.content, modality);
    return {
      kind: 'custom',
      confidence: estimateVisualConfidence(analysis),
      value: {
        schema: `neko.${modality}-understanding.v1`,
        providerId: modelRef.providerId,
        modelId: modelRef.modelId,
        analyzedAt: this.now(),
        focus: request.focus ?? (modality === 'image' ? 'composition' : 'visual'),
        assetId: request.asset.assetId,
        summary: analysis.summary,
        aesthetic: {
          score: analysis.aestheticScore,
          notes: analysis.notes.aesthetic,
        },
        cinematic: {
          score: analysis.cinematicScore,
          notes: analysis.notes.cinematic,
        },
        technicalQuality: {
          score: analysis.technicalQualityScore,
          notes: analysis.notes.technicalQuality,
        },
        strengths: analysis.strengths,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        tags: analysis.tags,
      },
    };
  }

  private async analyzeAudio(
    request: MediaUnderstandingPerceptionRequest,
  ): Promise<PerceptionEvidenceEntry> {
    const modality = 'audio';
    const modelRef = this.resolveModelRef(modality, request);
    const model = this.requireModel(modelRef, modality);
    const loaded = await this.loadAsset(request, modality);

    const response = await this.config.service.chat(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildAudioUnderstandingPrompt(request) },
            createMediaContentPart(modality, loaded, request.asset.mimeType),
          ],
        } satisfies ChatMessage,
      ],
      {
        providerId: modelRef.providerId,
        modelId: modelRef.modelId,
        modelCapabilities: model.capabilities,
        temperature: 0.2,
        maxTokens: 1800,
        responseFormat: { type: 'json_object' },
      },
    );

    const analysis = parseAudioUnderstandingAnalysis(response.message.content);
    return {
      kind: 'custom',
      confidence: estimateAudioConfidence(analysis),
      value: {
        schema: 'neko.audio-understanding.v1',
        providerId: modelRef.providerId,
        modelId: modelRef.modelId,
        analyzedAt: this.now(),
        focus: request.focus ?? 'audio',
        assetId: request.asset.assetId,
        summary: analysis.summary,
        transcript: analysis.transcript,
        speechClarity: {
          score: analysis.speechClarityScore,
          notes: analysis.notes.speech,
        },
        soundQuality: {
          score: analysis.soundQualityScore,
          notes: analysis.notes.soundQuality,
        },
        mixQuality: {
          score: analysis.mixQualityScore,
          notes: analysis.notes.mix,
        },
        strengths: analysis.strengths,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        tags: analysis.tags,
      },
    };
  }

  private resolveModelRef(
    modality: MediaUnderstandingModality,
    request: MediaUnderstandingPerceptionRequest,
  ): ModelRefConfig {
    const selected =
      request.understandingModels?.[modality] ?? readOptionsModelOverride(request, modality);
    if (selected) {
      return selected;
    }

    const purpose = getUnderstandingPurpose(modality);
    const ref = this.config.configManager.resolveModelRefForPurpose(purpose);
    if (!ref) {
      throw new PlatformError({
        category: 'validation',
        code: `${toErrorPrefix(modality)}_UNDERSTANDING_MODEL_UNCONFIGURED`,
        message: `No enabled model supports ${purpose}. Configure a Gemini model and optional [default_model_purposes.${purpose
          .split('.')
          .join('_')}].`,
        retryable: false,
      });
    }
    return ref;
  }

  private requireModel(modelRef: ModelRefConfig, modality: MediaUnderstandingModality) {
    const model = this.config.configManager.getModel(modelRef.modelId);
    if (!model) {
      throw new PlatformError({
        category: 'not_found',
        code: `${toErrorPrefix(modality)}_UNDERSTANDING_MODEL_NOT_FOUND`,
        message: `Configured ${modality} understanding model ${modelRef.modelId} was not found.`,
        retryable: false,
        context: {
          providerId: modelRef.providerId,
          modelId: modelRef.modelId,
        },
      });
    }
    return model;
  }

  private async loadAsset(
    request: MediaUnderstandingPerceptionRequest,
    modality: MediaUnderstandingModality,
  ): Promise<ProviderReadyAssetPayload> {
    const ref = request.asset.ref;
    if (!ref) {
      throw new PlatformError({
        category: 'validation',
        code: `${toErrorPrefix(modality)}_UNDERSTANDING_ASSET_REF_MISSING`,
        message: `${capitalize(modality)} understanding requires a provider-loadable ${modality} asset reference.`,
        retryable: false,
        context: { assetId: request.asset.assetId },
      });
    }

    const loaded = await this.config.assetLoader.load(ref);
    if (loaded.kind !== modality) {
      throw new PlatformError({
        category: 'validation',
        code: `${toErrorPrefix(modality)}_UNDERSTANDING_ASSET_KIND_MISMATCH`,
        message: `${capitalize(modality)} understanding expected ${indefiniteArticle(
          modality,
        )} ${modality} asset, got ${loaded.mimeType ?? 'unknown MIME type'}.`,
        retryable: false,
        context: { assetId: ref.assetId, mimeType: loaded.mimeType },
      });
    }
    return loaded;
  }
}

function buildVisualUnderstandingPrompt(
  request: MediaUnderstandingPerceptionRequest,
  modality: 'image' | 'video',
): string {
  const structural = buildStructuralMetadata(request.asset);
  const focus = request.focus ?? (modality === 'image' ? 'composition' : 'visual');
  const promptOptions = buildPromptOptions(request.options);
  const options = promptOptions ? `\nOptions: ${JSON.stringify(promptOptions)}` : '';

  return [
    `Analyze this ${modality === 'image' ? 'image or still frame' : 'video'} for a creative film workflow.`,
    `Focus: ${focus}.`,
    `Local preprocessing metadata: ${structural}.`,
    options,
    'Return only one JSON object with this exact shape:',
    JSON.stringify({
      summary: 'one concise paragraph',
      aestheticScore: 0.0,
      cinematicScore: 0.0,
      technicalQualityScore: 0.0,
      strengths: ['specific visual strength'],
      issues: ['specific visible issue'],
      recommendations: ['specific improvement'],
      tags: ['style or quality tag'],
      notes: {
        aesthetic: 'composition, color, mood, art direction',
        cinematic:
          modality === 'image'
            ? 'framing, lighting, depth, production design, story readability'
            : 'shot language, movement, edit rhythm, performance readability',
        technicalQuality:
          modality === 'image'
            ? 'focus, exposure, noise, compression, artifacting'
            : 'focus, exposure, stability, compression, audio/video sync',
      },
    }),
    'Scores must be numbers from 0 to 1.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function buildAudioUnderstandingPrompt(request: MediaUnderstandingPerceptionRequest): string {
  const structural = buildStructuralMetadata(request.asset);
  const focus = request.focus ?? 'audio';
  const promptOptions = buildPromptOptions(request.options);
  const options = promptOptions ? `\nOptions: ${JSON.stringify(promptOptions)}` : '';

  return [
    'Analyze this audio for a creative film workflow.',
    `Focus: ${focus}.`,
    `Local preprocessing metadata: ${structural}.`,
    options,
    'Return only one JSON object with this exact shape:',
    JSON.stringify({
      summary: 'one concise paragraph',
      transcript: 'spoken transcript, or empty string when there is no intelligible speech',
      speechClarityScore: 0.0,
      soundQualityScore: 0.0,
      mixQualityScore: 0.0,
      strengths: ['specific audio strength'],
      issues: ['specific audible issue'],
      recommendations: ['specific improvement'],
      tags: ['style or quality tag'],
      notes: {
        speech: 'dialogue intelligibility, language, timing',
        soundQuality: 'noise, distortion, clipping, room tone, recording quality',
        mix: 'balance, loudness, dynamics, music/effects/dialogue relationship',
      },
    }),
    'Scores must be numbers from 0 to 1.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function buildStructuralMetadata(asset: MediaUnderstandingPerceptionAsset): string {
  return [
    `assetId=${asset.assetId}`,
    `mimeType=${asset.mimeType}`,
    asset.width && asset.height ? `size=${asset.width}x${asset.height}` : undefined,
    asset.durationMs !== undefined ? `durationMs=${asset.durationMs}` : undefined,
    asset.frameRate !== undefined ? `frameRate=${asset.frameRate}` : undefined,
    asset.channels !== undefined ? `channels=${asset.channels}` : undefined,
    asset.sampleRate !== undefined ? `sampleRate=${asset.sampleRate}` : undefined,
    asset.byteSize !== undefined ? `byteSize=${asset.byteSize}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

function parseVisualUnderstandingAnalysis(
  content: ChatMessage['content'],
  modality: 'image' | 'video',
): VisualUnderstandingAnalysis {
  const parsed = parseJsonObject(content, modality);
  const notes = parsed['notes'];
  if (!isRecord(notes)) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must include notes.`,
    );
  }
  return {
    summary: readRequiredString(parsed, 'summary', modality),
    aestheticScore: readScore(parsed, 'aestheticScore', modality),
    cinematicScore: readScore(parsed, 'cinematicScore', modality),
    technicalQualityScore: readScore(parsed, 'technicalQualityScore', modality),
    strengths: readStringArray(parsed, 'strengths', modality),
    issues: readStringArray(parsed, 'issues', modality),
    recommendations: readStringArray(parsed, 'recommendations', modality),
    tags: readStringArray(parsed, 'tags', modality),
    notes: {
      aesthetic: readRequiredString(notes, 'aesthetic', modality),
      cinematic: readRequiredString(notes, 'cinematic', modality),
      technicalQuality: readRequiredString(notes, 'technicalQuality', modality),
    },
  };
}

function parseAudioUnderstandingAnalysis(
  content: ChatMessage['content'],
): AudioUnderstandingAnalysis {
  const modality = 'audio';
  const parsed = parseJsonObject(content, modality);
  const notes = parsed['notes'];
  if (!isRecord(notes)) {
    throw invalidResponseError(modality, 'Gemini audio understanding JSON must include notes.');
  }
  return {
    summary: readRequiredString(parsed, 'summary', modality),
    transcript: readString(parsed, 'transcript', modality),
    speechClarityScore: readScore(parsed, 'speechClarityScore', modality),
    soundQualityScore: readScore(parsed, 'soundQualityScore', modality),
    mixQualityScore: readScore(parsed, 'mixQualityScore', modality),
    strengths: readStringArray(parsed, 'strengths', modality),
    issues: readStringArray(parsed, 'issues', modality),
    recommendations: readStringArray(parsed, 'recommendations', modality),
    tags: readStringArray(parsed, 'tags', modality),
    notes: {
      speech: readRequiredString(notes, 'speech', modality),
      soundQuality: readRequiredString(notes, 'soundQuality', modality),
      mix: readRequiredString(notes, 'mix', modality),
    },
  };
}

function parseJsonObject(
  content: ChatMessage['content'],
  modality: MediaUnderstandingModality,
): Record<string, unknown> {
  if (typeof content !== 'string') {
    throw invalidResponseError(
      modality,
      `Expected Gemini ${modality} understanding response to be text JSON.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding returned non-JSON content: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isRecord(parsed)) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must be an object.`,
    );
  }
  return parsed;
}

function createMediaContentPart(
  modality: MediaUnderstandingModality,
  loaded: ProviderReadyAssetPayload,
  requestMimeType: string,
): ContentPart {
  if (modality === 'image') {
    return { type: 'image', imageUrl: loaded.url, detail: 'high' };
  }
  if (modality === 'audio') {
    return {
      type: 'audio',
      audioUrl: loaded.url,
      mimeType: loaded.mimeType ?? requestMimeType,
    };
  }
  return {
    type: 'video',
    videoUrl: loaded.url,
    mimeType: loaded.mimeType ?? requestMimeType,
  };
}

function getUnderstandingPurpose(modality: MediaUnderstandingModality): string {
  if (modality === 'image') return IMAGE_UNDERSTANDING_PURPOSE;
  if (modality === 'audio') return AUDIO_UNDERSTANDING_PURPOSE;
  return VIDEO_UNDERSTANDING_PURPOSE;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  modality: MediaUnderstandingModality,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must include ${key}.`,
    );
  }
  return value;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  modality: MediaUnderstandingModality,
): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must include string ${key}.`,
    );
  }
  return value;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  modality: MediaUnderstandingModality,
): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must include string[] ${key}.`,
    );
  }
  return value;
}

function readScore(
  record: Record<string, unknown>,
  key: string,
  modality: MediaUnderstandingModality,
): number {
  const value = record[key];
  if (typeof value !== 'number' || value < 0 || value > 1) {
    throw invalidResponseError(
      modality,
      `Gemini ${modality} understanding JSON must include 0..1 score ${key}.`,
    );
  }
  return value;
}

function estimateVisualConfidence(analysis: VisualUnderstandingAnalysis): number {
  return roundConfidence(
    (analysis.aestheticScore + analysis.cinematicScore + analysis.technicalQualityScore) / 3,
  );
}

function estimateAudioConfidence(analysis: AudioUnderstandingAnalysis): number {
  return roundConfidence(
    (analysis.speechClarityScore + analysis.soundQualityScore + analysis.mixQualityScore) / 3,
  );
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function invalidResponseError(
  modality: MediaUnderstandingModality,
  message: string,
): PlatformError {
  return new PlatformError({
    category: 'validation',
    code: `${toErrorPrefix(modality)}_UNDERSTANDING_RESPONSE_INVALID`,
    message,
    retryable: false,
  });
}

function toErrorPrefix(modality: MediaUnderstandingModality): string {
  return modality.toUpperCase();
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function indefiniteArticle(value: string): 'a' | 'an' {
  return value === 'audio' || value === 'image' ? 'an' : 'a';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildPromptOptions(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (!options) return undefined;
  const { understandingModels: _understandingModels, ...promptOptions } = options;
  return Object.keys(promptOptions).length > 0 ? promptOptions : undefined;
}

function readOptionsModelOverride(
  request: MediaUnderstandingPerceptionRequest,
  modality: MediaUnderstandingModality,
): MediaUnderstandingModelOverride | undefined {
  const override = request.options?.['understandingModels'];
  if (!isRecord(override)) return undefined;
  const selected = override[modality];
  if (!isRecord(selected)) return undefined;
  const providerId = readNonEmptyString(selected['providerId']);
  const modelId = readNonEmptyString(selected['modelId']);
  if (!providerId || !modelId) return undefined;
  return { providerId, modelId };
}
