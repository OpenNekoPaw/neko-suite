import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import {
  NEKO_EXTENSION_IDS,
  PathResolver,
  type NekoAssetsAPI,
  type PathVariableMap,
} from '@neko/shared';
import { getLogger } from '../base';

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

interface ResolvedMediaLibraryRoot {
  readonly variable?: string;
  readonly path: string;
  readonly workspaceRoot: string;
}

const logger = getLogger('DocumentPathResolver');
const NEKO_FACTS_DIR = 'neko';
const NEKO_LOCAL_DIR = '.neko';
const SETTINGS_FILE = 'settings.json';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;
const MAX_VARIABLE_RESOLUTION_DEPTH = 8;

export async function resolveDocumentPath(filePath: string): Promise<string> {
  if (isRemoteSource(filePath)) {
    return filePath;
  }

  try {
    const resolved = await vscode.commands.executeCommand<string>(
      'neko.assets.resolvePath',
      filePath,
    );
    if (resolved && !hasPathVariable(resolved)) {
      return normalizeResolvedPath(resolved);
    }
  } catch {
    // neko-assets may not be active; fall back to local settings.
  }

  return resolveDocumentPathWithWorkspaceSettings(filePath);
}

export async function createDocumentPathResolver(): Promise<PathResolver> {
  return new PathResolver(await loadWorkspacePathVariables());
}

export function hasPathVariable(filePath: string): boolean {
  return new PathResolver().hasVariable(filePath);
}

async function resolveDocumentPathWithWorkspaceSettings(filePath: string): Promise<string> {
  const resolver = await createDocumentPathResolver();
  const expanded = expandHomeDir(resolveVariables(filePath, resolver));
  if (hasPathVariable(expanded)) {
    return expanded;
  }
  return normalizeResolvedPath(expanded);
}

async function loadWorkspacePathVariables(): Promise<PathVariableMap> {
  const mediaRoots = await loadWorkspaceMediaLibraryRoots();
  const firstWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return buildWorkspacePathVariables(mediaRoots, firstWorkspaceRoot);
}

export async function loadAuthorizedMediaLibraryReadRoots(): Promise<string[]> {
  const apiRoots = await loadMediaLibraryRootsFromAssetsApi();
  if (apiRoots) {
    return apiRoots;
  }

  const roots = await loadWorkspaceMediaLibraryRoots();
  return filterReadableDirectories(
    dedupePaths(roots.map((root) => normalizeConfiguredPath(root.path, root.workspaceRoot))),
  );
}

async function loadWorkspaceMediaLibraryRoots(): Promise<ResolvedMediaLibraryRoot[]> {
  const roots: ResolvedMediaLibraryRoot[] = [];

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const settingsPath = path.join(folder.uri.fsPath, NEKO_FACTS_DIR, SETTINGS_FILE);
    const localSettingsPath = path.join(folder.uri.fsPath, NEKO_LOCAL_DIR, LOCAL_SETTINGS_FILE);
    const settings = await readJsonFile<MediaLibrarySettings>(settingsPath);
    const localSettings = await readJsonFile<MediaLibraryLocalSettings>(localSettingsPath);
    const overrides = localSettings?.mediaLibraryOverrides ?? {};

    for (const entry of settings?.mediaLibraries ?? []) {
      if (entry.enabled === false || !entry.path) continue;
      roots.push({
        variable: entry.variable,
        path: entry.variable ? (overrides[entry.variable] ?? entry.path) : entry.path,
        workspaceRoot: folder.uri.fsPath,
      });
    }
  }

  return roots;
}

function buildWorkspacePathVariables(
  mediaRoots: readonly ResolvedMediaLibraryRoot[],
  workspaceRoot?: string,
): PathVariableMap {
  const variables: PathVariableMap = new Map();

  for (const root of mediaRoots) {
    if (root.variable) {
      variables.set(root.variable, normalizeConfiguredPath(root.path, root.workspaceRoot));
    }
  }

  if (workspaceRoot) {
    variables.set('WORKSPACE', workspaceRoot);
    variables.set('PROJECT', workspaceRoot);
  }
  variables.set('HOME', os.homedir());
  variables.set('NEKO_HOME', path.join(os.homedir(), '.neko'));

  return variables;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to read path settings: ${filePath}`, error);
    }
    return null;
  }
}

function resolveVariables(filePath: string, resolver: PathResolver): string {
  let current = filePath;
  for (let i = 0; i < MAX_VARIABLE_RESOLUTION_DEPTH; i += 1) {
    const next = resolver.resolve(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function normalizeConfiguredPath(configuredPath: string, workspaceRoot: string): string {
  const expanded = expandHomeDir(configuredPath);
  const localPath = toLocalFilesystemPath(expanded);
  if (!localPath) return expanded;
  return path.isAbsolute(localPath)
    ? path.normalize(localPath)
    : path.resolve(workspaceRoot, localPath);
}

function normalizeResolvedPath(filePath: string): string {
  const expanded = expandHomeDir(filePath);
  const localPath = toLocalFilesystemPath(expanded);
  if (!localPath) return filePath;
  if (
    path.isAbsolute(localPath) ||
    WINDOWS_DRIVE_RE.test(localPath) ||
    WINDOWS_UNC_RE.test(localPath)
  ) {
    return path.normalize(localPath);
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return workspaceRoot ? path.resolve(workspaceRoot, localPath) : localPath;
}

function toLocalFilesystemPath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  if (WINDOWS_DRIVE_RE.test(trimmed) || WINDOWS_UNC_RE.test(trimmed)) return trimmed;

  if (URI_SCHEME_RE.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'file:' ? fileURLToPath(url) : null;
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

function isRemoteSource(filePath: string): boolean {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
}

async function loadMediaLibraryRootsFromAssetsApi(): Promise<string[] | undefined> {
  const extension = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
  if (!extension) {
    return undefined;
  }

  try {
    const api = extension.isActive ? extension.exports : await extension.activate();
    return dedupePaths((await api.getMediaLibraryRoots()).map((root) => path.resolve(root)));
  } catch (error) {
    logger.warn('Failed to load media library roots from neko-assets API', error);
    return undefined;
  }
}

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    if (!item.trim()) continue;
    const normalized = path.normalize(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function filterReadableDirectories(paths: readonly string[]): Promise<string[]> {
  const result: string[] = [];
  for (const item of paths) {
    try {
      const stat = await fs.stat(item);
      if (stat.isDirectory()) {
        await fs.access(item);
        result.push(item);
      }
    } catch {
      // Unreadable roots are not authorized for Agent file tools.
    }
  }
  return result;
}
