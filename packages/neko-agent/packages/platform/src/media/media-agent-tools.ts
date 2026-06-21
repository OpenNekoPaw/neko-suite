/**
 * Media Agent Tools - Tool executors for AI media generation in agent mode
 *
 * Bridges the ai-generate skill's tool definitions to the MediaGenerationService.
 * Each tool returns { backgroundMode: true, taskId } so AgentStreamProcessor
 * can subscribe to progress and notify the webview.
 */

import { createTool } from '@neko/shared';
import type {
  GenerationIntent,
  IToolRegistry,
  ProviderAdaptationMode,
  ProviderGenerationCapability,
  ToolExecuteOptions,
} from '@neko/shared';
import type { MediaGenerationService } from './media-generation-service';
import type { ImageGenerationRequest } from './types';

interface ImageToolRequestInput {
  readonly args: Record<string, unknown>;
  readonly target: GenerationTargetMetadata;
  readonly resolved: ResolvedGenerationPrompt;
  readonly transformMetadata?: Record<string, unknown>;
}

interface ResolvedGenerationPrompt {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly providerId?: string;
  readonly metadata?: Record<string, unknown>;
}

interface GenerationTargetMetadata {
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly actualProviderId?: string;
  readonly actualModelId?: string;
}

async function resolveGenerationPrompt(
  args: Record<string, unknown>,
  capability: ProviderGenerationCapability,
  defaultProviderId?: string,
): Promise<ResolvedGenerationPrompt> {
  const explicitProviderId = readOptionalString(args.providerId) ?? defaultProviderId;
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  const negativePrompt = readOptionalString(args.negativePrompt);
  const intent = readMarkdownGenerationIntent(args, capability, prompt);
  const adaptationMode = readProviderAdaptationMode(args);

  if (!intent) {
    if (!prompt.trim()) {
      throw new Error(
        `${capability === 'image.generate' ? 'GenerateImage' : 'GenerateVideo'} requires prompt or taskRef/planRef markdown`,
      );
    }
    return {
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(explicitProviderId ? { providerId: explicitProviderId } : {}),
      metadata: buildProviderAdaptationMetadata({
        mode: 'native',
        source: { kind: 'inline-prompt' },
        originalPrompt: prompt,
        providerPrompt: prompt,
        riskFlags: ['no-structured-intent'],
      }),
    };
  }

  if (adaptationMode === 'native') {
    return resolveNativeGenerationIntent(intent, explicitProviderId, negativePrompt, {
      reason: 'provider-adaptation-bypassed',
    });
  }

  return resolveNativeGenerationIntent(intent, explicitProviderId, negativePrompt, {
    mode: 'agentic',
    reason: 'agent-expression-context-only',
  });
}

function resolveNativeGenerationIntent(
  intent: GenerationIntent,
  providerId: string | undefined,
  negativePrompt: string | undefined,
  details: Record<string, unknown>,
): ResolvedGenerationPrompt {
  const defaultPrompt = composeGenerationIntentPrompt(intent);
  return {
    prompt: defaultPrompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(providerId ? { providerId } : {}),
    metadata: buildProviderAdaptationMetadata({
      mode: details.mode === 'agentic' ? 'agentic' : 'native',
      source: intent.source,
      extractedIntent: intent,
      providerPrompt: defaultPrompt,
      riskFlags: typeof details.reason === 'string' ? [details.reason] : [],
    }),
  };
}

function readProviderAdaptationMode(args: Record<string, unknown>): ProviderAdaptationMode {
  const value = args.providerAdaptationMode;
  return value === 'native' || value === 'agentic' ? value : 'auto';
}

function buildProviderAdaptationMetadata(input: {
  readonly mode: ProviderAdaptationMode;
  readonly source: GenerationIntent['source'];
  readonly originalPrompt?: string;
  readonly extractedIntent?: GenerationIntent;
  readonly providerPrompt: string;
  readonly riskFlags: readonly string[];
  readonly target?: GenerationTargetMetadata;
}): Record<string, unknown> {
  return {
    providerAdaptation: {
      mode: input.mode,
      source: input.source,
      ...(input.originalPrompt ? { originalPrompt: input.originalPrompt } : {}),
      ...(input.extractedIntent ? { extractedIntent: input.extractedIntent } : {}),
      providerPrompt: input.providerPrompt,
      ...(input.target?.requestedProviderId
        ? { providerId: input.target.requestedProviderId }
        : {}),
      ...(input.target?.requestedModelId ? { modelId: input.target.requestedModelId } : {}),
      ...(input.target?.actualProviderId || input.target?.actualModelId
        ? {
            resolvedTarget: {
              ...(input.target.actualProviderId
                ? { providerId: input.target.actualProviderId }
                : {}),
              ...(input.target.actualModelId ? { modelId: input.target.actualModelId } : {}),
            },
          }
        : {}),
      adaptationMetadata: {
        riskFlags: input.riskFlags,
      },
    },
  };
}

function withGenerationTargetMetadata(
  metadata: Record<string, unknown> | undefined,
  target: GenerationTargetMetadata,
): Record<string, unknown> | undefined {
  const providerAdaptation = metadata?.providerAdaptation;
  if (!isRecord(providerAdaptation)) return metadata;
  return buildProviderAdaptationMetadata({
    mode: providerAdaptation.mode === 'agentic' ? 'agentic' : 'native',
    source: readGenerationIntentSource(providerAdaptation.source),
    ...(typeof providerAdaptation.originalPrompt === 'string'
      ? { originalPrompt: providerAdaptation.originalPrompt }
      : {}),
    ...(isGenerationIntent(providerAdaptation.extractedIntent)
      ? { extractedIntent: providerAdaptation.extractedIntent }
      : {}),
    providerPrompt:
      typeof providerAdaptation.providerPrompt === 'string'
        ? providerAdaptation.providerPrompt
        : '',
    riskFlags: readRiskFlags(providerAdaptation.adaptationMetadata),
    target,
  });
}

function readRiskFlags(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.riskFlags)) return [];
  return value.riskFlags.filter((entry): entry is string => typeof entry === 'string');
}

function isGenerationIntent(value: unknown): value is GenerationIntent {
  return isRecord(value) && isGenerationIntentSource(value.source);
}

function readGenerationIntentSource(value: unknown): GenerationIntent['source'] {
  return isGenerationIntentSource(value) ? value : { kind: 'inline-prompt' };
}

function isGenerationIntentSource(value: unknown): value is GenerationIntent['source'] {
  if (!isRecord(value)) return false;
  return (
    value.kind === 'inline-prompt' ||
    value.kind === 'task-markdown' ||
    value.kind === 'plan-markdown'
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function resolveToolMediaTarget(
  args: Record<string, unknown>,
  options: ToolExecuteOptions | undefined,
  category: 'image' | 'video' | 'audio' | 'music',
  secondaryCategory?: 'audio',
): { providerId?: string; modelId?: string; source: 'args' | 'runtime' | 'missing' } {
  const argProviderId = readOptionalString(args.providerId);
  const argModelId = readOptionalString(args.modelId);
  const runtimeTarget =
    readRuntimeMediaModel(options, category) ??
    (secondaryCategory ? readRuntimeMediaModel(options, secondaryCategory) : undefined);

  return {
    providerId: argProviderId ?? runtimeTarget?.providerId,
    modelId: argModelId ?? runtimeTarget?.modelId,
    source: argProviderId || argModelId ? 'args' : runtimeTarget ? 'runtime' : 'missing',
  };
}

function requireToolMediaTarget(
  target: ReturnType<typeof resolveToolMediaTarget>,
  toolName: string,
): string | null {
  if (target.providerId && target.modelId) return null;
  if (target.source === 'args') {
    return `${toolName} requires both providerId and modelId when either routing field is specified.`;
  }
  return `${toolName} requires an explicit Agent ${toolNameMediaCategory(toolName)} model. Configure the Agent mode media model or pass providerId and modelId.`;
}

function toolNameMediaCategory(toolName: string): string {
  if (toolName.includes('Video')) return 'video';
  if (toolName.includes('Music') || toolName.includes('TTS')) return 'audio';
  return 'image';
}

function buildImageGenerationRequest(input: ImageToolRequestInput): ImageGenerationRequest {
  const aspectRatio = readOptionalString(input.args.aspectRatio);
  const sizeStr = readOptionalString(input.args.size);
  const [width, height] = sizeStr?.split('x').map(Number) ?? [];
  const metadata = buildImageToolMetadata({
    resolved: input.resolved,
    target: input.target,
    transformMetadata: input.transformMetadata,
  });

  return {
    prompt: input.resolved.prompt,
    ...(input.resolved.negativePrompt ? { negativePrompt: input.resolved.negativePrompt } : {}),
    ...(input.resolved.providerId ? { providerId: input.resolved.providerId } : {}),
    ...(input.target.requestedModelId ? { modelId: input.target.requestedModelId } : {}),
    ...(Number.isFinite(width) ? { width } : {}),
    ...(Number.isFinite(height) ? { height } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(input.args.quality === 'standard' || input.args.quality === 'hd'
      ? { quality: input.args.quality }
      : {}),
    ...(readOptionalString(input.args.style)
      ? { style: readOptionalString(input.args.style) }
      : {}),
    ...(readOptionalNumber(input.args.n) !== undefined
      ? { count: readOptionalNumber(input.args.n) }
      : {}),
    ...readImageReferenceInputs(input.args),
    ...readImageControlInputs(input.args),
    ...(metadata ? { metadata } : {}),
  };
}

function buildImageToolMetadata(input: {
  readonly resolved: ResolvedGenerationPrompt;
  readonly target: GenerationTargetMetadata;
  readonly transformMetadata?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const metadata = input.resolved.metadata
    ? withGenerationTargetMetadata(input.resolved.metadata, input.target)
    : undefined;
  if (!input.transformMetadata) return metadata;
  return {
    ...(metadata ?? {}),
    transformImage: input.transformMetadata,
  };
}

function readImageReferenceInputs(args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(readOptionalString(args.referenceImageUrl)
      ? { referenceImageUrl: readOptionalString(args.referenceImageUrl) }
      : {}),
    ...(readOptionalString(args.referenceImageUri)
      ? { referenceImageUri: readOptionalString(args.referenceImageUri) }
      : {}),
    ...(readOptionalString(args.referenceImageBase64)
      ? { referenceImageBase64: readOptionalString(args.referenceImageBase64) }
      : {}),
    ...(readOptionalString(args.maskUri) ? { maskUri: readOptionalString(args.maskUri) } : {}),
    ...(readOptionalString(args.maskBase64)
      ? { maskBase64: readOptionalString(args.maskBase64) }
      : {}),
    ...(readOptionalNumber(args.inpaintStrength) !== undefined
      ? { inpaintStrength: readOptionalNumber(args.inpaintStrength) }
      : {}),
    ...(readIpAdapterRefs(args.ipAdapterRefs)
      ? { ipAdapterRefs: readIpAdapterRefs(args.ipAdapterRefs) }
      : {}),
    ...(readOptionalString(args.editInstruction)
      ? { editInstruction: readOptionalString(args.editInstruction) }
      : {}),
  };
}

function readImageControlInputs(args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(readOptionalString(args.controlImageUri)
      ? { controlImageUri: readOptionalString(args.controlImageUri) }
      : {}),
    ...(readOptionalString(args.controlImageBase64)
      ? { controlImageBase64: readOptionalString(args.controlImageBase64) }
      : {}),
    ...(readOptionalString(args.controlMode)
      ? { controlMode: readOptionalString(args.controlMode) }
      : {}),
    ...(readOptionalNumber(args.controlStrength) !== undefined
      ? { controlStrength: readOptionalNumber(args.controlStrength) }
      : {}),
  };
}

function readVideoReferenceInputs(args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(readOptionalString(args.referenceImageUrl)
      ? { referenceImageUrl: readOptionalString(args.referenceImageUrl) }
      : {}),
    ...(readOptionalString(args.referenceImageUri)
      ? { referenceImageUri: readOptionalString(args.referenceImageUri) }
      : {}),
    ...(readOptionalString(args.referenceImageBase64)
      ? { referenceImageBase64: readOptionalString(args.referenceImageBase64) }
      : {}),
    ...(readOptionalString(args.referenceVideoUrl)
      ? { referenceVideoUrl: readOptionalString(args.referenceVideoUrl) }
      : {}),
    ...(readOptionalString(args.startFrameImageBase64)
      ? { startFrameImageBase64: readOptionalString(args.startFrameImageBase64) }
      : {}),
    ...(readOptionalString(args.endFrameImageBase64)
      ? { endFrameImageBase64: readOptionalString(args.endFrameImageBase64) }
      : {}),
    ...(readOptionalNumber(args.motionStrength) !== undefined
      ? { motionStrength: readOptionalNumber(args.motionStrength) }
      : {}),
    ...(readOptionalString(args.cameraMovement)
      ? { cameraMovement: readOptionalString(args.cameraMovement) }
      : {}),
    ...(readOptionalString(args.cameraAngle)
      ? { cameraAngle: readOptionalString(args.cameraAngle) }
      : {}),
    ...(readOptionalString(args.shotScale)
      ? { shotScale: readOptionalString(args.shotScale) }
      : {}),
    ...(readOptionalString(args.aspectRatio)
      ? { aspectRatio: readOptionalString(args.aspectRatio) }
      : {}),
    ...(readOptionalString(args.editInstruction)
      ? { editInstruction: readOptionalString(args.editInstruction) }
      : {}),
  };
}

function readTransformImageReferenceArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sourceImageRef = readOptionalRecord(args.sourceImageRef);
  const referenceBundle = readOptionalRecord(args.referenceBundle);
  const operationPlan = Array.isArray(args.operationPlan)
    ? args.operationPlan.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
  const maskRefs = Array.isArray(args.maskRefs)
    ? args.maskRefs.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : undefined;

  return {
    ...(sourceImageRef ? { sourceImageRef } : {}),
    ...(referenceBundle ? { referenceBundle } : {}),
    ...(operationPlan && operationPlan.length > 0 ? { operationPlan } : {}),
    ...(maskRefs && maskRefs.length > 0 ? { maskRefs } : {}),
    ...(readOptionalString(args.planId) ? { planId: readOptionalString(args.planId) } : {}),
    ...(readOptionalString(args.sceneId) ? { sceneId: readOptionalString(args.sceneId) } : {}),
    ...(readOptionalString(args.shotId) ? { shotId: readOptionalString(args.shotId) } : {}),
    ...(readOptionalString(args.imageStrategy)
      ? { imageStrategy: readOptionalString(args.imageStrategy) }
      : {}),
    ...(readOptionalString(args.targetAspectRatio)
      ? { targetAspectRatio: readOptionalString(args.targetAspectRatio) }
      : {}),
    ...(readOptionalString(args.targetStyle)
      ? { targetStyle: readOptionalString(args.targetStyle) }
      : {}),
  };
}

function readIpAdapterRefs(value: unknown): ImageGenerationRequest['ipAdapterRefs'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value.flatMap(
    (item): NonNullable<ImageGenerationRequest['ipAdapterRefs']> =>
      isIpAdapterRef(item) ? [item] : [],
  );
  return refs.length > 0 ? refs : undefined;
}

function isIpAdapterRef(
  value: unknown,
): value is NonNullable<ImageGenerationRequest['ipAdapterRefs']>[number] {
  if (!isRecord(value) || typeof value['imageBase64'] !== 'string') return false;
  return (
    (value['mimeType'] === undefined || typeof value['mimeType'] === 'string') &&
    (value['strength'] === undefined ||
      (typeof value['strength'] === 'number' && Number.isFinite(value['strength']))) &&
    (value['mode'] === undefined ||
      value['mode'] === 'style' ||
      value['mode'] === 'subject' ||
      value['mode'] === 'both')
  );
}

function hasResolvedTransformSource(args: Record<string, unknown>): boolean {
  return Boolean(
    readOptionalString(args.sourceImageUri) ||
    readOptionalString(args.referenceImageUri) ||
    readOptionalString(args.referenceImageUrl) ||
    readOptionalString(args.referenceImageBase64),
  );
}

function readRuntimeMediaModel(
  options: ToolExecuteOptions | undefined,
  category: 'image' | 'video' | 'audio' | 'music',
): { providerId: string; modelId: string } | undefined {
  const mediaModels = options?.metadata?.mediaModels;
  if (!isRecord(mediaModels)) return undefined;

  const model = mediaModels[category];
  if (!isRecord(model)) return undefined;

  const providerId = readOptionalString(model.providerId);
  const modelId = readOptionalString(model.modelId);
  if (!providerId || !modelId) return undefined;

  return { providerId, modelId };
}

function readMarkdownGenerationIntent(
  args: Record<string, unknown>,
  capability: ProviderGenerationCapability,
  originalPrompt: string,
): GenerationIntent | null {
  const markdown =
    typeof args.taskMarkdown === 'string'
      ? args.taskMarkdown
      : typeof args.planMarkdown === 'string'
        ? args.planMarkdown
        : undefined;
  const ref =
    typeof args.taskRef === 'string'
      ? args.taskRef
      : typeof args.planRef === 'string'
        ? args.planRef
        : undefined;
  if (!markdown && !ref) return null;

  const sourceKind =
    typeof args.planMarkdown === 'string' || typeof args.planRef === 'string'
      ? 'plan-markdown'
      : 'task-markdown';
  const goal = readMarkdownSection(markdown ?? '', 'Goal');
  const style = readMarkdownListSection(markdown ?? '', 'Style');
  const mustInclude = readMarkdownListSection(markdown ?? '', 'Must Include');
  const avoid = readMarkdownListSection(markdown ?? '', 'Avoid');
  const output = readMarkdownOutput(markdown ?? '');
  const styleFamily = inferStyleFamily(
    [...style, goal, originalPrompt].filter((value): value is string => Boolean(value)),
  );

  return {
    source: {
      kind: sourceKind,
      ...(ref ? { uri: ref } : {}),
      ...(markdown ? { contentHash: hashText(markdown) } : {}),
    },
    ...(originalPrompt.trim() ? { originalPrompt } : {}),
    capability,
    ...(goal ? { subject: goal } : {}),
    ...(styleFamily ? { styleFamily } : {}),
    ...(style.length > 0 ? { style } : {}),
    ...(mustInclude.length > 0 ? { mustInclude } : {}),
    ...(avoid.length > 0 ? { avoid } : {}),
    ...(output ? { output } : {}),
  };
}

function composeGenerationIntentPrompt(intent: GenerationIntent): string {
  return [
    intent.originalPrompt,
    intent.subject,
    intent.composition,
    ...(intent.style ?? []),
    ...(intent.mood ?? []),
    ...(intent.quality ?? []),
    ...(intent.mustInclude ?? []),
    intent.avoid && intent.avoid.length > 0 ? `avoid ${intent.avoid.join(', ')}` : undefined,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(', ');
}

function readMarkdownSection(markdown: string, title: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\n)##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i',
  ).exec(markdown);
  return (
    match?.[1]
      ?.trim()
      .replace(/^[-*]\s+/gm, '')
      .trim() || undefined
  );
}

function readMarkdownListSection(markdown: string, title: string): readonly string[] {
  const section = readMarkdownSection(markdown, title);
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean);
}

function readMarkdownOutput(markdown: string): GenerationIntent['output'] | undefined {
  const section = readMarkdownSection(markdown, 'Output');
  if (!section) return undefined;
  const duration = /duration\s*:\s*(\d+)/i.exec(section)?.[1];
  const resolution = /resolution\s*:\s*([^\n]+)/i.exec(section)?.[1]?.trim();
  const output = {
    ...(duration ? { duration: Number(duration) } : {}),
    ...(resolution ? { resolution } : {}),
  };
  return Object.keys(output).length > 0 ? output : undefined;
}

function inferStyleFamily(values: readonly string[]): GenerationIntent['styleFamily'] | undefined {
  const joined = values.join(' ').toLowerCase();
  if (/anime|manga|cel[-\s]?shaded/.test(joined)) return 'anime';
  if (/photo|realistic|cinematic|film/.test(joined)) return 'photorealistic';
  if (/pixel|8-bit|sprite/.test(joined)) return 'pixel-art';
  if (/concept/.test(joined)) return 'concept-art';
  if (/watercolor|oil|painting|acrylic/.test(joined)) return 'painting';
  if (/3d|cgi|blender|render/.test(joined)) return '3d-render';
  if (/illustration|flat art|editorial/.test(joined)) return 'illustration';
  return undefined;
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Register media generation tools into the tool registry.
 * Tool names must match ai-generate skill's allowedTools exactly.
 */
export function registerMediaAgentTools(
  toolRegistry: IToolRegistry,
  media: MediaGenerationService,
): void {
  // GenerateImage
  toolRegistry.register(
    createTool({
      name: 'GenerateImage',
      description:
        'Submit an async IMAGE generation task (photos, illustrations, artwork). Only use this for still images — for videos use GenerateVideo instead. This tool only SUBMITS the task and returns immediately with a taskId — the image is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the image is ready or finished.',
      category: 'generation',
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          negativePrompt: {
            type: 'string',
            description: 'Optional negative prompt describing what to avoid',
          },
          taskRef: {
            type: 'string',
            description: 'Optional task markdown URI/path used as the generation intent source',
          },
          planRef: {
            type: 'string',
            description: 'Optional plan markdown URI/path used as the generation intent source',
          },
          taskMarkdown: {
            type: 'string',
            description: 'Optional inline task markdown content for extracting generation intent',
          },
          planMarkdown: {
            type: 'string',
            description: 'Optional inline plan markdown content for extracting generation intent',
          },
          providerAdaptationMode: {
            type: 'string',
            enum: ['auto', 'agentic', 'native'],
            description:
              'Provider expression adaptation mode. auto/agentic rely on the agent prompt context; native sends the prompt directly.',
          },

          providerId: {
            type: 'string',
            description: 'Optional explicit provider id for media routing',
          },
          modelId: {
            type: 'string',
            description: 'Optional explicit model id for media routing',
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'Image quality (default: standard)',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'Image style (default: vivid)',
          },
          aspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          referenceImageUrl: {
            type: 'string',
            description: 'Optional remote reference image URL for image-to-image generation',
          },
          referenceImageUri: {
            type: 'string',
            description: 'Optional host-resolved local reference image URI/path',
          },
          referenceImageBase64: {
            type: 'string',
            description: 'Optional reference image bytes as base64 without a data: prefix',
          },
          maskUri: {
            type: 'string',
            description: 'Optional host-resolved inpaint mask URI/path',
          },
          maskBase64: {
            type: 'string',
            description: 'Optional inpaint mask bytes as base64 without a data: prefix',
          },
          inpaintStrength: {
            type: 'number',
            description: 'Optional inpaint strength from 0.0 to 1.0',
          },
          ipAdapterRefs: {
            type: 'array',
            description:
              'Optional host-resolved IP-Adapter image references for subject or style consistency',
            items: {
              type: 'object',
              properties: {
                imageBase64: {
                  type: 'string',
                  description: 'Reference image bytes as base64 without a data: prefix',
                },
                mimeType: {
                  type: 'string',
                  description: 'Reference image MIME type',
                },
                strength: {
                  type: 'number',
                  description: 'Influence strength from 0.0 to 1.0',
                },
                mode: {
                  type: 'string',
                  enum: ['style', 'subject', 'both'],
                  description: 'Whether the reference should guide style, subject, or both',
                },
              },
            },
          },
          controlImageUri: {
            type: 'string',
            description: 'Optional host-resolved ControlNet image URI/path',
          },
          controlImageBase64: {
            type: 'string',
            description: 'Optional ControlNet image bytes as base64 without a data: prefix',
          },
          controlMode: {
            type: 'string',
            enum: [
              'canny',
              'depth',
              'pose',
              'normal',
              'segment',
              'lineart',
              'softedge',
              'scribble',
            ],
            description: 'Optional ControlNet conditioning mode',
          },
          controlStrength: {
            type: 'number',
            description: 'Optional ControlNet conditioning strength from 0.0 to 1.0',
          },
          editInstruction: {
            type: 'string',
            description:
              'Optional natural language edit instruction for edit-capable image providers',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'image');
        const targetError = requireToolMediaTarget(target, 'GenerateImage');
        if (targetError) {
          return { success: false, error: targetError };
        }

        try {
          const resolved = await resolveGenerationPrompt(args, 'image.generate', target.providerId);
          const requestTarget = {
            ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
            ...(target.modelId ? { requestedModelId: target.modelId } : {}),
          };
          const task = await media.generateImage({
            ...buildImageGenerationRequest({
              args: { size: '1024x1024', ...args },
              target: requestTarget,
              resolved,
            }),
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'image',
              status: 'queued',
              message: resolved.prompt,
              routedTo: {
                provider: task.providerId,
                model: task.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                      ...(target.modelId ? { requestedModelId: target.modelId } : {}),
                      actualProviderId: task.providerId,
                      actualModelId: task.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image generation failed',
          };
        }
      },
    }),
  );

  // TransformImage
  toolRegistry.register(
    createTool({
      name: 'TransformImage',
      description:
        'Submit an async source-bound IMAGE transform task. Use this for editing an existing image with source image, optional mask, edit instruction, references, and target aspect ratio/style. This facade preserves transform lineage; host/provider adapters must resolve stable refs before provider execution.',
      category: 'generation',
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Optional prompt; editInstruction is used when prompt is omitted',
          },
          editInstruction: {
            type: 'string',
            description: 'Natural language edit instruction for the source-bound transform',
          },
          negativePrompt: {
            type: 'string',
            description: 'Optional negative prompt describing what to avoid',
          },
          sourceImageRef: {
            type: 'object',
            description:
              'Stable source image ref for lineage/review. Host must resolve it to URI/base64 before provider execution.',
          },
          sourceImageUri: {
            type: 'string',
            description: 'Host-resolved source image URI/path used as provider reference input',
          },
          referenceImageUri: {
            type: 'string',
            description: 'Host-resolved reference image URI/path used as provider reference input',
          },
          referenceImageUrl: {
            type: 'string',
            description: 'Optional remote reference image URL',
          },
          referenceImageBase64: {
            type: 'string',
            description: 'Optional source/reference image bytes as base64 without a data: prefix',
          },
          maskRefs: {
            type: 'array',
            description:
              'Stable mask refs for lineage/review; host must resolve them before provider execution',
            items: { type: 'object' },
          },
          maskUri: {
            type: 'string',
            description: 'Host-resolved inpaint mask URI/path',
          },
          maskBase64: {
            type: 'string',
            description: 'Optional inpaint mask bytes as base64 without a data: prefix',
          },
          inpaintStrength: {
            type: 'number',
            description: 'Optional inpaint strength from 0.0 to 1.0',
          },
          ipAdapterRefs: {
            type: 'array',
            description:
              'Optional host-resolved IP-Adapter image references for subject or style consistency',
            items: {
              type: 'object',
              properties: {
                imageBase64: {
                  type: 'string',
                  description: 'Reference image bytes as base64 without a data: prefix',
                },
                mimeType: {
                  type: 'string',
                  description: 'Reference image MIME type',
                },
                strength: {
                  type: 'number',
                  description: 'Influence strength from 0.0 to 1.0',
                },
                mode: {
                  type: 'string',
                  enum: ['style', 'subject', 'both'],
                  description: 'Whether the reference should guide style, subject, or both',
                },
              },
            },
          },
          referenceBundle: {
            type: 'object',
            description: 'Stable character/scene/style reference bundle for lineage/review',
          },
          controlImageUri: {
            type: 'string',
            description: 'Optional host-resolved ControlNet image URI/path',
          },
          controlImageBase64: {
            type: 'string',
            description: 'Optional ControlNet image bytes as base64 without a data: prefix',
          },
          controlMode: {
            type: 'string',
            enum: [
              'canny',
              'depth',
              'pose',
              'normal',
              'segment',
              'lineart',
              'softedge',
              'scribble',
            ],
            description: 'Optional ControlNet conditioning mode',
          },
          controlStrength: {
            type: 'number',
            description: 'Optional ControlNet conditioning strength from 0.0 to 1.0',
          },
          targetAspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          targetStyle: {
            type: 'string',
            description: 'Optional target style for style normalization',
          },
          operationPlan: {
            type: 'array',
            description:
              'Reviewable transform operations such as crop-panel, remove-text, inpaint, outpaint',
            items: { type: 'string' },
          },
          planId: {
            type: 'string',
            description: 'Optional shot image prep plan id for lineage metadata',
          },
          sceneId: {
            type: 'string',
            description: 'Optional scene id for lineage metadata',
          },
          shotId: {
            type: 'string',
            description: 'Optional shot id for lineage metadata',
          },
          providerId: {
            type: 'string',
            description: 'Optional explicit provider id for media routing',
          },
          modelId: {
            type: 'string',
            description: 'Optional explicit model id for media routing',
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'Image dimensions (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'Image quality (default: standard)',
          },
          style: {
            type: 'string',
            enum: ['natural', 'vivid'],
            description: 'Image style (default: vivid)',
          },
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'image');
        const targetError = requireToolMediaTarget(target, 'TransformImage');
        if (targetError) {
          return { success: false, error: targetError };
        }
        const editInstruction = readOptionalString(args.editInstruction);
        const prompt = readOptionalString(args.prompt) ?? editInstruction ?? '';
        if (!prompt.trim()) {
          return {
            success: false,
            error: 'TransformImage requires prompt or editInstruction.',
          };
        }
        if (!hasResolvedTransformSource(args)) {
          return {
            success: false,
            error:
              'TransformImage requires a host-resolved sourceImageUri, referenceImageUri, referenceImageUrl, or referenceImageBase64. Stable sourceImageRef is metadata only until host IO resolves it.',
          };
        }

        try {
          const resolved = await resolveGenerationPrompt(
            { ...args, prompt },
            'image.generate',
            target.providerId,
          );
          const requestTarget = {
            ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
            ...(target.modelId ? { requestedModelId: target.modelId } : {}),
          };
          const transformMetadata = readTransformImageReferenceArgs(args);
          const task = await media.generateImage({
            ...buildImageGenerationRequest({
              args: {
                size: '1024x1024',
                ...args,
                referenceImageUri:
                  readOptionalString(args.referenceImageUri) ??
                  readOptionalString(args.sourceImageUri),
                aspectRatio:
                  readOptionalString(args.targetAspectRatio) ??
                  readOptionalString(args.aspectRatio),
                style: readOptionalString(args.style) ?? readOptionalString(args.targetStyle),
                editInstruction,
              },
              target: requestTarget,
              resolved,
              transformMetadata,
            }),
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'image-transform',
              status: 'queued',
              message: resolved.prompt,
              routedTo: {
                provider: task.providerId,
                model: task.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              transformImage: transformMetadata,
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...requestTarget,
                      actualProviderId: task.providerId,
                      actualModelId: task.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image transform failed',
          };
        }
      },
    }),
  );

  // GenerateVideo
  toolRegistry.register(
    createTool({
      name: 'GenerateVideo',
      description:
        'Submit an async VIDEO generation task (clips, animations, motion content). Use this when the user asks for a video, animation, or moving content — for still images use GenerateImage instead. This tool only SUBMITS the task and returns immediately with a taskId — the video is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the video is ready or finished.',
      category: 'generation',
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the video to generate',
          },
          taskRef: {
            type: 'string',
            description: 'Optional task markdown URI/path used as the generation intent source',
          },
          planRef: {
            type: 'string',
            description: 'Optional plan markdown URI/path used as the generation intent source',
          },
          taskMarkdown: {
            type: 'string',
            description: 'Optional inline task markdown content for extracting generation intent',
          },
          planMarkdown: {
            type: 'string',
            description: 'Optional inline plan markdown content for extracting generation intent',
          },
          providerAdaptationMode: {
            type: 'string',
            enum: ['auto', 'agentic', 'native'],
            description:
              'Provider expression adaptation mode. auto/agentic rely on the agent prompt context; native sends the prompt directly.',
          },

          providerId: {
            type: 'string',
            description: 'Optional explicit provider id for media routing',
          },
          modelId: {
            type: 'string',
            description: 'Optional explicit model id for media routing',
          },
          duration: {
            type: 'number',
            description: 'Video duration in seconds (1-30, default: 4)',
          },
          resolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p'],
            description: 'Video resolution (default: 720p)',
          },
          fps: {
            type: 'number',
            enum: ['24', '30', '60'],
            description: 'Frames per second (default: 24)',
          },
          aspectRatio: {
            type: 'string',
            description: 'Optional target aspect ratio such as 16:9, 9:16, or 1:1',
          },
          referenceImageUrl: {
            type: 'string',
            description: 'Optional remote reference image URL for image-to-video generation',
          },
          referenceImageUri: {
            type: 'string',
            description: 'Optional host-resolved local reference image URI/path',
          },
          referenceImageBase64: {
            type: 'string',
            description: 'Optional reference image bytes as base64 without a data: prefix',
          },
          referenceVideoUrl: {
            type: 'string',
            description: 'Optional remote reference video URL for video-to-video generation',
          },
          startFrameImageBase64: {
            type: 'string',
            description: 'Optional first frame image bytes as base64 without a data: prefix',
          },
          endFrameImageBase64: {
            type: 'string',
            description: 'Optional last frame image bytes as base64 without a data: prefix',
          },
          motionStrength: {
            type: 'number',
            description: 'Optional motion strength from 0.0 to 1.0',
          },
          cameraMovement: {
            type: 'string',
            description: 'Optional camera movement directive such as static, pan, or zoom-in',
          },
          cameraAngle: {
            type: 'string',
            description: 'Optional camera angle directive such as eye-level or low-angle',
          },
          shotScale: {
            type: 'string',
            description: 'Optional shot scale directive such as CU, MS, LS, or VLS',
          },
          editInstruction: {
            type: 'string',
            description: 'Optional natural language instruction for video editing or motion',
          },
        },
        required: [],
      },
      execute: async (args, options) => {
        const target = resolveToolMediaTarget(args, options, 'video');
        const targetError = requireToolMediaTarget(target, 'GenerateVideo');
        if (targetError) {
          return { success: false, error: targetError };
        }

        try {
          const resolved = await resolveGenerationPrompt(args, 'video.generate', target.providerId);
          const task = await media.generateVideo({
            prompt: resolved.prompt,
            ...(resolved.providerId ? { providerId: resolved.providerId } : {}),
            ...(target.modelId ? { modelId: target.modelId } : {}),
            duration: args.duration as number | undefined,
            resolution: args.resolution as string | undefined,
            fps: args.fps as number | undefined,
            ...readVideoReferenceInputs(args),
            ...(resolved.metadata
              ? {
                  metadata: withGenerationTargetMetadata(resolved.metadata, {
                    ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                    ...(target.modelId ? { requestedModelId: target.modelId } : {}),
                  }),
                }
              : {}),
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'video',
              status: 'queued',
              message: resolved.prompt,
              routedTo: {
                provider: task.providerId,
                model: task.modelId,
                ...(resolved.providerId ? { requestedProvider: resolved.providerId } : {}),
              },
              ...(resolved.metadata
                ? {
                    providerAdaptation: withGenerationTargetMetadata(resolved.metadata, {
                      ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                      ...(target.modelId ? { requestedModelId: target.modelId } : {}),
                      actualProviderId: task.providerId,
                      actualModelId: task.modelId,
                    })?.providerAdaptation,
                  }
                : {}),
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Video generation failed',
          };
        }
      },
    }),
  );

  // GenerateMusic
  toolRegistry.register(
    createTool({
      name: 'GenerateMusic',
      description:
        'Submit an async music generation task. This tool only SUBMITS the task and returns immediately with a taskId — the music is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the music is ready or finished.',
      category: 'generation',
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Description of the music to generate',
          },
          duration: {
            type: 'number',
            description: 'Music duration in seconds (5-300, default: 30)',
          },
          genre: {
            type: 'string',
            description: 'Music genre (e.g., corporate, ambient, electronic)',
          },
          mood: {
            type: 'string',
            description: 'Music mood (e.g., upbeat, calm, dramatic)',
          },
        },
        required: ['prompt'],
      },
      execute: async (args, options) => {
        const prompt = args.prompt as string;
        const moodStr = args.mood ? ` (mood: ${args.mood})` : '';
        const genreStr = args.genre ? ` (genre: ${args.genre})` : '';
        const target = resolveToolMediaTarget(args, options, 'music', 'audio');
        const targetError = requireToolMediaTarget(target, 'GenerateMusic');
        if (targetError) {
          return { success: false, error: targetError };
        }

        try {
          const task = await media.generateAudio({
            prompt: `${prompt}${genreStr}${moodStr}`,
            ...(target.providerId ? { providerId: target.providerId } : {}),
            ...(target.modelId ? { modelId: target.modelId } : {}),
            duration: args.duration as number | undefined,
            isMusic: true,
            genre: args.genre as string | undefined,
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'audio',
              status: 'queued',
              message: prompt,
              routedTo: { provider: task.providerId, model: task.modelId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Music generation failed',
          };
        }
      },
    }),
  );

  // GenerateTTS
  toolRegistry.register(
    createTool({
      name: 'GenerateTTS',
      description:
        'Submit an async text-to-speech task. This tool only SUBMITS the task and returns immediately with a taskId — the audio is NOT ready yet. Always tell the user the task has been submitted and is being processed in the background; do NOT say the audio is ready or finished.',
      category: 'generation',
      isConcurrencySafe: true,
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to convert to speech',
          },
          voice: {
            type: 'string',
            description: 'Voice ID or name (e.g., alloy, echo, onyx, nova)',
          },
          language: {
            type: 'string',
            description: 'Language code (e.g., en, zh, ja)',
          },
          speed: {
            type: 'number',
            description: 'Speech speed multiplier (0.5-2, default: 1)',
          },
          sourceCueId: {
            type: 'string',
            description: 'Optional structured storyboard voice cue ID for lineage',
          },
          speakerEntityId: {
            type: 'string',
            description: 'Optional creative entity ID for the speaker',
          },
          voiceAssetId: {
            type: 'string',
            description: 'Optional voice representation or voice asset ID used for this cue',
          },
        },
        required: ['text'],
      },
      execute: async (args, options) => {
        const text = args.text as string;
        const target = resolveToolMediaTarget(args, options, 'audio');
        const targetError = requireToolMediaTarget(target, 'GenerateTTS');
        if (targetError) {
          return { success: false, error: targetError };
        }

        try {
          const task = await media.generateAudio({
            prompt: text,
            ...(target.providerId ? { providerId: target.providerId } : {}),
            ...(target.modelId ? { modelId: target.modelId } : {}),
            isMusic: false,
            metadata: {
              voice: args.voice,
              language: args.language,
              speed: args.speed,
              ...(typeof args.sourceCueId === 'string' ? { sourceCueId: args.sourceCueId } : {}),
              ...(typeof args.speakerEntityId === 'string'
                ? { speakerEntityId: args.speakerEntityId }
                : {}),
              ...(typeof args.voiceAssetId === 'string' ? { voiceAssetId: args.voiceAssetId } : {}),
              ...(typeof args.speakerEntityId === 'string'
                ? { characterIds: [args.speakerEntityId] }
                : {}),
            },
          });
          return {
            success: true,
            data: {
              backgroundMode: true,
              taskId: task.id,
              type: 'audio',
              status: 'queued',
              message: text,
              routedTo: { provider: task.providerId, model: task.modelId },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'TTS generation failed',
          };
        }
      },
    }),
  );
}
