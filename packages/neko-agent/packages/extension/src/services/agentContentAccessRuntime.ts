import * as vscode from 'vscode';
import {
  createEngineContentAccessAdapter,
  type EngineContentAccessAdapter,
} from '@neko/neko-client/engine-file-access';
import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import type { PathResolver, ContentAccessRequest } from '@neko/shared';
import {
  DocumentResourceCacheProvider,
  createHostContentAccessRuntime,
  type ContentAccessService,
  type LocalResourceAccessService,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { IEngineClientProvider } from './engineClientProvider';
import { createExtensionAgentContentAccessRuntimeAdapter } from './agentContentAccessRuntimeAdapter';
import { getLogger } from '../base';

const logger = getLogger('AgentContentAccessRuntime');
const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export interface AgentContentAccessRuntimeServices {
  readonly contentAccess: ContentAccessService;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
}

export interface CreateExtensionAgentContentAccessRuntimeOptions {
  readonly context?: vscode.ExtensionContext;
  readonly engineClientProvider: IEngineClientProvider;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: (request: ContentAccessRequest) => vscode.Webview | undefined;
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly maxProviderAssetBytes?: number;
}

export interface CreateExtensionAgentContentAccessRuntimeResult
  extends AgentContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
}

export function createExtensionAgentContentAccessRuntime(
  options: CreateExtensionAgentContentAccessRuntimeOptions,
): CreateExtensionAgentContentAccessRuntimeResult {
  const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const engineContentAccess = createEngineContentAccessAdapter({
    engineClientProvider: options.engineClientProvider,
    maxProviderAssetBytes: options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES,
  });
  const documentAccess = createHostDocumentAccess(engineContentAccess);

  const sharedRuntime = createHostContentAccessRuntime({
    context: options.context,
    extensionUri: options.context?.extensionUri,
    workspaceRoot,
    resourceCache: options.resourceCache,
    localResourceAccess: options.localResourceAccess,
    pathResolver: options.pathResolver,
    webviewResolver: options.webviewResolver,
    resourceCacheOptions: options.context
      ? {
          providers: [
            new DocumentResourceCacheProvider({
              entryReader: {
                readEntry: (source, entryPath) =>
                  engineContentAccess.readDocumentEntry({
                    sourcePath: source.filePath,
                    entryPath,
                  }),
              },
            }),
          ],
        }
      : undefined,
    sourceFileProvider: {
      enabled: Boolean(workspaceRoot),
      engineSourceResolver: ({ request, path: filePath }) =>
        engineContentAccess.createEngineSource(request, filePath),
      bytesResolver: ({ request, path: filePath }) =>
        engineContentAccess.readProviderAssetBytes({
          request,
          filePath,
          maxBytes: options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES,
        }),
    },
    documentEntryProvider: {
      enabled: Boolean(workspaceRoot),
      entryReader: ({ sourcePath, entryPath }) =>
        engineContentAccess.readDocumentEntry({
          sourcePath,
          entryPath,
        }),
    },
    ingest: { enabled: false },
    logger,
  });

  return {
    runtime: createExtensionAgentContentAccessRuntimeAdapter({
      contentAccess: sharedRuntime.contentAccess,
      documentAccess,
      resolveDocumentResourceScope: () =>
        vscode.workspace.workspaceFolders?.[0] ? 'project' : 'extension-private',
    }),
    contentAccess: sharedRuntime.contentAccess,
    ...(sharedRuntime.resourceCache ? { resourceCache: sharedRuntime.resourceCache } : {}),
    ...(options.localResourceAccess ? { localResourceAccess: options.localResourceAccess } : {}),
  };
}

function createHostDocumentAccess(
  engineContentAccess: EngineContentAccessAdapter,
): IDocumentAccessService {
  const lowLevelAccess = engineContentAccess.createDocumentLowLevelAccess();
  const runtimeDeps: DocumentReaderRuntimeDeps = {
    readTextFile: (filePath) => lowLevelAccess.readText(filePath),
    readBinaryFile: (filePath) => lowLevelAccess.readFile(filePath),
    readEntry: (filePath, entryPath) => lowLevelAccess.readEntry(filePath, entryPath),
    loadModule: <T>(packageName: string) => tryImport<T>(packageName),
    logger,
  };
  const reader = createDocumentReaderRuntime(runtimeDeps);
  return createDocumentAccessService({
    reader,
    runtime: runtimeDeps,
    lowLevelAccess,
  });
}

async function tryImport<T>(packageName: string): Promise<T | null> {
  try {
    const mod = (await import(packageName)) as { default?: unknown };
    return (mod.default ?? mod) as T;
  } catch {
    return null;
  }
}
