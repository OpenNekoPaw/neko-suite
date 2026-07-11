import type { SkillFileRuntimeLoader } from '../skill-file-runtime';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LegacySkillMigrationError,
  createLegacySkillMigrationRuntime,
} from '../legacy-skill-migration';
import { createSkillFileRuntime } from '../skill-file-runtime';

const loader: SkillFileRuntimeLoader = {
  loadFromDirectory: vi.fn(async () => ({ skills: [], commands: [], errors: [] })),
  loadLazyFromDirectory: vi.fn(async () => ({ skills: [], commands: [], errors: [] })),
};

describe('LegacySkillMigrationRuntime', () => {
  let root: string;
  let homeDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-skill-migration-'));
    homeDir = path.join(root, 'home');
    workspaceRoot = path.join(root, 'workspace');
    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('plans and atomically creates a portable package while preserving legacy source content', async () => {
    const sourcePath = await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'project',
      name: 'story-helper',
      skillMarkdown: `---
name: story-helper
description: Use this Skill when a story needs focused review.
allowed-tools: Read Grep
icon: assets/icon.svg
---

Review the story structure.
`,
      manifest: {
        version: '1.2.3',
        domain: 'story',
        requiredSubpackages: [
          { id: 'neko-story', required: true },
          { id: 'neko-preview', required: false },
        ],
        referencedSkills: [{ id: 'character-review', relationship: 'collaborator' }],
        profileReferences: [
          {
            profileId: 'story-artifact',
            kind: 'artifact',
            relationship: 'consumes',
            versionRange: '^1.0.0',
          },
        ],
      },
      resources: {
        'assets/icon.svg': '<svg />',
        'references/checklist.md': '# Checklist',
        'scripts/probe.bin': new Uint8Array([0, 1, 2, 255]),
        'agents/other-host.yaml': 'enabled: true\n',
      },
    });
    const runtime = createSkillFileRuntime({
      fs,
      path,
      loader,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill: (input) => runtime.createSkill(input),
    });

    const plan = await migration.plan({
      source: 'project',
      target: 'personal',
      name: 'story-helper',
    });

    expect(plan.sourcePath).toBe(sourcePath);
    expect(plan.targetPath).toBe(path.join(homeDir, '.agents', 'skills', 'story-helper'));
    expect(plan.createInput.skill).toEqual({
      name: 'story-helper',
      description: 'Use this Skill when a story needs focused review.',
      body: 'Review the story structure.',
      metadata: { version: '1.2.3', domain: 'story' },
      allowedTools: ['Read', 'Grep'],
    });
    expect(plan.createInput.neko).toEqual({
      schemaVersion: 1,
      interface: { iconSmall: 'assets/icon.svg' },
      dependencies: {
        capabilities: [
          { id: 'neko-story', requirement: 'required' },
          { id: 'neko-preview', requirement: 'optional' },
        ],
        profiles: [
          {
            id: 'story-artifact',
            kind: 'artifact',
            relationship: 'consumes',
            versionRange: '^1.0.0',
          },
        ],
      },
      relationships: {
        skills: [{ name: 'character-review', relationship: 'collaborator' }],
      },
    });
    expect(plan.createInput.resources?.map((resource) => resource.path)).toEqual([
      'agents/other-host.yaml',
      'assets/icon.svg',
      'references/checklist.md',
      'scripts/probe.bin',
    ]);

    const sourceSkillBefore = await fs.readFile(path.join(sourcePath, 'SKILL.md'), 'utf-8');
    const sourceManifestBefore = await fs.readFile(path.join(sourcePath, 'manifest.json'), 'utf-8');
    const result = await migration.migrate({
      source: 'project',
      target: 'personal',
      name: 'story-helper',
    });
    const targetPath = path.join(homeDir, '.agents', 'skills', 'story-helper');

    expect(result.created).toMatchObject({
      source: 'personal',
      absolutePath: targetPath,
      relativePath: 'story-helper',
    });
    expect(await fs.readFile(path.join(targetPath, 'SKILL.md'), 'utf-8')).toContain(
      'metadata:\n  version: 1.2.3\n  domain: story',
    );
    expect(await fs.readFile(path.join(targetPath, 'agents', 'neko.yaml'), 'utf-8')).toContain(
      'schema_version: 1',
    );
    expect(await fs.readFile(path.join(targetPath, 'agents', 'other-host.yaml'), 'utf-8')).toBe(
      'enabled: true\n',
    );
    expect(await fs.readFile(path.join(targetPath, 'scripts', 'probe.bin'))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
    await expect(fs.access(path.join(targetPath, 'manifest.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await fs.readFile(path.join(sourcePath, 'SKILL.md'), 'utf-8')).toBe(sourceSkillBefore);
    expect(await fs.readFile(path.join(sourcePath, 'manifest.json'), 'utf-8')).toBe(
      sourceManifestBefore,
    );
  });

  it('fails closed on canonical target conflicts without invoking creation or changing either package', async () => {
    const sourcePath = await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'personal',
      name: 'existing-skill',
    });
    const targetPath = path.join(workspaceRoot, '.agents', 'skills', 'existing-skill');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, 'SKILL.md'), 'canonical winner', 'utf-8');
    const createSkill = vi.fn(async () => {
      throw new Error('must not create');
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill,
    });

    await expect(
      migration.migrate({
        source: 'personal',
        target: 'project',
        name: 'existing-skill',
      }),
    ).rejects.toMatchObject({ code: 'migration-target-conflict' });

    expect(createSkill).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(targetPath, 'SKILL.md'), 'utf-8')).toBe('canonical winner');
    await expect(fs.access(path.join(sourcePath, 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(sourcePath, 'manifest.json'))).resolves.toBeUndefined();
  });

  it.each([
    ['host-owned autoInvoke', { autoInvoke: false }],
    [
      'subpackage version constraints',
      { requiredSubpackages: [{ id: 'neko-story', required: true, minVersion: '^2.0.0' }] },
    ],
    ['host-owned catalog policy', { catalog: { editable: true } }],
    [
      'unknown nested dependency fields',
      { requiredSubpackages: [{ id: 'neko-story', required: true, customPolicy: 'legacy' }] },
    ],
  ])('rejects unmappable %s without creating or deleting content', async (_label, manifest) => {
    const sourcePath = await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'personal',
      name: 'unmappable-skill',
      manifest,
    });
    const createSkill = vi.fn(async () => {
      throw new Error('must not create');
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill,
    });

    await expect(
      migration.plan({
        source: 'personal',
        target: 'project',
        name: 'unmappable-skill',
      }),
    ).rejects.toMatchObject({ code: 'migration-data-unmappable' });

    expect(createSkill).not.toHaveBeenCalled();
    await expect(fs.access(path.join(sourcePath, 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(sourcePath, 'manifest.json'))).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(workspaceRoot, '.agents', 'skills', 'unmappable-skill')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a mapped legacy icon when its resource is missing', async () => {
    const sourcePath = await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'personal',
      name: 'missing-icon',
      skillMarkdown: `---
name: missing-icon
description: Use this Skill when icon migration must be validated.
icon: assets/missing.svg
---

Validate the legacy icon.
`,
    });
    const createSkill = vi.fn(async () => {
      throw new Error('must not create');
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill,
    });

    await expect(
      migration.plan({
        source: 'personal',
        target: 'project',
        name: 'missing-icon',
      }),
    ).rejects.toMatchObject({
      code: 'migration-data-unmappable',
      diagnostics: [expect.objectContaining({ code: 'legacy-skill-icon-resource-missing' })],
    });

    expect(createSkill).not.toHaveBeenCalled();
    await expect(fs.access(path.join(sourcePath, 'SKILL.md'))).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(workspaceRoot, '.agents', 'skills', 'missing-icon')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps legacy parsing explicit and cannot use a valid legacy package to mask normal failures', async () => {
    await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'personal',
      name: 'legacy-only',
    });
    const loadedDirectories: string[] = [];
    const normalRuntime = createSkillFileRuntime({
      fs,
      path,
      loader: {
        loadFromDirectory: async (dirPath) => {
          loadedDirectories.push(dirPath);
          if (dirPath.includes(`${path.sep}.neko${path.sep}skills`)) {
            throw new Error('normal loader reached poisoned legacy root');
          }
          if (dirPath.endsWith(path.join('.agents', 'skills'))) {
            throw new Error('canonical package is invalid');
          }
          return { skills: [], commands: [], errors: [] };
        },
        loadLazyFromDirectory: async () => ({ skills: [], commands: [], errors: [] }),
      },
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill: (input) => normalRuntime.createSkill(input),
    });

    const scan = await normalRuntime.scanSkills();
    expect(
      scan.errors.some((error) => error.message.includes('canonical package is invalid')),
    ).toBe(true);
    expect(
      loadedDirectories.some((dirPath) => dirPath.includes(path.join('.neko', 'skills'))),
    ).toBe(false);
    await expect(
      normalRuntime.createSkill({
        target: 'personal',
        skill: {
          name: 'legacy-only',
          description: '',
          body: 'invalid native request',
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid-skill' });
    await expect(
      migration.plan({
        source: 'personal',
        target: 'project',
        name: 'legacy-only',
      }),
    ).resolves.toMatchObject({
      sourcePath: path.join(homeDir, '.neko', 'skills', 'legacy-only'),
      targetPath: path.join(workspaceRoot, '.agents', 'skills', 'legacy-only'),
    });
  });

  it('maps a commit race to a migration conflict and leaves the legacy source intact', async () => {
    const sourcePath = await writeLegacySkill({
      homeDir,
      workspaceRoot,
      source: 'personal',
      name: 'racing-skill',
    });
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill: vi.fn(async () => {
        throw Object.assign(new Error('winner committed first'), {
          code: 'atomic-commit-conflict',
        });
      }),
    });

    await expect(
      migration.migrate({
        source: 'personal',
        target: 'project',
        name: 'racing-skill',
      }),
    ).rejects.toMatchObject({ code: 'migration-target-conflict' });
    await expect(fs.access(path.join(sourcePath, 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(sourcePath, 'manifest.json'))).resolves.toBeUndefined();
  });

  it('returns typed diagnostics for missing legacy sources', async () => {
    const migration = createLegacySkillMigrationRuntime({
      fs,
      path,
      homeDir,
      getWorkspaceRoot: () => workspaceRoot,
      createSkill: vi.fn(async () => {
        throw new Error('must not create');
      }),
    });

    try {
      await migration.plan({ source: 'personal', target: 'project', name: 'missing-skill' });
      throw new Error('Expected migration planning to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(LegacySkillMigrationError);
      expect(error).toMatchObject({
        code: 'migration-source-not-found',
        diagnostics: [
          expect.objectContaining({
            area: 'migration',
            code: 'legacy-migration-source-not-found',
          }),
        ],
      });
    }
  });
});

async function writeLegacySkill(input: {
  readonly homeDir: string;
  readonly workspaceRoot: string;
  readonly source: 'project' | 'personal';
  readonly name: string;
  readonly skillMarkdown?: string;
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly resources?: Readonly<Record<string, string | Uint8Array>>;
}): Promise<string> {
  const root =
    input.source === 'personal'
      ? path.join(input.homeDir, '.neko', 'skills')
      : path.join(input.workspaceRoot, '.neko', 'skills');
  const skillPath = path.join(root, input.name);
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(
    path.join(skillPath, 'SKILL.md'),
    input.skillMarkdown ??
      `---
name: ${input.name}
description: Use this Skill when explicit migration is requested.
---

Follow the legacy instructions.
`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(skillPath, 'manifest.json'),
    JSON.stringify(input.manifest ?? { version: '1.0.0', domain: 'test' }, null, 2),
    'utf-8',
  );
  for (const [relativePath, content] of Object.entries(input.resources ?? {})) {
    const filePath = path.join(skillPath, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
  return skillPath;
}
