import React, { useState } from 'react';
import {
  VRM_EXPRESSION_CATEGORIES,
  VRM_EXPRESSION_LABELS,
  type VRMExpressionPreset,
} from '../../types/vrmExpressions';

interface ExpressionPresetPanelProps {
  onApplyExpression: (expression: VRMExpressionPreset) => void;
  isVRMLoaded: boolean;
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
  isVRMLoaded,
}: ExpressionPresetPanelProps): React.JSX.Element {
  const [selectedExpression, setSelectedExpression] = useState<VRMExpressionPreset>('neutral');

  const handleApply = () => {
    onApplyExpression(selectedExpression);
  };

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">VRM 表情预设</h2>
      </div>

      {!isVRMLoaded && (
        <div className="px-3 py-3 text-xs text-[var(--vscode-descriptionForeground)]">
          ⚠️ 请加载 VRM 模型以使用表情预设
        </div>
      )}

      {/* Expression Categories */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {VRM_EXPRESSION_CATEGORIES.map((category) => (
          <div key={category.name}>
            <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">
              {category.label}
            </div>
            <div className="space-y-1">
              {category.expressions.map((expression) => (
                <label
                  key={expression}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="expression"
                    value={expression}
                    checked={selectedExpression === expression}
                    onChange={() => setSelectedExpression(expression)}
                    disabled={!isVRMLoaded}
                    className="cursor-pointer"
                  />
                  <span className="text-xs text-[var(--vscode-foreground)]">
                    {VRM_EXPRESSION_LABELS[expression]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Apply Button */}
      <div className="px-3 py-3 border-t border-[var(--vscode-panel-border)]">
        <button
          onClick={handleApply}
          disabled={!isVRMLoaded}
          className="w-full px-3 py-2 text-sm bg-[var(--vscode-button-background)]
                     text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          应用表情
        </button>
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] text-xs text-[var(--vscode-descriptionForeground)]">
        VRM 1.0 标准表情预设
      </div>
    </div>
  );
}
