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
import { readLegacyCachePath } from './legacy-resource-cache-provider';

export const DOCUMENT_RESOURCE_CACHE_PROVIDER_ID = 'document-archive';

export interface DocumentRangeReader {
  readRange(source: DocumentSourceRef | string, range: DocumentRange): Promise<DocumentReadResult>;
}

export interface DocumentEntryReader {
  readEntry(source: DocumentSourceRef, entryPath: string): Promise<Uint8Array | null>;
}

export interface DocumentResourceCacheProviderOptions {
  readonly reader: DocumentRangeReader;
  readonly entryReader?: DocumentEntryReader;
  readonly enableRangeFallback?: boolean;
  readonly fsOps?: DocumentResourceCacheFsOps;
}

export interface DocumentResourceCacheFsOps {
  copyFile(source: string, target: string): Promise<void>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
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
  private readonly entryReader?: DocumentEntryReader;
  private readonly enableRangeFallback: boolean;
  private readonly fsOps: DocumentResourceCacheFsOps;

  constructor(options: DocumentResourceCacheProviderOptions) {
    this.reader = options.reader;
    this.entryReader = options.entryReader;
    this.enableRangeFallback = options.enableRangeFallback ?? true;
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
      input.ref.locator?.kind === 'document'
        ? (input.ref.locator.entryPath ?? readLocatorEntryName(input.ref.locator.locator))
        : undefined;
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

    const directEntry = entryPath
      ? await this.materializeDirectEntry(input, source, entryPath).catch(() => undefined)
      : undefined;
    if (directEntry) {
      return directEntry;
    }

    const legacyEntry = await this.materializeLegacyCachePath(input, entryPath).catch(
      () => undefined,
    );
    if (legacyEntry) {
      return legacyEntry;
    }

    if (!this.enableRangeFallback) {
      return {
        status: 'missing',
        ref: input.ref,
        variant: input.variant,
        error: entryPath
          ? `Document image entry could not be materialized directly: ${entryPath}`
          : 'Document resource ref cannot be materialized without a direct entry or legacy cache path.',
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

  private async materializeLegacyCachePath(
    input: ResourceEnsureInput,
    entryPath: string | undefined,
  ): Promise<ResourceEnsureResult | undefined> {
    const legacyPath = readLegacyCachePath(input.ref);
    if (!legacyPath) {
      return undefined;
    }
    const targetRelativePath = createDocumentResourceRelativePath(input.ref, legacyPath, entryPath);
    const targetPath = path.join(input.cacheRoot, targetRelativePath);
    await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
    await this.fsOps.copyFile(legacyPath, targetPath);
    const stat = await this.fsOps.stat(targetPath);
    return {
      status: 'ready',
      ref: input.ref,
      variant: input.variant,
      absolutePath: targetPath,
      relativePath: targetRelativePath,
      mimeType: input.variant.mimeType ?? inferMimeType(legacyPath),
      width: input.variant.width,
      height: input.variant.height,
      sizeBytes: stat.size,
      rebuildable: true,
    };
  }

  private async materializeDirectEntry(
    input: ResourceEnsureInput,
    source: DocumentSourceRef,
    entryPath: string,
  ): Promise<ResourceEnsureResult | undefined> {
    if (!this.entryReader) {
      return undefined;
    }
    const bytes = await this.entryReader.readEntry(source, entryPath);
    if (!bytes) {
      return undefined;
    }
    const targetRelativePath = createDocumentResourceRelativePath(input.ref, entryPath, entryPath);
    const targetPath = path.join(input.cacheRoot, targetRelativePath);
    await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
    await this.fsOps.writeFile(targetPath, bytes);
    const stat = await this.fsOps.stat(targetPath);
    return {
      status: 'ready',
      ref: input.ref,
      variant: input.variant,
      absolutePath: targetPath,
      relativePath: targetRelativePath,
      mimeType: input.variant.mimeType ?? inferMimeType(entryPath),
      width: input.variant.width,
      height: input.variant.height,
      sizeBytes: stat.size || bytes.byteLength,
      rebuildable: true,
    };
  }
}

export function createDocumentResourceRef(input: CreateDocumentResourceRefInput): ResourceRef {
  const entryPath = input.entryPath ?? readLocatorEntryName(input.locator);
  const baseSource = createDocumentResourceSource(input, false);
  const source = createDocumentResourceSource(input, Boolean(input.cachePath));
  const identityValue = readDocumentSourceIdentityValue(input.source);
  const fingerprint = createResourceFingerprint({
    strategy: identityValue ? 'identity' : 'provider',
    value:
      identityValue ??
      hashStableValue({
        filePath: input.source.filePath,
        format: input.source.format,
      }),
    providerId: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  });

  const ref = createResourceRef({
    id: createStableDocumentResourceRefId({
      scope: input.scope ?? 'project',
      source: input.source,
      entryPath,
      locator: input.locator,
      fingerprint,
    }),
    scope: input.scope ?? 'project',
    provider: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'document',
    source: baseSource,
    locator: createDocumentResourceLocator(entryPath, input.locator),
    fingerprint,
  });

  return input.cachePath
    ? {
        ...ref,
        source,
      }
    : ref;
}

function createDocumentResourceSource(
  input: CreateDocumentResourceRefInput,
  includeLegacyCachePath: boolean,
): ResourceSourceRef {
  return {
    kind: 'document',
    document: createStableDocumentSource(input.source),
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
      ...(includeLegacyCachePath && input.cachePath ? { legacyCachePath: input.cachePath } : {}),
    },
  };
}

function createStableDocumentResourceRefId(input: {
  readonly scope: ResourceRef['scope'];
  readonly source: DocumentSourceRef;
  readonly entryPath: string | undefined;
  readonly locator?: DocumentLocator;
  readonly fingerprint: ReturnType<typeof createResourceFingerprint>;
}): string {
  return `res_${hashStableValue({
    scope: input.scope,
    provider: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'document',
    source: createDocumentSourceIdentityKey(input.source),
    locator: createDocumentResourceIdentityLocator(input.entryPath, input.locator),
    fingerprint: input.fingerprint,
  })}`;
}

function createStableDocumentSource(source: DocumentSourceRef): DocumentSourceRef {
  return {
    filePath: source.filePath,
    format: source.format,
    ...(source.fileId ? { fileId: source.fileId } : {}),
    ...(source.identity
      ? {
          identity: {
            fileId: source.identity.fileId,
            sizeBytes: source.identity.sizeBytes,
            mtimeMs: source.identity.mtimeMs,
            hash: source.identity.hash,
          },
        }
      : {}),
  };
}

function readDocumentSourceIdentityValue(source: DocumentSourceRef): string | undefined {
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId;
}

function createDocumentResourceLocator(
  entryPath: string | undefined,
  locator?: DocumentLocator,
): ResourceRef['locator'] | undefined {
  return locator || entryPath
    ? {
        kind: 'document',
        ...(locator ? { locator } : {}),
        ...(entryPath ? { entryPath } : {}),
      }
    : undefined;
}

function createDocumentResourceIdentityLocator(
  entryPath: string | undefined,
  locator?: DocumentLocator,
): ResourceRef['locator'] | undefined {
  if (entryPath) {
    return createDocumentResourceLocator(entryPath);
  }
  return createDocumentResourceLocator(undefined, locator);
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

function readLocatorEntryName(locator: DocumentLocator | undefined): string | undefined {
  if (!locator) return undefined;
  if (locator.kind === 'page' || locator.kind === 'region') {
    return locator.entryName;
  }
  return undefined;
}

function createDocumentResourceRelativePath(
  ref: ResourceRef,
  sourcePath: string,
  entryPath: string | undefined,
): string {
  const ext = path.extname(sourcePath) || path.extname(entryPath ?? '') || '.bin';
  const documentDirectory = createDocumentCacheDirectoryName(ref);
  const entryRelativePath = createDocumentEntryRelativePath(ref, sourcePath, entryPath, ext);
  return path.join('documents', documentDirectory, entryRelativePath);
}

function createDocumentCacheDirectoryName(ref: ResourceRef): string {
  return `doc_${hashStableValue({
    scope: ref.scope,
    provider: ref.provider,
    source: createResourceSourceDirectoryKey(ref.source),
    fingerprint: ref.fingerprint,
  })}`;
}

function createResourceSourceDirectoryKey(source: ResourceSourceRef): unknown {
  if (source.document) {
    return createDocumentSourceIdentityKey(source.document);
  }
  const identityValue = source.identity?.hash ?? source.identity?.fileId;
  if (identityValue) {
    return {
      kind: source.kind,
      identity: identityValue,
      format: source.metadata?.format,
    };
  }
  return {
    kind: source.kind,
    filePath: source.filePath,
    uri: source.uri,
    projectRelativePath: source.projectRelativePath,
    mediaLibraryId: source.mediaLibraryId,
    generatedAssetId: source.generatedAssetId,
    previewAssetId: source.previewAssetId,
    format: source.metadata?.format,
  };
}

function createDocumentSourceIdentityKey(source: DocumentSourceRef): unknown {
  const identityValue = readDocumentSourceIdentityValue(source);
  return {
    format: source.format,
    ...(identityValue ? { identity: identityValue } : { filePath: source.filePath }),
  };
}

function createDocumentEntryRelativePath(
  ref: ResourceRef,
  sourcePath: string,
  entryPath: string | undefined,
  ext: string,
): string {
  const rawPath = entryPath ?? sourcePath;
  const parsed = path.parse(rawPath);
  const fallbackName = path.basename(rawPath, path.extname(rawPath)) || ref.id;
  const fileName = `${sanitizePathPart(parsed.name || fallbackName)}${ext}`;
  if (!entryPath) {
    return fileName;
  }
  const parentParts = parsed.dir
    .split(/[\\/]+/)
    .map(sanitizePathPart)
    .filter((part) => part.length > 0);
  return path.join(...parentParts, fileName);
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document-entry';
}

function inferMimeType(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return undefined;
  }
}

const nodeFsOps: DocumentResourceCacheFsOps = {
  copyFile: (source, target) => fs.copyFile(source, target),
  writeFile: (filePath, data) => fs.writeFile(filePath, data),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  },
};
