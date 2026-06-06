// =============================================================================
// Storage Layout — Unified path management for neko-suite local storage
// =============================================================================
//
// Four-level hierarchy:
//   L0   ~/.neko/               Global (user-level, cross-project)
//   L1a  <project>/neko/        Project facts (git-tracked, team-shared)
//   L1b  <project>/.neko/       Project local (gitignored, machine-specific)
//   L2   <project>/.neko/.cache/  Cache (derived data, not tracked)
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

/** L1a: project facts (neko/) — git-tracked, team-shared */
export interface IProjectFactsLayout {
  readonly root: string;
  readonly settings: string;
  readonly config: string;
  readonly assetLibrary: string;
  readonly providerCards: string;
  readonly entityBindings: string;
  readonly visualIdentityDrafts: string;
  readonly entityAssetRequirements: string;
}

/** L2: project-level cache (.neko/.cache/) — derived, not git-tracked */
export interface ICacheLayout {
  readonly root: string;
  readonly mediaMetadata: string;
  readonly thumbnails: string;
  readonly resources: string;
  readonly resourceManifest: string;
  readonly database: string;
  readonly proxies: string;
  readonly proxyManifest: string;
  readonly generated: string;
  readonly generatedIndex: string;
  readonly vectors: string;
  readonly assetGraph: string;
  readonly searchIndex: string;
}

/** L1b: project local (.neko/) — gitignored, machine-specific */
export interface IProjectLocalLayout {
  readonly root: string;
  readonly settingsLocal: string;
  readonly memory: string;
  readonly cache: ICacheLayout;
}

/** L1: project-level storage (combines facts + local) */
export interface IProjectStorageLayout {
  readonly facts: IProjectFactsLayout;
  readonly local: IProjectLocalLayout;

  // -- Deprecated compat aliases — migrate to facts.* / local.* --

  /** @deprecated Use facts.root */
  readonly root: string;
  /** @deprecated Use facts.assetLibrary */
  readonly assetLibrary: string;
  /** @deprecated Use local.memory */
  readonly memory: string;
  /** @deprecated Use facts.settings */
  readonly settings: string;
  /** @deprecated Use local.settingsLocal */
  readonly settingsLocal: string;
  /** @deprecated Use facts.config */
  readonly config: string;
  /** @deprecated Use facts.providerCards */
  readonly providerCards: string;
  /** @deprecated Use local.cache */
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
  const factsRoot = join(workspaceRoot, 'neko');
  const localRoot = join(workspaceRoot, '.neko');
  const cacheRoot = join(localRoot, '.cache');

  const facts: IProjectFactsLayout = {
    root: factsRoot,
    settings: join(factsRoot, 'settings.json'),
    config: join(factsRoot, 'config.json'),
    assetLibrary: join(factsRoot, 'assets', 'library.json'),
    providerCards: join(factsRoot, 'providers'),
    entityBindings: join(factsRoot, 'entity-bindings.json'),
    visualIdentityDrafts: join(factsRoot, 'visual-identity-drafts.json'),
    entityAssetRequirements: join(factsRoot, 'entity-asset-requirements.json'),
  };

  const cache: ICacheLayout = {
    root: cacheRoot,
    mediaMetadata: join(cacheRoot, 'media-metadata.json'),
    thumbnails: join(cacheRoot, 'thumbnails'),
    resources: join(cacheRoot, 'resources'),
    resourceManifest: join(cacheRoot, 'resources', 'manifest.json'),
    database: join(cacheRoot, 'neko-cache.db'),
    proxies: join(cacheRoot, 'proxies'),
    proxyManifest: join(cacheRoot, 'proxies', 'manifest.json'),
    generated: join(cacheRoot, 'generated'),
    generatedIndex: join(cacheRoot, 'generated', 'index.json'),
    vectors: join(cacheRoot, 'vectors'),
    assetGraph: join(cacheRoot, 'asset-graph.json'),
    searchIndex: join(cacheRoot, 'search-index.json'),
  };

  const local: IProjectLocalLayout = {
    root: localRoot,
    settingsLocal: join(localRoot, 'settings.local.json'),
    memory: join(localRoot, 'memory.md'),
    cache,
  };

  return {
    global: resolveGlobalStorageLayout(homedir),
    project: {
      facts,
      local,
      // Deprecated compat aliases
      root: facts.root,
      assetLibrary: facts.assetLibrary,
      memory: local.memory,
      settings: facts.settings,
      settingsLocal: local.settingsLocal,
      config: facts.config,
      providerCards: facts.providerCards,
      cache,
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
  /** Merge legacy content into an existing target without overwriting target files. */
  copy?(oldPath: string, newPath: string): Promise<void>;
  rm?(p: string, opts: { recursive: boolean; force: boolean }): Promise<void>;
}

/**
 * One-time migration from legacy paths to the new layout.
 * Idempotent — skips if old path doesn't exist or new path already exists.
 * Returns a list of migration actions taken (for logging).
 *
 * Handles two migration waves:
 *  1. Legacy cache paths → .neko/.cache/ (existing)
 *  2. Project facts from .neko/ → neko/ (new split)
 */
export async function migrateStorageLayout(
  workspaceRoot: string,
  fsOps: MigrateFsOps,
): Promise<string[]> {
  const oldProjectRoot = join(workspaceRoot, '.neko');
  const cacheRoot = join(oldProjectRoot, '.cache');
  const factsRoot = join(workspaceRoot, 'neko');

  // Wave 1: legacy cache paths → .neko/.cache/ (existing migrations)
  const cacheMigrations: Array<[string, string, string]> = [
    [join(oldProjectRoot, 'proxies'), join(cacheRoot, 'proxies'), 'proxies'],
    [join(oldProjectRoot, 'generated'), join(cacheRoot, 'generated'), 'generated'],
    [join(oldProjectRoot, 'assets', 'thumbnails'), join(cacheRoot, 'thumbnails'), 'thumbnails'],
    [join(oldProjectRoot, 'cache'), cacheRoot, 'cache'],
  ];

  // Wave 2: project facts from .neko/ → neko/
  const factsMigrations: Array<[string, string, string]> = [
    [join(oldProjectRoot, 'settings.json'), join(factsRoot, 'settings.json'), 'settings'],
    [join(oldProjectRoot, 'config.json'), join(factsRoot, 'config.json'), 'config'],
    [join(oldProjectRoot, 'assets'), join(factsRoot, 'assets'), 'assets'],
    [join(oldProjectRoot, 'providers'), join(factsRoot, 'providers'), 'providers'],
    [
      join(oldProjectRoot, 'entity-bindings.json'),
      join(factsRoot, 'entity-bindings.json'),
      'entity-bindings',
    ],
    [
      join(oldProjectRoot, 'visual-identity-drafts.json'),
      join(factsRoot, 'visual-identity-drafts.json'),
      'visual-identity-drafts',
    ],
    [
      join(oldProjectRoot, 'entity-asset-requirements.json'),
      join(factsRoot, 'entity-asset-requirements.json'),
      'entity-asset-requirements',
    ],
  ];

  const actions: string[] = [];

  // Run cache migrations first (so .neko/assets/thumbnails moves before .neko/assets/)
  for (const [oldPath, newPath, label] of cacheMigrations) {
    const oldExists = await fsOps.exists(oldPath);
    const newExists = await fsOps.exists(newPath);

    if (oldExists && !newExists) {
      await fsOps.mkdir(dirname(newPath), { recursive: true });
      await fsOps.rename(oldPath, newPath);
      actions.push(`migrated ${label}: ${oldPath} → ${newPath}`);
    } else if (oldExists && newExists && fsOps.copy && fsOps.rm) {
      await fsOps.mkdir(dirname(newPath), { recursive: true });
      await fsOps.copy(oldPath, newPath);
      await fsOps.rm(oldPath, { recursive: true, force: true });
      actions.push(`merged and removed legacy ${label}: ${oldPath} → ${newPath}`);
    }
  }

  // Then migrate project facts to neko/
  for (const [oldPath, newPath, label] of factsMigrations) {
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
