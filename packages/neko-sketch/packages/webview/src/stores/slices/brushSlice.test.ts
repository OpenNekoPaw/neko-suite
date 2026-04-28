import { create } from 'zustand';
import { describe, expect, it } from 'vitest';
import { createBrushSlice, type BrushSlice } from './brushSlice';
import type { TextureStampAsset } from '../../types';

function createBrushStore() {
  return create<BrushSlice>()((...args) => createBrushSlice(...args));
}

function makeAsset(id: string): TextureStampAsset {
  return {
    id,
    name: `${id}.png`,
    dataUrl: 'data:image/png;base64,AQID',
    mimeType: 'image/png',
    width: 8,
    height: 8,
    createdAt: 1,
  };
}

describe('brush slice texture stamp assets', () => {
  it('adds a stamp asset and selects it as the active stamp brush source', () => {
    const store = createBrushStore();
    const asset = makeAsset('stamp-1');

    store.getState().addTextureStampAsset(asset);

    expect(store.getState().textureStampAssets).toEqual([asset]);
    expect(store.getState().brushSettings.type).toBe('stamp');
    expect(store.getState().brushSettings.stampAssetId).toBe(asset.id);
  });

  it('removes the active asset and falls back to a built-in stamp pattern', () => {
    const store = createBrushStore();
    const asset = makeAsset('stamp-1');
    store.getState().addTextureStampAsset(asset);

    store.getState().removeTextureStampAsset(asset.id);

    expect(store.getState().textureStampAssets).toEqual([]);
    expect(store.getState().brushSettings.stampAssetId).toBeNull();
    expect(store.getState().brushSettings.stampPattern).toBe('grain');
  });
});
