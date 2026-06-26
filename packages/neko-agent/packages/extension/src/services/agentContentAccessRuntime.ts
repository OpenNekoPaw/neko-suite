import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EngineClient, FileAccessPurpose } from '@neko/neko-client/EngineClient';
import { probeImageMetadata } from '@neko/platform/document';
import {
  isResourceRef,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessTarget,
  type ContentDocumentSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';
import {
  createDocumentResourceRefFromArchiveRef,
  createHostContentAccessRuntime,
  readStringMetadata,
  type ContentAccessService,
  type LocalResourceAccessService,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import {
  createAgentContentAccessDiagnostic,
  createAgentContentAccessFailureResult,
  toAgentContentAccessDiagnostics,
  type AgentContentAccessCaller,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentDocumentImagesInput,
  type AgentDocumentImagesResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from '@neko/agent/runtime';
import { PathResolver } from '@neko/shared';
import type { IEngineClientProvider } from './engineClientProvider';
import type { IDocumentReaderService } from './DocumentReaderService';
import { createDocumentReaderService } from './DocumentReaderService';
import { createDocumentResourceCacheService } from './documentResourceCacheService';
import { createDocumentLowLevelAccess } from './documentLowLevelAccess';
import { getLogger } from '../base';

const logger = getLogger('AgentContentAccessRuntime');
const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export interface AgentContentAccessRuntimeServices {
  readonly contentAccess: ContentAccessService;
  readonly documentReader?: IDocumentReaderService;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
}

export interface CreateExtensionAgentContentAccessRuntimeOptions {
  readonly context?: vscode.ExtensionContext;
  readonly engineClientProvider: IEngineClientProvider;
  readonly documentReader?: IDocumentReaderService;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: (request: ContentAccessRequest) => vscode.Webview | undefined;
  readonly workspaceRoot?: string;
  readonly maxProviderAssetBytes?: number;
}

export interface CreateExtensionAgentContentAccessRuntimeResult extends AgentContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
}

export function createExtensionAgentContentAccessRuntime(
  options: CreateExtensionAgentContentAccessRuntimeOptions,
): CreateExtensionAgentContentAccessRuntimeResult {
  const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const documentReader =
    options.documentReader ??
    (options.context
      ? createDocumentReaderService(options.engineClientProvider, options.context)
      : undefined);
  const resourceCache =
    options.resourceCache ??
    (options.context && documentReader
      ? createDocumentResourceCacheService({
          reader: documentReader,
          context: options.context,
        })
      : undefined);

  const sharedRuntime = createHostContentAccessRuntime({
    workspaceRoot,
    resourceCache,
    localResourceAccess: options.localResourceAccess,
    webviewResolver: options.webviewResolver,
    sourceFileProvider: {
      enabled: Boolean(workspaceRoot),
      engineSourceResolver: ({ request, path: filePath }) =>
        createEngineSource(options.engineClientProvider, request, filePath),
    },
    documentEntryProvider: {
      enabled: Boolean(workspaceRoot),
      entryReader: ({ request, sourcePath, entryPath }) =>
        readDocumentEntry({
          engineClientProvider: options.engineClientProvider,
          request,
          sourcePath,
          entryPath,
        }),
    },
    ingest: { enabled: false },
    logger,
  });
  const contentAccess = sharedRuntime.contentAccess;

  const runtime = new ExtensionAgentContentAccessRuntime({
    contentAccess,
    engineClientProvider: options.engineClientProvider,
    documentReader,
    resourceCache,
    maxProviderAssetBytes: options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES,
  });

  return {
    runtime,
    contentAccess,
    ...(documentReader ? { documentReader } : {}),
    ...(resourceCache ? { resourceCache } : {}),
    ...(options.localResourceAccess ? { localResourceAccess: options.localResourceAccess } : {}),
  };
}

class ExtensionAgentContentAccessRuntime implements AgentContentAccessRuntime {
  constructor(
    private readonly services: {
      readonly contentAccess: ContentAccessService;
      readonly engineClientProvider: IEngineClientProvider;
      readonly documentReader?: IDocumentReaderService;
      readonly resourceCache?: ResourceCacheService;
      readonly maxProviderAssetBytes: number;
    },
  ) {}

  resolve(input: AgentContentAccessRuntimeRequest): Promise<ContentAccessResult> {
    if (
      input.request.target === 'bytes' &&
      input.request.ref.kind !== 'runtime' &&
      !isResourceRef(input.request.ref)
    ) {
      return this.loadProviderAsset({
        caller: input.caller,
        source: input.request.ref,
        preferredTarget: 'bytes',
        signal: input.request.signal,
        metadata: input.request.metadata,
      }).then((asset) => ({
        status: asset.status,
        request: input.request,
        source: asset.source,
        bytes: asset.bytes,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        diagnostics: asset.diagnostics,
        error: asset.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message,
      }));
    }
    return this.services.contentAccess.resolve({
      ...input.request,
      caller: input.request.caller ?? input.caller,
    });
  }

  async resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult> {
    const caller = input.caller ?? 'read-image';
    const request = createRequest(input.source, {
      caller,
      intent: input.intent ?? 'verify',
      target: 'bytes',
      variant: input.variant,
      signal: input.signal,
      metadata: input.metadata,
    });
    const providerAsset = await this.loadProviderAsset({
      ...input,
      caller,
      preferredTarget: 'bytes',
    });
    const diagnostics = [...providerAsset.diagnostics];
    const metadata =
      providerAsset.bytes !== undefined ? probeImageMetadata(providerAsset.bytes) : undefined;
    if (providerAsset.status === 'ready' && !metadata) {
      diagnostics.push(
        createAgentContentAccessDiagnostic({
          code: 'unsupported-source',
          message: 'Unsupported or unreadable image bytes.',
          caller,
          request,
        }),
      );
    }
    const documentResourceRef = readDocumentArchiveRef(input.source);

    return {
      status:
        metadata !== undefined
          ? 'ready'
          : providerAsset.status === 'ready'
            ? 'unsupported-source'
            : providerAsset.status,
      source: providerAsset.source,
      contentAccess: providerAsset.contentAccess,
      diagnostics,
      ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
      ...(metadata?.width !== undefined ? { width: metadata.width } : {}),
      ...(metadata?.height !== undefined ? { height: metadata.height } : {}),
      sizeBytes: metadata?.byteSize ?? providerAsset.sizeBytes,
      ...(isResourceRef(input.source) ? { resourceRef: input.source } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  async resolveDocumentContent(
    input: AgentDocumentContentInput,
  ): Promise<AgentDocumentContentResult> {
    const caller = input.caller ?? 'read-document';
    const request = createRequest(input.source, {
      caller,
      intent: input.intent ?? 'agent-context',
      target: 'bytes',
      signal: input.signal,
      metadata: input.metadata,
    });
    const documentReader = this.services.documentReader;
    const sourcePath = extractSourcePath(input.source);
    if (!documentReader) {
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'agent-content-access-unavailable',
            message: 'Document content access requires DocumentReaderService.',
            status: 'failed',
          }),
          caller,
        ),
      };
    }
    if (!sourcePath) {
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'unsupported-source',
            message: 'Document content access requires a path-backed source ref.',
            status: 'unsupported-source',
          }),
          caller,
        ),
      };
    }

    try {
      const content = await documentReader.readContent(sourcePath);
      const documentResourceRef = readDocumentArchiveRef(input.source);
      return {
        status: 'ready',
        source: stableSource(input.source),
        diagnostics: [],
        text: content.text,
        ...(isResourceRef(input.source) ? { resourceRef: input.source } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        metadata: sanitizeDocumentContentMetadata(content.metadata),
      };
    } catch (error) {
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'unsupported-source',
            message: error instanceof Error ? error.message : String(error),
            status: 'failed',
          }),
          caller,
        ),
      };
    }
  }

  async resolveDocumentImages(input: AgentDocumentImagesInput): Promise<AgentDocumentImagesResult> {
    const caller = input.caller ?? 'read-document-image';
    const sourceDocumentRef = readDocumentArchiveRef(input.source);
    const documentResourceRefs = [
      ...(input.locators ?? []),
      ...(sourceDocumentRef ? [sourceDocumentRef] : []),
    ];

    if (documentResourceRefs.length === 0) {
      const request = createRequest(input.source, {
        caller,
        intent: input.intent ?? 'cache-materialize',
        target: 'local-path',
        variant: input.variant,
        signal: input.signal,
        metadata: input.metadata,
      });
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'unsupported-source',
            message: 'Document image access requires DocumentArchiveResourceRef locators.',
            status: 'unsupported-source',
          }),
          caller,
        ),
        images: [],
      };
    }

    const images = await Promise.all(
      documentResourceRefs.map(async (documentResourceRef) => {
        const managedRef = this.toManagedDocumentResourceRef(documentResourceRef);
        const providerAsset = await this.loadProviderAsset({
          caller,
          source: managedRef,
          preferredTarget: 'bytes',
          variant: input.variant ?? createDocumentEntryVariant(documentResourceRef),
          signal: input.signal,
          metadata: input.metadata,
        });
        return {
          ...(documentResourceRef.entryPath
            ? { label: path.basename(documentResourceRef.entryPath) }
            : {}),
          resourceRef: managedRef,
          documentResourceRef,
          ...(providerAsset.status === 'ready' ? { providerAsset } : {}),
          metadata: {
            status: providerAsset.status,
            ...(providerAsset.diagnostics.length > 0
              ? { diagnostics: providerAsset.diagnostics }
              : {}),
          },
        };
      }),
    );
    const diagnostics = images.flatMap((image) => image.providerAsset?.diagnostics ?? []);
    return {
      status: images.every((image) => image.providerAsset?.status === 'ready') ? 'ready' : 'failed',
      source: stableSource(input.source),
      diagnostics,
      images,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  async loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    const caller = input.caller ?? 'perception-asset-loader';
    if (input.source.kind === 'runtime') {
      const request = createRequest(input.source, {
        caller,
        intent: 'agent-context',
        target: input.preferredTarget ?? 'bytes',
        signal: input.signal,
        metadata: input.metadata,
      });
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'runtime-handle-rejected',
            message: 'Runtime handles cannot be used as durable Agent content identity.',
            status: 'unsupported-source',
          }),
          caller,
        ),
      };
    }

    if (isResourceRef(input.source)) {
      return this.loadCacheBackedProviderAsset(input, caller);
    }

    const sourcePath = extractSourcePath(input.source);
    if (!sourcePath) {
      const request = createRequest(input.source, {
        caller,
        intent: 'agent-context',
        target: input.preferredTarget ?? 'bytes',
        signal: input.signal,
        metadata: input.metadata,
      });
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'unsupported-source',
            message: 'Provider asset loading requires a resource ref or path-backed source.',
            status: 'unsupported-source',
          }),
          caller,
        ),
      };
    }

    const target = input.preferredTarget ?? 'bytes';
    if (target === 'engine-source') {
      const request = createRequest(input.source, {
        caller,
        intent: 'agent-context',
        target,
        signal: input.signal,
        metadata: input.metadata,
      });
      const result = await this.services.contentAccess.resolve(request);
      return {
        ...operationFromContentAccess(result, caller),
        engineSourceToken: result.engineSource?.token,
        mimeType: result.mimeType ?? input.mimeTypeHint,
        sizeBytes: result.sizeBytes,
      };
    }

    if (target === 'local-path') {
      const request = createRequest(input.source, {
        caller,
        intent: 'agent-context',
        target,
        signal: input.signal,
        metadata: input.metadata,
      });
      const result = await this.services.contentAccess.resolve(request);
      return {
        ...operationFromContentAccess(result, caller),
        uri: result.localPath,
        mimeType: result.mimeType ?? input.mimeTypeHint,
        sizeBytes: result.sizeBytes,
      };
    }

    return this.readSourceBytesThroughEngine(input, caller, sourcePath);
  }

  async projectResource(
    input: AgentResourceProjectionInput,
  ): Promise<AgentResourceProjectionResult> {
    const caller = input.caller ?? 'message-resource-projection';
    const request = createRequest(input.source, {
      caller,
      intent: 'interactive-preview',
      target: input.target,
      variant: input.variant,
      signal: input.signal,
      metadata: input.metadata,
    });
    const result = await this.services.contentAccess.resolve(request);
    return {
      ...operationFromContentAccess(result, caller),
      target: input.target,
      uri: result.uri ?? result.runtimeStream?.url,
      runtimeOnly: true,
    };
  }

  private async loadCacheBackedProviderAsset(
    input: AgentProviderAssetInput,
    caller: AgentContentAccessCaller,
  ): Promise<AgentProviderAssetResult> {
    const request = createRequest(input.source, {
      caller,
      intent: 'agent-context',
      target: input.preferredTarget ?? 'bytes',
      variant: input.variant,
      materialization: 'if-missing',
      signal: input.signal,
      metadata: input.metadata,
    });
    const result = await this.services.contentAccess.resolve(request);
    return {
      ...operationFromContentAccess(result, caller),
      bytes: result.bytes,
      uri: result.localPath ?? result.uri,
      mimeType: result.mimeType ?? input.mimeTypeHint,
      sizeBytes: result.sizeBytes ?? result.bytes?.byteLength,
    };
  }

  private async readSourceBytesThroughEngine(
    input: AgentProviderAssetInput,
    caller: AgentContentAccessCaller,
    sourcePath: string,
  ): Promise<AgentProviderAssetResult> {
    const request = createRequest(input.source, {
      caller,
      intent: 'agent-context',
      target: 'bytes',
      signal: input.signal,
      metadata: input.metadata,
    });
    try {
      const engine = await this.services.engineClientProvider.getOptionalClient();
      if (!engine) {
        return {
          ...operationFromContentAccess(
            createAgentContentAccessFailureResult({
              request,
              caller,
              code: 'engine-file-access-unavailable',
              message: 'Engine file access is unavailable for binary/media provider assets.',
              status: 'failed',
            }),
            caller,
          ),
        };
      }
      const resolvedPath = resolveSourcePath(sourcePath);
      const bytes = await readWholeFileThroughEngine(
        engine,
        resolvedPath,
        this.services.maxProviderAssetBytes,
        input.signal,
      );
      return {
        status: 'ready',
        source: stableSource(input.source),
        diagnostics: [],
        bytes,
        mimeType: input.mimeTypeHint,
        sizeBytes: bytes.byteLength,
      };
    } catch (error) {
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'engine-file-access-unavailable',
            message: error instanceof Error ? error.message : String(error),
            status: 'failed',
          }),
          caller,
        ),
      };
    }
  }

  private toManagedDocumentResourceRef(ref: DocumentArchiveResourceRef): ResourceRef {
    return createDocumentResourceRefFromArchiveRef(ref, resolveDocumentResourceScope());
  }
}

function createRequest(
  ref: ContentSourceRef,
  options: {
    readonly caller: AgentContentAccessCaller;
    readonly intent: ContentAccessRequest['intent'];
    readonly target: ContentAccessTarget;
    readonly variant?: ResourceVariantRequest;
    readonly materialization?: ContentAccessRequest['materialization'];
    readonly signal?: AbortSignal;
    readonly metadata?: Record<string, unknown>;
  },
): ContentAccessRequest {
  return {
    ref,
    intent: options.intent,
    target: options.target,
    caller: options.caller,
    ...(options.variant ? { variant: options.variant, role: options.variant.role } : {}),
    ...(options.materialization ? { materialization: options.materialization } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

function operationFromContentAccess(
  result: ContentAccessResult,
  caller: AgentContentAccessCaller,
): {
  readonly status: ContentAccessResult['status'];
  readonly source?: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>;
  readonly contentAccess: ContentAccessResult;
  readonly diagnostics: readonly AgentContentAccessDiagnostic[];
  readonly metadata?: Record<string, unknown>;
} {
  const diagnostics = toAgentContentAccessDiagnostics(result.diagnostics, caller);
  return {
    status: result.status,
    ...(result.source ? { source: result.source } : {}),
    contentAccess: result,
    diagnostics,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}

function stableSource(
  source: ContentSourceRef,
): Exclude<ContentSourceRef, { readonly kind: 'runtime' }> | undefined {
  return source.kind === 'runtime' ? source.source : source;
}

function extractSourcePath(ref: ContentSourceRef): string | undefined {
  if (isResourceRef(ref)) {
    const locatorPath = ref.locator?.kind === 'file' ? ref.locator.path : undefined;
    return (
      ref.source.filePath ??
      ref.source.projectRelativePath ??
      ref.source.document?.filePath ??
      locatorPath
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
      return assertNever(ref);
  }
}

function resolveSourcePath(sourcePath: string): string {
  const resolver = new PathResolver();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const resolved = resolver.resolveSource(sourcePath, workspaceRoot);
  if (resolved.type !== 'local') {
    throw new Error('Remote binary/media provider assets are not supported.');
  }
  if (resolver.hasVariable(resolved.path)) {
    throw new Error('Source path contains an unresolved path variable.');
  }
  return resolved.path;
}

async function createEngineSource(
  engineClientProvider: IEngineClientProvider,
  request: ContentAccessRequest,
  filePath: string,
): Promise<NonNullable<ContentAccessResult['engineSource']>> {
  const engine = await engineClientProvider.getOptionalClient();
  if (!engine) {
    throw new Error('Engine file access is unavailable.');
  }
  const registered = await engine.registerFile({
    filePath,
    purpose: readEnginePurpose(request),
    mimeHint: readStringMetadata(request.metadata, 'mimeType'),
  });
  return {
    token: registered.token,
    sourcePath: filePath,
    runtimeOnly: true,
  };
}

async function readWholeFileThroughEngine(
  engine: EngineClient,
  filePath: string,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  return engine.withRegisteredFile(
    { filePath, purpose: 'agent-attachment' },
    async (registered) => {
      if (signal?.aborted) {
        throw new Error('Operation aborted.');
      }
      if (registered.fileSizeBytes > maxBytes) {
        throw new Error(`Provider asset is too large: ${registered.fileSizeBytes} bytes.`);
      }
      if (registered.fileSizeBytes === 0) {
        return new Uint8Array();
      }
      return new Uint8Array(
        await engine.readFileRange(registered.token, 0, registered.fileSizeBytes - 1, signal),
      );
    },
  );
}

async function readDocumentEntry(input: {
  readonly engineClientProvider: IEngineClientProvider;
  readonly request: ContentAccessRequest;
  readonly sourcePath: string;
  readonly entryPath?: string;
}): Promise<Uint8Array> {
  if (input.entryPath) {
    const lowLevelAccess = createDocumentLowLevelAccess(input.engineClientProvider);
    const bytes = await lowLevelAccess.readEntry?.(input.sourcePath, input.entryPath);
    if (!bytes) {
      throw new Error(`Document entry cannot be read: ${input.entryPath}`);
    }
    return bytes;
  }

  const engine = await input.engineClientProvider.getOptionalClient();
  if (!engine) {
    throw new Error('Engine file access is unavailable for document package bytes.');
  }
  const stat = await fs.stat(input.sourcePath);
  if (stat.size === 0) {
    return new Uint8Array();
  }
  return engine.withRegisteredFile(
    { filePath: input.sourcePath, purpose: 'document' },
    async (registered) =>
      new Uint8Array(await engine.readFileRange(registered.token, 0, stat.size - 1)),
  );
}

function readEnginePurpose(request: ContentAccessRequest): FileAccessPurpose {
  const purpose = readStringMetadata(request.metadata, 'enginePurpose');
  return purpose === 'document' ||
    purpose === 'media-decode' ||
    purpose === 'model' ||
    purpose === 'puppet' ||
    purpose === 'agent-attachment'
    ? purpose
    : 'agent-attachment';
}

function createDocumentEntryVariant(ref: DocumentArchiveResourceRef): ResourceVariantRequest {
  return {
    role: 'document-entry',
    ...(ref.source.format ? { format: ref.source.format } : {}),
  };
}

function readDocumentArchiveRef(source: ContentSourceRef): DocumentArchiveResourceRef | undefined {
  if (isContentDocumentSourceRef(source)) {
    const documentSource = source.source.document;
    if (!documentSource) {
      return undefined;
    }
    const locator = source.locator?.kind === 'document' ? source.locator.locator : undefined;
    const entryPath =
      source.entryPath ??
      (source.locator?.kind === 'document' ? source.locator.entryPath : undefined);
    return {
      kind: 'document-entry',
      source: documentSource,
      ...(entryPath ? { entryPath } : {}),
      ...(locator ? { locator } : {}),
      versionPolicy: 'versioned-export',
    };
  }
  if (isResourceRef(source) && source.source.kind === 'document' && source.source.document) {
    const locator = source.locator?.kind === 'document' ? source.locator.locator : undefined;
    const entryPath = source.locator?.kind === 'document' ? source.locator.entryPath : undefined;
    return {
      kind: 'document-entry',
      source: source.source.document,
      ...(entryPath ? { entryPath } : {}),
      ...(locator ? { locator } : {}),
      versionPolicy: 'versioned-export',
    };
  }
  return undefined;
}

function isContentDocumentSourceRef(source: ContentSourceRef): source is ContentDocumentSourceRef {
  return !isResourceRef(source) && source.kind === 'document';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled content source ref kind: ${JSON.stringify(value)}`);
}

function sanitizeDocumentContentMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const sanitized = { ...metadata };
  delete sanitized['imagePaths'];
  delete sanitized['runtimePath'];
  delete sanitized['runtimeKind'];
  delete sanitized['cachePath'];
  delete sanitized['cacheResourceRef'];
  return sanitized;
}

function resolveDocumentResourceScope(): ResourceRef['scope'] {
  return vscode.workspace.workspaceFolders?.[0] ? 'project' : 'extension-private';
}
