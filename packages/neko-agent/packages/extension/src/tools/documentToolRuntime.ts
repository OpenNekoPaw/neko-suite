import * as vscode from 'vscode';
import type { AgentCapabilityContext, ResourceRef } from '@neko/shared';
import {
  type CoreFileAccessDecision,
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessPolicy,
  type FileAccessKind,
} from '@neko/agent/tools';
import {
  createDocumentReaderService,
  type IDocumentReaderService,
} from '../services/DocumentReaderService';
import { getEngineClientProvider } from '../services/engineClientProvider';
import { loadAuthorizedMediaLibraryReadRoots } from '../services/documentPathResolver';

export interface DocumentToolRuntime {
  readonly documentReader: IDocumentReaderService;
  readonly fileAccessPolicy: CoreFileAccessPolicy;
  readonly resolveDocumentResourceScope: () => ResourceRef['scope'];
}

export function createDocumentToolRuntime(context: AgentCapabilityContext): DocumentToolRuntime {
  const extensionContext = readExtensionContext(context.extensionContext);
  const documentReader = createDocumentReaderService(getEngineClientProvider(), extensionContext);

  return {
    documentReader,
    fileAccessPolicy: createDocumentFileAccessPolicy(),
    resolveDocumentResourceScope,
  };
}

export function createDocumentFileAccessPolicy(): CoreFileAccessPolicy {
  void refreshDocumentAuthorizedReadRootsOnce();
  return new DocumentFileAccessPolicy();
}

export async function refreshDocumentAuthorizedReadRoots(): Promise<void> {
  documentAuthorizedReadRoots = await loadAuthorizedMediaLibraryReadRoots();
  documentAuthorizedReadRootsRevision += 1;
  await syncEngineAuthorizedReadRoots(documentAuthorizedReadRoots);
}

export async function setDocumentAuthorizedReadRoots(roots: readonly string[]): Promise<void> {
  documentAuthorizedReadRoots = [...roots];
  documentAuthorizedReadRootsRevision += 1;
  await syncEngineAuthorizedReadRoots(documentAuthorizedReadRoots);
}

async function syncEngineAuthorizedReadRoots(roots: readonly string[]): Promise<void> {
  await getEngineClientProvider().setAuthorizedReadRoots?.(roots);
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

let documentAuthorizedReadRoots: readonly string[] = [];
let documentAuthorizedReadRootsRevision = 0;
let isDocumentAuthorizedReadRootsRefreshRunning = false;

async function refreshDocumentAuthorizedReadRootsOnce(): Promise<void> {
  if (isDocumentAuthorizedReadRootsRefreshRunning) {
    return;
  }
  isDocumentAuthorizedReadRootsRefreshRunning = true;
  try {
    await refreshDocumentAuthorizedReadRoots();
  } finally {
    isDocumentAuthorizedReadRootsRefreshRunning = false;
  }
}

class DocumentFileAccessPolicy implements CoreFileAccessPolicy {
  private cachedPolicy:
    | {
        readonly workspaceRoot: string;
        readonly rootsRevision: number;
        readonly policy: CoreFileAccessPolicy;
      }
    | undefined;

  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision {
    return this.getInnerPolicy().authorize(filePath, accessKind);
  }

  private getInnerPolicy(): CoreFileAccessPolicy {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.cachedPolicy = undefined;
      return createNoWorkspaceFileAccessPolicy();
    }

    if (
      this.cachedPolicy?.workspaceRoot === workspaceRoot &&
      this.cachedPolicy.rootsRevision === documentAuthorizedReadRootsRevision
    ) {
      return this.cachedPolicy.policy;
    }

    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      readRoots: [workspaceRoot, ...documentAuthorizedReadRoots],
      writeRoots: [workspaceRoot],
    });
    this.cachedPolicy = {
      workspaceRoot,
      rootsRevision: documentAuthorizedReadRootsRevision,
      policy,
    };
    return policy;
  }
}
