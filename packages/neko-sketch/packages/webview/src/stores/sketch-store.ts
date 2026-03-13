/**
 * Combined Zustand store for neko-sketch
 *
 * Composes all slices into a single store following the
 * neko-cut editor-store pattern.
 */
import { create } from 'zustand';
import { createDocumentSlice, type DocumentSlice } from './slices/documentSlice';
import { createLayerSlice, type LayerSlice } from './slices/layerSlice';
import { createToolSlice, type ToolSlice } from './slices/toolSlice';
import { createBrushSlice, type BrushSlice } from './slices/brushSlice';
import { createViewportSlice, type ViewportSlice } from './slices/viewportSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createSelectionSlice, type SelectionSlice } from './slices/selectionSlice';
import { createAnimationSlice, type AnimationSlice } from './slices/animationSlice';
import { createFrameSlice, type FrameSlice } from './slices/frameSlice';
import { createFilterSlice, type FilterSlice } from './slices/filterSlice';
import { createParticleSlice, type ParticleSlice } from './slices/particleSlice';
import { createSceneSlice, type SceneSlice } from './slices/sceneSlice';

export type SketchStore = DocumentSlice &
  LayerSlice &
  ToolSlice &
  BrushSlice &
  ViewportSlice &
  HistorySlice &
  UISlice &
  SelectionSlice &
  AnimationSlice &
  FrameSlice &
  FilterSlice &
  ParticleSlice &
  SceneSlice;

export const useSketchStore = create<SketchStore>()((...a) => ({
  ...createDocumentSlice(...a),
  ...createLayerSlice(...a),
  ...createToolSlice(...a),
  ...createBrushSlice(...a),
  ...createViewportSlice(...a),
  ...createHistorySlice(...a),
  ...createUISlice(...a),
  ...createSelectionSlice(...a),
  ...createAnimationSlice(...a),
  ...createFrameSlice(...a),
  ...createFilterSlice(...a),
  ...createParticleSlice(...a),
  ...createSceneSlice(...a),
}));
