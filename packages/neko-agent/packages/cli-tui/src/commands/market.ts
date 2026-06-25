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
  InstalledRegistry,
  InstallTargetRegistry,
} from '@neko/market-core';
import type { SlashCommandResult } from '../core/slash-commands';

// ============================================================================
// Setup
// ============================================================================

const NEKO_HOME = path.join(os.homedir(), '.neko');
const CACHE_DIR = path.join(NEKO_HOME, 'market-cache');
const INSTALLED_FILE = path.join(NEKO_HOME, 'market-installed.json');
const SKILLS_BASE = path.join(NEKO_HOME, 'skills');

/** Lazy-initialized shared instances */
let _client: MarketClient | undefined;
let _installManager: InstallManager | undefined;
let _registry: InstalledRegistry | undefined;

function getClient(): MarketClient {
  if (!_client) _client = new MarketClient();
  return _client;
}

async function getInstallManager(): Promise<InstallManager> {
  if (!_installManager) {
    _registry = new InstalledRegistry(INSTALLED_FILE);
    await _registry.load();

    const targets = new InstallTargetRegistry();
    // Inline skill install target (no SkillFileService needed in CLI)
    targets.register({
      type: 'skill' as const,
      getInstallPath: (manifest: { name: string; distribution?: { publisherId?: string } }) => {
        const pub = manifest.distribution?.publisherId ?? 'unknown';
        return path.join(SKILLS_BASE, pub, manifest.name);
      },
    });

    _installManager = new InstallManager(
      getClient(),
      new CacheManager(CACHE_DIR),
      new LicenseManager(),
      new VersionResolver(),
      targets,
      _registry,
      { nekoSuiteVersion: '0.0.1', downloadTempDir: path.join(CACHE_DIR, '.downloads') },
    );
  }
  return _installManager;
}

// ============================================================================
// Handler
// ============================================================================

export async function handleMarketCommand(args: string[]): Promise<SlashCommandResult> {
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
      return showHelp();
  }
}

// ============================================================================
// Subcommands
// ============================================================================

async function handleSearch(args: string[]): Promise<SlashCommandResult> {
  const query = args.join(' ');
  if (!query) {
    return { handled: true, continueExecution: true, error: 'Usage: /market search <query>' };
  }

  try {
    const result = await getClient().search({ text: query, types: ['skill'] });
    if (result.items.length === 0) {
      return {
        handled: true,
        continueExecution: true,
        output: `\nNo results for "${query}"\n`,
      };
    }

    const lines = ['', `Search results for "${query}" (${result.total} total):`, ''];
    for (const item of result.items.slice(0, 10)) {
      const state =
        item.installState === 'installed'
          ? ' [installed]'
          : item.installState === 'update-available'
            ? ' [update available]'
            : '';
      lines.push(`  ${item.manifest.name}  v${item.manifest.version}${state}`);
      if (item.manifest.description) {
        lines.push(`    ${item.manifest.description}`);
      }
      lines.push(`    ID: ${item.id}`);
      lines.push('');
    }
    if (result.hasMore) {
      lines.push(`  … and ${result.total - result.items.length} more`);
    }

    return { handled: true, continueExecution: true, output: lines.join('\n') };
  } catch (error) {
    return { handled: true, continueExecution: true, error: `Search failed: ${String(error)}` };
  }
}

async function handleInstall(args: string[]): Promise<SlashCommandResult> {
  const packageId = args[0];
  if (!packageId) {
    return { handled: true, continueExecution: true, error: 'Usage: /market install <package-id>' };
  }

  const version = args[1] ?? 'latest';
  const manager = await getInstallManager();

  const lines = [''];
  lines.push(`Installing ${packageId}@${version}…`);

  let lastPhase = '';
  const result = await manager.install(packageId, version, (progress) => {
    if (progress.phase !== lastPhase) {
      lastPhase = progress.phase;
      lines.push(`  ${progress.phase}… ${progress.percent}%`);
    }
  });

  if (result.success) {
    lines.push(`✓ Installed ${packageId} → ${result.installedPath ?? 'done'}`);
  } else {
    lines.push(`✗ Install failed: ${result.error}`);
  }
  lines.push('');

  return { handled: true, continueExecution: true, output: lines.join('\n') };
}

async function handleList(): Promise<SlashCommandResult> {
  const manager = await getInstallManager();
  const installed = await manager.listInstalled();

  if (installed.length === 0) {
    return {
      handled: true,
      continueExecution: true,
      output: '\nNo packages installed. Use "/market search" to find packages.\n',
    };
  }

  const lines = ['', `Installed packages (${installed.length}):`, ''];
  for (const pkg of installed) {
    lines.push(`  ${pkg.packageId}  v${pkg.version}  [${pkg.type}]`);
    lines.push(`    Path: ${pkg.installedPath}`);
    lines.push('');
  }

  return { handled: true, continueExecution: true, output: lines.join('\n') };
}

async function handleUpdate(args: string[]): Promise<SlashCommandResult> {
  const targetId = args[0];
  const manager = await getInstallManager();
  const updates = await manager.checkUpdates();

  const targets = targetId ? updates.filter((u) => u.packageId === targetId) : updates;

  if (targets.length === 0) {
    const msg = targetId
      ? `No updates available for "${targetId}"`
      : 'All packages are up to date.';
    return { handled: true, continueExecution: true, output: `\n${msg}\n` };
  }

  const lines = ['', `Updating ${targets.length} package${targets.length !== 1 ? 's' : ''}…`, ''];

  for (const update of targets) {
    lines.push(
      `  Updating ${update.packageId} (${update.currentVersion} → ${update.latestVersion})…`,
    );
    const result = await manager.install(update.packageId, update.latestVersion);
    if (result.success) {
      lines.push(`  ✓ Updated ${update.packageId}`);
    } else {
      lines.push(`  ✗ Failed: ${result.error}`);
    }
  }

  lines.push('');
  return { handled: true, continueExecution: true, output: lines.join('\n') };
}

async function handleUninstall(args: string[]): Promise<SlashCommandResult> {
  const packageId = args[0];
  if (!packageId) {
    return {
      handled: true,
      continueExecution: true,
      error: 'Usage: /market uninstall <package-id>',
    };
  }

  const manager = await getInstallManager();
  try {
    await manager.uninstall(packageId);
    return {
      handled: true,
      continueExecution: true,
      output: `\n✓ Uninstalled ${packageId}\n`,
    };
  } catch (error) {
    return {
      handled: true,
      continueExecution: true,
      error: `Uninstall failed: ${String(error)}`,
    };
  }
}

function showHelp(): SlashCommandResult {
  const lines = [
    '',
    'Neko Marketplace — CLI Commands:',
    '',
    '  /market search <query>       Search for packages',
    '  /market install <id>         Install a package',
    '  /market install <id> <ver>   Install a specific version',
    '  /market list                 List installed packages',
    '  /market update               Update all installed packages',
    '  /market update <id>          Update a specific package',
    '  /market uninstall <id>       Uninstall a package',
    '',
  ];
  return { handled: true, continueExecution: true, output: lines.join('\n') };
}
