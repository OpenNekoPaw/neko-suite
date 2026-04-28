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
import { TEXTURE_STAMP_PATTERNS, getTextureStampPatternLabelKey } from '../brush/texture-stamp';
import type { BrushType, SymmetryMode, TextureStampPattern } from '../types';

interface VsCodeBridge {
  postMessage(message: unknown): void;
}

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
  { type: 'stamp', key: 'sketch.brush.stamp' },
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
  const textureStampAssets = useSketchStore((s) => s.textureStampAssets);
  const removeTextureStampAsset = useSketchStore((s) => s.removeTextureStampAsset);
  const symmetry = useSketchStore((s) => s.symmetry);
  const setSymmetry = useSketchStore((s) => s.setSymmetry);
  const show = useSketchStore((s) => s.showBrushPanel);

  if (!show) return null;

  const isEraser = activeTool === 'eraser';
  const isStamp = brushSettings.type === 'stamp';
  const showStampControls = !isEraser && isStamp;
  const spacingPercent = Math.round((brushSettings.spacing ?? 0.65) * 100);
  const stampTextureValue = brushSettings.stampAssetId
    ? `asset:${brushSettings.stampAssetId}`
    : `builtin:${brushSettings.stampPattern ?? 'grain'}`;

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
            {t('sketch.brush.hardness', { hardness: Math.round(brushSettings.hardness * 100) })}
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

      {showStampControls && (
        <>
          <div className="sketch-panel-row">
            <label htmlFor="brush-stamp-pattern">{t('sketch.brush.stampPattern')}</label>
            <select
              id="brush-stamp-pattern"
              className="sketch-select"
              value={stampTextureValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith('asset:')) {
                  setBrushSettings({ stampAssetId: value.slice('asset:'.length) });
                  return;
                }
                setBrushSettings({
                  stampAssetId: null,
                  stampPattern: value.slice('builtin:'.length) as TextureStampPattern,
                });
              }}
            >
              <optgroup label={t('sketch.brush.stampPattern.builtIn')}>
                {TEXTURE_STAMP_PATTERNS.map((pattern) => (
                  <option key={pattern} value={`builtin:${pattern}`}>
                    {t(getTextureStampPatternLabelKey(pattern))}
                  </option>
                ))}
              </optgroup>
              {textureStampAssets.length > 0 && (
                <optgroup label={t('sketch.brush.stampPattern.assets')}>
                  {textureStampAssets.map((asset) => (
                    <option key={asset.id} value={`asset:${asset.id}`}>
                      {asset.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="sketch-panel-row">
            <span>{t('sketch.brush.stampAssets')}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="sketch-button"
                onClick={() => requestTextureStampImport()}
              >
                {t('sketch.brush.stampAsset.import')}
              </button>
              {brushSettings.stampAssetId && (
                <button
                  type="button"
                  className="sketch-danger-button"
                  onClick={() => {
                    if (brushSettings.stampAssetId) {
                      removeTextureStampAsset(brushSettings.stampAssetId);
                    }
                  }}
                >
                  {t('sketch.brush.stampAsset.remove')}
                </button>
              )}
            </div>
          </div>

          <div className="sketch-panel-row">
            <label htmlFor="brush-spacing">
              {t('sketch.brush.spacing', { spacing: spacingPercent })}
            </label>
            <input
              id="brush-spacing"
              type="range"
              className="sketch-slider"
              min={10}
              max={200}
              step={5}
              value={spacingPercent}
              onChange={(e) => setBrushSettings({ spacing: Number(e.target.value) / 100 })}
            />
          </div>
        </>
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

function requestTextureStampImport(): void {
  const vscode = (window as unknown as { __vscode_api__?: VsCodeBridge }).__vscode_api__;
  vscode?.postMessage({ type: 'stamp:import' });
}
