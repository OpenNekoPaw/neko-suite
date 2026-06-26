import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveStorageLayout } from '@neko/shared';
import type { DocumentSourceRef } from '@neko/shared';
import {
  createHostContentAccessRuntime,
  DocumentResourceCacheProvider,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../base';
import type { IDocumentReaderService } from './DocumentReaderService';
import { resolveDocumentPath } from './documentPathResolver';

const logger = getLogger('DocumentResourceCacheService');

export interface CreateDocumentResourceCacheServiceOptions {
  readonly reader: IDocumentReaderService;
  readonly context: vscode.ExtensionContext;
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
          reader: options.reader,
          entryReader: {
            readEntry: readZipBackedDocumentEntry,
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

async function readZipBackedDocumentEntry(
  source: DocumentSourceRef,
  entryPath: string,
): Promise<Uint8Array | null> {
  if (!isZipBackedDocument(source)) {
    return null;
  }
  const AdmZip = await loadAdmZip();
  if (!AdmZip) {
    return null;
  }
  const zip = new AdmZip(await resolveDocumentPath(source.filePath));
  for (const candidate of createEntryPathCandidates(entryPath)) {
    const entry = zip.getEntry(candidate);
    if (entry) {
      return new Uint8Array(entry.getData());
    }
  }
  const entry = findUniqueEntryByBasename(zip, entryPath);
  if (entry) {
    return new Uint8Array(entry.getData());
  }
  return null;
}

function isZipBackedDocument(source: DocumentSourceRef): boolean {
  return (
    source.format === 'epub' ||
    source.format === 'cbz' ||
    source.format === 'docx' ||
    source.format === 'pptx' ||
    source.format === 'xlsx'
  );
}

async function loadAdmZip(): Promise<AdmZipConstructor | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('adm-zip') as AdmZipConstructor;
  } catch {
    return null;
  }
}

function createEntryPathCandidates(entryPath: string): readonly string[] {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const decoded = safeDecodeURIComponent(normalized);
  return Array.from(new Set([entryPath, normalized, decoded].filter((value) => value.length > 0)));
}

function findUniqueEntryByBasename(zip: AdmZipInstance, entryPath: string): AdmZipEntry | null {
  const basenames = new Set(
    createEntryPathCandidates(entryPath).map((candidate) => pathPosixBasename(candidate)),
  );
  if (basenames.size === 0) {
    return null;
  }

  const matches = zip.getEntries().filter((entry) => {
    const name = readZipEntryName(entry);
    return name !== undefined && basenames.has(pathPosixBasename(name));
  });
  return matches.length === 1 ? matches[0]! : null;
}

function readZipEntryName(entry: AdmZipEntry): string | undefined {
  return entry.entryName ?? entry.name;
}

function pathPosixBasename(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop() ?? value;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface AdmZipEntry {
  readonly name?: string;
  readonly entryName?: string;
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntries(): AdmZipEntry[];
  getEntry(name: string): AdmZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
}
