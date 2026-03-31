/**
 * Tool Slice - active tool state
 */
import type { StateCreator } from 'zustand';
import type { ToolType, ShapeType } from '../../types';

export interface ToolSlice {
  activeTool: ToolType;
  activeShapeType: ShapeType;
  polygonSides: number;
  starPoints: number;
  setActiveTool: (tool: ToolType) => void;
  setActiveShapeType: (shape: ShapeType) => void;
  setPolygonSides: (sides: number) => void;
  setStarPoints: (points: number) => void;
}

export const createToolSlice: StateCreator<ToolSlice> = (set) => ({
  activeTool: 'brush',
  activeShapeType: 'rectangle',
  polygonSides: 6,
  starPoints: 5,
  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveShapeType: (shape) => set({ activeShapeType: shape }),
  setPolygonSides: (sides) => set({ polygonSides: Math.max(3, Math.min(12, sides)) }),
  setStarPoints: (points) => set({ starPoints: Math.max(3, Math.min(12, points)) }),
});
