import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PathResolver, type PathVariableMap } from '@neko/shared';
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

const logger = getLogger('WorkspacePathResolver');
const NEKO_FACTS_DIR = 'neko';
const NEKO_LOCAL_DIR = '.neko';
const SETTINGS_FILE = 'settings.json';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const PATH_VARIABLE_RE = /\/?\$\{([^}]+)\}/;

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

async function loadWorkspacePathVariables(): Promise<PathVariableMap> {
  const variables: PathVariableMap = new Map();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of workspaceFolders) {
    const settingsPath = path.join(folder.uri.fsPath, NEKO_FACTS_DIR, SETTINGS_FILE);
    const localSettingsPath = path.join(folder.uri.fsPath, NEKO_LOCAL_DIR, LOCAL_SETTINGS_FILE);
    const settings = await readJsonFile<MediaLibrarySettings>(settingsPath);
    const localSettings = await readJsonFile<MediaLibraryLocalSettings>(localSettingsPath);
    const overrides = localSettings?.mediaLibraryOverrides ?? {};

    for (const entry of settings?.mediaLibraries ?? []) {
      if (entry.enabled === false) continue;
      if (!entry.variable || !entry.path) continue;
      variables.set(entry.variable, overrides[entry.variable] ?? entry.path);
    }
  }

  return variables;
}

export async function resolveWorkspacePath(filePath: string): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return filePath;
  }

  const resolver = new PathResolver(await loadWorkspacePathVariables());
  return resolver.resolve(filePath);
}

export async function resolvePreviewPath(filePath: string): Promise<string> {
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

  return resolveWorkspacePath(filePath);
}
