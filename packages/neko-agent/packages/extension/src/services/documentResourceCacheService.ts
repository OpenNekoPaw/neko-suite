import * as os from 'node:os';
import * as vscode from 'vscode';
import { resolveStorageLayout } from '@neko/shared';
import {
  createDefaultLocalResourceAccessService,
  LegacyResourceCacheProvider,
  VSCodeResourceCacheService,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../base';
import { DocumentResourceCacheProvider } from './documentResourceCacheProvider';
import type { IDocumentReaderService } from './DocumentReaderService';

const logger = getLogger('DocumentResourceCacheService');

export interface CreateDocumentResourceCacheServiceOptions {
  readonly reader: IDocumentReaderService;
  readonly context: vscode.ExtensionContext;
}

export function createDocumentResourceCacheService(
  options: CreateDocumentResourceCacheServiceOptions,
): ResourceCacheService | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return undefined;
  }

  const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
  const localResourceAccess = createDefaultLocalResourceAccessService({
    extensionUri: options.context.extensionUri,
    context: options.context,
    logger,
  });

  return new VSCodeResourceCacheService({
    cacheRoot: layout.project.local.cache.resources,
    manifestPath: layout.project.local.cache.resourceManifest,
    projectRoot: workspaceRoot,
    localResourceAccess,
    providers: [
      new DocumentResourceCacheProvider({ reader: options.reader }),
      new LegacyResourceCacheProvider(),
    ],
    logger,
  });
}
