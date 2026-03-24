/**
 * SkillMarketService — Orchestrates marketplace operations for skills.
 *
 * Composes @neko/market-core components with SkillFileService
 * to provide a unified skill marketplace API for the extension layer.
 */

import * as vscode from 'vscode';
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
import type {
  MarketSearchQuery,
  MarketSearchResult,
  InstallResult,
  InstallProgress,
  InstalledPackage,
  UpdateInfo,
} from '@neko/shared/types/asset/market';

import { SkillInstallTarget } from './SkillInstallTarget';
import type { SkillFileService } from '../services/SkillFileService';
import { getLogger } from '../base';

const logger = getLogger('SkillMarketService');

/** Neko home directory for marketplace data */
const NEKO_HOME = path.join(os.homedir(), '.neko');
const CACHE_DIR = path.join(NEKO_HOME, 'market-cache');
const INSTALLED_FILE = path.join(NEKO_HOME, 'market-installed.json');

export class SkillMarketService implements vscode.Disposable {
  private readonly client: MarketClient;
  private readonly installManager: InstallManager;
  private readonly installedRegistry: InstalledRegistry;
  private readonly disposables: vscode.Disposable[] = [];

  // Progress events (adapted from callback to vscode.Event)
  private readonly _onInstallProgress = new vscode.EventEmitter<InstallProgress>();
  readonly onInstallProgress = this._onInstallProgress.event;

  constructor(skillFileService: SkillFileService) {
    // Initialize market-core components
    this.client = new MarketClient();
    const cache = new CacheManager(CACHE_DIR);
    const versionResolver = new VersionResolver();
    const license = new LicenseManager();
    this.installedRegistry = new InstalledRegistry(INSTALLED_FILE);

    // Register skill install target
    const targets = new InstallTargetRegistry();
    targets.register(new SkillInstallTarget(skillFileService));

    this.installManager = new InstallManager(
      this.client,
      cache,
      license,
      versionResolver,
      targets,
      this.installedRegistry,
      { nekoSuiteVersion: '0.0.1' }, // TODO: read from package.json
    );

    // Load installed registry
    this.installedRegistry.load().catch((err) => {
      logger.error('Failed to load installed registry', err);
    });

    this.disposables.push(this._onInstallProgress);
  }

  // ===========================================================================
  // Search
  // ===========================================================================

  async search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    // Scope to skill type
    const skillQuery: MarketSearchQuery = {
      ...query,
      types: ['skill'],
    };
    return this.client.search(skillQuery);
  }

  async getFeatured(): Promise<MarketSearchResult> {
    const items = await this.client.getFeatured('skill');
    return { items, total: items.length, hasMore: false };
  }

  // ===========================================================================
  // Install / Uninstall
  // ===========================================================================

  async install(packageId: string, version: string): Promise<InstallResult> {
    const result = await this.installManager.install(packageId, version, (progress) =>
      this._onInstallProgress.fire(progress),
    );

    if (result.success) {
      logger.info(`Skill installed: ${packageId}@${version}`);
    } else {
      logger.error(`Skill install failed: ${packageId} — ${result.error}`);
    }

    return result;
  }

  async uninstall(packageId: string): Promise<void> {
    await this.installManager.uninstall(packageId);
    logger.info(`Skill uninstalled: ${packageId}`);
  }

  // ===========================================================================
  // Installed Packages
  // ===========================================================================

  async listInstalled(): Promise<InstalledPackage[]> {
    const all = await this.installManager.listInstalled();
    // Filter to only skill type
    return all.filter((pkg) => pkg.type === 'skill');
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    return this.installManager.checkUpdates();
  }

  // ===========================================================================
  // Disposable
  // ===========================================================================

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
