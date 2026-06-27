import type * as vscode from 'vscode';
import { PathResolver } from '../../path';
import { NEKO_EXTENSION_IDS, type NekoAssetsAPI } from '../../types/extension-api';

export interface HostContentPathResolverOptions {
  readonly workspaceRoot?: string;
  readonly getExtension?: <T>(id: string) => vscode.Extension<T> | undefined;
  readonly logger?: {
    warn(message: string, metadata?: Record<string, unknown>): void;
  };
}

export async function createHostContentPathResolver(
  options: HostContentPathResolverOptions = {},
): Promise<PathResolver> {
  const variables = createWorkspacePathVariables(options.workspaceRoot);
  const assetsApi = await getNekoAssetsApi(options);
  const assetVariables = await assetsApi?.getPathVariables?.();
  for (const [key, value] of assetVariables ?? []) {
    if (key && value) {
      variables.set(key, value);
    }
  }
  return new PathResolver(variables);
}

export function createWorkspaceContentPathResolver(
  options: Pick<HostContentPathResolverOptions, 'workspaceRoot'> = {},
): PathResolver {
  return new PathResolver(createWorkspacePathVariables(options.workspaceRoot));
}

export async function getHostContentAuthorizedReadRoots(
  options: HostContentPathResolverOptions = {},
): Promise<string[]> {
  const roots = new Set<string>();
  if (options.workspaceRoot) {
    roots.add(options.workspaceRoot);
  }
  const assetsApi = await getNekoAssetsApi(options);
  for (const root of (await assetsApi?.getMediaLibraryRoots?.()) ?? []) {
    if (root) roots.add(root);
  }
  for (const [, value] of (await assetsApi?.getPathVariables?.()) ?? []) {
    if (value) roots.add(value);
  }
  return Array.from(roots);
}

function createWorkspacePathVariables(workspaceRoot: string | undefined): Map<string, string> {
  const variables = new Map<string, string>();
  if (workspaceRoot) {
    variables.set('WORKSPACE', workspaceRoot);
    variables.set('PROJECT', workspaceRoot);
  }
  return variables;
}

async function getNekoAssetsApi(
  options: HostContentPathResolverOptions,
): Promise<NekoAssetsAPI | undefined> {
  const getExtension = options.getExtension;
  const extension = getExtension
    ? getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS)
    : undefined;
  if (!extension) return undefined;
  try {
    return extension.isActive ? extension.exports : await extension.activate();
  } catch (error) {
    options.logger?.warn('Failed to activate neko-assets for content path variables', { error });
    return undefined;
  }
}
