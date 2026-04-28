/**
 * NekoSketch Agent Capability Provider
 *
 * Provides AI-powered painting tools (generate, inpaint, style transfer, auto-layer)
 * to neko-agent via the AgentCapabilityProvider protocol.
 *
 * This replaces the `createNekoSketchTools()` factory function that was previously
 * maintained inside neko-agent's extension code.
 */

import * as vscode from 'vscode';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  NekoSketchAPI,
  ICapabilityMediaService,
  SketchAIContextScope,
  SketchAIContextSnapshot,
  SketchAIImageResultRequest,
  SketchAIOperationType,
  SketchSelectionData,
} from '@neko/shared';
import { TOOL_NAMES_SKETCH } from '@neko/shared';
import { getRootLogger } from './utils/logger';

type SketchAiFeature =
  | 'generate'
  | 'smartSelection'
  | 'inpaint'
  | 'styleTransfer'
  | 'upscale'
  | 'autoLayer'
  | 'lineartColorize';

const SKETCH_TOOL_FEATURES: Readonly<Record<string, SketchAiFeature>> = {
  [TOOL_NAMES_SKETCH.SKETCH_GENERATE]: 'generate',
  [TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION]: 'smartSelection',
  [TOOL_NAMES_SKETCH.SKETCH_INPAINT]: 'inpaint',
  [TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER]: 'styleTransfer',
  [TOOL_NAMES_SKETCH.SKETCH_UPSCALE]: 'upscale',
  [TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER]: 'autoLayer',
  [TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE]: 'lineartColorize',
};

function isAiOpsEnabled(): boolean {
  return vscode.workspace.getConfiguration('neko.sketch').get('aiOps.enabled', false);
}

function isAiFeatureEnabled(feature: SketchAiFeature): boolean {
  return vscode.workspace.getConfiguration('neko.sketch').get(`aiOps.${feature}.enabled`, true);
}

function isSketchToolEnabled(toolName: string): boolean {
  const feature = SKETCH_TOOL_FEATURES[toolName];
  return feature === undefined || isAiFeatureEnabled(feature);
}

type CapabilityImageOutput = {
  readonly url: string;
  readonly mimeType?: string;
};

type CapabilityMediaTaskResult = Awaited<ReturnType<ICapabilityMediaService['waitForTask']>>;

type CapabilityToolFailure = {
  readonly success: false;
  readonly error: string;
};

type MediaImageInput = {
  readonly mediaRequest: {
    readonly referenceImageBase64?: string;
    readonly referenceImageUri?: string;
  };
  readonly snapshot?: SketchAIContextSnapshot;
};

type MediaInpaintInput = {
  readonly mediaRequest: {
    readonly referenceImageBase64?: string;
    readonly referenceImageUri?: string;
    readonly maskBase64?: string;
    readonly maskUri?: string;
  };
  readonly bounds: Pick<SketchSelectionData, 'x' | 'y' | 'width' | 'height'>;
  readonly snapshot?: SketchAIContextSnapshot;
};

function requireActiveSketchEditor(api: NekoSketchAPI): CapabilityToolFailure | null {
  if (api.isActive()) {
    return null;
  }
  return {
    success: false,
    error: 'No active sketch editor is currently open.',
  };
}

async function applyAIImageOutput(
  api: NekoSketchAPI,
  output: CapabilityImageOutput,
  request: SketchAIImageResultRequest,
): Promise<{ readonly success: true } | CapabilityToolFailure> {
  const applied = await api.applyAIImageResult({
    ...request,
    sourceUrl: output.url,
    mimeType: request.mimeType ?? output.mimeType,
  });
  if (!applied) {
    return {
      success: false,
      error: 'AI result was generated but could not be delivered to the active sketch editor.',
    };
  }
  return { success: true };
}

function blendModeForAutoLayer(layerType: string): SketchAIImageResultRequest['blendMode'] {
  switch (layerType) {
    case 'shadow':
      return 'multiply';
    case 'highlight':
      return 'screen';
    default:
      return 'normal';
  }
}

function normalizeUpscaleFactor(value: number | undefined): number {
  if (value === 4) {
    return 4;
  }
  return 2;
}

async function getScopedImageInput(
  api: NekoSketchAPI,
  operation: SketchAIOperationType,
  scope: SketchAIContextScope,
): Promise<MediaImageInput | null> {
  const snapshot = await api.createAIContextSnapshot({ operation, scope });
  const asset = scope === 'layer' ? snapshot?.layerImage : snapshot?.compositeImage;
  if (asset?.kind === 'fileUri') {
    return {
      mediaRequest: { referenceImageUri: asset.ref },
      snapshot,
    };
  }

  const base64 = scope === 'layer' ? await api.getLayerImageData() : await api.getCanvasImageData();
  return base64 ? { mediaRequest: { referenceImageBase64: base64 } } : null;
}

async function getInpaintInput(api: NekoSketchAPI): Promise<MediaInpaintInput | null> {
  const snapshot = await api.createAIContextSnapshot({
    operation: 'inpaint',
    scope: 'canvas',
    includeSelection: true,
  });
  if (
    snapshot?.compositeImage?.kind === 'fileUri' &&
    snapshot.maskImage?.kind === 'fileUri' &&
    snapshot.selectionBounds
  ) {
    return {
      mediaRequest: {
        referenceImageUri: snapshot.compositeImage.ref,
        maskUri: snapshot.maskImage.ref,
      },
      bounds: snapshot.selectionBounds,
      snapshot,
    };
  }

  const selection = await api.getSelectionMask();
  if (!selection) {
    return null;
  }
  return {
    mediaRequest: {
      referenceImageBase64: selection.layerImageData,
      maskBase64: selection.mask,
    },
    bounds: selection,
  };
}

function normalizeStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function buildLineartColorizePrompt(prompt: string, palette: readonly string[]): string {
  const paletteText = palette.length > 0 ? ` Use this palette: ${palette.join(', ')}.` : '';
  return `Colorize this line art as a separate clean color layer. ${prompt}.${paletteText}`;
}

async function cleanupAIContextSnapshot(
  api: NekoSketchAPI,
  snapshot: SketchAIContextSnapshot | undefined,
): Promise<void> {
  if (!snapshot?.runId || !api.cleanupAIArtifacts) {
    return;
  }
  try {
    await api.cleanupAIArtifacts(snapshot.runId);
  } catch {
    // Cleanup is best-effort and must not mask the tool result.
  }
}

function registerMediaTaskCancellation(
  api: NekoSketchAPI,
  media: ICapabilityMediaService,
  taskId: string,
): () => void {
  const cancelTask = media.cancelTask?.bind(media);
  if (!api.registerAIRun || !cancelTask) {
    return () => {};
  }

  api.registerAIRun(taskId, async () => {
    const cancelled = await cancelTask(taskId);
    if (!cancelled) {
      throw new Error(`Media task ${taskId} could not be cancelled.`);
    }
  });

  return () => {
    api.unregisterAIRun?.(taskId);
  };
}

async function waitForCancellableMediaTask(
  api: NekoSketchAPI,
  media: ICapabilityMediaService,
  taskId: string,
  operation: SketchAIOperationType,
  stage: string,
  timeoutMs: number,
): Promise<CapabilityMediaTaskResult> {
  const unregister = registerMediaTaskCancellation(api, media, taskId);
  try {
    await api.reportAIProgress?.({
      runId: taskId,
      operation,
      percent: 10,
      stage,
    });
  } catch {
    // Progress reporting is best-effort; media execution remains authoritative.
  }
  try {
    return await media.waitForTask(taskId, timeoutMs);
  } finally {
    unregister();
  }
}

/**
 * Create the NekoSketch capability provider.
 *
 * @param api The NekoSketchAPI exports from the extension activation
 */
export function createNekoSketchCapabilityProvider(api: NekoSketchAPI): AgentCapabilityProvider {
  return new NekoSketchCapabilityProviderImpl(api);
}

class NekoSketchCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-sketch';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoSketchAPI) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const api = this._api;
    const logger = getRootLogger();
    const mediaService = context.mediaService;

    // All sketch tools require the media service for AI generation
    if (!mediaService) {
      logger.info('MediaService unavailable, neko-sketch tools will not be registered');
      return [];
    }
    if (!isAiOpsEnabled()) {
      logger.info('AI operations disabled by neko.sketch.aiOps.enabled');
      return [];
    }

    // Capture a non-optional reference for use in tool closures
    const media: ICapabilityMediaService = mediaService;

    const tools: Tool[] = [
      // -----------------------------------------------------------------------
      // SketchGenerate — Text-to-Image -> import as new canvas layer
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_GENERATE,
        description:
          'Generate a 2D image from a text prompt using AI and import it as a new layer in ' +
          'the active neko-sketch canvas. Waits for generation to complete before importing. ' +
          'Returns an error if no sketch editor is currently open.',
        category: 'generation',
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text description of the image to generate',
            },
            size: {
              type: 'string',
              enum: ['512x512', '1024x1024', '1792x1024', '1024x1792'],
              description: 'Image dimensions (default: 1024x1024)',
            },
            layerName: {
              type: 'string',
              description: 'Name for the new layer (default: derived from prompt)',
            },
          },
          required: ['prompt'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const prompt = args.prompt as string;
            const sizeStr = (args.size as string | undefined) ?? '1024x1024';
            const layerName =
              (args.layerName as string | undefined) ??
              `AI-${prompt.slice(0, 20).replace(/\s+/g, '-')}`;

            // Submit generation task
            const [w, h] = sizeStr.split('x').map(Number);
            let task;
            try {
              task = await media.generateImage({ prompt, width: w, height: h });
            } catch (err) {
              return { success: false, error: `Image generation failed: ${String(err)}` };
            }

            // Wait for completion (up to 3 minutes)
            let completed;
            try {
              completed = await waitForCancellableMediaTask(
                api,
                media,
                task.id,
                'generate',
                'Generating image',
                3 * 60 * 1000,
              );
            } catch (err) {
              return {
                success: false,
                error: `Waiting for image timed out or failed: ${String(err)}`,
              };
            }

            if (completed.status !== 'completed' || !completed.outputs?.length) {
              return { success: false, error: `Generation ${completed.status}` };
            }

            const output = completed.outputs[0]!;
            const applied = await applyAIImageOutput(api, output, {
              runId: task.id,
              operation: 'generate',
              sourceUrl: output.url,
              mimeType: output.mimeType,
              target: 'layer',
              name: layerName,
              width: w,
              height: h,
              metadata: { prompt, size: sizeStr },
            });
            if (!applied.success) return applied;

            logger.info(`SketchGenerate: sent layer preview "${layerName}" (${sizeStr})`);
            return {
              success: true,
              data: {
                message: `Image generated and sent to sketch for preview: ${layerName}`,
                size: sizeStr,
                taskId: task.id,
              },
            };
          } catch (err) {
            return { success: false, error: `SketchGenerate failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchSmartSelection — Generate a selection mask from the current canvas
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION,
        description:
          'Create a selection mask for the active neko-sketch canvas using AI. ' +
          'The result is applied as the current selection mask and can be used by inpaint.',
        category: 'generation',
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                'What to select, for example "main character", "background", or "line art".',
            },
            negativePrompt: {
              type: 'string',
              description: 'What should be excluded from the selection mask',
            },
            scope: {
              type: 'string',
              enum: ['layer', 'canvas'],
              description: 'Use the active layer or full canvas composite (default: canvas)',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const prompt = (args.prompt as string | undefined) ?? 'main subject';
            const negativePrompt = args.negativePrompt as string | undefined;
            const scope = (args.scope as SketchAIContextScope | undefined) ?? 'canvas';
            const imageInput = await getScopedImageInput(api, 'smart-selection', scope);

            if (!imageInput) {
              return { success: false, error: 'No image data available from sketch editor' };
            }

            try {
              let task;
              try {
                task = await media.generateImage({
                  prompt:
                    `Create a binary alpha selection mask for: ${prompt}. ` +
                    'Return a black and white mask image where white means selected.',
                  negativePrompt,
                  ...imageInput.mediaRequest,
                  outputKind: 'selection-mask',
                });
              } catch (err) {
                return { success: false, error: `Smart selection failed: ${String(err)}` };
              }

              let completed;
              try {
                completed = await waitForCancellableMediaTask(
                  api,
                  media,
                  task.id,
                  'smart-selection',
                  'Generating selection mask',
                  3 * 60 * 1000,
                );
              } catch (err) {
                return { success: false, error: `Smart selection timed out: ${String(err)}` };
              }

              if (completed.status !== 'completed' || !completed.outputs?.length) {
                return { success: false, error: `Smart selection ${completed.status}` };
              }

              const output = completed.outputs[0]!;
              const applied = await applyAIImageOutput(api, output, {
                runId: task.id,
                operation: 'smart-selection',
                sourceUrl: output.url,
                mimeType: output.mimeType,
                target: 'selection',
                name: 'smart-selection-mask',
                metadata: { prompt, negativePrompt, scope, contextSnapshot: imageInput.snapshot },
              });
              if (!applied.success) return applied;

              logger.info(`SketchSmartSelection: sent selection mask preview (${scope})`);
              return {
                success: true,
                data: {
                  message: 'Smart selection mask generated and sent to sketch for preview',
                  taskId: task.id,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, imageInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchSmartSelection failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchInpaint — Repaint a selected region using AI
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_INPAINT,
        description:
          'Inpaint (locally redraw) the rectangular selection in the active neko-sketch canvas. ' +
          'Requires an active rectangular selection. The selected region is regenerated with ' +
          'AI-generated content and added as a new layer above the current one.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'What to draw in the selected area',
            },
            strength: {
              type: 'number',
              description:
                'Inpaint strength 0.0-1.0 (default: 0.8). Higher = more creative, lower = closer to original.',
            },
            negativePrompt: {
              type: 'string',
              description: 'What the inpaint result should avoid',
            },
            layerName: {
              type: 'string',
              description: 'Name for the result layer (default: "Inpaint")',
            },
          },
          required: ['prompt'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const inpaintInput = await getInpaintInput(api);
            if (!inpaintInput) {
              return {
                success: false,
                error:
                  'No active selection in sketch editor. Use a selection tool first (rect/lasso/wand).',
              };
            }

            const prompt = args.prompt as string;
            const negativePrompt = args.negativePrompt as string | undefined;
            const strength = (args.strength as number | undefined) ?? 0.8;
            const layerName = (args.layerName as string | undefined) ?? 'Inpaint';

            try {
              let task;
              try {
                task = await media.generateImage({
                  prompt,
                  negativePrompt,
                  ...inpaintInput.mediaRequest,
                  inpaintStrength: strength,
                  width: inpaintInput.bounds.width,
                  height: inpaintInput.bounds.height,
                });
              } catch (err) {
                return { success: false, error: `Inpaint generation failed: ${String(err)}` };
              }

              let completed;
              try {
                completed = await waitForCancellableMediaTask(
                  api,
                  media,
                  task.id,
                  'inpaint',
                  'Generating inpaint result',
                  3 * 60 * 1000,
                );
              } catch (err) {
                return { success: false, error: `Waiting for inpaint timed out: ${String(err)}` };
              }

              if (completed.status !== 'completed' || !completed.outputs?.length) {
                return { success: false, error: `Inpaint ${completed.status}` };
              }

              const output = completed.outputs[0]!;
              const applied = await applyAIImageOutput(api, output, {
                runId: task.id,
                operation: 'inpaint',
                sourceUrl: output.url,
                mimeType: output.mimeType,
                target: 'layer',
                name: layerName,
                width: inpaintInput.bounds.width,
                height: inpaintInput.bounds.height,
                offsetX: inpaintInput.bounds.x,
                offsetY: inpaintInput.bounds.y,
                metadata: {
                  prompt,
                  negativePrompt,
                  strength,
                  contextSnapshot: inpaintInput.snapshot,
                },
              });
              if (!applied.success) return applied;

              logger.info(`SketchInpaint: sent inpaint preview "${layerName}"`);
              return {
                success: true,
                data: {
                  message: `Inpainting complete, preview ready: ${layerName}`,
                  taskId: task.id,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, inpaintInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchInpaint failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchStyleTransfer — Apply an artistic style to the active layer/canvas
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
        description:
          'Apply an artistic style transformation to the active layer or full canvas composite. ' +
          'The result is added as a new layer. Use for converting sketches to anime, painting, etc.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            style: {
              type: 'string',
              enum: [
                'anime',
                'oil-painting',
                'watercolor',
                'pixel-art',
                'sketch',
                'comic',
                'ghibli',
              ],
              description: 'Target artistic style',
            },
            prompt: {
              type: 'string',
              description: 'Additional style guidance (optional)',
            },
            strength: {
              type: 'number',
              description: 'Style strength 0.0-1.0 (default: 0.7)',
            },
            scope: {
              type: 'string',
              enum: ['layer', 'canvas'],
              description: 'Apply to active layer or full canvas composite (default: canvas)',
            },
            layerName: {
              type: 'string',
              description: 'Name for the result layer (default: derived from style)',
            },
          },
          required: ['style'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const style = args.style as string;
            const strength = (args.strength as number | undefined) ?? 0.7;
            const scope = (args.scope as SketchAIContextScope | undefined) ?? 'canvas';
            const extraPrompt = (args.prompt as string | undefined) ?? '';
            const layerName = (args.layerName as string | undefined) ?? `${style}-style`;

            const imageInput = await getScopedImageInput(api, 'style-transfer', scope);

            if (!imageInput) {
              return { success: false, error: 'No image data available from sketch editor' };
            }

            const stylePromptMap: Record<string, string> = {
              anime: 'anime style illustration, cel shading, vibrant colors',
              'oil-painting': 'oil painting, thick brushstrokes, textured canvas, artistic',
              watercolor: 'watercolor painting, soft washes, transparent layers',
              'pixel-art': 'pixel art, 8-bit retro style, pixelated',
              sketch: 'pencil sketch, line art, black and white',
              comic: 'comic book style, bold outlines, halftone shading',
              ghibli: 'Studio Ghibli animation style, soft colors, hand-drawn',
            };
            const stylePrompt = stylePromptMap[style] ?? style;
            const fullPrompt = extraPrompt ? `${stylePrompt}, ${extraPrompt}` : stylePrompt;

            try {
              let task;
              try {
                task = await media.generateImage({
                  prompt: fullPrompt,
                  ...imageInput.mediaRequest,
                  inpaintStrength: strength,
                  style,
                });
              } catch (err) {
                return { success: false, error: `Style transfer failed: ${String(err)}` };
              }

              let completed;
              try {
                completed = await waitForCancellableMediaTask(
                  api,
                  media,
                  task.id,
                  'style-transfer',
                  'Generating style transfer result',
                  3 * 60 * 1000,
                );
              } catch (err) {
                return { success: false, error: `Style transfer timed out: ${String(err)}` };
              }

              if (completed.status !== 'completed' || !completed.outputs?.length) {
                return { success: false, error: `Style transfer ${completed.status}` };
              }

              const output = completed.outputs[0]!;
              const applied = await applyAIImageOutput(api, output, {
                runId: task.id,
                operation: 'style-transfer',
                sourceUrl: output.url,
                mimeType: output.mimeType,
                target: 'layer',
                name: layerName,
                metadata: {
                  style,
                  scope,
                  strength,
                  prompt: extraPrompt,
                  contextSnapshot: imageInput.snapshot,
                },
              });
              if (!applied.success) return applied;

              logger.info(`SketchStyleTransfer: sent preview "${layerName}" (style=${style})`);
              return {
                success: true,
                data: {
                  message: `Style transfer complete, preview ready: ${layerName}`,
                  style,
                  taskId: task.id,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, imageInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchStyleTransfer failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchUpscale — Enhance resolution/detail and import as a new layer
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_UPSCALE,
        description:
          'Upscale the active layer or full canvas composite using AI. ' +
          'The result is imported as a new raster layer and does not overwrite the source.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            scale: {
              type: 'number',
              description: 'Upscale factor, usually 2 or 4 (default: 2)',
            },
            scope: {
              type: 'string',
              enum: ['layer', 'canvas'],
              description: 'Upscale the active layer or full canvas composite (default: canvas)',
            },
            prompt: {
              type: 'string',
              description: 'Optional detail guidance for the upscaled result',
            },
            layerName: {
              type: 'string',
              description: 'Name for the result layer (default: "Upscale")',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const scale = normalizeUpscaleFactor(args.scale as number | undefined);
            const scope = (args.scope as SketchAIContextScope | undefined) ?? 'canvas';
            const prompt = (args.prompt as string | undefined) ?? 'preserve the original drawing';
            const layerName = (args.layerName as string | undefined) ?? `Upscale ${scale}x`;
            const imageInput = await getScopedImageInput(api, 'upscale', scope);

            if (!imageInput) {
              return { success: false, error: 'No image data available from sketch editor' };
            }

            try {
              let task;
              try {
                task = await media.generateImage({
                  prompt: `Upscale this 2D artwork by ${scale}x, ${prompt}`,
                  ...imageInput.mediaRequest,
                  operation: 'upscale',
                  scale,
                });
              } catch (err) {
                return { success: false, error: `Upscale failed: ${String(err)}` };
              }

              let completed;
              try {
                completed = await waitForCancellableMediaTask(
                  api,
                  media,
                  task.id,
                  'upscale',
                  'Generating upscale result',
                  3 * 60 * 1000,
                );
              } catch (err) {
                return { success: false, error: `Upscale timed out: ${String(err)}` };
              }

              if (completed.status !== 'completed' || !completed.outputs?.length) {
                return { success: false, error: `Upscale ${completed.status}` };
              }

              const output = completed.outputs[0]!;
              const applied = await applyAIImageOutput(api, output, {
                runId: task.id,
                operation: 'upscale',
                sourceUrl: output.url,
                mimeType: output.mimeType,
                target: 'layer',
                name: layerName,
                metadata: { scale, scope, prompt, contextSnapshot: imageInput.snapshot },
              });
              if (!applied.success) return applied;

              logger.info(`SketchUpscale: sent preview "${layerName}" (${scale}x, scope=${scope})`);
              return {
                success: true,
                data: {
                  message: `Upscale complete, preview ready: ${layerName}`,
                  scale,
                  taskId: task.id,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, imageInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchUpscale failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchLineartColorize — Generate a color layer for line art
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE,
        description:
          'Colorize line art from the active layer or full canvas using AI. ' +
          'The generated colors are imported as a new raster layer.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Coloring guidance, materials, mood, or character details',
            },
            palette: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional color palette as hex strings or color names',
            },
            scope: {
              type: 'string',
              enum: ['layer', 'canvas'],
              description: 'Colorize the active layer or full canvas composite (default: layer)',
            },
            layerName: {
              type: 'string',
              description: 'Name for the result layer (default: "Colorize")',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const prompt = (args.prompt as string | undefined) ?? 'clean flat colors';
            const palette = normalizeStringList(args.palette);
            const scope = (args.scope as SketchAIContextScope | undefined) ?? 'layer';
            const layerName = (args.layerName as string | undefined) ?? 'Colorize';
            const imageInput = await getScopedImageInput(api, 'lineart-colorize', scope);

            if (!imageInput) {
              return { success: false, error: 'No image data available from sketch editor' };
            }

            try {
              let task;
              try {
                task = await media.generateImage({
                  prompt: buildLineartColorizePrompt(prompt, palette),
                  ...imageInput.mediaRequest,
                  operation: 'lineart-colorize',
                  palette,
                });
              } catch (err) {
                return { success: false, error: `Line art colorize failed: ${String(err)}` };
              }

              let completed;
              try {
                completed = await waitForCancellableMediaTask(
                  api,
                  media,
                  task.id,
                  'lineart-colorize',
                  'Generating color layer',
                  3 * 60 * 1000,
                );
              } catch (err) {
                return { success: false, error: `Line art colorize timed out: ${String(err)}` };
              }

              if (completed.status !== 'completed' || !completed.outputs?.length) {
                return { success: false, error: `Line art colorize ${completed.status}` };
              }

              const output = completed.outputs[0]!;
              const applied = await applyAIImageOutput(api, output, {
                runId: task.id,
                operation: 'lineart-colorize',
                sourceUrl: output.url,
                mimeType: output.mimeType,
                target: 'layer',
                name: layerName,
                metadata: { prompt, palette, scope, contextSnapshot: imageInput.snapshot },
              });
              if (!applied.success) return applied;

              logger.info(`SketchLineartColorize: sent preview "${layerName}" (scope=${scope})`);
              return {
                success: true,
                data: {
                  message: `Line art colorize complete, preview ready: ${layerName}`,
                  taskId: task.id,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, imageInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchLineartColorize failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SketchAutoLayer — Decompose image into separate artistic layers via AI
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
        description:
          'Automatically decompose the active layer or canvas into separate layers: ' +
          'line art, flat color, shadow, and highlight. Each decomposed component is imported ' +
          'as an individual layer. Note: requires AI provider support for image decomposition.',
        category: 'generation',
        parameters: {
          type: 'object',
          properties: {
            layers: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['lineart', 'flatcolor', 'shadow', 'highlight'],
              },
              description: 'Which layers to extract (default: all four)',
            },
          },
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const inactive = requireActiveSketchEditor(api);
            if (inactive) return inactive;

            const requestedLayers = (args.layers as string[] | undefined) ?? [
              'lineart',
              'flatcolor',
              'shadow',
              'highlight',
            ];

            const imageInput = await getScopedImageInput(api, 'auto-layer', 'canvas');
            if (!imageInput) {
              return { success: false, error: 'No canvas image data available' };
            }

            // Generate each layer component via style-transfer approach
            const layerStyleMap: Record<string, string> = {
              lineart: 'line art extraction, black outlines on white background, no fill',
              flatcolor: 'flat color extraction, solid colors, no shading or outlines',
              shadow: 'shadow layer extraction, dark values only, multiply blend mode',
              highlight: 'highlight layer extraction, bright values only, screen blend mode',
            };

            try {
              const results: string[] = [];
              for (const layerType of requestedLayers) {
                const stylePrompt = layerStyleMap[layerType];
                if (!stylePrompt) continue;

                try {
                  const task = await media.generateImage({
                    prompt: stylePrompt,
                    ...imageInput.mediaRequest,
                    inpaintStrength: 1.0,
                  });
                  const completed = await waitForCancellableMediaTask(
                    api,
                    media,
                    task.id,
                    'auto-layer',
                    `Extracting ${layerType}`,
                    3 * 60 * 1000,
                  );

                  if (completed.status === 'completed' && completed.outputs?.length) {
                    const output = completed.outputs[0]!;
                    const applied = await applyAIImageOutput(api, output, {
                      runId: task.id,
                      operation: 'auto-layer',
                      sourceUrl: output.url,
                      mimeType: output.mimeType,
                      target: 'layer',
                      name: layerType,
                      blendMode: blendModeForAutoLayer(layerType),
                      metadata: { layerType, contextSnapshot: imageInput.snapshot },
                    });
                    if (applied.success) {
                      results.push(layerType);
                    } else {
                      logger.warn(
                        `SketchAutoLayer: failed to apply "${layerType}": ${applied.error}`,
                      );
                    }
                  }
                } catch (err) {
                  logger.warn(`SketchAutoLayer: failed to extract "${layerType}": ${String(err)}`);
                }
              }

              if (results.length === 0) {
                return {
                  success: false,
                  error: 'Failed to extract any layers. Check AI provider configuration.',
                };
              }

              logger.info(`SketchAutoLayer: sent layer previews: ${results.join(', ')}`);
              return {
                success: true,
                data: {
                  message: `Prepared ${results.length} layer preview(s): ${results.join(', ')}`,
                  layerPreviews: results,
                },
              };
            } finally {
              await cleanupAIContextSnapshot(api, imageInput.snapshot);
            }
          } catch (err) {
            return { success: false, error: `SketchAutoLayer failed: ${String(err)}` };
          }
        },
      },
    ];
    return tools.filter((tool) => isSketchToolEnabled(tool.name));
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'sketch-painting',
        description:
          'AI painting tools for NekoSketch — generate, inpaint, style transfer, auto-layer, drawing, sketch',
        tools: Object.values(TOOL_NAMES_SKETCH),
        alwaysActive: false,
        source: 'builtin',
        enabled: isAiOpsEnabled(),
        loadingTier: 'eager',
      },
    ];
  }
}
