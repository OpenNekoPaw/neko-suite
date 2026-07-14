/**
 * /market — CLI commands for Neko Marketplace skill management.
 *
 * Uses @neko/market-core directly (Layer 0, no vscode dependency).
 *
 * Usage:
 *   /market                  — Show help
 *   /market search <query>   — Search for packages
 *   /market install <id>     — Install a package
 *   /market list             — List installed packages
 *   /market update [id]      — Update one or all installed packages
 *   /market uninstall <id>   — Uninstall a package
 */

import * as os from 'os';
import * as path from 'path';
import {
  MarketClient,
  InstallManager,
  CacheManager,
  VersionResolver,
  LicenseManager,
  InstallTargetRegistry,
} from '@neko/market-core';
import type { MarketCommandSemanticResult } from '../presentation/market-presentation';
import { createTuiMarketStorage, type TuiMarketStorage } from '../host/tui-market-storage';

// ============================================================================
// Setup
// ============================================================================

/** Lazy-initialized shared instances */
let _client: MarketClient | undefined;
let _installManager: InstallManager | undefined;
let _storage: TuiMarketStorage | undefined;
let _storagePromise: Promise<TuiMarketStorage> | undefined;

function getClient(): MarketClient {
  if (!_client) _client = new MarketClient();
  return _client;
}

async function getInstallManager(): Promise<InstallManager> {
  if (!_installManager) {
    const storage = await getMarketStorage();

    const targets = new InstallTargetRegistry();
    // Inline skill install target (no SkillFileService needed in CLI)
    targets.register({
      type: 'skill' as const,
      getInstallPath: (manifest: { name: string; distribution?: { publisherId?: string } }) => {
        const pub = manifest.distribution?.publisherId ?? 'unknown';
        return path.join(storage.skillsBase, pub, manifest.name);
      },
    });

    _installManager = new InstallManager(
      getClient(),
      new CacheManager(storage.cacheDir),
      new LicenseManager(),
      new VersionResolver(),
      targets,
      storage.registry,
      {
        nekoSuiteVersion: '0.0.1',
        downloadTempDir: path.join(storage.cacheDir, '.downloads'),
        getWorkspaceTrustLevel: () => 'restricted',
      },
    );
  }
  return _installManager;
}

async function getMarketStorage(): Promise<TuiMarketStorage> {
  if (_storage) return _storage;
  _storagePromise ??= createTuiMarketStorage({ homedir: os.homedir() });
  try {
    _storage = await _storagePromise;
    return _storage;
  } catch (error) {
    _storagePromise = undefined;
    throw error;
  }
}

export async function disposeMarketCommandStorage(): Promise<void> {
  const storage = _storage ?? (await _storagePromise);
  _storage = undefined;
  _storagePromise = undefined;
  _installManager = undefined;
  if (storage) await storage.dispose();
}

// ============================================================================
// Handler
// ============================================================================

export async function handleMarketCommandSemantic(
  args: string[],
): Promise<MarketCommandSemanticResult> {
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'search':
      return handleSearch(args.slice(1));
    case 'install':
      return handleInstall(args.slice(1));
    case 'list':
      return handleList();
    case 'update':
      return handleUpdate(args.slice(1));
    case 'uninstall':
      return handleUninstall(args.slice(1));
    default:
      return { kind: 'help' };
  }
}

async function handleSearch(args: string[]): Promise<MarketCommandSemanticResult> {
  const query = args.join(' ');
  if (!query) return { kind: 'diagnostic', code: 'search-usage' };

  try {
    const result = await getClient().search({ text: query, types: ['skill'] });
    const items = result.items.slice(0, 10).map((item) => ({
      id: item.id,
      name: item.manifest.name,
      version: item.manifest.version,
      ...(item.manifest.distribution?.description
        ? { description: item.manifest.distribution?.description }
        : {}),
      ...(item.installState === 'installed' || item.installState === 'update-available'
        ? { installState: item.installState }
        : {}),
    }));
    return {
      kind: 'search-results',
      query,
      total: result.total,
      items,
      remainingCount: result.hasMore ? Math.max(0, result.total - result.items.length) : 0,
    };
  } catch (error) {
    return operationFailed('search', error);
  }
}

async function handleInstall(args: string[]): Promise<MarketCommandSemanticResult> {
  const packageId = args[0];
  if (!packageId) return { kind: 'diagnostic', code: 'install-usage' };

  const version = args[1] ?? 'latest';
  try {
    const manager = await getInstallManager();
    const phases: { phase: string; percent: number }[] = [];
    let lastPhase = '';
    const result = await manager.install(packageId, version, (progress) => {
      if (progress.phase !== lastPhase) {
        lastPhase = progress.phase;
        phases.push({ phase: progress.phase, percent: progress.percent });
      }
    });
    return {
      kind: 'install-result',
      packageId,
      version,
      phases,
      success: result.success,
      ...(result.installedPath ? { installedPath: result.installedPath } : {}),
      ...(result.error ? { detail: result.error } : {}),
    };
  } catch (error) {
    return operationFailed('install', error);
  }
}

async function handleList(): Promise<MarketCommandSemanticResult> {
  try {
    const manager = await getInstallManager();
    const installed = await manager.listInstalled();
    return {
      kind: 'installed',
      packages: installed.map((item) => ({
        packageId: item.packageId,
        version: item.version,
        type: item.type,
        installedPath: item.installedPath,
      })),
    };
  } catch (error) {
    return operationFailed('list', error);
  }
}

async function handleUpdate(args: string[]): Promise<MarketCommandSemanticResult> {
  const packageId = args[0];
  try {
    const manager = await getInstallManager();
    const available = await manager.checkUpdates();
    const targets = packageId
      ? available.filter((update) => update.packageId === packageId)
      : available;
    if (targets.length === 0) {
      return { kind: 'updates-current', ...(packageId ? { packageId } : {}) };
    }

    const updates = [];
    for (const update of targets) {
      const result = await manager.install(update.packageId, update.latestVersion);
      updates.push({
        packageId: update.packageId,
        currentVersion: update.currentVersion,
        latestVersion: update.latestVersion,
        success: result.success,
        ...(result.error ? { detail: result.error } : {}),
      });
    }
    return { kind: 'updates', updates };
  } catch (error) {
    return operationFailed('update', error);
  }
}

async function handleUninstall(args: string[]): Promise<MarketCommandSemanticResult> {
  const packageId = args[0];
  if (!packageId) return { kind: 'diagnostic', code: 'uninstall-usage' };

  try {
    const manager = await getInstallManager();
    await manager.uninstall(packageId);
    return { kind: 'uninstalled', packageId };
  } catch (error) {
    return operationFailed('uninstall', error);
  }
}

function operationFailed(
  operation: 'search' | 'install' | 'list' | 'update' | 'uninstall',
  error: unknown,
): MarketCommandSemanticResult {
  return {
    kind: 'diagnostic',
    code: 'operation-failed',
    operation,
    detail: error instanceof Error ? error.message : String(error),
  };
}
