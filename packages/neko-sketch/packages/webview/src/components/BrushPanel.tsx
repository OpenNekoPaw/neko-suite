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
import type { PropertyValue } from '@neko/ui/creative';
import { PropertyPanel } from '@neko/ui/creative';
import { Button } from '@neko/ui/primitives';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { SketchBrushPropertyPatch } from './adapters/sharedSketchUiAdapter';
import {
  mapSketchBrushPropertyCommit,
  mapSketchBrushToProperties,
} from './adapters/sharedSketchUiAdapter';

interface VsCodeBridge {
  postMessage(message: unknown): void;
}

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
  const { properties } = mapSketchBrushToProperties({
    activeTool,
    brushSettings,
    symmetry,
    textureStampAssets,
    translate: t,
  });
  const applyPatch = (patch: SketchBrushPropertyPatch): void => {
    if (patch.brushType) setBrushType(patch.brushType);
    if (patch.brushSize !== undefined) setBrushSize(patch.brushSize);
    if (patch.brushOpacity !== undefined) setBrushOpacity(patch.brushOpacity);
    if (patch.brushColor) setBrushColor(patch.brushColor);
    if (patch.brushSettings) setBrushSettings(patch.brushSettings);
    if (patch.symmetry) setSymmetry(patch.symmetry);
  };
  const handlePropertyChange = (id: string, value: PropertyValue): void => {
    applyPatch(mapSketchBrushPropertyCommit(id, value));
  };

  return (
    <div
      className="sketch-panel"
      role="region"
      aria-label={isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
    >
      <h3 className="sketch-panel-title">
        {isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
      </h3>

      <PropertyPanel
        properties={properties}
        onCommit={handlePropertyChange}
        onPreviewChange={handlePropertyChange}
      />

      {!isEraser && isStamp && (
        <div className="sketch-panel-row mt-2">
          <span>{t('sketch.brush.stampAssets')}</span>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => requestTextureStampImport()}>
              {t('sketch.brush.stampAsset.import')}
            </Button>
            {brushSettings.stampAssetId && (
              <Button
                size="xs"
                variant="danger"
                onClick={() => {
                  if (brushSettings.stampAssetId) {
                    removeTextureStampAsset(brushSettings.stampAssetId);
                  }
                }}
              >
                {t('sketch.brush.stampAsset.remove')}
              </Button>
            )}
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
