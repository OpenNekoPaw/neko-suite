import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PathResolver, type PathVariableMap } from '@neko/shared';

const PATH_VARIABLE_RE = /\$\{[^}]+\}/;

export function hasPathVariable(src: string): boolean {
  return PATH_VARIABLE_RE.test(src);
}

export async function resolveMediaSrcPath(jviDir: string, src: string): Promise<string> {
  if (!hasPathVariable(src)) {
    if (path.isAbsolute(src)) return src;
    return path.resolve(jviDir, src);
  }

  try {
    const resolved = await vscode.commands.executeCommand<string>('neko.assets.resolvePath', src);
    if (resolved && !hasPathVariable(resolved)) return resolved;
  } catch {
    // neko-assets not active
  }

  const resolver = new PathResolver(await loadWorkspacePathVariables());
  const expanded = resolver.resolve(src);
  return path.isAbsolute(expanded) ? expanded : path.resolve(jviDir, expanded);
}

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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function loadWorkspacePathVariables(): Promise<PathVariableMap> {
  const variables: PathVariableMap = new Map();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of workspaceFolders) {
    const settingsPath = path.join(folder.uri.fsPath, 'neko', 'settings.json');
    const localSettingsPath = path.join(folder.uri.fsPath, '.neko', 'settings.local.json');
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
