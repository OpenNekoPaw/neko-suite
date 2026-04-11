/**
 * LightPanel - property inspector for a selected light scene object
 *
 * Controls light color, intensity, radius, and height.
 * Dispatches updates via updateSceneObject.
 */
import type { LightSceneObject, SceneObject } from '../types/scene';
import type { LightProperties } from '../types/light';

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
  const props = light.properties;

  const updateProp = (updates: Partial<LightProperties>) => {
    updateSceneObject(sceneId, layerId, light.id, {
      properties: { ...props, ...updates },
    });
  };

  const updatePosition = (axis: 'x' | 'y', value: number) => {
    updateSceneObject(sceneId, layerId, light.id, { [axis]: value });
  };

  return (
    <div className="mt-1 pt-1 text-[10px]" style={{ borderTop: '1px solid var(--sketch-divider)' }}>
      <p className="opacity-60 mb-0.5">Point Light</p>

      {/* Position */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">X</span>
        <input
          type="number"
          value={Math.round(light.x)}
          onChange={(e) => updatePosition('x', parseFloat(e.target.value) || 0)}
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0 w-16"
          aria-label="Light X position"
        />
        <span className="w-4 opacity-60">Y</span>
        <input
          type="number"
          value={Math.round(light.y)}
          onChange={(e) => updatePosition('y', parseFloat(e.target.value) || 0)}
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0 w-16"
          aria-label="Light Y position"
        />
      </div>

      {/* Color */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">Color</span>
        <input
          type="color"
          value={rgbToHex(props.color)}
          onChange={(e) => updateProp({ color: hexToRgb(e.target.value) })}
          className="w-6 h-4 p-0 border-0 cursor-pointer"
          aria-label="Light color"
        />
      </div>

      {/* Intensity */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">Intensity</span>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={props.intensity}
          onChange={(e) => updateProp({ intensity: parseFloat(e.target.value) })}
          className="sketch-slider flex-1"
          aria-label="Light intensity"
        />
        <span className="w-8 text-right tabular-nums">{props.intensity.toFixed(1)}</span>
      </div>

      {/* Radius */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-14 opacity-60">Radius</span>
        <input
          type="range"
          min={10}
          max={2000}
          step={10}
          value={props.radius}
          onChange={(e) => updateProp({ radius: parseFloat(e.target.value) })}
          className="sketch-slider flex-1"
          aria-label="Light radius"
        />
        <span className="w-8 text-right tabular-nums">{props.radius}px</span>
      </div>

      {/* Height (Z-axis simulation) */}
      <div className="flex items-center gap-1">
        <span className="w-14 opacity-60">Height</span>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={props.height}
          onChange={(e) => updateProp({ height: parseFloat(e.target.value) })}
          className="sketch-slider flex-1"
          aria-label="Light height"
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
