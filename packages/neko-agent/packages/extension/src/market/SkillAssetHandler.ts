/**
 * SkillAssetHandler — IAssetHandler implementation for skill assets.
 *
 * Validates skill packages and extracts marketplace metadata.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { AssetValidationResult, IAssetHandler } from '@neko/shared/types/asset/registry';
import type { SkillFrontmatter } from '@neko/shared';
import { SkillLoader, createNodeSkillLoader } from '@neko/agent';

export class SkillAssetHandler implements IAssetHandler<'skill'> {
  readonly type = 'skill' as const;
  private readonly loader: SkillLoader;

  constructor() {
    this.loader = createNodeSkillLoader(fs, path);
  }

  /**
   * Validate that the path contains a valid SKILL.md with correct frontmatter.
   */
  async validate(skillPath: string): Promise<AssetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // Check SKILL.md exists
    try {
      await fs.access(skillMdPath);
    } catch {
      errors.push('Missing SKILL.md file');
      return { valid: false, errors, warnings };
    }

    // Parse frontmatter
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontmatter = this.loader.parseFrontmatterOnly(content);

      if (!frontmatter) {
        errors.push('Invalid or missing YAML frontmatter in SKILL.md');
        return { valid: false, errors, warnings };
      }

      // Narrow to SkillFrontmatter (has 'name' field, not 'command')
      if (!('name' in frontmatter)) {
        errors.push('SKILL.md uses command frontmatter format instead of skill format');
        return { valid: false, errors, warnings };
      }

      const skillFm = frontmatter as SkillFrontmatter;

      if (!skillFm.name) {
        errors.push('Missing required field: name');
      }
      if (!skillFm.description) {
        errors.push('Missing required field: description');
      }

      if (skillFm.name && !/^[a-z0-9-]+$/.test(skillFm.name)) {
        errors.push('Name must contain only lowercase letters, numbers, and hyphens');
      }
    } catch (error) {
      errors.push(
        `Failed to read SKILL.md: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Extract skill-specific metadata from SKILL.md frontmatter.
   */
  async extractMetadata(skillPath: string): Promise<Record<string, unknown>> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontmatter = this.loader.parseFrontmatterOnly(content);

      if (!frontmatter || !('name' in frontmatter)) return {};

      const skillFm = frontmatter as SkillFrontmatter;
      return {
        name: skillFm.name,
        description: skillFm.description,
        icon: skillFm.icon,
        model: skillFm.model,
        hasToolsRef: !!skillFm['tools-ref'],
      };
    } catch {
      return {};
    }
  }

  /**
   * Post-registration hook (no-op: SkillInstallTarget handles hot reload).
   */
  async onInstall(_id: string, _manifest: AssetManifest): Promise<void> {
    // Handled by SkillInstallTarget.onPostInstall
  }

  /**
   * Pre-unregistration hook.
   */
  async onUninstall(_id: string, _manifest: AssetManifest): Promise<void> {
    // Handled by InstallManager + SkillInstallTarget
  }
}
