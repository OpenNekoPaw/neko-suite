import * as vscode from 'vscode';
import type { AgentCapabilityContext, ResourceRef } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import {
  createDocumentReaderService,
  type IDocumentReaderService,
} from '../services/DocumentReaderService';
import { createDocumentResourceCacheService } from '../services/documentResourceCacheService';
import { getEngineClientProvider } from '../services/engineClientProvider';

export interface DocumentToolRuntime {
  readonly documentReader: IDocumentReaderService;
  readonly documentResourceCache?: ResourceCacheService;
  readonly resolveDocumentResourceScope: () => ResourceRef['scope'];
}

export function createDocumentToolRuntime(context: AgentCapabilityContext): DocumentToolRuntime {
  const extensionContext = readExtensionContext(context.extensionContext);
  const documentReader = createDocumentReaderService(getEngineClientProvider(), extensionContext);
  const documentResourceCache =
    extensionContext !== undefined
      ? createDocumentResourceCacheService({
          reader: documentReader,
          context: extensionContext,
        })
      : undefined;

  return {
    documentReader,
    documentResourceCache,
    resolveDocumentResourceScope,
  };
}

function resolveDocumentResourceScope(): ResourceRef['scope'] {
  return hasWorkspaceFolder() ? 'project' : 'extension-private';
}

function hasWorkspaceFolder(): boolean {
  return (
    Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 0
  );
}

function readExtensionContext(value: unknown): vscode.ExtensionContext | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'extensionUri' in value &&
    'globalStorageUri' in value
  ) {
    return value as vscode.ExtensionContext;
  }
  return undefined;
}
