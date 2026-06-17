/**
 * LightPanel - property inspector for a selected light scene object
 *
 * Controls light type, color, intensity, radius, direction, cone, and height.
 * Dispatches updates via updateSceneObject.
 */
import type { LightSceneObject, SceneObject } from '../types/scene';
import type { LightProperties, LightType } from '../types/light';
import { useTranslation } from '../i18n/I18nContext';

interface LightPanelProps {
  sceneId: string;
  layerId: string;
  light: LightSceneObject;
  updateSceneObject: (
    sceneId: string,
    layerId: string,
    objectId: string,
    updates: Partial<SceneObject>,
  ) => void;
}

export function LightPanel({ sceneId, layerId, light, updateSceneObject }: LightPanelProps) {
  const { t } = useTranslation();
  const props = light.properties;

  const updateProp = (updates: Partial<LightProperties>) => {
    updateSceneObject(sceneId, layerId, light.id, {
      properties: { ...props, ...updates },
    });
  };

  const updatePosition = (axis: 'x' | 'y', value: number) => {
    updateSceneObject(sceneId, layerId, light.id, { [axis]: value });
  };

  const showPosition = props.lightType !== 'directional';
  const showRadius = props.lightType !== 'directional';
  const showDirection = props.lightType === 'directional' || props.lightType === 'spot';
  const showCone = props.lightType === 'spot';

  return (
    <div className="mt-1 pt-1 text-[10px]" style={{ borderTop: '1px solid var(--sketch-divider)' }}>
      <p className="opacity-60 mb-0.5">
        {t('sketch.light.selected', { type: t(lightTypeLabelKey(props.lightType)) })}
      </p>

      {/* Type */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">{t('sketch.light.type')}</span>
        <select
          value={props.lightType}
          onChange={(e) => updateProp({ lightType: parseLightType(e.target.value) })}
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0"
          aria-label={t('sketch.light.type')}
        >
          <option value="point">{t('sketch.light.type.point')}</option>
          <option value="directional">{t('sketch.light.type.directional')}</option>
          <option value="spot">{t('sketch.light.type.spot')}</option>
        </select>
      </div>

      {/* Position */}
      {showPosition && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-14 opacity-60">X</span>
          <input
            type="number"
            value={Math.round(light.x)}
            onChange={(e) => updatePosition('x', parseFloat(e.target.value) || 0)}
            className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0 w-16"
            aria-label={t('sketch.light.xPosition')}
          />
          <span className="w-4 opacity-60">Y</span>
          <input
            type="number"
            value={Math.round(light.y)}
            onChange={(e) => updatePosition('y', parseFloat(e.target.value) || 0)}
            className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0 w-16"
            aria-label={t('sketch.light.yPosition')}
          />
        </div>
      )}

      {/* Color */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">{t('sketch.light.color')}</span>
        <input
          type="color"
          value={rgbToHex(props.color)}
          onChange={(e) => updateProp({ color: hexToRgb(e.target.value) })}
          className="w-6 h-4 p-0 border-0 cursor-pointer"
          aria-label={t('sketch.light.color')}
        />
      </div>

      {/* Intensity */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">{t('sketch.light.intensity')}</span>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={props.intensity}
          onChange={(e) => updateProp({ intensity: parseFloat(e.target.value) })}
          className="sketch-slider flex-1"
          aria-label={t('sketch.light.intensity')}
        />
        <span className="w-8 text-right tabular-nums">{props.intensity.toFixed(1)}</span>
      </div>

      {/* Radius */}
      {showRadius && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-14 opacity-60">{t('sketch.light.radius')}</span>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={props.radius}
            onChange={(e) => updateProp({ radius: parseFloat(e.target.value) })}
            className="sketch-slider flex-1"
            aria-label={t('sketch.light.radius')}
          />
          <span className="w-8 text-right tabular-nums">{props.radius}px</span>
        </div>
      )}

      {/* Direction */}
      {showDirection && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-14 opacity-60">{t('sketch.light.direction')}</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={radiansToDegrees(props.direction)}
            onChange={(e) =>
              updateProp({ direction: degreesToRadians(parseFloat(e.target.value)) })
            }
            className="sketch-slider flex-1"
            aria-label={t('sketch.light.direction')}
          />
          <span className="w-8 text-right tabular-nums">
            {Math.round(radiansToDegrees(props.direction))}°
          </span>
        </div>
      )}

      {/* Spotlight cone */}
      {showCone && (
        <>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="w-14 opacity-60">{t('sketch.light.cone')}</span>
            <input
              type="range"
              min={5}
              max={180}
              step={1}
              value={radiansToDegrees(props.coneAngle)}
              onChange={(e) =>
                updateProp({ coneAngle: degreesToRadians(parseFloat(e.target.value)) })
              }
              className="sketch-slider flex-1"
              aria-label={t('sketch.light.cone')}
            />
            <span className="w-8 text-right tabular-nums">
              {Math.round(radiansToDegrees(props.coneAngle))}°
            </span>
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="w-14 opacity-60">{t('sketch.light.softness')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={props.coneSoftness}
              onChange={(e) => updateProp({ coneSoftness: parseFloat(e.target.value) })}
              className="sketch-slider flex-1"
              aria-label={t('sketch.light.softness')}
            />
            <span className="w-8 text-right tabular-nums">{props.coneSoftness.toFixed(2)}</span>
          </div>
        </>
      )}

      {/* Height (Z-axis simulation) */}
      <div className="flex items-center gap-1">
        <span className="w-14 opacity-60">{t('sketch.light.height')}</span>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={props.height}
          onChange={(e) => updateProp({ height: parseFloat(e.target.value) })}
          className="sketch-slider flex-1"
          aria-label={t('sketch.light.height')}
        />
        <span className="w-8 text-right tabular-nums">{props.height}</span>
      </div>
    </div>
  );
}

// ─── Color helpers ───

function rgbToHex(color: readonly [number, number, number]): string {
  const r = Math.round(color[0] * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(color[1] * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(color[2] * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b] as const;
}

function lightTypeLabelKey(type: LightType): string {
  switch (type) {
    case 'directional':
      return 'sketch.light.type.directional';
    case 'spot':
      return 'sketch.light.type.spot';
    case 'point':
      return 'sketch.light.type.point';
  }
}

function parseLightType(value: string): LightType {
  if (value === 'directional' || value === 'spot') return value;
  return 'point';
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
