import { describe, expect, it } from 'vitest';
import type { ISkillFileSystem } from '@neko/shared';
import { SkillLoader } from '../skill-loader';

describe('SkillLoader manifest metadata', () => {
  it('merges sibling manifest.json metadata into fully loaded skills', async () => {
    const loader = new SkillLoader(
      new MemorySkillFs({
        '/repo/.neko/skills/media-to-video/SKILL.md': `---
name: media-to-video
description: Convert media inputs into video planning artifacts.
---

# Media to Video
`,
        '/repo/.neko/skills/media-to-video/manifest.json': JSON.stringify({
          version: '1.0.0',
          domain: 'media',
          referencedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
          mediaWorkflow: {
            acceptedModalities: ['comic'],
            producedArtifacts: ['StoryboardTable'],
            tags: ['media-to-video'],
            costLevel: 'low',
            riskLevel: 'low',
          },
        }),
      }),
    );

    const skill = await loader.loadSkillFromDirectory(
      '/repo/.neko/skills/media-to-video',
      'project',
    );

    expect(skill).toMatchObject({
      name: 'media-to-video',
      version: '1.0.0',
      domain: 'media',
      referencedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
      mediaWorkflow: {
        acceptedModalities: ['comic'],
        producedArtifacts: ['StoryboardTable'],
      },
    });
  });

  it('exposes manifest metadata on lazy skill placeholders before full content load', async () => {
    const loader = new SkillLoader(
      new MemorySkillFs({
        '/repo/.neko/skills/media-to-video': null,
        '/repo/.neko/skills/media-to-video/SKILL.md': `---
name: media-to-video
description: Convert media inputs into video planning artifacts.
---

# Media to Video
`,
        '/repo/.neko/skills/media-to-video/manifest.json': JSON.stringify({
          version: '1.0.0',
          domain: 'media',
          referencedSkills: [{ id: 'image-to-shot', relationship: 'delegator' }],
          mediaWorkflow: {
            acceptedModalities: ['image'],
            producedArtifacts: ['animation-plan'],
          },
        }),
      }),
    );

    const result = await loader.loadLazyFromDirectory('/repo/.neko/skills', 'project');

    expect(result.errors).toEqual([]);
    expect(result.skills[0]).toMatchObject({
      name: 'media-to-video',
      manifest: {
        referencedSkills: [{ id: 'image-to-shot', relationship: 'delegator' }],
        mediaWorkflow: {
          acceptedModalities: ['image'],
          producedArtifacts: ['animation-plan'],
        },
      },
    });
  });

  it('rejects manifest media workflow DSL fields during load', async () => {
    const loader = new SkillLoader(
      new MemorySkillFs({
        '/repo/.neko/skills/media-to-video/SKILL.md': `---
name: media-to-video
description: Convert media inputs into video planning artifacts.
---

# Media to Video
`,
        '/repo/.neko/skills/media-to-video/manifest.json': JSON.stringify({
          version: '1.0.0',
          domain: 'media',
          mediaWorkflow: {
            acceptedModalities: ['comic'],
            steps: ['inspect', 'structure'],
          },
        }),
      }),
    );

    await expect(
      loader.loadSkillFromDirectory('/repo/.neko/skills/media-to-video', 'project'),
    ).rejects.toThrow('mediaWorkflow.steps is not allowed');
  });
});

class MemorySkillFs implements ISkillFileSystem {
  constructor(private readonly files: Record<string, string | null>) {}

  async exists(path: string): Promise<boolean> {
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
    const value = this.files[path];
    if (typeof value !== 'string') {
      throw new Error(`File not found: ${path}`);
    }
    return value;
  }

  async isDirectory(path: string): Promise<boolean> {
    if (this.files[path] === null) return true;
    const prefix = `${path}/`;
    return Object.keys(this.files).some((entry) => entry.startsWith(prefix));
  }
}
