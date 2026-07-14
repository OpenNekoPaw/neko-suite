import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { SkillInstallTarget, injectMarketFrontmatter } from './skill-install-target';

describe('SkillInstallTarget', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('computes marketplace skill install path from publisher and skill name', () => {
    const target = new SkillInstallTarget({ skillsBaseDir: '/tmp/neko-skills' });

    expect(target.getInstallPath(createSkillManifest())).toBe('/tmp/neko-skills/pub/camera-shot');
  });

  it('installs personal marketplace Skills under the portable user Skill root by default', () => {
    const target = new SkillInstallTarget();

    expect(target.getInstallPath(createSkillManifest())).toBe(
      join(homedir(), '.agents', 'skills', 'pub', 'camera-shot'),
    );
  });

  it('injects and updates market metadata in existing frontmatter', () => {
    const result = injectMarketFrontmatter(
      `---
name: old
source: personal
market-id: "old"
---
`,
      '@pub/new',
    );

    expect(result.match(/^source:/gm)).toHaveLength(1);
    expect(result.match(/^market-id:/gm)).toHaveLength(1);
    expect(result).toContain('source: market');
    expect(result).toContain('market-id: "@pub/new"');
  });

  it('normalizes SKILL.md metadata and refreshes skills after install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-market-skill-'));
    tempDirs.push(root);
    const skillDir = join(root, 'skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: camera-shot
---
`,
      'utf-8',
    );
    const refreshSkills = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const target = new SkillInstallTarget({ refreshSkills });

    await target.onPostInstall(createSkillManifest(), skillDir);

    await expect(readFile(join(skillDir, 'SKILL.md'), 'utf-8')).resolves.toContain(
      'market-id: "@pub/camera-shot"',
    );
    expect(refreshSkills).toHaveBeenCalledTimes(1);
  });
});

function createSkillManifest(): AssetManifest {
  return {
    id: '@pub/camera-shot',
    name: 'camera-shot',
    version: '1.0.0',
    type: 'skill',
    source: {
      kind: 'registry',
      registry: 'test',
      package: '@pub/camera-shot',
      version: '1.0.0',
      integrity: 'sha256-test',
    },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'pub',
      tags: ['skill'],
      checksum: 'sha256-test',
      publisherId: 'pub',
    },
    createdAt: 0,
    updatedAt: 0,
  };
}
