/**
 * BrushPanel - brush settings UI
 */
import { useSketchStore } from '../stores';
import type { BrushType } from '../types';

const BRUSH_TYPES: { type: BrushType; label: string }[] = [
  { type: 'pencil', label: 'Pencil' },
  { type: 'pen', label: 'Pen' },
  { type: 'watercolor', label: 'Watercolor' },
  { type: 'airbrush', label: 'Airbrush' },
  { type: 'eraser', label: 'Eraser' },
  { type: 'marker', label: 'Marker' },
  { type: 'pixel', label: 'Pixel' },
];

export function BrushPanel() {
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const setBrushType = useSketchStore((s) => s.setBrushType);
  const setBrushSize = useSketchStore((s) => s.setBrushSize);
  const setBrushOpacity = useSketchStore((s) => s.setBrushOpacity);
  const show = useSketchStore((s) => s.showBrushPanel);

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label="Brush settings">
      <h3 className="sketch-panel-title">Brush</h3>

      <div className="sketch-panel-row">
        <label htmlFor="brush-type">Type</label>
        <select
          id="brush-type"
          value={brushSettings.type}
          onChange={(e) => setBrushType(e.target.value as BrushType)}
        >
          {BRUSH_TYPES.map((b) => (
            <option key={b.type} value={b.type}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sketch-panel-row">
        <label htmlFor="brush-size">Size: {brushSettings.size}px</label>
        <input
          id="brush-size"
          type="range"
          className="sketch-slider"
          min={1}
          max={500}
          step={1}
          value={brushSettings.size}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
      </div>

      <div className="sketch-panel-row">
        <label htmlFor="brush-opacity">Opacity: {Math.round(brushSettings.opacity * 100)}%</label>
        <input
          id="brush-opacity"
          type="range"
          className="sketch-slider"
          min={0}
          max={100}
          step={1}
          value={Math.round(brushSettings.opacity * 100)}
          onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
        />
      </div>
    </div>
  );
}
