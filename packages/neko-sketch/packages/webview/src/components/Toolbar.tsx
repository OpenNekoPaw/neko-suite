/**
 * Toolbar - vertical tool selector
 */
import { useSketchStore } from '../stores';
import type { ToolType } from '../types';

const TOOLS: { type: ToolType; icon: string; label: string }[] = [
  { type: 'brush', icon: 'B', label: 'Brush' },
  { type: 'eraser', icon: 'E', label: 'Eraser' },
  { type: 'select-rect', icon: 'S', label: 'Select' },
  { type: 'move', icon: 'M', label: 'Move' },
  { type: 'shape', icon: 'R', label: 'Shape' },
  { type: 'transform', icon: 'T', label: 'Transform' },
  { type: 'eyedropper', icon: 'I', label: 'Eyedropper' },
  { type: 'fill', icon: 'F', label: 'Fill' },
  { type: 'zoom', icon: 'Z', label: 'Zoom' },
];

export function Toolbar() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);

  return (
    <div className="sketch-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.type}
          title={t.label}
          aria-label={t.label}
          aria-pressed={activeTool === t.type}
          className={activeTool === t.type ? 'active' : ''}
          onClick={() => setActiveTool(t.type)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
