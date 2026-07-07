import {
  DocumentContentAccessRuntime,
  createDocumentAccessService,
  createDocumentReaderRuntime,
  probeImageMetadata,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import AdmZipModule from 'adm-zip';
import * as Epub2Module from 'epub2';
import type { NekoHostPorts } from '@neko/host';
import {
  isResourceRef,
  readResourceSourceLocalPath,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessTarget,
  type ContentSourceRef,
  type ContentStableSourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';
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
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from '@neko/agent/runtime';

const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export interface CreateNodeContentAccessRuntimeOptions {
  readonly host: NekoHostPorts;
  readonly maxProviderAssetBytes?: number;
}

export function createNodeContentAccessRuntime(
  options: CreateNodeContentAccessRuntimeOptions,
): AgentContentAccessRuntime {
  return new NodeContentAccessRuntime(options);
}

class NodeContentAccessRuntime implements AgentContentAccessRuntime {
  private readonly maxProviderAssetBytes: number;
  private readonly documentAccess: IDocumentAccessService;
  private readonly documentRuntime: DocumentContentAccessRuntime;

  constructor(private readonly options: CreateNodeContentAccessRuntimeOptions) {
    this.maxProviderAssetBytes =
      options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES;
    const runtime = this.createDocumentReaderDeps();
    const reader = createDocumentReaderRuntime(runtime);
    this.documentAccess = createDocumentAccessService({
      reader,
      runtime,
      lowLevelAccess: {
        readFile: (filePath) => this.readBytes(filePath),
        readEntry: async (filePath, entryPath) => {
          const bytes = await this.readEntry(filePath, entryPath);
          if (!bytes) {
            throw new Error(`Document entry not found: ${entryPath}`);
          }
          return bytes;
        },
      },
    });
    this.documentRuntime = new DocumentContentAccessRuntime({
      contentAccess: {
        resolve: (request) => this.resolveContentAccess(request),
      },
      documentAccess: this.documentAccess,
      resolveDocumentResourceScope: () => 'project',
      loadProviderAsset: (input) => this.loadProviderAsset(input),
    });
  }

  resolve(input: AgentContentAccessRuntimeRequest): Promise<ContentAccessResult> {
    return this.resolveContentAccess({
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
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  async resolveDocumentContent(
    input: AgentDocumentContentInput,
  ): Promise<AgentDocumentContentResult> {
    const caller = input.caller ?? 'read-document';
    try {
      const result = await this.documentRuntime.resolveDocumentContent({
        ...input,
        caller,
      });
      return {
        ...operationFromContentAccess(result.contentAccess, caller),
        status: result.contentAccess.status,
        ...(result.source ? { source: result.source } : {}),
        ...(result.documentResourceRef ? { documentResourceRef: result.documentResourceRef } : {}),
        ...(result.resourceRef ? { resourceRef: result.resourceRef } : {}),
        ...(result.text !== undefined ? { text: result.text } : {}),
        ...(result.manifest ? { manifest: result.manifest } : {}),
        ...(result.range ? { range: result.range } : {}),
        ...(result.locator ? { locator: result.locator } : {}),
        ...(result.excerpt ? { excerpt: result.excerpt } : {}),
        ...(result.cursor ? { cursor: result.cursor } : {}),
        ...(result.imageInfo ? { imageInfo: result.imageInfo } : {}),
        ...(result.imageCount !== undefined ? { imageCount: result.imageCount } : {}),
        ...(result.imagesTruncated !== undefined
          ? { imagesTruncated: result.imagesTruncated }
          : {}),
        ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
        ...(result.totalTextChars !== undefined ? { totalTextChars: result.totalTextChars } : {}),
        ...(result.returnedTextChars !== undefined
          ? { returnedTextChars: result.returnedTextChars }
          : {}),
        ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
      };
    } catch (error) {
      const request = createRequest(input.source, {
        caller,
        intent: input.intent ?? 'agent-context',
        target: 'local-path',
        signal: input.signal,
        metadata: input.metadata,
      });
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

  async loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    const caller = input.caller ?? 'perception-asset-loader';
    const request = createRequest(input.source, {
      caller,
      intent: 'agent-context',
      target: input.preferredTarget ?? 'bytes',
      variant: input.variant,
      materialization: isResourceRef(input.source) ? 'if-missing' : undefined,
      signal: input.signal,
      metadata: input.metadata,
    });
    if (input.source.kind === 'runtime') {
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

    const documentEntry = readDocumentEntryRequest(input.source);
    if (documentEntry) {
      const bytes = await this.readEntry(documentEntry.filePath, documentEntry.entryPath);
      if (!bytes) {
        return {
          ...operationFromContentAccess(
            createAgentContentAccessFailureResult({
              request,
              caller,
              code: 'missing-source',
              message: `Document entry not found: ${documentEntry.entryPath}`,
              status: 'missing-source',
            }),
            caller,
          ),
        };
      }
      return {
        ...operationFromContentAccess(
          {
            status: 'ready',
            request,
            source: stableSource(input.source),
            bytes,
            sizeBytes: bytes.byteLength,
            diagnostics: [],
          },
          caller,
        ),
        bytes,
        sizeBytes: bytes.byteLength,
        mimeType: input.mimeTypeHint,
      };
    }

    const result = await this.resolveContentAccess(request);
    return {
      ...operationFromContentAccess(result, caller),
      bytes: result.bytes,
      uri: result.localPath ?? result.uri,
      mimeType: result.mimeType ?? input.mimeTypeHint,
      sizeBytes: result.sizeBytes ?? result.bytes?.byteLength,
    };
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
    const result = await this.resolveContentAccess(request);
    return {
      ...operationFromContentAccess(result, caller),
      target: input.target,
      uri: result.uri,
      runtimeOnly: true,
    };
  }

  private async resolveContentAccess(request: ContentAccessRequest): Promise<ContentAccessResult> {
    if (request.ref.kind === 'runtime') {
      return createAgentContentAccessFailureResult({
        request,
        caller: readCaller(request.caller),
        code: 'runtime-handle-rejected',
        message: 'Runtime handles cannot be used as durable Agent content identity.',
        status: 'unsupported-source',
      });
    }
    const rawPath = readSourcePath(request.ref);
    if (!rawPath) {
      return createAgentContentAccessFailureResult({
        request,
        caller: readCaller(request.caller),
        code: 'unsupported-source',
        message: 'Content access requires a path-backed source ref in TUI.',
        status: 'unsupported-source',
      });
    }
    const localPath = await this.resolveLocalPath(rawPath);
    if (!localPath) {
      return createAgentContentAccessFailureResult({
        request,
        caller: readCaller(request.caller),
        code: 'unsupported-source',
        message: `TUI content access only supports local paths: ${rawPath}`,
        status: 'unsupported-source',
      });
    }
    if (request.target === 'local-path') {
      return {
        status: 'ready',
        request,
        source: stableSource(request.ref),
        localPath,
        diagnostics: [],
      };
    }
    if (request.target === 'bytes') {
      const bytes = await this.readBytes(localPath);
      return {
        status: 'ready',
        request,
        source: stableSource(request.ref),
        localPath,
        bytes,
        sizeBytes: bytes.byteLength,
        diagnostics: [],
      };
    }
    return createAgentContentAccessFailureResult({
      request,
      caller: readCaller(request.caller),
      code: 'projection-failed',
      message: `TUI content access does not support target: ${request.target}`,
      status: 'unsupported-destination',
    });
  }

  private createDocumentReaderDeps(): DocumentReaderRuntimeDeps {
    return {
      readTextFile: (filePath) => this.readText(filePath),
      readBinaryFile: (filePath) => this.readBytes(filePath),
      readEntry: (filePath, entryPath) => this.readEntry(filePath, entryPath),
      loadModule: <T>(packageName: string) => loadTuiDocumentReaderModule<T>(packageName),
    };
  }

  private async readText(filePath: string): Promise<string> {
    const resolved = await this.requireLocalPath(filePath);
    return this.options.host.files.readText(resolved);
  }

  private async readBytes(filePath: string): Promise<Uint8Array> {
    const resolved = await this.requireLocalPath(filePath);
    return this.options.host.files.readBytes(resolved);
  }

  private async readEntry(filePath: string, entryPath: string): Promise<Uint8Array | null> {
    const resolved = await this.requireLocalPath(filePath);
    const AdmZip = readAdmZipConstructor(AdmZipModule);
    if (!AdmZip) {
      throw new Error('Document archive entry reader is unavailable in this Neko TUI build.');
    }
    const archive = new AdmZip(resolved);
    const entry = archive.getEntry(entryPath);
    if (!entry) {
      return null;
    }
    const bytes = entry.getData();
    if (bytes.byteLength > this.maxProviderAssetBytes) {
      throw new Error(`Document entry is too large for TUI content access: ${entryPath}`);
    }
    return bytes;
  }

  private async requireLocalPath(value: string): Promise<string> {
    const localPath = await this.resolveLocalPath(value);
    if (!localPath) {
      throw new Error(`TUI content access only supports local paths: ${value}`);
    }
    return localPath;
  }

  private async resolveLocalPath(value: string): Promise<string | undefined> {
    const workspace = await this.options.host.workspace.getWorkspace();
    const resolved = this.options.host.paths.resolvePath({
      path: value,
      ...(workspace.workspaceRoot ? { baseDir: workspace.workspaceRoot } : {}),
      ...(workspace.pathVariables ? { variables: workspace.pathVariables } : {}),
    });
    return resolved.type === 'local' && !resolved.path.includes('${') ? resolved.path : undefined;
  }
}

interface AdmZipEntry {
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntry(entryPath: string): AdmZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
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
  readonly source?: ContentStableSourceRef;
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

function readDocumentEntryRequest(
  source: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>,
): { readonly filePath: string; readonly entryPath: string } | undefined {
  if (!isResourceRef(source) || source.source.kind !== 'document') {
    return undefined;
  }
  const filePath = source.source.document?.filePath ?? source.source.filePath;
  const entryPath = source.locator?.kind === 'document' ? source.locator.entryPath : undefined;
  return filePath && entryPath ? { filePath, entryPath } : undefined;
}

function readSourcePath(source: ContentSourceRef): string | undefined {
  if (isResourceRef(source)) {
    const locatorPath = source.locator?.kind === 'file' ? source.locator.path : undefined;
    return readResourceSourceLocalPath(source.source) ?? locatorPath;
  }
  switch (source.kind) {
    case 'document':
      return readResourceSourceLocalPath(source.source);
    case 'asset':
      return source.sourcePath ?? readOptionalResourceSourcePath(source.resource);
    case 'file':
      return source.path;
    case 'media-library':
      return source.path;
    case 'generated-asset':
      return source.path ?? readOptionalResourceSourcePath(source.resource);
    case 'runtime':
      return source.source ? readSourcePath(source.source) : undefined;
  }
}

function readOptionalResourceSourcePath(resource: ResourceRef | undefined): string | undefined {
  return resource ? readResourceSourceLocalPath(resource.source) : undefined;
}

function stableSource(source: ContentSourceRef): ContentStableSourceRef | undefined {
  return source.kind === 'runtime' ? source.source : source;
}

function readCaller(caller: string | undefined): AgentContentAccessCaller {
  switch (caller) {
    case 'read-image':
    case 'read-document':
    case 'perception-asset-loader':
    case 'attachment-processor':
    case 'media-preprocessor':
    case 'message-resource-projection':
    case 'canvas-transfer':
    case 'storyboard-transfer':
    case 'clipboard-transfer':
      return caller;
    default:
      return 'unknown';
  }
}

async function loadTuiDocumentReaderModule<T>(packageName: string): Promise<T | null> {
  switch (packageName) {
    case 'adm-zip':
      return readAdmZipConstructor(AdmZipModule) as T;
    case 'epub2':
      return Epub2Module as T;
    default:
      return null;
  }
}

function readAdmZipConstructor(value: unknown): AdmZipConstructor | null {
  return typeof value === 'function' ? (value as AdmZipConstructor) : null;
}
