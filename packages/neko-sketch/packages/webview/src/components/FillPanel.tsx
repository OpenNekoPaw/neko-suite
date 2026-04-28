/**
 * FillPanel - solid and pattern fill settings
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { FillPatternType } from '../types';

const FILL_PATTERNS: readonly { readonly value: FillPatternType; readonly labelKey: string }[] = [
  { value: 'solid', labelKey: 'sketch.fill.pattern.solid' },
  { value: 'checker', labelKey: 'sketch.fill.pattern.checker' },
  { value: 'dots', labelKey: 'sketch.fill.pattern.dots' },
  { value: 'diagonal', labelKey: 'sketch.fill.pattern.diagonal' },
];

export function FillPanel() {
  const { t } = useTranslation();
  const fillSettings = useSketchStore((s) => s.fillSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.fill')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.fill')}</h3>

      <div className="sketch-panel-row">
        <label htmlFor="fill-pattern">{t('sketch.fill.pattern')}</label>
        <select
          id="fill-pattern"
          className="sketch-select"
          value={fillSettings.pattern}
          onChange={(event) => setFillSettings({ pattern: parseFillPattern(event.target.value) })}
        >
          {FILL_PATTERNS.map((pattern) => (
            <option key={pattern.value} value={pattern.value}>
              {t(pattern.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {fillSettings.pattern !== 'solid' && (
        <div className="sketch-panel-row">
          <label htmlFor="fill-pattern-size">
            {t('sketch.fill.patternSize', { size: fillSettings.patternSize })}
          </label>
          <input
            id="fill-pattern-size"
            type="range"
            className="sketch-slider"
            min={2}
            max={96}
            step={1}
            value={fillSettings.patternSize}
            onChange={(event) => setFillSettings({ patternSize: Number(event.target.value) })}
          />
        </div>
      )}
    </div>
  );
}

function parseFillPattern(value: string): FillPatternType {
  if (value === 'checker' || value === 'dots' || value === 'diagonal') return value;
  return 'solid';
}
