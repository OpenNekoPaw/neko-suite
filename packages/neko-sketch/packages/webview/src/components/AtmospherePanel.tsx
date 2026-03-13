/**
 * AtmospherePanel - atmosphere effect controls
 *
 * Preset selection with intensity, color, and wind parameters.
 */
import { useSketchStore } from '../stores';
import type { AtmospherePreset } from '../types/scene';

const PRESETS: { value: AtmospherePreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fog', label: 'Fog' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
  { value: 'fireflies', label: 'Fireflies' },
  { value: 'dust', label: 'Dust' },
];

export function AtmospherePanel() {
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const setAtmosphere = useSketchStore((s) => s.setAtmosphere);

  const activeScene = scenes.find((s) => s.id === activeSceneId);
  if (!activeScene) return null;

  const atm = activeScene.atmosphere;

  return (
    <div className="sketch-panel" role="region" aria-label="Atmosphere">
      <h3 className="sketch-panel-title m-0 mb-1">Atmosphere</h3>

      {/* Preset selector */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-14 opacity-60">Preset</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={atm.preset}
          onChange={(e) =>
            setAtmosphere(activeScene.id, { preset: e.target.value as AtmospherePreset })
          }
          aria-label="Atmosphere preset"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {atm.preset !== 'none' && (
        <>
          {/* Intensity */}
          <div className="flex items-center gap-1 text-[10px] mb-0.5">
            <span className="w-14 opacity-60">Intensity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={atm.intensity}
              onChange={(e) =>
                setAtmosphere(activeScene.id, { intensity: parseFloat(e.target.value) })
              }
              className="flex-1 h-3"
              aria-label="Intensity"
            />
            <span className="w-8 text-right tabular-nums">{atm.intensity.toFixed(2)}</span>
          </div>

          {/* Wind X */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="w-14 opacity-60">Wind X</span>
            <input
              type="range"
              min={-100}
              max={100}
              step={5}
              value={atm.wind[0]}
              onChange={(e) =>
                setAtmosphere(activeScene.id, {
                  wind: [parseFloat(e.target.value), atm.wind[1]],
                })
              }
              className="flex-1 h-3"
              aria-label="Wind X"
            />
            <span className="w-8 text-right tabular-nums">{atm.wind[0]}</span>
          </div>
        </>
      )}
    </div>
  );
}
