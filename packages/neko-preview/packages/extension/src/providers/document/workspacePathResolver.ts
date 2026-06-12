import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vscode from 'vscode';
import {
  PathResolver,
  resolveWorkspaceMediaPath,
  type PathVariableMap,
  type WorkspaceMediaPathContext,
} from '@neko/shared';
import { createVSCodeWorkspaceMediaPathContext } from '@neko/shared/vscode/extension';
import { getLogger } from '../../utils/logger';

interface MediaLibraryEntry {
  variable?: string;
  path?: string;
  enabled?: boolean;
}

interface MediaLibrarySettings {
  mediaLibraries?: MediaLibraryEntry[];
}

interface MediaLibraryLocalSettings {
  mediaLibraryOverrides?: Record<string, string>;
}

interface ResolvedMediaLibraryRoot {
  variable?: string;
  path: string;
  workspaceRoot: string;
}

export interface PreviewPathResolutionOptions {
  readonly sourceDocumentUri?: vscode.Uri;
  readonly allowedRoots?: readonly string[];
}

const logger = getLogger('WorkspacePathResolver');
const NEKO_FACTS_DIR = 'neko';
const NEKO_LOCAL_DIR = '.neko';
const SETTINGS_FILE = 'settings.json';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const PATH_VARIABLE_RE = /\/?\$\{([^}]+)\}/;
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\/;
const MAX_VARIABLE_RESOLUTION_DEPTH = 8;

export function hasPathVariable(filePath: string): boolean {
  return PATH_VARIABLE_RE.test(filePath);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to read media library settings: ${filePath}`, error);
    }
    return null;
  }
}

async function loadWorkspaceMediaLibraryRoots(): Promise<ResolvedMediaLibraryRoot[]> {
  const roots: ResolvedMediaLibraryRoot[] = [];
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of workspaceFolders) {
    const settingsPath = path.join(folder.uri.fsPath, NEKO_FACTS_DIR, SETTINGS_FILE);
    const localSettingsPath = path.join(folder.uri.fsPath, NEKO_LOCAL_DIR, LOCAL_SETTINGS_FILE);
    const settings = await readJsonFile<MediaLibrarySettings>(settingsPath);
    const localSettings = await readJsonFile<MediaLibraryLocalSettings>(localSettingsPath);
    const overrides = localSettings?.mediaLibraryOverrides ?? {};

    for (const entry of settings?.mediaLibraries ?? []) {
      if (entry.enabled === false) continue;
      if (!entry.path) continue;
      const path = entry.variable ? (overrides[entry.variable] ?? entry.path) : entry.path;
      roots.push({ variable: entry.variable, path, workspaceRoot: folder.uri.fsPath });
    }
  }

  return roots;
}

function buildWorkspacePathVariables(
  mediaRoots: ResolvedMediaLibraryRoot[],
  workspaceRoot?: string,
): PathVariableMap {
  const variables: PathVariableMap = new Map();

  for (const root of mediaRoots) {
    if (!root.variable) continue;
    variables.set(root.variable, root.path);
  }

  // Built-in variables are resolved locally in the Extension Host before the
  // engine receives canonical filesystem roots.
  if (workspaceRoot) {
    variables.set('WORKSPACE', workspaceRoot);
    variables.set('PROJECT', workspaceRoot);
  }
  variables.set('HOME', os.homedir());
  variables.set('NEKO_HOME', path.join(os.homedir(), '.neko'));

  return variables;
}

async function loadWorkspacePathVariables(): Promise<PathVariableMap> {
  const mediaRoots = await loadWorkspaceMediaLibraryRoots();
  const firstWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return buildWorkspacePathVariables(mediaRoots, firstWorkspaceRoot);
}

async function loadWorkspacePathVariablesForRoot(workspaceRoot?: string): Promise<PathVariableMap> {
  const mediaRoots = await loadWorkspaceMediaLibraryRoots();
  return buildWorkspacePathVariables(mediaRoots, workspaceRoot);
}

function expandHomeDir(filePath: string): string {
  if (filePath === '~') {
    return os.homedir();
  }
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function resolveVariables(filePath: string, variables: PathVariableMap): string {
  const resolver = new PathResolver(variables);
  let current = filePath;

  for (let i = 0; i < MAX_VARIABLE_RESOLUTION_DEPTH; i += 1) {
    const next = resolver.resolve(current);
    if (next === current) break;
    current = next;
  }

  return current;
}

function toLocalFilesystemPath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;

  if (WINDOWS_DRIVE_RE.test(trimmed) || WINDOWS_UNC_RE.test(trimmed)) {
    return trimmed;
  }

  if (URI_SCHEME_RE.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'file:') {
        logger.warn(`Skipping non-local media library root: ${trimmed}`);
        return null;
      }
      return fileURLToPath(url);
    } catch (error) {
      logger.warn(`Skipping invalid media library root URI: ${trimmed}`, error);
      return null;
    }
  }

  return trimmed;
}

function normalizeLocalRoot(
  configuredPath: string,
  workspaceRoot: string,
  variables: PathVariableMap,
): string | null {
  const expanded = expandHomeDir(resolveVariables(configuredPath, variables));
  const localPath = toLocalFilesystemPath(expanded);
  if (!localPath) return null;
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.resolve(workspaceRoot, localPath);
}

export async function getPreviewAllowedRoots(): Promise<string[]> {
  const roots = new Set<string>();
  const mediaRoots = await loadWorkspaceMediaLibraryRoots();

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.fsPath) {
      roots.add(path.normalize(folder.uri.fsPath));
    }
  }

  for (const root of mediaRoots) {
    const normalizedRoot = normalizeLocalRoot(
      root.path,
      root.workspaceRoot,
      buildWorkspacePathVariables(mediaRoots, root.workspaceRoot),
    );
    if (normalizedRoot) roots.add(normalizedRoot);
  }

  return [...roots];
}

async function createPreviewWorkspaceMediaPathContext(
  options?: PreviewPathResolutionOptions,
): Promise<WorkspaceMediaPathContext> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const provisionalContext = createVSCodeWorkspaceMediaPathContext({
    documentUri: options?.sourceDocumentUri,
    workspaceFolders,
    allowedRoots: options?.allowedRoots ?? (await getPreviewAllowedRoots()),
  });
  const pathVariables = await loadWorkspacePathVariablesForRoot(
    provisionalContext.owningWorkspaceRoot,
  );
  return createVSCodeWorkspaceMediaPathContext({
    documentUri: options?.sourceDocumentUri,
    workspaceFolders,
    pathVariables,
    allowedRoots: options?.allowedRoots ?? (await getPreviewAllowedRoots()),
  });
}

export async function resolveWorkspacePath(
  filePath: string,
  options?: PreviewPathResolutionOptions,
): Promise<string> {
  if (options?.sourceDocumentUri) {
    const context = await createPreviewWorkspaceMediaPathContext(options);
    const resolved = resolveWorkspaceMediaPath({
      source: filePath,
      context,
      fileExists: (candidate) => fileExists(candidate),
      isPathAuthorized: (candidate) => isPathAuthorized(candidate, context.allowedRoots),
    });
    if (resolved.status === 'resolved-local') return resolved.path;
    if (resolved.status === 'remote') return resolved.url;
    return filePath;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return filePath;
  }

  const expanded = expandHomeDir(resolveVariables(filePath, await loadWorkspacePathVariables()));
  const localPath = toLocalFilesystemPath(expanded);
  if (!localPath) return filePath;
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.resolve(workspaceFolders[0]!.uri.fsPath, localPath);
}

export async function resolvePreviewPath(
  filePath: string,
  options?: PreviewPathResolutionOptions,
): Promise<string> {
  if (options?.sourceDocumentUri) {
    const resolved = await resolveWorkspacePath(filePath, options);
    if (resolved !== filePath || !hasPathVariable(filePath)) {
      return resolved;
    }
  }

  try {
    const resolved = await vscode.commands.executeCommand<string>(
      'neko.assets.resolvePath',
      filePath,
    );
    if (resolved && !hasPathVariable(resolved)) {
      return resolved;
    }
  } catch {
    // neko-assets not active
  }

  return resolveWorkspacePath(filePath, options);
}

function fileExists(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathAuthorized(filePath: string, allowedRoots: readonly string[] | undefined): boolean {
  if (!allowedRoots || allowedRoots.length === 0) return true;
  return allowedRoots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
