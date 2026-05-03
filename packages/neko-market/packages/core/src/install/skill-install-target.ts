/**
 * Marketplace install target for skill packages.
 *
 * market-core owns marketplace skill layout and metadata normalization. Hosts
 * may inject refresh callbacks, but should not reimplement skill install paths.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

export interface SkillInstallTargetOptions {
  skillsBaseDir?: string;
  refreshSkills?: () => Promise<void>;
  logger?: SkillInstallTargetLogger;
}

export interface SkillInstallTargetLogger {
  info(message: string): void;
  warn(message: string, error?: unknown): void;
}

const DEFAULT_SKILLS_BASE_DIR = join(homedir(), '.neko', 'skills');

export class SkillInstallTarget implements IInstallTarget<'skill'> {
  readonly type = 'skill' as const;

  private readonly skillsBaseDir: string;
  private readonly refreshSkills?: () => Promise<void>;
  private readonly logger?: SkillInstallTargetLogger;

  constructor(options: SkillInstallTargetOptions = {}) {
    this.skillsBaseDir = options.skillsBaseDir ?? DEFAULT_SKILLS_BASE_DIR;
    this.refreshSkills = options.refreshSkills;
    this.logger = options.logger;
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return join(this.skillsBaseDir, publisherId, manifest.name);
  }

  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    await this.injectMarketMetadata(installedPath, manifest.id);
    await this.refreshSkills?.();
    this.logger?.info(`Skill installed: ${manifest.id} -> ${installedPath}`);
  }

  async onPreUninstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    // The service refreshes after InstallManager removes files, so scanners see
    // the final filesystem state instead of the pre-delete directory.
  }

  private async injectMarketMetadata(installedPath: string, marketId: string): Promise<void> {
    const skillMdPath = join(installedPath, 'SKILL.md');

    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const updated = injectMarketFrontmatter(content, marketId);
      if (updated !== content) {
        await writeFile(skillMdPath, updated, 'utf-8');
      }
    } catch (error) {
      this.logger?.warn(`Failed to inject market metadata into ${skillMdPath}`, error);
    }
  }
}

export function injectMarketFrontmatter(content: string, marketId: string): string {
  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch?.[0]) {
    return content;
  }

  let block = frontmatterMatch[0];
  block = upsertFrontmatterField(block, 'source', 'market');
  block = upsertFrontmatterField(block, 'market-id', `"${marketId}"`);

  return `${block}${content.slice(frontmatterMatch[0].length)}`;
}

function upsertFrontmatterField(block: string, key: string, value: string): string {
  const fieldPattern = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, 'm');
  if (fieldPattern.test(block)) {
    return block.replace(fieldPattern, `${key}: ${value}`);
  }

  return block.replace(/\r?\n---$/, `\n${key}: ${value}\n---`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
