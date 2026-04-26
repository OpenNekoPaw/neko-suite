// =============================================================================
// Storage Layout — Unified path management for neko-suite local storage
// =============================================================================
//
// Three-level hierarchy:
//   L0  ~/.neko/              Global (user-level, cross-project)
//   L1  <project>/.neko/      Project (git-tracked source data)
//   L2  <project>/.neko/.cache/  Cache (not tracked, all derived data)
//
// All resolve* functions are pure — no I/O, only join.
// =============================================================================

// Pure join — no Node.js dependency so this module works in browser/webview bundles.
function join(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? '/' : p.substring(0, idx);
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** L0: user-level global storage (~/.neko/) */
export interface IGlobalStorageLayout {
  readonly root: string;
  readonly marketCache: string;
  readonly marketInstalled: string;
  readonly conversations: string;
  readonly providerCards: string;
  readonly agentsMd: string;
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
  readonly searchIndex: string;
}

/** L1: project-level source data (.neko/) — git-tracked */
export interface IProjectStorageLayout {
  readonly root: string;
  readonly assetLibrary: string;
  readonly memory: string;
  readonly settings: string;
  readonly settingsLocal: string;
  readonly config: string;
  readonly providerCards: string;
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

/** Resolve global storage layout. Pass homedir explicitly (e.g. os.homedir()). */
export function resolveGlobalStorageLayout(homedir: string): IGlobalStorageLayout {
  const root = join(homedir, '.neko');
  return {
    root,
    agentsMd: join(root, 'AGENTS.md'),
    config: join(root, 'config.json'),
    marketCache: join(root, 'market-cache'),
    marketInstalled: join(root, 'market-installed.json'),
    conversations: join(root, 'conversations'),
    providerCards: join(root, 'providers'),
  };
}

/** Resolve full storage layout for a workspace. Pass homedir explicitly (e.g. os.homedir()). */
export function resolveStorageLayout(workspaceRoot: string, homedir: string): IStorageLayout {
  const projectRoot = join(workspaceRoot, '.neko');
  const cacheRoot = join(projectRoot, '.cache');

  return {
    global: resolveGlobalStorageLayout(homedir),
    project: {
      root: projectRoot,
      assetLibrary: join(projectRoot, 'assets', 'library.json'),
      memory: join(projectRoot, 'memory.md'),
      settings: join(projectRoot, 'settings.json'),
      settingsLocal: join(projectRoot, 'settings.local.json'),
      config: join(projectRoot, 'config.json'),
      providerCards: join(projectRoot, 'providers'),
      cache: {
        root: cacheRoot,
        mediaMetadata: join(cacheRoot, 'media-metadata.json'),
        thumbnails: join(cacheRoot, 'thumbnails'),
        proxies: join(cacheRoot, 'proxies'),
        proxyManifest: join(cacheRoot, 'proxies', 'manifest.json'),
        generated: join(cacheRoot, 'generated'),
        generatedIndex: join(cacheRoot, 'generated', 'index.json'),
        vectors: join(cacheRoot, 'vectors'),
        assetGraph: join(cacheRoot, 'asset-graph.json'),
        searchIndex: join(cacheRoot, 'search-index.json'),
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
  const projectRoot = join(workspaceRoot, '.neko');
  const cacheRoot = join(projectRoot, '.cache');

  // Order matters: specific paths before the general .neko/cache/ directory
  const migrations: Array<[string, string, string]> = [
    [join(projectRoot, 'proxies'), join(cacheRoot, 'proxies'), 'proxies'],
    [join(projectRoot, 'generated'), join(cacheRoot, 'generated'), 'generated'],
    [join(projectRoot, 'assets', 'thumbnails'), join(cacheRoot, 'thumbnails'), 'thumbnails'],
    // General cache dir last — may contain media-metadata.json etc.
    [join(projectRoot, 'cache'), cacheRoot, 'cache'],
  ];

  const actions: string[] = [];

  for (const [oldPath, newPath, label] of migrations) {
    const oldExists = await fsOps.exists(oldPath);
    const newExists = await fsOps.exists(newPath);

    if (oldExists && !newExists) {
      await fsOps.mkdir(dirname(newPath), { recursive: true });
      await fsOps.rename(oldPath, newPath);
      actions.push(`migrated ${label}: ${oldPath} → ${newPath}`);
    }
  }

  return actions;
}
