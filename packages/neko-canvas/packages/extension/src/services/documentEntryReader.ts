import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PathResolver, type DocumentSourceRef, type PathVariableMap } from '@neko/shared';
import type { DocumentEntryReader } from '@neko/shared/vscode/extension';

interface MediaLibraryEntry {
  readonly variable?: string;
  readonly path?: string;
  readonly enabled?: boolean;
}

interface MediaLibrarySettings {
  readonly mediaLibraries?: readonly MediaLibraryEntry[];
}

interface MediaLibraryLocalSettings {
  readonly mediaLibraryOverrides?: Record<string, string>;
}

interface ZipEntry {
  readonly name?: string;
  readonly entryName?: string;
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntries(): ZipEntry[];
  getEntry(name: string): ZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
}

const NEKO_FACTS_DIR = 'neko';
const NEKO_LOCAL_DIR = '.neko';
const SETTINGS_FILE = 'settings.json';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;

export function createCanvasDocumentEntryReader(projectRoot: string): DocumentEntryReader {
  let resolverPromise: Promise<PathResolver> | undefined;
  const getResolver = () => {
    resolverPromise ??= createCanvasDocumentPathResolver(projectRoot);
    return resolverPromise;
  };

  return {
    readEntry: async (source, entryPath) => {
      if (!isZipBackedDocument(source)) {
        return null;
      }

      const resolver = await getResolver();
      const filePath = await resolveCanvasDocumentPath(source.filePath, projectRoot, resolver);
      if (!filePath || resolver.hasVariable(filePath)) {
        return null;
      }

      const AdmZip = await loadAdmZip();
      if (!AdmZip) {
        return null;
      }

      const zip = new AdmZip(filePath);
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
    },
  };
}

async function createCanvasDocumentPathResolver(projectRoot: string): Promise<PathResolver> {
  return new PathResolver(await loadCanvasPathVariables(projectRoot));
}

async function loadCanvasPathVariables(projectRoot: string): Promise<PathVariableMap> {
  const variables: PathVariableMap = new Map([
    ['WORKSPACE', projectRoot],
    ['PROJECT', projectRoot],
    ['HOME', os.homedir()],
    ['NEKO_HOME', path.join(os.homedir(), '.neko')],
  ]);

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const workspaceRoot = folder.uri.fsPath;
    const settingsPath = path.join(workspaceRoot, NEKO_FACTS_DIR, SETTINGS_FILE);
    const localSettingsPath = path.join(workspaceRoot, NEKO_LOCAL_DIR, LOCAL_SETTINGS_FILE);
    const settings = await readJsonFile<MediaLibrarySettings>(settingsPath);
    const localSettings = await readJsonFile<MediaLibraryLocalSettings>(localSettingsPath);
    const overrides = localSettings?.mediaLibraryOverrides ?? {};

    for (const entry of settings?.mediaLibraries ?? []) {
      if (entry.enabled === false || !entry.variable || !entry.path) continue;
      variables.set(
        entry.variable,
        normalizeConfiguredPath(overrides[entry.variable] ?? entry.path, workspaceRoot),
      );
    }
  }

  return variables;
}

async function resolveCanvasDocumentPath(
  filePath: string,
  projectRoot: string,
  resolver: PathResolver,
): Promise<string | null> {
  try {
    const resolved = await vscode.commands.executeCommand<string>(
      'neko.assets.resolvePath',
      filePath,
    );
    if (resolved && !resolver.hasVariable(resolved)) {
      return normalizeLocalPath(resolved);
    }
  } catch {
    // neko-assets may not be active; fall back to workspace/project variables.
  }

  const resolved = resolver.resolveSource(filePath, projectRoot);
  return resolved.type === 'local' ? normalizeLocalPath(resolved.path) : null;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function loadAdmZip(): Promise<AdmZipConstructor | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('adm-zip') as AdmZipConstructor;
  } catch {
    return null;
  }
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

function createEntryPathCandidates(entryPath: string): readonly string[] {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const decoded = safeDecodeURIComponent(normalized);
  return dedupe([entryPath, normalized, decoded, path.posix.normalize(normalized)]);
}

function findUniqueEntryByBasename(zip: AdmZipInstance, entryPath: string): ZipEntry | null {
  const basenames = new Set(
    createEntryPathCandidates(entryPath).map((candidate) => path.posix.basename(candidate)),
  );
  if (basenames.size === 0) {
    return null;
  }

  const matches = zip.getEntries().filter((entry) => {
    const name = readZipEntryName(entry);
    return name !== undefined && basenames.has(path.posix.basename(name));
  });
  return matches.length === 1 ? matches[0]! : null;
}

function readZipEntryName(entry: ZipEntry): string | undefined {
  return entry.entryName ?? entry.name;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeLocalPath(filePath: string): string {
  const localPath = toLocalFilesystemPath(filePath);
  return localPath ? path.normalize(localPath) : filePath;
}

function normalizeConfiguredPath(configuredPath: string, workspaceRoot: string): string {
  const expanded = expandHomeDir(configuredPath);
  const localPath = toLocalFilesystemPath(expanded);
  if (!localPath) return expanded;
  return path.isAbsolute(localPath) ||
    WINDOWS_DRIVE_RE.test(localPath) ||
    WINDOWS_UNC_RE.test(localPath)
    ? path.normalize(localPath)
    : path.resolve(workspaceRoot, localPath);
}

function toLocalFilesystemPath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  if (WINDOWS_DRIVE_RE.test(trimmed) || WINDOWS_UNC_RE.test(trimmed)) return trimmed;
  if (URI_SCHEME_RE.test(trimmed)) {
    try {
      const uri = vscode.Uri.parse(trimmed);
      return uri.scheme === 'file' ? uri.fsPath : null;
    } catch {
      return null;
    }
  }
  return trimmed;
}

function expandHomeDir(filePath: string): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}
