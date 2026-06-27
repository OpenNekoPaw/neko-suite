import {
  TOOL_NAMES_SYSTEM,
  createTool,
  isContentSourceRef,
  parseDocumentArchiveResourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type ResourceRef,
  type Tool,
  type ToolParameterProperty,
  type ToolResult,
} from '@neko/shared';
import {
  READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED,
  executeReadImage,
  type ReadImageAnalysisKind,
  type ReadImageMode,
  type ReadImageToolDeps,
} from './readImageTool';

export const DEFAULT_READ_DOCUMENT_IMAGE_LIMIT = 4;
export const MAX_READ_DOCUMENT_IMAGE_LIMIT = 16;

const CONTENT_SOURCE_REF_PARAMETER: ToolParameterProperty = {
  type: 'object',
  description:
    'Canonical ContentSourceRef returned by ReadDocument or provided as {"kind":"file","path":"${VAR}/file.epub"}.',
  properties: {
    kind: {
      type: 'string',
      enum: ['file', 'document', 'asset', 'media-library', 'generated-asset'],
    },
    path: {
      type: 'string',
      description: 'Source path for kind="file"; may be project-relative or ${VAR}/path.',
    },
  },
  required: ['kind'],
  additionalProperties: true,
};

export interface ReadDocumentImageToolDeps extends ReadImageToolDeps {
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}

export function createReadDocumentImageTool(deps: ReadDocumentImageToolDeps): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    description:
      'Expose document entry images through the unified content access runtime. Use only with locators copied exactly from ReadDocument.imageInfo[].resourceRef or ReadDocument.images[].resourceRef. Do not invent page, chapter, metadata, custom, or path locator objects.',
    category: 'document',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        source: {
          ...CONTENT_SOURCE_REF_PARAMETER,
        },
        locators: {
          type: 'array',
          description:
            'Required. Array of DocumentArchiveResourceRef objects copied exactly from ReadDocument imageInfo[].resourceRef or images[].resourceRef.',
          items: { type: 'object' },
        },
        mode: {
          type: 'string',
          enum: ['metadata'],
        },
        analysis: {
          type: 'string',
          enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
        },
        prompt: {
          type: 'string',
        },
        max_images: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_READ_DOCUMENT_IMAGE_LIMIT,
        },
      },
      required: ['source', 'locators'],
    },
    execute: async (args) => executeReadDocumentImage(deps, args),
  });
}

export async function executeReadDocumentImage(
  deps: ReadDocumentImageToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const source = readContentSourceRef(args['source']);
  if (!source) {
    return {
      success: false,
      error:
        'ReadDocumentImage requires source to be a canonical ContentSourceRef, for example {"kind":"file","path":"${VAR}/book.epub"}, plus locators returned by ReadDocument.',
    };
  }
  const locators = readDocumentArchiveResourceRefs(args['locators']);
  if (locators.length === 0) {
    return {
      success: false,
      error:
        'Missing required field: locators. Pass locators as an array of ReadDocument.imageInfo[].resourceRef objects. Do not inspect cache directories, pass page_indexes, metadata/custom locator objects, cache paths, or EPUB entry paths.',
    };
  }
  const mode = readMode(args['mode']);
  if (mode === 'vision') {
    return { success: false, error: READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED };
  }
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_DOCUMENT_IMAGE_LIMIT,
    1,
    MAX_READ_DOCUMENT_IMAGE_LIMIT,
  );
  const selected = locators.slice(0, maxImages);
  const contentAccessRuntime = deps.contentAccessRuntime;
  if (!contentAccessRuntime) {
    return { success: false, error: 'ReadDocumentImage requires AgentContentAccessRuntime.' };
  }

  const resolved = await contentAccessRuntime.resolveDocumentImages({
    caller: 'read-document-image',
    source,
    locators: selected,
    intent: 'cache-materialize',
  });
  if (resolved.status !== 'ready') {
    return {
      success: false,
      error:
        resolved.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `ReadDocumentImage resources are not ready: ${resolved.status}`,
    };
  }

  const readImageResult = await executeReadImage(deps, {
    images: resolved.images.flatMap((image, index) => {
      const ref = image.resourceRef ?? image.documentResourceRef;
      return ref
        ? [
            {
              label: image.label ?? `document-image-${index + 1}`,
              resourceRef: ref,
              ...(image.documentResourceRef ? { metadata: { documentResourceRef: image.documentResourceRef } } : {}),
            },
          ]
        : [];
    }),
    mode,
    analysis: readAnalysisKind(args['analysis']),
    ...(readString(args['prompt']) ? { prompt: readString(args['prompt']) } : {}),
    max_images: maxImages,
  });
  if (!readImageResult.success) {
    return readImageResult;
  }

  return {
    success: true,
    data: {
      source,
      mode,
      analysis: readAnalysisKind(args['analysis']),
      images: readImages(readImageResult.data),
      imageCount: selected.length,
    },
    attachments: readImageResult.attachments,
    perceptionCards: readImageResult.perceptionCards,
  };
}

function readContentSourceRef(value: unknown): ContentSourceRef | undefined {
  return isContentSourceRef(value) ? value : undefined;
}

function readDocumentArchiveResourceRefs(value: unknown): DocumentArchiveResourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const ref = parseDocumentArchiveResourceRef(item);
    return ref?.entryPath ? [ref] : [];
  });
}

function readImages(data: unknown): readonly Record<string, unknown>[] {
  return isRecord(data) && Array.isArray(data['images']) ? data['images'].filter(isRecord) : [];
}

function readMode(value: unknown): ReadImageMode {
  return value === 'vision' ? 'vision' : 'metadata';
}

function readAnalysisKind(value: unknown): ReadImageAnalysisKind {
  return value === 'ocr' || value === 'panels' || value === 'storyboard' || value === 'custom'
    ? value
    : 'describe';
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : defaultValue;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
