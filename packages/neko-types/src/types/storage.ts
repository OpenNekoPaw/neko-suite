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
    },
  };
}
