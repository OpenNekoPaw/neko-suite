/**
 * Skill marketplace service.
 *
 * This module composes market-core with the platform skill install target. It
 * contains no VS Code APIs; hosts only inject callbacks such as skill refresh.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CacheManager,
  InstallManager,
  InstalledRegistry,
  InstallTargetRegistry,
  LicenseManager,
  MarketClient,
  SkillInstallTarget,
  VersionResolver,
} from '@neko/market-core';
import type {
  IInstallManager,
  IMarketClient,
  InstallProgressCallback,
  InstallResult,
  InstalledPackage,
  MarketSearchQuery,
  MarketSearchResult,
  UpdateInfo,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

export interface SkillMarketSearchQuery {
  text?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sort?: MarketSearchQuery['sort'];
}

export interface SkillMarketServiceOptions {
  marketHome?: string;
  cacheDir?: string;
  installedFile?: string;
  skillsBaseDir?: string;
  nekoSuiteVersion?: string;
  refreshSkills?: () => Promise<void>;
  client?: IMarketClient;
  installManager?: IInstallManager;
}

const logger = getLogger('SkillMarketService');

const DEFAULT_NEKO_HOME = join(homedir(), '.neko');
const DEFAULT_NEKO_SUITE_VERSION = '0.0.1';

export class SkillMarketService {
  private readonly client: IMarketClient;
  private readonly installManager: IInstallManager;
  private readonly ready: Promise<void>;
  private readonly refreshSkills?: () => Promise<void>;

  constructor(options: SkillMarketServiceOptions = {}) {
    this.client = options.client ?? new MarketClient();
    this.refreshSkills = options.refreshSkills;

    if (options.installManager) {
      this.installManager = options.installManager;
      this.ready = Promise.resolve();
      return;
    }

    const marketHome = options.marketHome ?? DEFAULT_NEKO_HOME;
    const cacheDir = options.cacheDir ?? join(marketHome, 'market-cache');
    const installedFile = options.installedFile ?? join(marketHome, 'market-installed.json');
    const installedRegistry = new InstalledRegistry(installedFile);

    const targets = new InstallTargetRegistry();
    targets.register(
      new SkillInstallTarget({
        skillsBaseDir: options.skillsBaseDir ?? join(marketHome, 'skills'),
        refreshSkills: options.refreshSkills,
      }),
    );

    this.installManager = new InstallManager(
      this.client,
      new CacheManager(cacheDir),
      new LicenseManager(),
      new VersionResolver(),
      targets,
      installedRegistry,
      { nekoSuiteVersion: options.nekoSuiteVersion ?? DEFAULT_NEKO_SUITE_VERSION },
    );

    this.ready = installedRegistry.load().catch((error) => {
      logger.error('Failed to load installed skill marketplace registry', error);
    });
  }

  async search(query: SkillMarketSearchQuery): Promise<MarketSearchResult> {
    return this.client.search({
      ...query,
      types: ['skill'],
    });
  }

  async getFeatured(): Promise<MarketSearchResult> {
    const items = await this.client.getFeatured('skill');
    return { items, total: items.length, hasMore: false };
  }

  async install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    await this.ready;
    const result = await this.installManager.install(packageId, version, onProgress);

    if (result.success) {
      logger.info(`Skill installed: ${packageId}@${version}`);
    } else {
      logger.error(`Skill install failed: ${packageId} - ${result.error ?? 'unknown error'}`);
    }

    return result;
  }

  async uninstall(packageId: string): Promise<void> {
    await this.ready;
    await this.installManager.uninstall(packageId);
    await this.refreshSkills?.();
    logger.info(`Skill uninstalled: ${packageId}`);
  }

  async listInstalled(): Promise<InstalledPackage[]> {
    await this.ready;
    const installed = await this.installManager.listInstalled();
    return installed.filter((pkg) => pkg.type === 'skill');
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    await this.ready;
    return this.installManager.checkUpdates();
  }

  dispose(): void {
    // Reserved for future market-core disposables.
  }
}
