import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  type DocumentArchiveResourceRef,
  type DocumentImageInfo,
  type DocumentLocator,
  type DocumentRange,
  type DocumentReadResult,
  type DocumentSourceRef,
  type ResourceRef,
  type ResourceSourceRef,
  type ResourceVariantRequest,
} from '../../types';
import type {
  ResourceCacheProvider,
  ResourceEnsureInput,
  ResourceEnsureResult,
} from './resource-cache-service';

export const DOCUMENT_RESOURCE_CACHE_PROVIDER_ID = 'document-archive';

export interface DocumentRangeReader {
  readRange(source: DocumentSourceRef | string, range: DocumentRange): Promise<DocumentReadResult>;
}

export interface DocumentResourceCacheProviderOptions {
  readonly reader: DocumentRangeReader;
  readonly fsOps?: DocumentResourceCacheFsOps;
}

export interface DocumentResourceCacheFsOps {
  copyFile(source: string, target: string): Promise<void>;
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number }>;
}

export interface CreateDocumentResourceRefInput {
  readonly source: DocumentSourceRef;
  readonly entryPath?: string;
  readonly locator?: DocumentLocator;
  readonly cachePath?: string;
  readonly scope?: ResourceRef['scope'];
}

export class DocumentResourceCacheProvider implements ResourceCacheProvider {
  readonly id = DOCUMENT_RESOURCE_CACHE_PROVIDER_ID;

  private readonly reader: DocumentRangeReader;
  private readonly fsOps: DocumentResourceCacheFsOps;

  constructor(options: DocumentResourceCacheProviderOptions) {
    this.reader = options.reader;
    this.fsOps = options.fsOps ?? nodeFsOps;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return (
      ref.provider === this.id &&
      ref.kind === 'document' &&
      ref.source.kind === 'document' &&
      Boolean(ref.source.document) &&
      (variant.role === 'document-entry' ||
        variant.role === 'page-image' ||
        variant.role === 'thumbnail')
    );
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    if (!this.supports(input.ref, input.variant)) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Document resource provider does not support this resource variant.',
      };
    }

    const source = input.ref.source.document;
    const locator = input.ref.locator?.kind === 'document' ? input.ref.locator.locator : undefined;
    const entryPath =
      input.ref.locator?.kind === 'document' ? input.ref.locator.entryPath : undefined;
    if (!source || (!locator && !entryPath)) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Document resource ref requires a source and document locator or entry path.',
      };
    }

    const rangeLocator = locator ?? createFallbackLocator(entryPath);
    if (!rangeLocator) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Document resource ref cannot be materialized without a stable locator.',
      };
    }

    const result = await this.reader.readRange(source, {
      locator: rangeLocator,
      limit: { maxImages: 32 },
    });
    const image = selectImage(result.imageInfo ?? [], entryPath);
    if (!image) {
      return {
        status: 'missing',
        ref: input.ref,
        variant: input.variant,
        error: entryPath
          ? `Document image entry was not found: ${entryPath}`
          : 'Document range did not return an image.',
      };
    }

    const targetRelativePath = createDocumentResourceRelativePath(input.ref, image.path, entryPath);
    const targetPath = path.join(input.cacheRoot, targetRelativePath);
    await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
    await this.fsOps.copyFile(image.path, targetPath);
    const stat = await this.fsOps.stat(targetPath);

    return {
      status: 'ready',
      ref: input.ref,
      variant: input.variant,
      absolutePath: targetPath,
      relativePath: targetRelativePath,
      mimeType: image.mimeType ?? input.variant.mimeType,
      width: image.width ?? input.variant.width,
      height: image.height ?? input.variant.height,
      sizeBytes: image.byteSize ?? stat.size,
      rebuildable: true,
    };
  }
}

export function createDocumentResourceRef(input: CreateDocumentResourceRefInput): ResourceRef {
  const source: ResourceSourceRef = {
    kind: 'document',
    document: input.source,
    filePath: input.source.filePath,
    identity: input.source.identity
      ? {
          fileId: input.source.identity.fileId,
          sizeBytes: input.source.identity.sizeBytes,
          mtimeMs: input.source.identity.mtimeMs,
          hash: input.source.identity.hash,
        }
      : input.source.fileId
        ? { fileId: input.source.fileId }
        : undefined,
    metadata: {
      format: input.source.format,
      ...(input.scope === 'extension-private'
        ? {
            cacheScope: 'extension-private',
            nonPortable: true,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
          }
        : {}),
      ...(input.cachePath ? { legacyCachePath: input.cachePath } : {}),
    },
  };
  const stableSource: ResourceSourceRef = {
    ...source,
    metadata: {
      format: input.source.format,
      ...(input.scope === 'extension-private'
        ? {
            cacheScope: 'extension-private',
            nonPortable: true,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
          }
        : {}),
    },
  };
  const fingerprint = createResourceFingerprint({
    strategy: input.source.identity ? 'identity' : input.source.fileId ? 'identity' : 'provider',
    value:
      input.source.identity?.hash ??
      input.source.identity?.fileId ??
      input.source.fileId ??
      hashStableValue({
        filePath: input.source.filePath,
        format: input.source.format,
        entryPath: input.entryPath,
        locator: input.locator,
      }),
    providerId: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  });

  const ref = createResourceRef({
    scope: input.scope ?? 'project',
    provider: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'document',
    source: stableSource,
    locator:
      input.locator || input.entryPath
        ? {
            kind: 'document',
            ...(input.locator ? { locator: input.locator } : {}),
            ...(input.entryPath ? { entryPath: input.entryPath } : {}),
          }
        : undefined,
    fingerprint,
  });

  return input.cachePath
    ? {
        ...ref,
        source,
      }
    : ref;
}

export function createDocumentResourceRefFromArchiveRef(
  ref: DocumentArchiveResourceRef,
  scope: ResourceRef['scope'] = 'project',
): ResourceRef {
  return createDocumentResourceRef({
    source: ref.source,
    entryPath: ref.entryPath,
    locator: ref.locator,
    cachePath: ref.cachePath,
    scope,
  });
}

function selectImage(
  images: readonly DocumentImageInfo[],
  entryPath: string | undefined,
): DocumentImageInfo | undefined {
  if (entryPath) {
    return (
      images.find((image) => image.resourceRef?.entryPath === entryPath) ??
      images.find((image) => path.basename(image.path) === path.basename(entryPath))
    );
  }
  return images[0];
}

function createFallbackLocator(entryPath: string | undefined): DocumentLocator | undefined {
  if (!entryPath) return undefined;
  return {
    kind: 'page',
    pageNumber: 1,
    pageIndex: 0,
    entryName: entryPath,
  };
}

function createDocumentResourceRelativePath(
  ref: ResourceRef,
  sourcePath: string,
  entryPath: string | undefined,
): string {
  const ext = path.extname(sourcePath) || path.extname(entryPath ?? '') || '.bin';
  const basename = sanitizePathPart(
    path.basename(entryPath ?? sourcePath, path.extname(entryPath ?? sourcePath)) || ref.id,
  );
  return path.join('documents', ref.id, `${basename}${ext}`);
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document-entry';
}

const nodeFsOps: DocumentResourceCacheFsOps = {
  copyFile: (source, target) => fs.copyFile(source, target),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  },
};
