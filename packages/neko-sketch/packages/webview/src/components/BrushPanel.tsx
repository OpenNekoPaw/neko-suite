/**
 * BrushPanel - brush settings UI
 */
import { useSketchStore } from '../stores';
import { t } from '../i18n';
import type { BrushType } from '../types';

const BRUSH_TYPES: { type: BrushType; key: string }[] = [
  { type: 'pencil', key: 'sketch.brush.pencil' },
  { type: 'pen', key: 'sketch.brush.pen' },
  { type: 'watercolor', key: 'sketch.brush.watercolor' },
  { type: 'airbrush', key: 'sketch.brush.airbrush' },
  { type: 'eraser', key: 'sketch.brush.eraser' },
  { type: 'marker', key: 'sketch.brush.marker' },
  { type: 'pixel', key: 'sketch.brush.pixel' },
];

export function BrushPanel() {
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const setBrushType = useSketchStore((s) => s.setBrushType);
  const setBrushSize = useSketchStore((s) => s.setBrushSize);
  const setBrushOpacity = useSketchStore((s) => s.setBrushOpacity);
  const show = useSketchStore((s) => s.showBrushPanel);

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.brush')}>
      <h3 className="sketch-panel-title">{t('sketch.panel.brush')}</h3>

      <div className="sketch-panel-row">
        <label htmlFor="brush-type">{t('sketch.brush.type')}</label>
        <select
          id="brush-type"
          value={brushSettings.type}
          onChange={(e) => setBrushType(e.target.value as BrushType)}
        >
          {BRUSH_TYPES.map((b) => (
            <option key={b.type} value={b.type}>
              {t(b.key)}
            </option>
          ))}
        </select>
      </div>

      <div className="sketch-panel-row">
        <label htmlFor="brush-size">{t('sketch.brush.size', { size: brushSettings.size })}</label>
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
        <label htmlFor="brush-opacity">
          {t('sketch.brush.opacity', { opacity: Math.round(brushSettings.opacity * 100) })}
        </label>
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
