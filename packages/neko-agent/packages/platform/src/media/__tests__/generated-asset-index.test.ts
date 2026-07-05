import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeneratedAsset } from '@neko/shared';
import { GeneratedAssetIndex, generateAssetId } from '../generated-asset-index';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function imageAsset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    id: 'asset-1',
    type: 'generated-image',
    path: '/tmp/a.png',
    mimeType: 'image/png',
    generatedAt: '2026-01-01T00:00:00.000Z',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    ...overrides,
  } as GeneratedAsset;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'neko-generated-index-'));
  tempDirs.push(dir);
  return dir;
}

describe('GeneratedAssetIndex', () => {
  it('adds, filters, sorts and removes generated assets in memory', async () => {
    const dir = await createTempDir();
    const index = new GeneratedAssetIndex(dir);
    const first = imageAsset({
      id: 'asset-1',
      model: 'model-a',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const second = imageAsset({
      id: 'asset-2',
      type: 'generated-video',
      path: '/tmp/b.mp4',
      mimeType: 'video/mp4',
      model: 'model-b',
      generatedAt: '2026-01-02T00:00:00.000Z',
    });

    index.add(first);
    index.add(second);

    expect(index.size).toBe(2);
    expect(index.get('asset-1')).toEqual(first);
    expect(index.list().map((asset) => asset.id)).toEqual(['asset-2', 'asset-1']);
    expect(index.list({ model: 'model-a' })).toEqual([first]);
    expect(index.list({ type: 'generated-video' })).toEqual([second]);
    expect(index.remove('asset-1')).toBe(true);
    expect(index.size).toBe(1);
    index.dispose();
  });

  it('persists pending writes on dispose and loads existing index files', async () => {
    const dir = await createTempDir();
    const index = new GeneratedAssetIndex(dir);
    index.add(imageAsset());
    index.dispose();

    const raw = await readFile(path.join(dir, 'index.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      assets: [imageAsset()],
    });

    const restored = new GeneratedAssetIndex(dir);
    await restored.load();
    expect(restored.get('asset-1')).toEqual(imageAsset());
  });

  it('merges existing on-disk entries before flushing a stale in-memory cache', async () => {
    const dir = await createTempDir();
    const firstWriter = new GeneratedAssetIndex(dir);
    const secondWriter = new GeneratedAssetIndex(dir);
    await firstWriter.load();
    await secondWriter.load();

    firstWriter.add(imageAsset({ id: 'asset-a', path: '/tmp/a.png' }));
    secondWriter.add(imageAsset({ id: 'asset-b', path: '/tmp/b.png' }));
    firstWriter.dispose();
    secondWriter.dispose();

    const raw = await readFile(path.join(dir, 'index.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { assets?: GeneratedAsset[] };
    expect(parsed.assets?.map((asset) => asset.id).sort()).toEqual(['asset-a', 'asset-b']);
  });

  it('ignores missing or malformed index files during load', async () => {
    const dir = await createTempDir();
    const index = new GeneratedAssetIndex(dir);
    await index.load();
    expect(index.size).toBe(0);

    await writeFile(path.join(dir, 'index.json'), '{bad json', 'utf-8');
    await index.load();
    expect(index.size).toBe(0);
  });

  it('generates unique asset ids', () => {
    expect(generateAssetId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
