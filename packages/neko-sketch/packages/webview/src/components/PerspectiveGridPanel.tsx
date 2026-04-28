/**
 * PerspectiveGridPanel - controls for 1/2/3 point construction grid
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { PerspectiveGridMode } from '../types';

const GRID_MODES: readonly { readonly value: PerspectiveGridMode; readonly labelKey: string }[] = [
  { value: 'one-point', labelKey: 'sketch.perspective.mode.one' },
  { value: 'two-point', labelKey: 'sketch.perspective.mode.two' },
  { value: 'three-point', labelKey: 'sketch.perspective.mode.three' },
];

export function PerspectiveGridPanel() {
  const { t } = useTranslation();
  const canvas = useSketchStore((s) => s.canvas);
  const grid = useSketchStore((s) => s.perspectiveGrid);
  const setPerspectiveGrid = useSketchStore((s) => s.setPerspectiveGrid);
  const resetPerspectiveGrid = useSketchStore((s) => s.resetPerspectiveGrid);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.perspective')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.perspective')}</h3>

      <label className="flex items-center gap-1 text-xs mb-1">
        <input
          type="checkbox"
          checked={grid.enabled}
          onChange={(event) => setPerspectiveGrid({ enabled: event.target.checked })}
        />
        {t('sketch.common.enabled')}
      </label>

      <label className="flex items-center gap-1 text-xs mb-1">
        <input
          type="checkbox"
          checked={grid.snapEnabled}
          disabled={!grid.enabled}
          onChange={(event) => setPerspectiveGrid({ snapEnabled: event.target.checked })}
        />
        {t('sketch.perspective.snap')}
      </label>

      <div className="flex items-center gap-1 text-[10px] mb-1">
        <span className="w-16 opacity-60">{t('sketch.perspective.mode')}</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={grid.mode}
          onChange={(event) =>
            setPerspectiveGrid({ mode: parsePerspectiveMode(event.target.value) })
          }
          aria-label={t('sketch.perspective.mode')}
        >
          {GRID_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {t(mode.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <RangeRow
        label={t('sketch.perspective.divisions')}
        value={grid.divisions}
        min={2}
        max={24}
        step={1}
        format={(value) => `${Math.round(value)}`}
        onChange={(value) => setPerspectiveGrid({ divisions: value })}
      />
      <RangeRow
        label={t('sketch.perspective.opacity')}
        value={grid.opacity}
        min={0.05}
        max={1}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => setPerspectiveGrid({ opacity: value })}
      />

      <button
        className="mt-1 text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
        onClick={() => resetPerspectiveGrid(canvas.width, canvas.height)}
      >
        {t('sketch.perspective.reset')}
      </button>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] mb-1">
      <span className="w-16 opacity-60 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sketch-slider flex-1"
        aria-label={label}
      />
      <span className="w-8 text-right tabular-nums">{format(value)}</span>
    </div>
  );
}

function parsePerspectiveMode(value: string): PerspectiveGridMode {
  if (value === 'one-point' || value === 'three-point') return value;
  return 'two-point';
}
