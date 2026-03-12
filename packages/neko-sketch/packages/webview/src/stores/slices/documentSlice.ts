/**
 * Document Slice - canvas size, DPI, background, document state
 */
import type { StateCreator } from 'zustand';
import type { CanvasConfig } from '../../types';

export interface DocumentSlice {
  // State
  canvas: CanvasConfig;
  isDirty: boolean;
  documentVersion: string;

  // Actions
  setCanvas: (config: Partial<CanvasConfig>) => void;
  markDirty: () => void;
  markClean: () => void;
}

export const createDocumentSlice: StateCreator<DocumentSlice> = (set) => ({
  canvas: {
    width: 1920,
    height: 1080,
    dpi: 72,
    backgroundColor: '#ffffff',
  },
  isDirty: false,
  documentVersion: '1.0',

  setCanvas: (config) =>
    set((state) => ({
      canvas: { ...state.canvas, ...config },
      isDirty: true,
    })),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
});
