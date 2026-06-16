import React from 'react';
import { useTranslation } from '../i18n/I18nContext';
import {
  normalizeViewportStreamQualityPreset,
  type ViewportStreamQualityPreset,
} from '../viewport/viewportStreamQuality';

export interface ViewportQualityControlsProps {
  readonly quality: ViewportStreamQualityPreset;
  readonly onQualityChange: (quality: ViewportStreamQualityPreset) => void;
}

const QUALITY_OPTIONS: readonly {
  readonly quality: ViewportStreamQualityPreset;
  readonly labelKey: string;
  readonly titleKey: string;
}[] = [
  {
    quality: 'quarter',
    labelKey: 'viewport.quality.quarterShort',
    titleKey: 'viewport.qualityTitle.quarter',
  },
  {
    quality: 'half',
    labelKey: 'viewport.quality.halfShort',
    titleKey: 'viewport.qualityTitle.half',
  },
  {
    quality: 'native',
    labelKey: 'viewport.quality.nativeShort',
    titleKey: 'viewport.qualityTitle.native',
  },
];

export function ViewportQualityControls({
  quality,
  onQualityChange,
}: ViewportQualityControlsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="model-viewport-quality-controls" aria-label={t('viewport.quality.aria')}>
      <label className="model-compact-select-field">
        <span>{t('viewport.quality.label')}</span>
        <select
          aria-label={t('viewport.quality.aria')}
          className="model-compact-select"
          value={quality}
          onChange={(event) =>
            onQualityChange(normalizeViewportStreamQualityPreset(event.currentTarget.value))
          }
        >
          {QUALITY_OPTIONS.map((item) => (
            <option key={item.quality} title={t(item.titleKey)} value={item.quality}>
              {t(item.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="model-viewport-quality-segments" role="radiogroup">
        {QUALITY_OPTIONS.map((item) => (
          <button
            key={item.quality}
            type="button"
            role="radio"
            aria-checked={quality === item.quality}
            className={quality === item.quality ? 'active' : undefined}
            title={t(item.titleKey)}
            onClick={() => onQualityChange(item.quality)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
