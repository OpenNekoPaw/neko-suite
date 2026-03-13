/**
 * FilterPanel - image filter management UI
 *
 * Displays applied filters with parameter editing, enable/disable, and reorder.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import { FilterRegistry } from '../engine/filter-registry';
import type { FilterCategory, FilterDef } from '../types/filter';

const registry = new FilterRegistry();

const CATEGORY_KEYS: Record<FilterCategory, string> = {
  blur: 'sketch.filter.category.blur',
  color: 'sketch.filter.category.color',
  distort: 'sketch.filter.category.distort',
  stylize: 'sketch.filter.category.stylize',
};

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
      const defaults: Record<
        string,
        number | boolean | [number, number] | [number, number, number, number]
      > = {};
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
                {def.name}
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
  params: Record<string, number | boolean | [number, number] | [number, number, number, number]>;
  enabled: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateParam: (
    id: string,
    name: string,
    value: number | boolean | [number, number] | [number, number, number, number],
  ) => void;
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
          aria-label={`Toggle ${def.name}`}
        />
        <span className="text-xs flex-1">{def.name}</span>
        <button
          className="text-xs px-1 text-red-400 hover:text-red-300"
          onClick={() => onRemove(id)}
          title={t('sketch.filter.remove')}
          aria-label={`${t('sketch.filter.remove')} ${def.name}`}
        >
          ✕
        </button>
      </div>
      {enabled &&
        def.params.map((p) => {
          const val = params[p.name] ?? p.default;
          if (p.type === 'float' || p.type === 'int') {
            return (
              <div key={p.name} className="flex items-center gap-1 text-[10px]">
                <span className="w-16 opacity-60 truncate">{p.label}</span>
                <input
                  type="range"
                  min={p.min ?? 0}
                  max={p.max ?? 1}
                  step={p.step ?? 0.01}
                  value={val as number}
                  onChange={(e) =>
                    onUpdateParam(
                      id,
                      p.name,
                      p.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
                    )
                  }
                  className="flex-1 h-3"
                  aria-label={p.label}
                />
                <span className="w-8 text-right tabular-nums">{(val as number).toFixed(2)}</span>
              </div>
            );
          }
          return null;
        })}
    </div>
  );
}
