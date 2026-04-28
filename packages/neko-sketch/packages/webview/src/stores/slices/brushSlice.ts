/**
 * Brush Slice - brush settings state
 */
import type { StateCreator } from 'zustand';
import type { BrushSettings, BrushType, SymmetryConfig, TextureStampAsset } from '../../types';
import { getDefaultBrushSettings } from '../../brush';

export interface BrushSlice {
  brushSettings: BrushSettings;
  symmetry: SymmetryConfig;
  textureStampAssets: readonly TextureStampAsset[];
  setBrushSettings: (updates: Partial<BrushSettings>) => void;
  setSymmetry: (updates: Partial<SymmetryConfig>) => void;
  setBrushType: (type: BrushType) => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  addTextureStampAsset: (asset: TextureStampAsset) => void;
  removeTextureStampAsset: (assetId: string) => void;
}

export const createBrushSlice: StateCreator<BrushSlice> = (set) => ({
  brushSettings: getDefaultBrushSettings('pen'),
  symmetry: { mode: 'none', axisX: 0, axisY: 0, radialCount: 4 },
  textureStampAssets: [],

  setBrushSettings: (updates) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, ...updates },
    })),

  setBrushType: (type) =>
    set((state) => ({
      brushSettings: {
        ...getDefaultBrushSettings(type, state.brushSettings.color),
      },
    })),

  setBrushColor: (color) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, color },
    })),

  setBrushSize: (size) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, size: Math.max(1, Math.min(500, size)) },
    })),

  setBrushOpacity: (opacity) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, opacity: Math.max(0, Math.min(1, opacity)) },
    })),

  setSymmetry: (updates) =>
    set((state) => ({
      symmetry: { ...state.symmetry, ...updates },
    })),

  addTextureStampAsset: (asset) =>
    set((state) => ({
      textureStampAssets: [
        ...state.textureStampAssets.filter((item) => item.id !== asset.id),
        asset,
      ],
      brushSettings: {
        ...state.brushSettings,
        type: 'stamp',
        stampAssetId: asset.id,
      },
    })),

  removeTextureStampAsset: (assetId) =>
    set((state) => ({
      textureStampAssets: state.textureStampAssets.filter((item) => item.id !== assetId),
      brushSettings:
        state.brushSettings.stampAssetId === assetId
          ? {
              ...state.brushSettings,
              stampAssetId: null,
              stampPattern: state.brushSettings.stampPattern ?? 'grain',
            }
          : state.brushSettings,
    })),
});
