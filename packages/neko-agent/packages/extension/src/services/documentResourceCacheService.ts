import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveStorageLayout } from '@neko/shared';
import {
  createHostContentAccessRuntime,
  DocumentResourceCacheProvider,
  type DocumentEntryReader,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../base';
import { createDocumentLowLevelAccess } from './documentLowLevelAccess';
import type { IEngineClientProvider } from './engineClientProvider';

const logger = getLogger('DocumentResourceCacheService');

export interface CreateDocumentResourceCacheServiceOptions {
  readonly context: vscode.ExtensionContext;
  readonly engineClientProvider: IEngineClientProvider;
}

export function createDocumentResourceCacheService(
  options: CreateDocumentResourceCacheServiceOptions,
): ResourceCacheService | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const cacheTarget = workspaceRoot
    ? createWorkspaceDocumentResourceCacheTarget(workspaceRoot)
    : createExtensionPrivateDocumentResourceCacheTarget(options.context);
  if (!cacheTarget) return undefined;

  return createHostContentAccessRuntime({
    extensionUri: options.context.extensionUri,
    context: options.context,
    workspaceRoot,
    resourceCacheOptions: {
      cacheRoot: cacheTarget.cacheRoot,
      manifestPath: cacheTarget.manifestPath,
      ...(cacheTarget.projectRoot ? { projectRoot: cacheTarget.projectRoot } : {}),
      ...(cacheTarget.extensionPrivateRoot
        ? { extensionPrivateRoot: cacheTarget.extensionPrivateRoot }
        : {}),
      providers: [
        new DocumentResourceCacheProvider({
          entryReader: {
            readEntry: createEngineDocumentEntryReader(options.engineClientProvider),
          },
        }),
      ],
    },
    sourceFileProvider: { enabled: false },
    documentEntryProvider: { enabled: false },
    ingest: { enabled: false },
    logger,
  }).resourceCache;
}

interface DocumentResourceCacheTarget {
  readonly cacheRoot: string;
  readonly manifestPath: string;
  readonly projectRoot?: string;
  readonly extensionPrivateRoot?: string;
}

function createWorkspaceDocumentResourceCacheTarget(
  workspaceRoot: string,
): DocumentResourceCacheTarget {
  const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
  return {
    cacheRoot: layout.project.local.cache.resources,
    manifestPath: layout.project.local.cache.resourceManifest,
    projectRoot: workspaceRoot,
  };
}

function createExtensionPrivateDocumentResourceCacheTarget(
  context: vscode.ExtensionContext,
): DocumentResourceCacheTarget | undefined {
  if (context.globalStorageUri.scheme !== 'file') return undefined;
  const extensionPrivateRoot = context.globalStorageUri.fsPath;
  const cacheRoot = path.join(extensionPrivateRoot, 'resources');
  return {
    cacheRoot,
    manifestPath: path.join(cacheRoot, 'manifest.json'),
    extensionPrivateRoot,
  };
}

function createEngineDocumentEntryReader(
  engineClientProvider: IEngineClientProvider,
): DocumentEntryReader['readEntry'] {
  const access = createDocumentLowLevelAccess(engineClientProvider);
  return async (source, entryPath) => {
    if (!access.readEntry) {
      return null;
    }
    return access.readEntry(source.filePath, entryPath);
  };
}
