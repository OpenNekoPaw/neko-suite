import { describe, expect, it } from 'vitest';
import type { ISkillFileSystem } from '@neko/shared';
import { SkillLoader } from '../skill-loader';

const PORTABLE_SKILL = `---
name: media-production
description: Convert media inputs into video planning artifacts when a reusable workflow is needed.
license: MIT
compatibility: Requires a Neko media capability.
metadata:
  author: neko
allowed-tools: Read Grep
---

# Media to Video
`;

const NEKO_OVERLAY = `schema_version: 1
interface:
  display_name: Media to Video
  short_description: Plan a video from source media.
dependencies:
  capabilities:
    - id: media.inspect
      requirement: required
relationships:
  skills:
    - name: image
      relationship: delegates-to
`;

describe('SkillLoader portable packages', () => {
  it('loads a minimal external Skill without a manifest or Neko overlay', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/plain/SKILL.md': `---
name: plain
description: Provide plain reusable guidance when a small Skill is sufficient.
---

Follow the requested workflow.
`,
    });
    const loader = new SkillLoader(fs);

    const skill = await loader.loadSkillFromDirectory('/repo/.agents/skills/plain', 'project');

    expect(skill).toMatchObject({
      name: 'plain',
      description: 'Provide plain reusable guidance when a small Skill is sufficient.',
      content: 'Follow the requested workflow.',
      source: 'project',
      directoryPath: '/repo/.agents/skills/plain',
      enabled: true,
      portableDefinition: {
        name: 'plain',
        description: 'Provide plain reusable guidance when a small Skill is sufficient.',
        body: 'Follow the requested workflow.',
      },
    });
    expect(skill?.nekoOverlay).toBeUndefined();
  });

  it('loads portable optional fields and a validated Neko overlay while ignoring poisoned manifests and other Host overlays', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/media-production/SKILL.md': PORTABLE_SKILL,
      '/repo/.agents/skills/media-production/agents/neko.yaml': NEKO_OVERLAY,
      '/repo/.agents/skills/media-production/agents/openai.yaml': 'not: [valid',
      '/repo/.agents/skills/media-production/manifest.json': '{ invalid legacy poison',
    });
    const loader = new SkillLoader(fs);

    const skill = await loader.loadSkillFromDirectory(
      '/repo/.agents/skills/media-production',
      'project',
    );

    expect(skill).toMatchObject({
      name: 'media-production',
      allowedTools: ['Read', 'Grep'],
      portableDefinition: {
        license: 'MIT',
        compatibility: 'Requires a Neko media capability.',
        metadata: { author: 'neko' },
      },
      nekoOverlay: {
        schemaVersion: 1,
        interface: {
          displayName: 'Media to Video',
          shortDescription: 'Plan a video from source media.',
        },
        dependencies: {
          capabilities: [{ id: 'media.inspect', requirement: 'required' }],
        },
        relationships: {
          skills: [{ name: 'image', relationship: 'delegates-to' }],
        },
      },
    });
    expect(fs.readPaths).not.toContain('/repo/.agents/skills/media-production/manifest.json');
    expect(fs.readPaths).not.toContain('/repo/.agents/skills/media-production/agents/openai.yaml');
  });

  it('keeps lazy and full loading on the same portable and overlay validation path', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/media-production': null,
      '/repo/.agents/skills/media-production/SKILL.md': PORTABLE_SKILL,
      '/repo/.agents/skills/media-production/agents/neko.yaml': NEKO_OVERLAY,
      '/repo/.agents/skills/media-production/manifest.json': JSON.stringify({
        enabled: false,
        trusted: true,
        catalog: { actions: ['run'] },
      }),
    });
    const loader = new SkillLoader(fs);

    const result = await loader.loadLazyFromDirectory('/repo/.agents/skills', 'project');

    expect(result.errors).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      name: 'media-production',
      source: 'project',
      directoryPath: '/repo/.agents/skills/media-production',
      portableDefinition: {
        license: 'MIT',
        metadata: { author: 'neko' },
      },
      nekoOverlay: {
        schemaVersion: 1,
        dependencies: {
          capabilities: [{ id: 'media.inspect', requirement: 'required' }],
        },
      },
      isLoaded: false,
    });

    const full = await result.skills[0]?.loadContent();
    expect(full?.portableDefinition).toEqual(result.skills[0]?.portableDefinition);
    expect(full?.nekoOverlay).toEqual(result.skills[0]?.nekoOverlay);
    expect(fs.readPaths).not.toContain('/repo/.agents/skills/media-production/manifest.json');
  });

  it('keeps valid support file references contained within the Skill directory', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/plain/SKILL.md': `---
name: plain
description: Provide plain reusable guidance when a small Skill is sufficient.
---

Read the [checklist](references/checklist.md) before proceeding.
`,
      '/repo/.agents/skills/plain/references/checklist.md': '# Checklist',
    });
    const loader = new SkillLoader(fs);

    const skill = await loader.loadSkillFromDirectory('/repo/.agents/skills/plain', 'project');

    expect(skill?.supportFileRefs).toEqual(['references/checklist.md']);
    expect(fs.existsPaths).toContain('/repo/.agents/skills/plain/references/checklist.md');
  });

  it.each([
    ['../outside.md', 'skill-resource-path-traversal'],
    ['/outside.md', 'skill-resource-path-absolute'],
    [String.raw`C:\outside.md`, 'skill-resource-path-absolute'],
    ['references/./checklist.md', 'skill-resource-path-traversal'],
  ] as const)(
    'fails visibly before filesystem access for invalid support file reference %s',
    async (supportPath, diagnosticCode) => {
      const content = `---
name: plain
description: Provide plain reusable guidance when a small Skill is sufficient.
---

Read [outside](${supportPath}) before proceeding.
`;
      const fs = new MemorySkillFs({
        '/repo/.agents/skills/plain/SKILL.md': content,
        '/repo/.agents/skills/outside.md': '# Outside',
      });
      const loader = new SkillLoader(fs);

      await expect(
        loader.loadSkillFromDirectory('/repo/.agents/skills/plain', 'project'),
      ).rejects.toThrow(diagnosticCode);
      expect(() =>
        loader.loadSkillFromContent(content, 'project', '/repo/.agents/skills/plain'),
      ).toThrow(diagnosticCode);
      expect(fs.existsPaths).toEqual([]);
    },
  );

  it('fails visibly on directory/frontmatter identity mismatch in full and lazy loading', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/wrong-name': null,
      '/repo/.agents/skills/wrong-name/SKILL.md': PORTABLE_SKILL,
    });
    const loader = new SkillLoader(fs);

    await expect(
      loader.loadSkillFromDirectory('/repo/.agents/skills/wrong-name', 'project'),
    ).rejects.toThrow('skill-directory-name-mismatch');

    const lazy = await loader.loadLazyFromDirectory('/repo/.agents/skills', 'project');
    expect(lazy.skills).toEqual([]);
    expect(lazy.errors[0]?.details).toContain('skill-directory-name-mismatch');
  });

  it('fails visibly on invalid or unknown Neko overlay data in full and lazy loading', async () => {
    const fs = new MemorySkillFs({
      '/repo/.agents/skills/media-production': null,
      '/repo/.agents/skills/media-production/SKILL.md': PORTABLE_SKILL,
      '/repo/.agents/skills/media-production/agents/neko.yaml': `schema_version: 2
trusted: true
`,
    });
    const loader = new SkillLoader(fs);

    await expect(
      loader.loadSkillFromDirectory('/repo/.agents/skills/media-production', 'project'),
    ).rejects.toThrow(/neko-overlay-(unknown-field|schema-unsupported)/);

    const lazy = await loader.loadLazyFromDirectory('/repo/.agents/skills', 'project');
    expect(lazy.skills).toEqual([]);
    expect(lazy.errors[0]?.details).toContain('neko-overlay-unknown-field');
    expect(lazy.errors[0]?.details).toContain('neko-overlay-schema-unsupported');
  });
});

class MemorySkillFs implements ISkillFileSystem {
  readonly readPaths: string[] = [];
  readonly existsPaths: string[] = [];

  constructor(private readonly files: Record<string, string | null>) {}

  async exists(path: string): Promise<boolean> {
    this.existsPaths.push(path);
    if (Object.prototype.hasOwnProperty.call(this.files, path)) return true;
    const prefix = `${path}/`;
    return Object.keys(this.files).some((entry) => entry.startsWith(prefix));
  }

  async readDir(path: string): Promise<string[]> {
    const prefix = `${path}/`;
    const entries = new Set<string>();
    for (const entry of Object.keys(this.files)) {
      if (!entry.startsWith(prefix)) continue;
      const rest = entry.slice(prefix.length);
      const first = rest.split('/')[0];
      if (first) entries.add(first);
    }
    return Array.from(entries);
  }

  async readFile(path: string): Promise<string> {
    this.readPaths.push(path);
    const value = this.files[path];
    if (typeof value !== 'string') {
      throw Object.assign(new Error(`File not found: ${path}`), { code: 'ENOENT' });
    }
    return value;
  }

  async isDirectory(path: string): Promise<boolean> {
    if (this.files[path] === null) return true;
    const prefix = `${path}/`;
    return Object.keys(this.files).some((entry) => entry.startsWith(prefix));
  }
}
