import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHomeResourceSurfaceSnapshot } from './home-resource-surfaces';

let tempRoot: string | undefined;

describe('home resource surfaces', () => {
  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('projects configured workspace resources without fabricating catalog data', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-home-resources-'));
    await mkdir(join(tempRoot, 'neko/assets'), { recursive: true });
    await mkdir(join(tempRoot, 'neko/generated/image'), { recursive: true });
    await mkdir(join(tempRoot, '.neko/providers'), { recursive: true });
    await mkdir(join(tempRoot, '.agents/skills/review'), { recursive: true });
    await writeFile(
      join(tempRoot, 'neko/settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'References', path: '${WORKSPACE}/refs', variable: 'REF' }],
      }),
    );
    await mkdir(join(tempRoot, 'refs'), { recursive: true });
    await writeFile(join(tempRoot, 'neko/generated/image/frame.png'), 'image-bytes');
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
            id: 'legacy-generated-1',
            path: join(tempRoot, 'neko/generated/image/legacy-only.png'),
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
      join(tempRoot, '.agents/skills/review/SKILL.md'),
      [
        '---',
        'name: review',
        'description: Review project artifacts.',
        '---',
        '# Review Skill',
      ].join('\n'),
    );

    const snapshot = await createHomeResourceSurfaceSnapshot({ workspaceRoot: tempRoot });
    const surfaces = snapshot.resourceSurfaces;
    const assets = surfaces.find((surface) => surface.surfaceId === 'assets');
    const generations = surfaces.find((surface) => surface.surfaceId === 'generations');
    const market = surfaces.find((surface) => surface.surfaceId === 'market');
    const skills = surfaces.find((surface) => surface.surfaceId === 'skills');
    const serialized = JSON.stringify(surfaces);
    const serializedProviders = JSON.stringify(snapshot.providerSnapshots);

    expect(assets?.nodes.map((node) => node.label)).toEqual(['Scene Bible', 'References']);
    expect(generations?.nodes.map((node) => node.label)).toEqual(['frame.png', 'Image Generation']);
    expect(market?.nodes.map((node) => node.label)).toEqual(['media-provider']);
    expect(skills?.nodes.map((node) => node.label)).toEqual(['review']);
    expect(serialized).not.toContain('Storyboard Director');
    expect(serialized).not.toContain('Quality Review');
    expect(serialized).not.toContain('Shot 001 keyframe');
    expect(serialized).not.toContain('Trailer export');
    expect(serialized).not.toContain('legacy-only.png');
    expect(snapshot.providerSnapshots.map((provider) => provider.provider.providerId)).toEqual([
      'assets',
      'media-library',
      'generation-outputs',
      'render-queue',
      'provider-cards',
      'skills',
    ]);
    expect(snapshot.providerSnapshots.map((provider) => provider.provider.providerKind)).toEqual(
      Array.from({ length: 6 }, () => 'domain-provider'),
    );
    expect(snapshot.providerSnapshots.map((provider) => provider.provider.ownerId)).toEqual([
      'neko-assets',
      'neko-assets',
      '@neko-agent/platform',
      '@neko-agent/platform',
      'neko-market',
      '@neko/skills',
    ]);
    expect(
      snapshot.providerSnapshots.find(
        (provider) => provider.provider.providerId === 'media-library',
      )?.resourceNodes?.[0]?.stableRef.id,
    ).toBe('REF');
    expect(serializedProviders).not.toContain(tempRoot);
  });

  it('keeps missing optional workspace resource files as empty surfaces', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-home-resources-empty-'));

    const snapshot = await createHomeResourceSurfaceSnapshot({ workspaceRoot: tempRoot });
    const surfaces = snapshot.resourceSurfaces;

    expect(surfaces.map((surface) => surface.surfaceId)).toEqual([
      'assets',
      'generations',
      'market',
      'skills',
    ]);
    expect(surfaces.every((surface) => surface.nodes.length === 0)).toBe(true);
    expect(snapshot.providerSnapshots).toEqual([]);
  });

  it('fails visibly for malformed workspace resource configuration', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-home-resources-invalid-'));
    await mkdir(join(tempRoot, 'neko/assets'), { recursive: true });
    await writeFile(join(tempRoot, 'neko/assets/library.json'), JSON.stringify({ entities: {} }));

    await expect(createHomeResourceSurfaceSnapshot({ workspaceRoot: tempRoot })).rejects.toThrow(
      'neko/assets/library.json entities must be an array.',
    );
  });
});
