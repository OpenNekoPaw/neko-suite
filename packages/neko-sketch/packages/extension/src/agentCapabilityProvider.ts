/**
 * NekoSketch Agent Capability Provider
 *
 * Provides AI-powered painting tools (generate, inpaint, style transfer, auto-layer)
 * to neko-agent via the AgentCapabilityProvider protocol.
 *
 * This replaces the `createNekoSketchTools()` factory function that was previously
 * maintained inside neko-agent's extension code.
 */

import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  NekoSketchAPI,
  ICapabilityMediaService,
} from '@neko/shared';
import { TOOL_NAMES_SKETCH } from '@neko/shared';
import { getRootLogger } from './utils/logger';

/**
 * Create the NekoSketch capability provider.
 *
 * @param api The NekoSketchAPI exports from the extension activation
 */
export function createNekoSketchCapabilityProvider(api: NekoSketchAPI): AgentCapabilityProvider {
  return new NekoSketchCapabilityProviderImpl(api);
}

/**
 * Download an image from a URL and convert to base64.
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
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

    // Capture a non-optional reference for use in tool closures
    const media: ICapabilityMediaService = mediaService;

    return [
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
              completed = await media.waitForTask(task.id, 3 * 60 * 1000);
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

            // Download and import into the active sketch canvas
            let base64: string;
            try {
              base64 = await fetchImageAsBase64(output.url);
            } catch (err) {
              return {
                success: false,
                error: `Failed to fetch generated image: ${String(err)}`,
              };
            }

            api.importImageData(base64, `${layerName}.png`);

            logger.info(`SketchGenerate: imported layer "${layerName}" (${sizeStr})`);
            return {
              success: true,
              data: {
                message: `Image generated and imported as layer: ${layerName}`,
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
            layerName: {
              type: 'string',
              description: 'Name for the result layer (default: "Inpaint")',
            },
          },
          required: ['prompt'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const selection = await api.getSelectionMask();
            if (!selection) {
              return {
                success: false,
                error:
                  'No active selection in sketch editor. Use a selection tool first (rect/lasso/wand).',
              };
            }

            const prompt = args.prompt as string;
            const strength = (args.strength as number | undefined) ?? 0.8;
            const layerName = (args.layerName as string | undefined) ?? 'Inpaint';

            let task;
            try {
              task = await media.generateImage({
                prompt,
                referenceImageBase64: selection.layerImageData,
                maskBase64: selection.mask,
                inpaintStrength: strength,
                width: selection.width,
                height: selection.height,
              });
            } catch (err) {
              return { success: false, error: `Inpaint generation failed: ${String(err)}` };
            }

            let completed;
            try {
              completed = await media.waitForTask(task.id, 3 * 60 * 1000);
            } catch (err) {
              return { success: false, error: `Waiting for inpaint timed out: ${String(err)}` };
            }

            if (completed.status !== 'completed' || !completed.outputs?.length) {
              return { success: false, error: `Inpaint ${completed.status}` };
            }

            const output = completed.outputs[0]!;
            let base64: string;
            try {
              base64 = await fetchImageAsBase64(output.url);
            } catch (err) {
              return {
                success: false,
                error: `Failed to fetch inpainted image: ${String(err)}`,
              };
            }

            api.importImageData(base64, `${layerName}.png`);
            logger.info(`SketchInpaint: imported inpainted layer "${layerName}"`);
            return {
              success: true,
              data: {
                message: `Inpainting complete, layer: ${layerName}`,
                taskId: task.id,
              },
            };
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
            const style = args.style as string;
            const strength = (args.strength as number | undefined) ?? 0.7;
            const scope = (args.scope as string | undefined) ?? 'canvas';
            const extraPrompt = (args.prompt as string | undefined) ?? '';
            const layerName = (args.layerName as string | undefined) ?? `${style}-style`;

            const imageData =
              scope === 'layer' ? await api.getLayerImageData() : await api.getCanvasImageData();

            if (!imageData) {
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

            let task;
            try {
              task = await media.generateImage({
                prompt: fullPrompt,
                referenceImageBase64: imageData,
                inpaintStrength: strength,
                style,
              });
            } catch (err) {
              return { success: false, error: `Style transfer failed: ${String(err)}` };
            }

            let completed;
            try {
              completed = await media.waitForTask(task.id, 3 * 60 * 1000);
            } catch (err) {
              return { success: false, error: `Style transfer timed out: ${String(err)}` };
            }

            if (completed.status !== 'completed' || !completed.outputs?.length) {
              return { success: false, error: `Style transfer ${completed.status}` };
            }

            const output = completed.outputs[0]!;
            let base64: string;
            try {
              base64 = await fetchImageAsBase64(output.url);
            } catch (err) {
              return {
                success: false,
                error: `Failed to fetch styled image: ${String(err)}`,
              };
            }

            api.importImageData(base64, `${layerName}.png`);
            logger.info(`SketchStyleTransfer: imported "${layerName}" (style=${style})`);
            return {
              success: true,
              data: {
                message: `Style transfer complete, layer: ${layerName}`,
                style,
                taskId: task.id,
              },
            };
          } catch (err) {
            return { success: false, error: `SketchStyleTransfer failed: ${String(err)}` };
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
            const requestedLayers = (args.layers as string[] | undefined) ?? [
              'lineart',
              'flatcolor',
              'shadow',
              'highlight',
            ];

            const imageData = await api.getCanvasImageData();
            if (!imageData) {
              return { success: false, error: 'No canvas image data available' };
            }

            // Generate each layer component via style-transfer approach
            const layerStyleMap: Record<string, string> = {
              lineart: 'line art extraction, black outlines on white background, no fill',
              flatcolor: 'flat color extraction, solid colors, no shading or outlines',
              shadow: 'shadow layer extraction, dark values only, multiply blend mode',
              highlight: 'highlight layer extraction, bright values only, screen blend mode',
            };

            const results: string[] = [];
            for (const layerType of requestedLayers) {
              const stylePrompt = layerStyleMap[layerType];
              if (!stylePrompt) continue;

              try {
                const task = await media.generateImage({
                  prompt: stylePrompt,
                  referenceImageBase64: imageData,
                  inpaintStrength: 1.0,
                });
                const completed = await media.waitForTask(task.id, 3 * 60 * 1000);

                if (completed.status === 'completed' && completed.outputs?.length) {
                  const output = completed.outputs[0]!;
                  const base64 = await fetchImageAsBase64(output.url);
                  api.importImageData(base64, `${layerType}.png`);
                  results.push(layerType);
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

            logger.info(`SketchAutoLayer: imported layers: ${results.join(', ')}`);
            return {
              success: true,
              data: {
                message: `Extracted ${results.length} layer(s): ${results.join(', ')}`,
                layersCreated: results,
              },
            };
          } catch (err) {
            return { success: false, error: `SketchAutoLayer failed: ${String(err)}` };
          }
        },
      },
    ];
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
        enabled: true,
        loadingTier: 'eager',
      },
    ];
  }
}
