import * as fs from 'fs/promises';
import { createTool, TOOL_NAMES_SYSTEM, type Tool, type ToolResult } from '@neko/shared';
import { probeImageMetadata, type ImageMetadata } from '@neko/platform/document';
import {
  DEFAULT_VISION_PREPROCESS_POLICY,
  planVisionImagePreprocess,
  resolveVisionImageAttachmentMediaType,
  type VisionImageProcessor,
  type VisionPreprocessPolicy,
} from '@neko/platform/media';
import type { Platform } from '@neko/platform';
import { resolveDocumentPath } from '../services/documentPathResolver';
import { createSharpVisionImageProcessor } from '../services/visionImageProcessor';

export const DEFAULT_READ_IMAGE_LIMIT = 4;
export const MAX_READ_IMAGE_LIMIT = 16;
export const MAX_READ_IMAGE_BYTES = 20 * 1024 * 1024;
export const MIN_READ_IMAGE_LONG_EDGE = 256;
export const MAX_READ_IMAGE_LONG_EDGE = 4096;
export const MIN_READ_IMAGE_JPEG_QUALITY = 40;
export const MAX_READ_IMAGE_JPEG_QUALITY = 95;

export interface ReadImageToolDeps {
  readonly platform?: Platform;
  readonly readFile?: (filePath: string) => Promise<Uint8Array>;
  readonly imageProcessor?: VisionImageProcessor;
}

export interface ReadImageInputImage {
  readonly path: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReadImageResultImage {
  readonly path: string;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly byteSize: number;
  readonly visionInput?: ReadImageVisionInputSummary;
  readonly analysis?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReadImageResultData {
  readonly mode: ReadImageMode;
  readonly analysis: ReadImageAnalysisKind;
  readonly images: readonly ReadImageResultImage[];
  readonly imageCount: number;
  readonly imagePathsTruncated: boolean;
}

export type ReadImageMode = 'metadata' | 'vision';
export type ReadImageAnalysisKind = 'describe' | 'ocr' | 'panels' | 'storyboard' | 'custom';
export type ReadImagePreprocessMode = 'auto' | 'none';

export interface ReadImageVisionInputSummary {
  readonly preprocess: ReadImagePreprocessMode;
  readonly transformed: boolean;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly maxLongEdge?: number;
  readonly jpegQuality?: number;
}

interface LoadedImage {
  readonly input: ReadImageInputImage;
  readonly resolvedPath: string;
  readonly bytes: Uint8Array;
  readonly metadata: ImageMetadata;
}

interface PreparedVisionImage {
  readonly image: LoadedImage;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly summary: ReadImageVisionInputSummary;
}

export function createReadImageTool(deps: ReadImageToolDeps = {}): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_IMAGE,
    description:
      'Read local image metadata, or analyze selected images with the current vision-capable chat model. ' +
      'Use this for image files from documents, media libraries, generated assets, screenshots, and attachments. ' +
      'Default mode="metadata" returns dimensions/MIME/size only; mode="vision" performs visual analysis/OCR/panel description.',
    category: 'analysis',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        image_paths: {
          type: 'array',
          description: 'Local image paths to inspect or analyze.',
          items: { type: 'string' },
        },
        images: {
          type: 'array',
          description:
            'Optional structured image inputs. Each item may include { path, label }. Used when page labels are available.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['path'],
          },
        },
        mode: {
          type: 'string',
          enum: ['metadata', 'vision'],
          description:
            'metadata reads only file/image metadata. vision sends selected images to the chat model.',
        },
        analysis: {
          type: 'string',
          enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
          description:
            'Requested vision analysis style. Ignored for metadata mode except for result bookkeeping.',
        },
        prompt: {
          type: 'string',
          description:
            'Optional custom instruction for vision mode. Used with analysis="custom" or to add task-specific detail.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum number of images to process. Default ${DEFAULT_READ_IMAGE_LIMIT}; max ${MAX_READ_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_IMAGE_LIMIT,
        },
        preprocess: {
          type: 'string',
          enum: ['auto', 'none'],
          description:
            'Vision mode only. auto (default) downscales oversized inputs and normalizes model payloads to JPEG; none sends original bytes.',
        },
        max_long_edge: {
          type: 'integer',
          description:
            'Vision mode preprocessing target for the longest edge. Used with preprocess="auto".',
          minimum: MIN_READ_IMAGE_LONG_EDGE,
          maximum: MAX_READ_IMAGE_LONG_EDGE,
        },
        quality: {
          type: 'integer',
          description:
            'Vision mode JPEG quality used by preprocessing. Used with preprocess="auto".',
          minimum: MIN_READ_IMAGE_JPEG_QUALITY,
          maximum: MAX_READ_IMAGE_JPEG_QUALITY,
        },
      },
    },
    execute: async (args) => executeReadImage(deps, args),
  });
}

export async function executeReadImage(
  deps: ReadImageToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const mode = readMode(args['mode']);
  const analysis = readAnalysisKind(args['analysis']);
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_IMAGE_LIMIT,
    1,
    MAX_READ_IMAGE_LIMIT,
  );
  const preprocessOptions = readVisionPreprocessOptions(args);
  const images = readInputImages(args);
  if (images.length === 0) {
    return { success: false, error: 'Missing required field: image_paths or images' };
  }

  const selected = images.slice(0, maxImages);
  try {
    const loaded = await Promise.all(selected.map((image) => loadImage(deps, image)));
    const results: ReadImageResultImage[] = loaded.map((image) => ({
      path: image.resolvedPath,
      ...(image.input.label ? { label: image.input.label } : {}),
      ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
      ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
      ...(image.metadata.mimeType ? { mimeType: image.metadata.mimeType } : {}),
      byteSize: image.metadata.byteSize,
      ...(image.input.metadata ? { metadata: image.input.metadata } : {}),
    }));

    if (mode === 'vision') {
      const service = deps.platform?.createService();
      if (!service) {
        return {
          success: false,
          error: 'ReadImage vision mode requires an active AI platform service.',
        };
      }
      const prepared = await Promise.all(
        loaded.map((image) => prepareVisionImage(deps, image, preprocessOptions)),
      );

      const response = await service.chat([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildVisionPrompt({ analysis, prompt: readString(args['prompt']) }),
            },
            ...prepared.flatMap((preparedImage, index) => [
              {
                type: 'text' as const,
                text: formatVisionImageLabel(preparedImage.image, index),
              },
              {
                type: 'image' as const,
                imageUrl: toDataUrl(
                  preparedImage.mimeType,
                  preparedImage.image.resolvedPath,
                  preparedImage.bytes,
                ),
                detail: 'high' as const,
              },
            ]),
          ],
        },
      ]);
      const analysisText = normalizeServiceResponseText(response.message.content);
      return {
        success: true,
        data: {
          mode,
          analysis,
          images: results.map((result, index) => ({
            ...result,
            ...(prepared[index] ? { visionInput: prepared[index].summary } : {}),
            analysis: analysisText,
          })),
          imageCount: images.length,
          imagePathsTruncated: selected.length < images.length,
        } satisfies ReadImageResultData,
      };
    }

    return {
      success: true,
      data: {
        mode,
        analysis,
        images: results,
        imageCount: images.length,
        imagePathsTruncated: selected.length < images.length,
      } satisfies ReadImageResultData,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function loadImage(
  deps: ReadImageToolDeps,
  input: ReadImageInputImage,
): Promise<LoadedImage> {
  const resolvedPath = await resolveDocumentPath(input.path);
  const bytes = deps.readFile ? await deps.readFile(resolvedPath) : await fs.readFile(resolvedPath);
  if (bytes.byteLength > MAX_READ_IMAGE_BYTES) {
    throw new Error(`Image is too large for ReadImage: ${resolvedPath}`);
  }
  const metadata = probeImageMetadata(bytes);
  if (!metadata) {
    throw new Error(`Unsupported or unreadable image file: ${resolvedPath}`);
  }
  return { input, resolvedPath, bytes, metadata };
}

async function prepareVisionImage(
  deps: ReadImageToolDeps,
  image: LoadedImage,
  options: ReadVisionPreprocessOptions,
): Promise<PreparedVisionImage> {
  if (options.mode === 'none') {
    const mimeType =
      image.metadata.mimeType ?? resolveVisionImageAttachmentMediaType(image.resolvedPath);
    return {
      image,
      bytes: image.bytes,
      mimeType,
      summary: {
        preprocess: 'none',
        transformed: false,
        mimeType,
        byteSize: image.bytes.byteLength,
        ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
        ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
      },
    };
  }

  const policy = createVisionPreprocessPolicy(options);
  const plan = planVisionImagePreprocess(
    {
      width: image.metadata.width ?? 0,
      height: image.metadata.height ?? 0,
      byteLength: image.bytes.byteLength,
    },
    policy,
  );
  const processor = deps.imageProcessor ?? createSharpVisionImageProcessor();
  const processedBytes = await processor.toJpeg({
    buffer: image.bytes,
    jpegQuality: plan.jpegQuality,
    ...(plan.shouldResize && {
      resize: {
        width: plan.maxWidth,
        height: plan.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      },
    }),
  });
  const processedMetadata = probeImageMetadata(processedBytes);

  return {
    image,
    bytes: processedBytes,
    mimeType: plan.outputMediaType,
    summary: {
      preprocess: 'auto',
      transformed: true,
      mimeType: plan.outputMediaType,
      byteSize: processedBytes.byteLength,
      ...(processedMetadata?.width !== undefined ? { width: processedMetadata.width } : {}),
      ...(processedMetadata?.height !== undefined ? { height: processedMetadata.height } : {}),
      maxLongEdge: policy.maxLongEdge,
      jpegQuality: plan.jpegQuality,
    },
  };
}

function readInputImages(args: Record<string, unknown>): ReadImageInputImage[] {
  const structured = args['images'];
  if (Array.isArray(structured)) {
    return structured.flatMap((item) => {
      if (!isRecord(item)) return [];
      const path = readString(item['path']);
      const label = readString(item['label']);
      const metadata = isRecord(item['metadata']) ? item['metadata'] : undefined;
      return path ? [{ path, ...(label ? { label } : {}), ...(metadata ? { metadata } : {}) }] : [];
    });
  }

  const paths = args['image_paths'];
  if (!Array.isArray(paths)) return [];
  return paths.flatMap((path) =>
    typeof path === 'string' && path.trim() ? [{ path: path.trim() }] : [],
  );
}

function readMode(value: unknown): ReadImageMode {
  return value === 'vision' ? 'vision' : 'metadata';
}

function readAnalysisKind(value: unknown): ReadImageAnalysisKind {
  return value === 'ocr' || value === 'panels' || value === 'storyboard' || value === 'custom'
    ? value
    : 'describe';
}

interface ReadVisionPreprocessOptions {
  readonly mode: ReadImagePreprocessMode;
  readonly maxLongEdge: number;
  readonly quality?: number;
}

function readVisionPreprocessOptions(args: Record<string, unknown>): ReadVisionPreprocessOptions {
  return {
    mode: args['preprocess'] === 'none' ? 'none' : 'auto',
    maxLongEdge: readBoundedInteger(
      args['max_long_edge'],
      DEFAULT_VISION_PREPROCESS_POLICY.maxLongEdge,
      MIN_READ_IMAGE_LONG_EDGE,
      MAX_READ_IMAGE_LONG_EDGE,
    ),
    ...(typeof args['quality'] === 'number' && Number.isInteger(args['quality'])
      ? {
          quality: readBoundedInteger(
            args['quality'],
            DEFAULT_VISION_PREPROCESS_POLICY.resizedImageQuality,
            MIN_READ_IMAGE_JPEG_QUALITY,
            MAX_READ_IMAGE_JPEG_QUALITY,
          ),
        }
      : {}),
  };
}

function createVisionPreprocessPolicy(
  options: ReadVisionPreprocessOptions,
): VisionPreprocessPolicy {
  return {
    ...DEFAULT_VISION_PREPROCESS_POLICY,
    maxLongEdge: options.maxLongEdge,
    ...(options.quality !== undefined
      ? {
          resizedImageQuality: options.quality,
          normalizedImageQuality: options.quality,
        }
      : {}),
  };
}

function readBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildVisionPrompt(input: {
  readonly analysis: ReadImageAnalysisKind;
  readonly prompt?: string;
}): string {
  const base = (() => {
    switch (input.analysis) {
      case 'ocr':
        return 'Extract all readable text from the image. Preserve reading order and note uncertain text.';
      case 'panels':
        return 'Analyze the comic/storyboard panel layout. Return reading order, panel count, visual descriptions, characters, actions, dialogue/OCR, and camera framing.';
      case 'storyboard':
        return 'Convert the image content into animation storyboard notes. Include scene description, characters, dialogue/OCR, mood, camera, and motion suggestions.';
      case 'custom':
        return input.prompt ?? 'Analyze the image content.';
      case 'describe':
      default:
        return 'Describe the image content with important visual details, text, objects, characters, composition, and mood.';
    }
  })();
  return input.prompt && input.analysis !== 'custom'
    ? `${base}\n\nAdditional instruction: ${input.prompt}`
    : base;
}

function formatVisionImageLabel(image: LoadedImage, index: number): string {
  return `Image ${index + 1}${image.input.label ? ` (${image.input.label})` : ''}: ${
    image.resolvedPath
  }`;
}

function toDataUrl(mimeType: string | undefined, filePath: string, bytes: Uint8Array): string {
  const mime = mimeType ?? resolveVisionImageAttachmentMediaType(filePath);
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function normalizeServiceResponseText(content: unknown): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
