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
import {
  ColorPropertyRow,
  PanelSection,
  SelectPropertyRow,
  SliderPropertyRow,
} from '@neko/ui/creative';
import { Button } from '@neko/ui/primitives';
import type { SelectOption } from '@neko/ui/primitives';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type {
  BrushSettings,
  BrushType,
  SymmetryConfig,
  SymmetryMode,
  TextureStampAsset,
  TextureStampPattern,
} from '../types';
import { TEXTURE_STAMP_PATTERNS, getTextureStampPatternLabelKey } from '../brush/texture-stamp';
import { postSketchMessage } from '../utils/vscode';

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

  return (
    <div
      className="sketch-panel"
      role="region"
      aria-label={isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
    >
      <h3 className="sketch-panel-title">
        {isEraser ? t('sketch.tool.eraser') : t('sketch.panel.brush')}
      </h3>

      <PanelSection className="sketch-brush-control-section" density="compact">
        {!isEraser ? (
          <SelectPropertyRow
            density="compact"
            id="brush.type"
            label={t('sketch.brush.type')}
            onCommit={(_, value) => setBrushType(toBrushType(value))}
            onPreviewChange={(_, value) => setBrushType(toBrushType(value))}
            options={createBrushTypeOptions(t)}
            value={brushSettings.type}
          />
        ) : null}

        <SliderPropertyRow
          density="compact"
          id="brush.size"
          label={t('sketch.brush.size')}
          max={500}
          min={1}
          onCommit={(_, value) => setBrushSize(value)}
          onPreviewChange={(_, value) => setBrushSize(value)}
          step={1}
          unit="px"
          value={brushSettings.size}
        />

        <SliderPropertyRow
          density="compact"
          id="brush.opacity"
          label={t('sketch.brush.opacity')}
          max={100}
          min={0}
          onCommit={(_, value) => setBrushOpacity(value / 100)}
          onPreviewChange={(_, value) => setBrushOpacity(value / 100)}
          step={1}
          unit="%"
          value={Math.round(brushSettings.opacity * 100)}
        />

        {!isEraser ? (
          <SliderPropertyRow
            density="compact"
            id="brush.hardness"
            label={t('sketch.brush.hardness')}
            max={100}
            min={0}
            onCommit={(_, value) => setBrushSettings({ hardness: value / 100 })}
            onPreviewChange={(_, value) => setBrushSettings({ hardness: value / 100 })}
            step={1}
            unit="%"
            value={Math.round(brushSettings.hardness * 100)}
          />
        ) : null}

        {!isEraser && isStamp ? (
          <>
            <SelectPropertyRow
              density="compact"
              id="brush.stampTexture"
              label={t('sketch.brush.stampPattern')}
              onCommit={(_, value) => setBrushSettings(mapStampTextureValue(value))}
              onPreviewChange={(_, value) => setBrushSettings(mapStampTextureValue(value))}
              options={createStampTextureOptions(textureStampAssets, t)}
              value={getStampTextureValue(brushSettings)}
            />
            <SliderPropertyRow
              density="compact"
              id="brush.spacing"
              label={t('sketch.brush.spacing')}
              max={200}
              min={10}
              onCommit={(_, value) => setBrushSettings({ spacing: value / 100 })}
              onPreviewChange={(_, value) => setBrushSettings({ spacing: value / 100 })}
              step={5}
              unit="%"
              value={Math.round((brushSettings.spacing ?? 0.65) * 100)}
            />
          </>
        ) : null}

        {!isEraser ? (
          <>
            <SelectPropertyRow
              density="compact"
              id="symmetry.mode"
              label={t('sketch.brush.symmetry')}
              onCommit={(_, value) => setSymmetry({ mode: toSymmetryMode(value) })}
              onPreviewChange={(_, value) => setSymmetry({ mode: toSymmetryMode(value) })}
              options={createSymmetryOptions(t)}
              value={symmetry.mode}
            />
            <ColorPropertyRow
              density="compact"
              id="brush.color"
              label={t('sketch.color.brushColor')}
              onCommit={(_, value) => setBrushColor(value)}
              onPreviewChange={(_, value) => setBrushColor(value)}
              value={brushSettings.color}
            />
          </>
        ) : null}
      </PanelSection>

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
  postSketchMessage({ type: 'stamp:import' });
}

function createBrushTypeOptions(
  translate: (key: string, params?: Record<string, string | number>) => string,
): readonly SelectOption[] {
  return BRUSH_TYPE_OPTIONS.map((option) => ({
    value: option.type,
    label: translate(option.key),
  }));
}

function createSymmetryOptions(
  translate: (key: string, params?: Record<string, string | number>) => string,
): readonly SelectOption[] {
  return SYMMETRY_OPTIONS.map((option) => ({
    value: option.value,
    label: translate(option.label),
  }));
}

function getStampTextureValue(brushSettings: BrushSettings): string {
  return brushSettings.stampAssetId
    ? `asset:${brushSettings.stampAssetId}`
    : `builtin:${brushSettings.stampPattern ?? 'grain'}`;
}

function createStampTextureOptions(
  textureStampAssets: readonly TextureStampAsset[],
  translate: (key: string, params?: Record<string, string | number>) => string,
): readonly SelectOption[] {
  return [
    ...TEXTURE_STAMP_PATTERNS.map((pattern) => ({
      value: `builtin:${pattern}`,
      label: translate(getTextureStampPatternLabelKey(pattern)),
    })),
    ...textureStampAssets.map((asset) => ({
      value: `asset:${asset.id}`,
      label: asset.name,
    })),
  ];
}

function mapStampTextureValue(value: string): Partial<BrushSettings> {
  if (value.startsWith('asset:')) {
    return { stampAssetId: value.slice('asset:'.length) };
  }

  const patternValue = value.startsWith('builtin:') ? value.slice('builtin:'.length) : value;
  return {
    stampAssetId: null,
    stampPattern: toTextureStampPattern(patternValue),
  };
}

function toBrushType(value: string): BrushType {
  if (isBrushType(value)) return value;
  throw new Error(`Unknown Sketch brush type: ${value}`);
}

function toSymmetryMode(value: string): SymmetryConfig['mode'] {
  if (isSymmetryMode(value)) return value;
  throw new Error(`Unknown Sketch symmetry mode: ${value}`);
}

function toTextureStampPattern(value: string): TextureStampPattern {
  if (isTextureStampPattern(value)) return value;
  throw new Error(`Unknown Sketch texture stamp pattern: ${value}`);
}

function isBrushType(value: string): value is BrushType {
  return BRUSH_TYPE_OPTIONS.some((option) => option.type === value);
}

function isSymmetryMode(value: string): value is SymmetryMode {
  return SYMMETRY_OPTIONS.some((option) => option.value === value);
}

function isTextureStampPattern(value: string): value is TextureStampPattern {
  return TEXTURE_STAMP_PATTERNS.includes(value as TextureStampPattern);
}

const BRUSH_TYPE_OPTIONS: readonly { readonly type: BrushType; readonly key: string }[] = [
  { type: 'pencil', key: 'sketch.brush.pencil' },
  { type: 'pen', key: 'sketch.brush.pen' },
  { type: 'watercolor', key: 'sketch.brush.watercolor' },
  { type: 'airbrush', key: 'sketch.brush.airbrush' },
  { type: 'marker', key: 'sketch.brush.marker' },
  { type: 'pixel', key: 'sketch.brush.pixel' },
  { type: 'stamp', key: 'sketch.brush.stamp' },
];

const SYMMETRY_OPTIONS: readonly { readonly value: SymmetryMode; readonly label: string }[] = [
  { value: 'none', label: 'sketch.brush.symmetry.off' },
  { value: 'vertical', label: 'sketch.brush.symmetry.vertical' },
  { value: 'horizontal', label: 'sketch.brush.symmetry.horizontal' },
  { value: 'both', label: 'sketch.brush.symmetry.both' },
  { value: 'radial', label: 'sketch.brush.symmetry.radial' },
];
