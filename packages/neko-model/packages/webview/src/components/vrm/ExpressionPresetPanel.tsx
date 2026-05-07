import React, { useState } from 'react';
import {
  VRM_EXPRESSION_CATEGORIES,
  VRM_EXPRESSION_LABELS,
  type VRMExpressionPreset,
} from '../../types/vrmExpressions';
import { useTranslation } from '../../i18n/I18nContext';

interface ExpressionPresetPanelProps {
  onApplyExpression: (expression: VRMExpressionPreset, weight: number) => void;
  characterId: string | null;
  disabled?: boolean;
}

/**
 * VRM Expression Preset Panel
 *
 * Provides UI for applying VRM 1.0 standard expression presets.
 * Supports 17 standard expressions across 3 categories:
 * - Emotions (6): neutral, happy, angry, sad, relaxed, surprised
 * - Mouth (5): aa, ih, ou, ee, oh
 * - Eyes (6): blink, blinkLeft, blinkRight, lookUp, lookDown, lookLeft, lookRight
 */
export function ExpressionPresetPanel({
  onApplyExpression,
  characterId,
  disabled = false,
}: ExpressionPresetPanelProps): React.JSX.Element {
  const [selectedExpression, setSelectedExpression] = useState<VRMExpressionPreset>('neutral');
  const controlsDisabled = disabled || !characterId;
  const { t } = useTranslation();

  const handleApply = () => {
    onApplyExpression(selectedExpression, 1);
  };

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('expression.title')}</h2>
      </div>

      {controlsDisabled && (
        <div className="model-panel-section text-xs text-[var(--model-fg-secondary)]">
          Route A requires an Engine character command target
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {VRM_EXPRESSION_CATEGORIES.map((category) => (
          <div key={category.name}>
            <div className="model-section-title mb-2">{category.label}</div>
            <div className="space-y-1">
              {category.expressions.map((expression) => (
                <label
                  key={expression}
                  className={`model-selectable-row flex items-center gap-2 px-2 py-1 ${
                    selectedExpression === expression ? 'model-selected-row' : ''
                  } ${controlsDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="expression"
                    value={expression}
                    checked={selectedExpression === expression}
                    onChange={() => setSelectedExpression(expression)}
                    disabled={controlsDisabled}
                    className="cursor-pointer"
                  />
                  <span className="text-xs text-[var(--model-fg)]">
                    {VRM_EXPRESSION_LABELS[expression]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="model-panel-footer">
        <button
          onClick={handleApply}
          disabled={controlsDisabled}
          className="model-btn-primary w-full text-sm"
        >
          {t('expression.apply')}
        </button>
      </div>

      <div className="model-panel-footer text-xs">{t('expression.footer')}</div>
    </div>
  );
}
