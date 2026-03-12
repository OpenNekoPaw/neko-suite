/**
 * Tool Slice - active tool state
 */
import type { StateCreator } from 'zustand';
import type { ToolType, ShapeType } from '../../types';

export interface ToolSlice {
  activeTool: ToolType;
  activeShapeType: ShapeType;
  setActiveTool: (tool: ToolType) => void;
  setActiveShapeType: (shape: ShapeType) => void;
}

export const createToolSlice: StateCreator<ToolSlice> = (set) => ({
  activeTool: 'brush',
  activeShapeType: 'rectangle',
  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveShapeType: (shape) => set({ activeShapeType: shape }),
});
