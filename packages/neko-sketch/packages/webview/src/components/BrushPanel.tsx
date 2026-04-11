/**
 * BrushPanel - brush and eraser settings UI
 *
 * Adapts to the active tool:
 *  - activeTool === 'eraser'  → shows eraser settings (size + opacity only)
 *  - activeTool === 'brush'   → shows brush type, size, opacity, and color picker
 *
 * Color picker is included here so ColorPanel is no longer needed as a separate
 * panel — color is a brush attribute.
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { BrushType, SymmetryMode } from '../types';

const SYMMETRY_MODES: { mode: SymmetryMode; label: string }[] = [
  { mode: 'none', label: 'Off' },
  { mode: 'vertical', label: 'Vertical' },
  { mode: 'horizontal', label: 'Horizontal' },
  { mode: 'both', label: 'Both' },
  { mode: 'radial', label: 'Radial' },
];

/** Brush types available when the brush tool is active (eraser handled by toolbar) */
const BRUSH_TYPES: { type: BrushType; key: string }[] = [
  { type: 'pencil', key: 'sketch.brush.pencil' },
  { type: 'pen', key: 'sketch.brush.pen' },
  { type: 'watercolor', key: 'sketch.brush.watercolor' },
  { type: 'airbrush', key: 'sketch.brush.airbrush' },
  { type: 'marker', key: 'sketch.brush.marker' },
  { type: 'pixel', key: 'sketch.brush.pixel' },
];

export function BrushPanel() {
  const { t } = useTranslation();
  const activeTool = useSketchStore((s) => s.activeTool);
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const setBrushType = useSketchStore((s) => s.setBrushType);
  const setBrushSize = useSketchStore((s) => s.setBrushSize);
  const setBrushOpacity = useSketchStore((s) => s.setBrushOpacity);
  const setBrushColor = useSketchStore((s) => s.setBrushColor);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const symmetry = useSketchStore((s) => s.symmetry);
  const setSymmetry = useSketchStore((s) => s.setSymmetry);
  const show = useSketchStore((s) => s.showBrushPanel);

  if (!show) return null;

  const isEraser = activeTool === 'eraser';

  return (
    <div
      className="sketch-panel"
      role="region"
      aria-label={isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
    >
      <h3 className="sketch-panel-title">
        {isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
      </h3>

      {/* Brush type selector — hidden in eraser mode */}
      {!isEraser && (
        <div className="sketch-panel-row">
          <label htmlFor="brush-type">{t('sketch.brush.type')}</label>
          <select
            id="brush-type"
            className="sketch-select"
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
      )}

      {/* Size */}
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

      {/* Opacity */}
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

      {/* Hardness */}
      {!isEraser && (
        <div className="sketch-panel-row">
          <label htmlFor="brush-hardness">
            Hardness {Math.round(brushSettings.hardness * 100)}%
          </label>
          <input
            id="brush-hardness"
            type="range"
            className="sketch-slider"
            min={0}
            max={100}
            step={1}
            value={Math.round(brushSettings.hardness * 100)}
            onChange={(e) => setBrushSettings({ hardness: Number(e.target.value) / 100 })}
          />
        </div>
      )}

      {/* Symmetry mode — hidden in eraser mode */}
      {!isEraser && (
        <div className="sketch-panel-row">
          <label htmlFor="symmetry-mode">Symmetry</label>
          <select
            id="symmetry-mode"
            className="sketch-select"
            value={symmetry.mode}
            onChange={(e) => setSymmetry({ mode: e.target.value as SymmetryMode })}
          >
            {SYMMETRY_MODES.map((s) => (
              <option key={s.mode} value={s.mode}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Color picker — hidden in eraser mode (eraser has no color) */}
      {!isEraser && (
        <div className="sketch-panel-row">
          <label htmlFor="brush-color">{t('sketch.color.brushColor')}</label>
          <div className="flex items-center gap-2">
            <input
              id="brush-color"
              type="color"
              aria-label={t('sketch.color.brushColor')}
              value={brushSettings.color}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-7 h-7 cursor-pointer border-0 p-0 rounded"
            />
            <span className="text-xs" style={{ color: 'var(--sketch-text-secondary)' }}>
              {brushSettings.color}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
