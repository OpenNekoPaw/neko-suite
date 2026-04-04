// =============================================================================
// Storage Layout — Unified path management for neko-suite local storage
// =============================================================================
//
// Three-level hierarchy:
//   L0  ~/.neko/              Global (user-level, cross-project)
//   L1  <project>/.neko/      Project (git-tracked source data)
//   L2  <project>/.neko/.cache/  Cache (not tracked, all derived data)
//
// All resolve* functions are pure — no I/O, only path.join.
// =============================================================================

import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** L0: user-level global storage (~/.neko/) */
export interface IGlobalStorageLayout {
  readonly root: string;
  readonly marketCache: string;
  readonly marketInstalled: string;
  readonly conversations: string;
  readonly globalMemory: string;
  readonly config: string;
}

/** L2: project-level cache (.neko/.cache/) — derived, not git-tracked */
export interface ICacheLayout {
  readonly root: string;
  readonly mediaMetadata: string;
  readonly thumbnails: string;
  readonly proxies: string;
  readonly proxyManifest: string;
  readonly generated: string;
  readonly generatedIndex: string;
  readonly vectors: string;
  readonly assetGraph: string;
}

/** L1: project-level source data (.neko/) — git-tracked */
export interface IProjectStorageLayout {
  readonly root: string;
  readonly assetLibrary: string;
  readonly memory: string;
  readonly settings: string;
  readonly settingsLocal: string;
  readonly config: string;
  readonly cache: ICacheLayout;
}

/** Unified storage layout across all levels */
export interface IStorageLayout {
  readonly global: IGlobalStorageLayout;
  readonly project: IProjectStorageLayout;
}

// ---------------------------------------------------------------------------
// Resolve functions (pure, no I/O)
// ---------------------------------------------------------------------------

/** Resolve global storage layout (no workspace needed) */
export function resolveGlobalStorageLayout(): IGlobalStorageLayout {
  const root = path.join(os.homedir(), '.neko');
  return {
    root,
    config: path.join(root, 'config.json'),
    marketCache: path.join(root, 'market-cache'),
    marketInstalled: path.join(root, 'market-installed.json'),
    conversations: path.join(root, 'conversations'),
    globalMemory: path.join(root, 'global-memory.md'),
  };
}

/** Resolve full storage layout for a workspace */
export function resolveStorageLayout(workspaceRoot: string): IStorageLayout {
  const projectRoot = path.join(workspaceRoot, '.neko');
  const cacheRoot = path.join(projectRoot, '.cache');

  return {
    global: resolveGlobalStorageLayout(),
    project: {
      root: projectRoot,
      assetLibrary: path.join(projectRoot, 'assets', 'library.json'),
      memory: path.join(projectRoot, 'memory.md'),
      settings: path.join(projectRoot, 'settings.json'),
      settingsLocal: path.join(projectRoot, 'settings.local.json'),
      config: path.join(projectRoot, 'config.json'),
      cache: {
        root: cacheRoot,
        mediaMetadata: path.join(cacheRoot, 'media-metadata.json'),
        thumbnails: path.join(cacheRoot, 'thumbnails'),
        proxies: path.join(cacheRoot, 'proxies'),
        proxyManifest: path.join(cacheRoot, 'proxies', 'manifest.json'),
        generated: path.join(cacheRoot, 'generated'),
        generatedIndex: path.join(cacheRoot, 'generated', 'index.json'),
        vectors: path.join(cacheRoot, 'vectors'),
        assetGraph: path.join(cacheRoot, 'asset-graph.json'),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/** File system operations required by migrateStorageLayout (injectable for testing) */
export interface MigrateFsOps {
  exists(p: string): Promise<boolean>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(p: string, opts: { recursive: boolean }): Promise<void>;
}

/**
 * One-time migration from legacy paths to the new .cache/ layout.
 * Idempotent — skips if old path doesn't exist or new path already exists.
 * Returns a list of migration actions taken (for logging).
 */
export async function migrateStorageLayout(
  workspaceRoot: string,
  fsOps: MigrateFsOps,
): Promise<string[]> {
  const projectRoot = path.join(workspaceRoot, '.neko');
  const cacheRoot = path.join(projectRoot, '.cache');

  // Order matters: specific paths before the general .neko/cache/ directory
  const migrations: Array<[string, string, string]> = [
    [path.join(projectRoot, 'proxies'), path.join(cacheRoot, 'proxies'), 'proxies'],
    [path.join(projectRoot, 'generated'), path.join(cacheRoot, 'generated'), 'generated'],
    [
      path.join(projectRoot, 'assets', 'thumbnails'),
      path.join(cacheRoot, 'thumbnails'),
      'thumbnails',
    ],
    // General cache dir last — may contain media-metadata.json etc.
    [path.join(projectRoot, 'cache'), cacheRoot, 'cache'],
  ];

  const actions: string[] = [];

  for (const [oldPath, newPath, label] of migrations) {
    const oldExists = await fsOps.exists(oldPath);
    const newExists = await fsOps.exists(newPath);

    if (oldExists && !newExists) {
      await fsOps.mkdir(path.dirname(newPath), { recursive: true });
      await fsOps.rename(oldPath, newPath);
      actions.push(`migrated ${label}: ${oldPath} → ${newPath}`);
    }
  }

  return actions;
}
