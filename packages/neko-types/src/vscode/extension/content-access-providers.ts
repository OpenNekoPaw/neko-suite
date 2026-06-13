import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { PathResolver, type ResolvedPath } from '../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  isOfflineContentAccessIntent,
  isPreviewLikeContentAccessIntent,
  isResourceRef,
  type ContentAccessProvider,
  type ContentAccessProviderRequest,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessStatus,
  type ContentDocumentSourceRef,
  type ContentEngineSource,
  type ContentGeneratedAssetSourceRef,
  type ContentIngestProvider,
  type ContentIngestProviderRequest,
  type ContentIngestRequest,
  type ContentIngestResult,
  type ContentRuntimeStream,
  type ContentSourceRef,
  type ContentStableSourceRef,
  type ResourceCacheStatus,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../types';
import type { LocalResourceAccessService } from './local-resource-access';
import type { ResourceCacheService } from './resource-cache-service';

export interface ContentAccessFileOps {
  readFile(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, content: Uint8Array): Promise<void>;
  copyFile(sourcePath: string, targetPath: string): Promise<void>;
  mkdir(dirPath: string, options: { recursive: boolean }): Promise<void>;
}

export interface ContentAccessWebviewResolver {
  (request: ContentAccessRequest): vscode.Webview | undefined;
}

export interface ResourceCacheContentAccessProviderOptions {
  readonly id?: string;
  readonly resourceCache: ResourceCacheService;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly webviewResolver?: ContentAccessWebviewResolver;
}

export interface SourceFileContentAccessProviderOptions {
  readonly id?: string;
  readonly pathResolver?: PathResolver;
  readonly projectRoot: string;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: ContentAccessWebviewResolver;
  readonly engineSourceResolver?: (input: {
    readonly request: ContentAccessRequest;
    readonly path: string;
  }) => Promise<ContentEngineSource>;
}

export interface DocumentEntryContentAccessProviderOptions {
  readonly id?: string;
  readonly pathResolver?: PathResolver;
  readonly projectRoot: string;
  readonly resourceCache?: ResourceCacheService;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly webviewResolver?: ContentAccessWebviewResolver;
  readonly entryReader?: (input: {
    readonly request: ContentAccessRequest;
    readonly sourcePath: string;
    readonly entryPath?: string;
  }) => Promise<Uint8Array>;
}

export interface VideoProxyContentAccessProviderOptions {
  readonly id?: string;
  readonly proxyResolver: (request: ContentAccessRequest) => Promise<{
    readonly localPath?: string;
    readonly runtimeStream?: ContentRuntimeStream;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  }>;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: ContentAccessWebviewResolver;
}

export interface PreviewVariantContentAccessProviderOptions {
  readonly id?: string;
  readonly variantResolver: (request: ContentAccessRequest) => Promise<{
    readonly uri?: string;
    readonly localPath?: string;
    readonly bytes?: Uint8Array;
    readonly mimeType?: string;
    readonly width?: number;
    readonly height?: number;
    readonly sizeBytes?: number;
  }>;
}

export interface ContentIngestFileProviderOptions {
  readonly id?: string;
  readonly pathResolver?: PathResolver;
  readonly projectRoot: string;
  readonly fileOps?: ContentAccessFileOps;
}

export interface CacheArtifactContentIngestProviderOptions {
  readonly id?: string;
  readonly resourceCache: ResourceCacheService;
}

const nodeFileOps: ContentAccessFileOps = {
  readFile: async (filePath) => fs.readFile(filePath),
  writeFile: async (filePath, content) => fs.writeFile(filePath, content),
  copyFile: async (sourcePath, targetPath) => fs.copyFile(sourcePath, targetPath),
  mkdir: async (dirPath, options) => fs.mkdir(dirPath, options),
};

export class ResourceCacheContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly resourceCache: ResourceCacheService;
  private readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
  private readonly webviewResolver?: ContentAccessWebviewResolver;

  constructor(options: ResourceCacheContentAccessProviderOptions) {
    this.id = options.id ?? 'resource-cache-content-access';
    this.resourceCache = options.resourceCache;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.webviewResolver = options.webviewResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return (
      isResourceRef(request.ref) &&
      isPreviewLikeContentAccessIntent(request.intent) &&
      request.target !== 'engine-source' &&
      request.target !== 'runtime-stream'
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    if (!isResourceRef(request.ref)) {
      return unsupported(request, this.id, 'Resource cache provider requires a ResourceRef.');
    }

    const variant = resolveVariant(request);
    const materializeIfMissing =
      request.materialization === undefined ||
      request.materialization === 'if-missing' ||
      request.materialization === 'refresh';

    if (request.target === 'webview-uri') {
      const webview = this.webviewResolver?.(request);
      if (!webview) {
        return unsupportedDestination(
          request,
          this.id,
          'Webview URI content access requires a webview resolver.',
        );
      }
      const projected = await this.resourceCache.project(webview, request.ref, variant, {
        materializeIfMissing,
      });
      return {
        status: mapCacheStatus(projected.status),
        request,
        providerId: this.id,
        source: request.ref,
        role: variant.role,
        uri: projected.uri,
        localPath: projected.absolutePath,
        mimeType: projected.variant.mimeType,
        width: projected.variant.width,
        height: projected.variant.height,
        sizeBytes: projected.variantEntry?.sizeBytes,
        error: projected.error,
      };
    }

    const result = await this.resourceCache.resolve(request.ref, variant, { materializeIfMissing });
    const status = mapCacheStatus(result.status);
    if (request.target === 'bytes') {
      if (!result.absolutePath || status !== 'ready') {
        return {
          status,
          request,
          providerId: this.id,
          source: request.ref,
          role: variant.role,
          error: result.error,
        };
      }
      return {
        status,
        request,
        providerId: this.id,
        source: request.ref,
        role: variant.role,
        bytes: await this.fileOps.readFile(result.absolutePath),
        localPath: result.absolutePath,
        mimeType: result.variant.mimeType,
        width: result.variant.width,
        height: result.variant.height,
        sizeBytes: result.variantEntry?.sizeBytes,
      };
    }

    return {
      status,
      request,
      providerId: this.id,
      source: request.ref,
      role: variant.role,
      localPath: result.absolutePath,
      mimeType: result.variant.mimeType,
      width: result.variant.width,
      height: result.variant.height,
      sizeBytes: result.variantEntry?.sizeBytes,
      error: result.error,
    };
  }
}

export class SourceFileContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
  private readonly localResourceAccess?: LocalResourceAccessService;
  private readonly webviewResolver?: ContentAccessWebviewResolver;
  private readonly engineSourceResolver?: SourceFileContentAccessProviderOptions['engineSourceResolver'];

  constructor(options: SourceFileContentAccessProviderOptions) {
    this.id = options.id ?? 'source-file-content-access';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.localResourceAccess = options.localResourceAccess;
    this.webviewResolver = options.webviewResolver;
    this.engineSourceResolver = options.engineSourceResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return (
      extractSourcePath(request.ref) !== undefined &&
      (isOfflineContentAccessIntent(request.intent) || request.intent === 'cache-materialize')
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const sourcePath = extractSourcePath(request.ref);
    if (!sourcePath) {
      return missingSource(request, this.id, 'Source file provider requires a path-backed ref.');
    }

    const resolved = this.pathResolver.resolveSource(sourcePath, this.projectRoot);
    if (resolved.type === 'local' && this.pathResolver.hasVariable(resolved.path)) {
      return missingSource(request, this.id, 'Source path contains an unresolved path variable.');
    }

    return this.resolveResolvedPath(request, resolved);
  }

  private async resolveResolvedPath(
    request: ContentAccessRequest,
    resolved: ResolvedPath,
  ): Promise<ContentAccessResult> {
    if (resolved.type === 'remote') {
      return request.target === 'local-path'
        ? unsupportedDestination(request, this.id, 'Remote URLs cannot resolve to local paths.')
        : unsupportedDestination(request, this.id, 'Remote source reads are not supported yet.');
    }

    switch (request.target) {
      case 'local-path':
        return {
          status: 'ready',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.path,
          role: request.role ?? request.variant?.role,
        };
      case 'bytes':
        try {
          return {
            status: 'ready',
            request,
            providerId: this.id,
            source: stableSourceOrUndefined(request.ref),
            localPath: resolved.path,
            bytes: await this.fileOps.readFile(resolved.path),
            role: request.role ?? request.variant?.role,
          };
        } catch (error) {
          return missingSource(
            request,
            this.id,
            error instanceof Error
              ? `Source file cannot be read: ${error.message}`
              : 'Source file cannot be read.',
          );
        }
      case 'engine-source':
        if (!this.engineSourceResolver) {
          return unsupportedDestination(
            request,
            this.id,
            'Engine source target requires an engine source resolver.',
          );
        }
        return {
          status: 'ready',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.path,
          engineSource: await this.engineSourceResolver({ request, path: resolved.path }),
          role: request.role ?? request.variant?.role,
        };
      case 'webview-uri': {
        const webview = this.webviewResolver?.(request);
        if (!webview || !this.localResourceAccess) {
          return unsupportedDestination(
            request,
            this.id,
            'Webview URI source access requires local resource access and a webview resolver.',
          );
        }
        const projection = await this.localResourceAccess.toWebviewUri(webview, resolved.path, {
          caller: request.caller,
        });
        if (!projection.ok) {
          return {
            status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
            request,
            providerId: this.id,
            source: stableSourceOrUndefined(request.ref),
            localPath: resolved.path,
            error: projection.message,
          };
        }
        return {
          status: 'ready',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.path,
          uri: projection.uri,
        };
      }
      case 'runtime-stream':
        return unsupportedDestination(
          request,
          this.id,
          'Source file provider does not create runtime streams.',
        );
      default:
        return unsupportedDestination(request, this.id, 'Unsupported source file target.');
    }
  }
}

export class DocumentEntryContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly sourceProvider: SourceFileContentAccessProvider;
  private readonly resourceCacheProvider?: ResourceCacheContentAccessProvider;
  private readonly entryReader?: DocumentEntryContentAccessProviderOptions['entryReader'];

  constructor(options: DocumentEntryContentAccessProviderOptions) {
    this.id = options.id ?? 'document-entry-content-access';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.sourceProvider = new SourceFileContentAccessProvider({
      id: `${this.id}:source`,
      pathResolver: this.pathResolver,
      projectRoot: options.projectRoot,
      fileOps: options.fileOps,
    });
    this.entryReader = options.entryReader;
    this.resourceCacheProvider = options.resourceCache
      ? new ResourceCacheContentAccessProvider({
          id: `${this.id}:cache`,
          resourceCache: options.resourceCache,
          fileOps: options.fileOps,
          webviewResolver: options.webviewResolver,
        })
      : undefined;
  }

  supports(request: ContentAccessRequest): boolean {
    return getDocumentRef(request.ref) !== undefined;
  }

  async resolve(input: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const { request } = input;
    const documentRef = getDocumentRef(request.ref);
    if (!documentRef) {
      return missingSource(request, this.id, 'Document entry provider requires a document ref.');
    }

    if (isPreviewLikeContentAccessIntent(request.intent) && this.resourceCacheProvider) {
      const resource = isResourceRef(request.ref) ? request.ref : documentRef.resource;
      if (resource) {
        return this.resourceCacheProvider.resolve({
          request: { ...request, ref: resource },
        });
      }
    }

    if (request.intent === 'package' && request.target === 'bytes') {
      if (!this.entryReader) {
        return unsupportedDestination(
          request,
          this.id,
          'Document package entry bytes require an entry reader.',
        );
      }
      const sourcePath = extractSourcePath(request.ref);
      if (!sourcePath) {
        return missingSource(request, this.id, 'Document entry source path is missing.');
      }
      const resolved = this.pathResolver.resolveSource(sourcePath, this.projectRoot);
      if (resolved.type !== 'local' || this.pathResolver.hasVariable(resolved.path)) {
        return missingSource(request, this.id, 'Document entry source path cannot be resolved.');
      }
      const bytes = await this.entryReader({
        request,
        sourcePath: resolved.path,
        entryPath: documentRef.entryPath,
      });
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        bytes,
      };
    }

    return this.sourceProvider.resolve(input);
  }
}

export class VideoProxyContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly proxyResolver: VideoProxyContentAccessProviderOptions['proxyResolver'];
  private readonly localResourceAccess?: LocalResourceAccessService;
  private readonly webviewResolver?: ContentAccessWebviewResolver;

  constructor(options: VideoProxyContentAccessProviderOptions) {
    this.id = options.id ?? 'video-proxy-content-access';
    this.proxyResolver = options.proxyResolver;
    this.localResourceAccess = options.localResourceAccess;
    this.webviewResolver = options.webviewResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return (
      (request.intent === 'interactive-preview' || request.intent === 'edit-playback') &&
      (request.role === 'proxy' || request.variant?.role === 'proxy')
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const resolved = await this.proxyResolver(request);
    if (request.target === 'runtime-stream' && resolved.runtimeStream) {
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        runtimeStream: resolved.runtimeStream,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    if (request.target === 'webview-uri' && resolved.localPath) {
      const webview = this.webviewResolver?.(request);
      if (!webview || !this.localResourceAccess) {
        return unsupportedDestination(
          request,
          this.id,
          'Proxy Webview URI content access requires local resource access and a webview resolver.',
        );
      }
      const projection = await this.localResourceAccess.toWebviewUri(webview, resolved.localPath, {
        caller: request.caller,
      });
      if (!projection.ok) {
        return {
          status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.localPath,
          error: projection.message,
        };
      }
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        localPath: resolved.localPath,
        uri: projection.uri,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    if (request.target === 'local-path' && resolved.localPath) {
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        localPath: resolved.localPath,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    return unsupportedDestination(request, this.id, 'Proxy resolver did not return the target.');
  }
}

export class PreviewVariantContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly variantResolver: PreviewVariantContentAccessProviderOptions['variantResolver'];

  constructor(options: PreviewVariantContentAccessProviderOptions) {
    this.id = options.id ?? 'preview-variant-content-access';
    this.variantResolver = options.variantResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return isPreviewLikeContentAccessIntent(request.intent);
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const resolved = await this.variantResolver(request);
    return {
      status: 'ready',
      request,
      providerId: this.id,
      source: stableSourceOrUndefined(request.ref),
      uri: resolved.uri,
      localPath: resolved.localPath,
      bytes: resolved.bytes,
      mimeType: resolved.mimeType,
      width: resolved.width,
      height: resolved.height,
      sizeBytes: resolved.sizeBytes,
    };
  }
}

export class ImportSourceContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly fileOps: ContentAccessFileOps;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'import-source-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.fileOps = options.fileOps ?? nodeFileOps;
  }

  supports(request: ContentIngestRequest): boolean {
    return request.mode === 'import-source' && request.sourcePath !== undefined;
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.sourcePath) {
      return ingestFailure(request, this.id, 'Import source path is required.');
    }
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    if (request.destination.copyMode === undefined || request.destination.copyMode === 'copy') {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.copyFile(request.sourcePath, outputPath);
    }
    return createFileIngestResult(
      request,
      this.id,
      outputPath,
      this.pathResolver,
      this.projectRoot,
    );
  }
}

export class RegisterExistingSourceContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'register-existing-source-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
  }

  supports(request: ContentIngestRequest): boolean {
    return request.mode === 'register-existing-source' && request.sourcePath !== undefined;
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.sourcePath) {
      return ingestFailure(request, this.id, 'Existing source path is required.');
    }
    return createFileIngestResult(
      request,
      this.id,
      request.sourcePath,
      this.pathResolver,
      this.projectRoot,
    );
  }
}

export class GeneratedOutputContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly fileOps: ContentAccessFileOps;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'generated-output-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.fileOps = options.fileOps ?? nodeFileOps;
  }

  supports(request: ContentIngestRequest): boolean {
    return (
      request.mode === 'generated-output' && (request.sourcePath !== undefined || request.bytes)
    );
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    if (request.bytes) {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.writeFile(outputPath, request.bytes);
    } else if (request.sourcePath && request.sourcePath !== outputPath) {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.copyFile(request.sourcePath, outputPath);
    }
    const contractedPath = contractDurableSourcePath(
      outputPath,
      this.pathResolver,
      this.projectRoot,
    );
    const assetId = readStringMetadata(request.metadata, 'assetId') ?? path.basename(outputPath);
    const source: ContentGeneratedAssetSourceRef = {
      kind: 'generated-asset',
      assetId,
      path: contractedPath,
      promoted: true,
      metadata: request.metadata,
    };
    return {
      status: 'ready',
      request,
      providerId: this.id,
      source,
      outputPath,
      contractedPath,
      prewarm: request.prewarm,
    };
  }
}

export class ExportStagingContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly projectRoot: string;

  constructor(options: Pick<ContentIngestFileProviderOptions, 'id' | 'projectRoot'>) {
    this.id = options.id ?? 'export-staging-content-ingest';
    this.projectRoot = options.projectRoot;
  }

  supports(request: ContentIngestRequest): boolean {
    return request.mode === 'stage-export';
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    return {
      status: 'ready',
      request,
      providerId: this.id,
      outputPath,
      stagedOutput: {
        path: outputPath,
        kind: request.destination.kind === 'export-output' ? 'export' : 'package',
      },
    };
  }
}

export class CacheArtifactContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly resourceCache: ResourceCacheService;

  constructor(options: CacheArtifactContentIngestProviderOptions) {
    this.id = options.id ?? 'cache-artifact-content-ingest';
    this.resourceCache = options.resourceCache;
  }

  supports(request: ContentIngestRequest): boolean {
    return (
      request.mode === 'cache-artifact' &&
      request.resource !== undefined &&
      request.variant !== undefined
    );
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.resource || !request.variant) {
      return ingestFailure(
        request,
        this.id,
        'Cache artifact ingest requires resource and variant.',
      );
    }
    const result = await this.resourceCache.ensure(request.resource, request.variant, {
      materializeIfMissing: true,
    });
    return {
      status: mapCacheStatus(result.status),
      request,
      providerId: this.id,
      source: request.resource,
      outputPath: result.absolutePath,
      prewarm: request.prewarm,
      error: result.error,
    };
  }
}

function resolveVariant(request: ContentAccessRequest): ResourceVariantRequest {
  return request.variant ?? { role: request.role ?? 'preview' };
}

function mapCacheStatus(status: ResourceCacheStatus): ContentAccessStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'missing':
    case 'materializing':
      return 'missing-cache';
    case 'stale':
      return 'stale-source';
    case 'unsupported':
      return 'unsupported-source';
    case 'unauthorized':
      return 'unauthorized';
    case 'non-portable':
      return 'non-portable';
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

function extractSourcePath(ref: ContentSourceRef): string | undefined {
  if (isResourceRef(ref)) {
    const fileLocatorPath = ref.locator?.kind === 'file' ? ref.locator.path : undefined;
    return (
      ref.source.filePath ??
      ref.source.projectRelativePath ??
      ref.source.document?.filePath ??
      fileLocatorPath
    );
  }
  switch (ref.kind) {
    case 'document':
      return ref.source.filePath ?? ref.source.document?.filePath;
    case 'asset':
      return ref.sourcePath ?? ref.resource?.source.filePath;
    case 'file':
      return ref.path;
    case 'media-library':
      return ref.path;
    case 'generated-asset':
      return ref.path ?? ref.resource?.source.filePath;
    case 'runtime':
      return ref.source ? extractSourcePath(ref.source) : undefined;
    default:
      return undefined;
  }
}

function getDocumentRef(ref: ContentSourceRef): ContentDocumentSourceRef | undefined {
  if (isResourceRef(ref)) {
    if (ref.source.kind !== 'document') return undefined;
    return {
      kind: 'document',
      source: ref.source,
      resource: ref,
      entryPath: ref.locator?.kind === 'document' ? ref.locator.entryPath : undefined,
      locator: ref.locator,
    };
  }
  return ref.kind === 'document' ? ref : undefined;
}

function stableSourceOrUndefined(ref: ContentSourceRef): ContentStableSourceRef | undefined {
  return ref.kind === 'runtime' ? ref.source : ref;
}

function unsupported(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
): ContentAccessResult {
  return {
    status: 'unsupported-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-provider-unsupported-source', severity: 'error', message, providerId },
    ],
  };
}

function unsupportedDestination(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
): ContentAccessResult {
  return {
    status: 'unsupported-destination',
    request,
    providerId,
    error: message,
    diagnostics: [
      {
        code: 'content-provider-unsupported-destination',
        severity: 'error',
        message,
        providerId,
        intent: request.intent,
        target: request.target,
      },
    ],
  };
}

function missingSource(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
): ContentAccessResult {
  return {
    status: 'missing-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-provider-missing-source', severity: 'error', message, providerId },
    ],
  };
}

function ingestFailure(
  request: ContentIngestRequest,
  providerId: string,
  message: string,
): ContentIngestResult {
  return {
    status: 'missing-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-ingest-missing-source', severity: 'error', message, providerId },
    ],
  };
}

function resolveIngestOutputPath(request: ContentIngestRequest, projectRoot: string): string {
  if (request.destination.copyMode === 'register' && request.sourcePath) return request.sourcePath;
  if (request.destination.directory) {
    return path.join(
      request.destination.directory,
      request.fileName ?? (request.sourcePath ? path.basename(request.sourcePath) : 'content.bin'),
    );
  }
  if (request.sourcePath) return request.sourcePath;
  if (request.mode === 'generated-output' || request.destination.kind === 'generated-assets') {
    return path.join(
      projectRoot,
      '.neko',
      '.cache',
      'generated',
      request.fileName ?? 'content.bin',
    );
  }
  if (request.mode === 'stage-export' || request.destination.kind === 'export-output') {
    return path.join(projectRoot, '.neko', '.cache', 'exports', request.fileName ?? 'content.bin');
  }
  return path.join(projectRoot, '.neko', '.cache', 'content', request.fileName ?? 'content.bin');
}

function createFileIngestResult(
  request: ContentIngestRequest,
  providerId: string,
  outputPath: string,
  pathResolver: PathResolver,
  projectRoot: string,
): ContentIngestResult {
  const contractedPath = contractDurableSourcePath(outputPath, pathResolver, projectRoot);
  const source = createResourceRef({
    scope: request.destination.kind === 'media-library' ? 'global' : 'project',
    provider: providerId,
    kind: 'media',
    source: {
      kind: request.destination.kind === 'media-library' ? 'media-library' : 'file',
      filePath: contractedPath,
      projectRelativePath: toProjectRelativePath(outputPath, projectRoot),
      mediaLibraryId: request.destination.mediaLibraryId,
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: `${providerId}:${contractedPath}`,
    }),
  });
  return {
    status: 'ready',
    request,
    providerId,
    source,
    outputPath,
    contractedPath,
    prewarm: request.prewarm,
  };
}

function toProjectRelativePath(filePath: string, projectRoot: string): string | undefined {
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath === normalizedRoot) return '';
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return undefined;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

function contractDurableSourcePath(
  filePath: string,
  pathResolver: PathResolver,
  projectRoot: string,
): string {
  const variablePath = pathResolver.contract(filePath);
  if (variablePath !== filePath) return variablePath;
  return toProjectRelativePath(filePath, projectRoot) ?? filePath;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/g, '');
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}
