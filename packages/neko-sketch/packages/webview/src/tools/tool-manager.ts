/**
 * Tool Manager
 *
 * Manages active tool state and tool-specific cursors.
 */
import type { ToolType } from '../types';

export interface IToolManager {
  getActiveTool(): ToolType;
  setActiveTool(tool: ToolType): void;
  getCursor(): string;
}

const TOOL_CURSORS: Record<ToolType, string> = {
  brush: 'crosshair',
  eraser: 'crosshair',
  'select-rect': 'crosshair',
  'select-lasso': 'crosshair',
  'select-wand': 'crosshair',
  move: 'grab',
  shape: 'crosshair',
  transform: 'default',
  eyedropper: 'crosshair',
  fill: 'crosshair',
  zoom: 'zoom-in',
  pixel: 'crosshair',
  vector: 'default',
  gradient: 'crosshair',
  text: 'text',
  clone: 'crosshair',
};

export class ToolManager implements IToolManager {
  private activeTool: ToolType = 'brush';

  getActiveTool(): ToolType {
    return this.activeTool;
  }

  setActiveTool(tool: ToolType): void {
    this.activeTool = tool;
  }

  getCursor(): string {
    return TOOL_CURSORS[this.activeTool];
  }
}
