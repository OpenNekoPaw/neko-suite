/**
 * SkillInstallTarget — Install target for marketplace skills.
 *
 * Determines where skills are installed and triggers
 * SkillFileService rescan after installation.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';
import type { SkillFileService } from '../services/SkillFileService';
import { getLogger } from '../base';

const logger = getLogger('SkillInstallTarget');

/** Base directory for marketplace-installed skills */
const MARKET_SKILLS_BASE = path.join(os.homedir(), '.neko', 'skills');

export class SkillInstallTarget implements IInstallTarget<'skill'> {
  readonly type = 'skill' as const;

  constructor(private readonly skillFileService: SkillFileService) {}

  /**
   * Compute install path: ~/.neko/skills/{publisherId}/{skillName}/
   */
  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    const skillName = manifest.name;
    return path.join(MARKET_SKILLS_BASE, publisherId, skillName);
  }

  /**
   * Post-install: inject market source into SKILL.md frontmatter,
   * then trigger SkillFileService rescan for hot reload.
   */
  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    // Inject market metadata into SKILL.md frontmatter
    const skillMdPath = path.join(installedPath, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const updated = this.injectMarketSource(content, manifest.id);
      await fs.writeFile(skillMdPath, updated, 'utf-8');
    } catch (error) {
      logger.warn(`Failed to inject market metadata into ${skillMdPath}`, error);
    }

    // Trigger SkillFileService rescan
    await this.skillFileService.scanSkills();
    logger.info(`Skill installed: ${manifest.id} → ${installedPath}`);
  }

  /**
   * Pre-uninstall: trigger SkillFileService rescan after removal.
   */
  async onPreUninstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    // Rescan will happen after the directory is deleted by InstallManager
    // We schedule a delayed rescan via setTimeout in the service layer
  }

  /**
   * Inject `source: market` and `market-id` into SKILL.md YAML frontmatter.
   */
  private injectMarketSource(content: string, marketId: string): string {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) return content;

    const frontmatter = content.slice(0, frontmatterEnd);
    const body = content.slice(frontmatterEnd);

    // Check if already has source field
    if (frontmatter.includes('source:')) {
      return content;
    }

    // Inject before closing ---
    const injection = `source: market\nmarket-id: "${marketId}"\n`;
    return frontmatter + injection + body;
  }
}
