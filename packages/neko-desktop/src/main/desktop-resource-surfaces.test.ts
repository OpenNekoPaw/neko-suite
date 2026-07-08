import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopResourceSurfaces } from './desktop-resource-surfaces';

let tempRoot: string | undefined;

describe('desktop resource surfaces', () => {
  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('projects configured workspace resources without fabricating catalog data', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-resources-'));
    await mkdir(join(tempRoot, 'neko/assets'), { recursive: true });
    await mkdir(join(tempRoot, 'neko/generated/image'), { recursive: true });
    await mkdir(join(tempRoot, '.neko/providers'), { recursive: true });
    await mkdir(join(tempRoot, '.neko/skills/review'), { recursive: true });
    await writeFile(
      join(tempRoot, 'neko/settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'References', path: '${WORKSPACE}/refs', variable: 'REF' }],
      }),
    );
    await mkdir(join(tempRoot, 'refs'), { recursive: true });
    await writeFile(
      join(tempRoot, 'neko/assets/library.json'),
      JSON.stringify({
        version: 1,
        entities: [
          {
            id: 'entity-1',
            name: 'Scene Bible',
            category: 'document',
            description: 'Project document source.',
            tags: ['document'],
            variants: [
              {
                files: [
                  {
                    path: '${WORKSPACE}/docs/scene-bible.md',
                    mediaType: 'document',
                    status: 'online',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await writeFile(
      join(tempRoot, 'neko/generated/index.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'generated-1',
            path: join(tempRoot, 'neko/generated/image/frame.png'),
            mimeType: 'image/png',
            prompt: 'frame prompt',
            width: 1024,
            height: 768,
            model: 'image-model',
          },
        ],
      }),
    );
    await writeFile(
      join(tempRoot, '.neko/dashboard-activity.json'),
      JSON.stringify({
        version: 1,
        entries: [
          {
            taskId: 'task-1',
            title: 'Image Generation',
            source: 'neko-agent',
            status: 'done',
            outputs: [],
          },
        ],
      }),
    );
    await writeFile(
      join(tempRoot, '.neko/providers/media.card.md'),
      [
        '---',
        'providerId: "media-provider"',
        'capabilities: [image.generate]',
        '---',
        '# Media Provider',
      ].join('\n'),
    );
    await writeFile(
      join(tempRoot, '.neko/skills/review/SKILL.md'),
      [
        '---',
        'name: review',
        'description: Review project artifacts.',
        '---',
        '# Review Skill',
      ].join('\n'),
    );

    const surfaces = await createDesktopResourceSurfaces({ workspaceRoot: tempRoot });
    const assets = surfaces.find((surface) => surface.surfaceId === 'assets');
    const generations = surfaces.find((surface) => surface.surfaceId === 'generations');
    const market = surfaces.find((surface) => surface.surfaceId === 'market');
    const skills = surfaces.find((surface) => surface.surfaceId === 'skills');
    const serialized = JSON.stringify(surfaces);

    expect(assets?.nodes.map((node) => node.label)).toEqual(['Scene Bible', 'References']);
    expect(generations?.nodes.map((node) => node.label)).toEqual([
      'frame.png',
      'Image Generation',
    ]);
    expect(market?.nodes.map((node) => node.label)).toEqual(['media-provider']);
    expect(skills?.nodes.map((node) => node.label)).toEqual(['review']);
    expect(serialized).not.toContain('Storyboard Director');
    expect(serialized).not.toContain('Quality Review');
    expect(serialized).not.toContain('Shot 001 keyframe');
    expect(serialized).not.toContain('Trailer export');
  });

  it('keeps missing optional workspace resource files as empty surfaces', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-resources-empty-'));

    const surfaces = await createDesktopResourceSurfaces({ workspaceRoot: tempRoot });

    expect(surfaces.map((surface) => surface.surfaceId)).toEqual([
      'explorer',
      'assets',
      'generations',
      'market',
      'skills',
      'search',
    ]);
    expect(surfaces.every((surface) => surface.nodes.length === 0)).toBe(true);
  });

  it('fails visibly for malformed workspace resource configuration', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-resources-invalid-'));
    await mkdir(join(tempRoot, 'neko/assets'), { recursive: true });
    await writeFile(join(tempRoot, 'neko/assets/library.json'), JSON.stringify({ entities: {} }));

    await expect(createDesktopResourceSurfaces({ workspaceRoot: tempRoot })).rejects.toThrow(
      'neko/assets/library.json entities must be an array.',
    );
  });
});
