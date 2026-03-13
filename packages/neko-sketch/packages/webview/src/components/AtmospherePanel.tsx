/**
 * AtmospherePanel - atmosphere effect controls
 *
 * Preset selection with intensity, color, and wind parameters.
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { AtmospherePreset } from '../types/scene';

const PRESETS: { value: AtmospherePreset; key: string }[] = [
  { value: 'none', key: 'sketch.atmosphere.preset.none' },
  { value: 'fog', key: 'sketch.atmosphere.preset.fog' },
  { value: 'rain', key: 'sketch.atmosphere.preset.rain' },
  { value: 'snow', key: 'sketch.atmosphere.preset.snow' },
  { value: 'fireflies', key: 'sketch.atmosphere.preset.fireflies' },
  { value: 'dust', key: 'sketch.atmosphere.preset.dust' },
];

export function AtmospherePanel() {
  const { t } = useTranslation();
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const setAtmosphere = useSketchStore((s) => s.setAtmosphere);

  const activeScene = scenes.find((s) => s.id === activeSceneId);
  if (!activeScene) return null;

  const atm = activeScene.atmosphere;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.atmosphere')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.atmosphere')}</h3>

      {/* Preset selector */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-14 opacity-60">{t('sketch.atmosphere.preset')}</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={atm.preset}
          onChange={(e) =>
            setAtmosphere(activeScene.id, { preset: e.target.value as AtmospherePreset })
          }
          aria-label={t('sketch.atmosphere.presetLabel')}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {t(p.key)}
            </option>
          ))}
        </select>
      </div>

      {atm.preset !== 'none' && (
        <>
          {/* Intensity */}
          <div className="flex items-center gap-1 text-[10px] mb-0.5">
            <span className="w-14 opacity-60">{t('sketch.atmosphere.intensity')}</span>
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
              aria-label={t('sketch.atmosphere.intensity')}
            />
            <span className="w-8 text-right tabular-nums">{atm.intensity.toFixed(2)}</span>
          </div>

          {/* Wind X */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="w-14 opacity-60">{t('sketch.atmosphere.windX')}</span>
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
              aria-label={t('sketch.atmosphere.windX')}
            />
            <span className="w-8 text-right tabular-nums">{atm.wind[0]}</span>
          </div>
        </>
      )}
    </div>
  );
}
