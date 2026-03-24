/**
 * SkillInstallTarget — Install target for marketplace skills.
 *
 * Standalone version (no SkillFileService dependency).
 * Hot-reload is handled by neko-agent's file watchers on ~/.neko/skills/.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

/** Base directory for marketplace-installed skills */
const MARKET_SKILLS_BASE = path.join(os.homedir(), '.neko', 'skills');

export class SkillInstallTarget implements IInstallTarget<'skill'> {
  readonly type = 'skill' as const;

  /**
   * Compute install path: ~/.neko/skills/{publisherId}/{skillName}/
   */
  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(MARKET_SKILLS_BASE, publisherId, manifest.name);
  }

  /**
   * Post-install: inject market source into SKILL.md frontmatter.
   */
  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    const skillMdPath = path.join(installedPath, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const updated = this._injectMarketSource(content, manifest.id);
      await fs.writeFile(skillMdPath, updated, 'utf-8');
    } catch {
      // SKILL.md may not exist — not a fatal error
    }
  }

  private _injectMarketSource(content: string, marketId: string): string {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) return content;

    const frontmatter = content.slice(0, frontmatterEnd);
    const body = content.slice(frontmatterEnd);

    if (frontmatter.includes('source:')) return content;

    return frontmatter + `source: market\nmarket-id: "${marketId}"\n` + body;
  }
}
