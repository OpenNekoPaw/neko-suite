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
} from '@neko/shared';
import type { MediaGenerationService } from './media-generation-service';

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
): Promise<ResolvedGenerationPrompt> {
  const explicitProviderId = typeof args.providerId === 'string' ? args.providerId : undefined;
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
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
    return resolveNativeGenerationIntent(intent, explicitProviderId, {
      reason: 'provider-adaptation-bypassed',
    });
  }

  return resolveNativeGenerationIntent(intent, explicitProviderId, {
    mode: 'agentic',
    reason: 'agent-expression-context-only',
  });
}

function resolveNativeGenerationIntent(
  intent: GenerationIntent,
  providerId: string | undefined,
  details: Record<string, unknown>,
): ResolvedGenerationPrompt {
  const fallbackPrompt = composeGenerationIntentPrompt(intent);
  return {
    prompt: fallbackPrompt,
    ...(providerId ? { providerId } : {}),
    metadata: buildProviderAdaptationMetadata({
      mode: details.mode === 'agentic' ? 'agentic' : 'native',
      source: intent.source,
      extractedIntent: intent,
      providerPrompt: fallbackPrompt,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
          n: {
            type: 'number',
            description: 'Number of images to generate (1-4, default: 1)',
          },
        },
        required: [],
      },
      execute: async (args) => {
        const sizeStr = readOptionalString(args.size) ?? '1024x1024';
        const [w, h] = sizeStr.split('x').map(Number);
        const requestedModelId = readOptionalString(args.modelId);

        try {
          const resolved = await resolveGenerationPrompt(args, 'image.generate');
          const task = await media.generateImage({
            prompt: resolved.prompt,
            ...(resolved.negativePrompt ? { negativePrompt: resolved.negativePrompt } : {}),
            ...(resolved.providerId ? { providerId: resolved.providerId } : {}),
            ...(requestedModelId ? { modelId: requestedModelId } : {}),
            width: w,
            height: h,
            quality: args.quality as 'standard' | 'hd' | undefined,
            style: args.style as string | undefined,
            count: args.n as number | undefined,
            ...(resolved.metadata
              ? {
                  metadata: withGenerationTargetMetadata(resolved.metadata, {
                    ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                    ...(requestedModelId ? { requestedModelId } : {}),
                  }),
                }
              : {}),
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
                      ...(requestedModelId ? { requestedModelId } : {}),
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
        },
        required: [],
      },
      execute: async (args) => {
        const requestedModelId = readOptionalString(args.modelId);

        try {
          const resolved = await resolveGenerationPrompt(args, 'video.generate');
          const task = await media.generateVideo({
            prompt: resolved.prompt,
            ...(resolved.providerId ? { providerId: resolved.providerId } : {}),
            ...(requestedModelId ? { modelId: requestedModelId } : {}),
            duration: args.duration as number | undefined,
            resolution: args.resolution as string | undefined,
            fps: args.fps as number | undefined,
            ...(resolved.metadata
              ? {
                  metadata: withGenerationTargetMetadata(resolved.metadata, {
                    ...(resolved.providerId ? { requestedProviderId: resolved.providerId } : {}),
                    ...(requestedModelId ? { requestedModelId } : {}),
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
                      ...(requestedModelId ? { requestedModelId } : {}),
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
      execute: async (args) => {
        const prompt = args.prompt as string;
        const moodStr = args.mood ? ` (mood: ${args.mood})` : '';
        const genreStr = args.genre ? ` (genre: ${args.genre})` : '';

        try {
          const task = await media.generateAudio({
            prompt: `${prompt}${genreStr}${moodStr}`,
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
              routedTo: { provider: task.providerId },
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
        },
        required: ['text'],
      },
      execute: async (args) => {
        const text = args.text as string;

        try {
          const task = await media.generateAudio({
            prompt: text,
            isMusic: false,
            metadata: {
              voice: args.voice,
              language: args.language,
              speed: args.speed,
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
              routedTo: { provider: task.providerId },
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
