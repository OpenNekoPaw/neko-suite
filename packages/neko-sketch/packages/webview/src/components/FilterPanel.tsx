/**
 * FilterPanel - image filter management UI
 *
 * Displays applied filters with parameter editing, enable/disable, and reorder.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import { FilterRegistry } from '../engine/filter-registry';
import type { FilterCategory, FilterDef, FilterParamValue } from '../types/filter';
import { BUILTIN_PRESETS } from '../types/filter-preset';

const registry = new FilterRegistry();

const CATEGORY_KEYS: Record<FilterCategory, string> = {
  blur: 'sketch.filter.category.blur',
  color: 'sketch.filter.category.color',
  distort: 'sketch.filter.category.distort',
  stylize: 'sketch.filter.category.stylize',
};

function isRgbaTuple(
  value: FilterParamValue | undefined,
): value is [number, number, number, number] {
  return (
    Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')
  );
}

function resolveRgbaValue(
  value: FilterParamValue | undefined,
  fallback: FilterParamValue,
): [number, number, number, number] {
  if (isRgbaTuple(value)) return value;
  if (isRgbaTuple(fallback)) return fallback;
  return [0, 0, 0, 1];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rgbaToHex(color: [number, number, number, number]): string {
  const toHex = (component: number) =>
    Math.round(clamp01(component) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`;
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0, alpha];
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, clamp01(alpha)];
}

export function FilterPanel() {
  const { t } = useTranslation();
  const filters = useSketchStore((s) => s.filters);
  const addFilter = useSketchStore((s) => s.addFilter);
  const removeFilter = useSketchStore((s) => s.removeFilter);
  const toggleFilter = useSketchStore((s) => s.toggleFilter);
  const updateFilterParam = useSketchStore((s) => s.updateFilterParam);

  const handleAdd = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const filterId = e.target.value;
      if (!filterId) return;
      const def = registry.get(filterId);
      if (!def) return;
      const defaults: Record<string, FilterParamValue> = {};
      for (const p of def.params) {
        defaults[p.name] = p.default;
      }
      addFilter(filterId, defaults);
      e.target.value = '';
    },
    [addFilter],
  );

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.filters')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.filters')}</h3>

      {/* Presets (Looks) */}
      <div className="flex flex-wrap gap-1 mb-1">
        {BUILTIN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)]"
            title={preset.name}
            onClick={() => {
              // Replace current filter stack with preset filters
              const state = useSketchStore.getState();
              // Clear existing filters
              for (const f of state.filters) {
                state.removeFilter(f.id);
              }
              // Apply preset filters
              for (const pf of preset.filters) {
                state.addFilter(pf.filterId, pf.params);
              }
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Add filter selector */}
      <select
        className="w-full text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5 mb-1"
        onChange={handleAdd}
        defaultValue=""
        aria-label={t('sketch.filter.addFilter')}
      >
        <option value="" disabled>
          + {t('sketch.filter.addFilter')}
        </option>
        {(['blur', 'color', 'distort', 'stylize'] as FilterCategory[]).map((cat) => (
          <optgroup key={cat} label={t(CATEGORY_KEYS[cat])}>
            {registry.listByCategory(cat).map((def) => (
              <option key={def.id} value={def.id}>
                {t(def.name)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Applied filters list */}
      {filters.length === 0 && (
        <p className="text-xs opacity-50 m-0">{t('sketch.filter.noFilters')}</p>
      )}
      {filters.map((applied) => {
        const def = registry.get(applied.filterId);
        if (!def) return null;
        return (
          <FilterItem
            key={applied.id}
            id={applied.id}
            def={def}
            params={applied.params}
            enabled={applied.enabled}
            onToggle={toggleFilter}
            onRemove={removeFilter}
            onUpdateParam={updateFilterParam}
          />
        );
      })}
    </div>
  );
}

interface FilterItemProps {
  id: string;
  def: FilterDef;
  params: Record<string, FilterParamValue>;
  enabled: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateParam: (id: string, name: string, value: FilterParamValue) => void;
}

function FilterItem({
  id,
  def,
  params,
  enabled,
  onToggle,
  onRemove,
  onUpdateParam,
}: FilterItemProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`mb-1 p-1 rounded border border-[var(--vscode-input-border)] ${enabled ? '' : 'opacity-50'}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={() => onToggle(id)}
          aria-label={t('sketch.filter.toggle', { name: t(def.name) })}
        />
        <span className="text-xs flex-1">{t(def.name)}</span>
        <button
          className="text-xs px-1 text-red-400 hover:text-red-300"
          onClick={() => onRemove(id)}
          title={t('sketch.filter.remove')}
          aria-label={`${t('sketch.filter.remove')} ${t(def.name)}`}
        >
          ✕
        </button>
      </div>
      {enabled &&
        def.params.map((p) => {
          const val = params[p.name] ?? p.default;
          if (p.type === 'float' || p.type === 'int') {
            const numericValue =
              typeof val === 'number' ? val : typeof p.default === 'number' ? p.default : 0;
            return (
              <div key={p.name} className="flex items-center gap-1 text-[10px]">
                <span className="w-16 opacity-60 truncate">{t(p.label)}</span>
                <input
                  type="range"
                  min={p.min ?? 0}
                  max={p.max ?? 1}
                  step={p.step ?? 0.01}
                  value={numericValue}
                  onChange={(e) =>
                    onUpdateParam(
                      id,
                      p.name,
                      p.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
                    )
                  }
                  className="flex-1 h-3"
                  aria-label={t(p.label)}
                />
                <span className="w-8 text-right tabular-nums">{numericValue.toFixed(2)}</span>
              </div>
            );
          }
          if (p.type === 'color') {
            const color = resolveRgbaValue(val, p.default);
            const hex = rgbaToHex(color);
            return (
              <div key={p.name} className="flex items-center gap-1 text-[10px]">
                <span className="w-16 opacity-60 truncate">{t(p.label)}</span>
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => onUpdateParam(id, p.name, hexToRgba(e.target.value, color[3]))}
                  className="w-8 h-5 p-0 border border-[var(--vscode-input-border)] bg-transparent"
                  aria-label={t(p.label)}
                />
                <span className="flex-1 text-right tabular-nums opacity-70">
                  {hex.toUpperCase()}
                </span>
              </div>
            );
          }
          return null;
        })}
    </div>
  );
}
