import { beforeEach, describe, expect, it } from 'vitest';
import { GeneratedAssetIndex } from '../generatedAssetIndex';
import type { GeneratedAsset } from '@neko/shared';

describe('GeneratedAssetIndex entity projection', () => {
  let index: GeneratedAssetIndex;

  beforeEach(() => {
    index = new GeneratedAssetIndex('/tmp/neko-generated-test');
  });

  it('lists assets by character id', () => {
    const asset = {
      id: 'asset-1',
      type: 'generated-image',
      path: '/tmp/a.png',
      mimeType: 'image/png',
      generatedAt: '2026-04-08T00:00:00.000Z',
      width: 100,
      height: 100,
      ratio: '1:1',
      characterIds: ['char_alice'],
      sourceNodeId: 'shot-1',
    } satisfies GeneratedAsset;

    index.add(asset);

    expect(index.listByCharacterId('char_alice')).toHaveLength(1);
    expect(index.listBySourceNodeId('shot-1')).toHaveLength(1);
  });

  it('lists assets by object id', () => {
    index.add({
      id: 'asset-2',
      type: 'generated-image',
      path: '/tmp/b.png',
      mimeType: 'image/png',
      generatedAt: '2026-04-08T00:00:00.000Z',
      width: 100,
      height: 100,
      ratio: '1:1',
      objectIds: ['obj_ring'],
    } satisfies GeneratedAsset);

    expect(index.listByObjectId('obj_ring')).toHaveLength(1);
  });

  it('projects character-bound assets into occurrence entries', () => {
    index.add({
      id: 'asset-1',
      type: 'generated-image',
      path: '/tmp/a.png',
      mimeType: 'image/png',
      generatedAt: '2026-04-08T00:00:00.000Z',
      width: 100,
      height: 100,
      ratio: '1:1',
      characterIds: ['char_alice'],
    } satisfies GeneratedAsset);

    expect(index.listOccurrencesByCharacterId('char_alice')).toEqual([
      {
        entity: {
          kind: 'character',
          id: 'char_alice',
        },
        source: 'generated-asset',
        sourceId: 'asset-1',
        strength: 'confirmed',
        provenance: 'lineage',
        locator: {
          uri: '/tmp/a.png',
        },
      },
    ]);
  });

  it('projects object-bound assets into occurrence entries', () => {
    index.add({
      id: 'asset-3',
      type: 'generated-image',
      path: '/tmp/c.png',
      mimeType: 'image/png',
      generatedAt: '2026-04-08T00:00:00.000Z',
      width: 100,
      height: 100,
      ratio: '1:1',
      objectIds: ['obj_ring'],
    } satisfies GeneratedAsset);

    expect(index.listOccurrencesByObjectId('obj_ring')).toEqual([
      {
        entity: {
          kind: 'object',
          id: 'obj_ring',
        },
        source: 'generated-asset',
        sourceId: 'asset-3',
        strength: 'confirmed',
        provenance: 'lineage',
        locator: {
          uri: '/tmp/c.png',
        },
      },
    ]);
  });
});
