import * as os from 'node:os';
import * as vscode from 'vscode';
import { resolveStorageLayout } from '@neko/shared';
import type { DocumentSourceRef } from '@neko/shared';
import {
  createDefaultLocalResourceAccessService,
  VSCodeResourceCacheService,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../base';
import { DocumentResourceCacheProvider } from './documentResourceCacheProvider';
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
      new DocumentResourceCacheProvider({
        reader: options.reader,
        entryReader: {
          readEntry: readZipBackedDocumentEntry,
        },
      }),
    ],
    logger,
  });
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
