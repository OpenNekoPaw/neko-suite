import React, { useState, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';

interface TextEditorPanelProps {
  disabled?: boolean;
  onCreateText: (text: string, fontSize: number, extrusionDepth: number) => void;
}

/**
 * Text Editor Panel - Create extruded 3D text meshes.
 *
 * Controls: text input, font size, extrusion depth, create button.
 */
export function TextEditorPanel({
  disabled = false,
  onCreateText,
}: TextEditorPanelProps): React.JSX.Element {
  const [text, setText] = useState('Hello');
  const [fontSize, setFontSize] = useState(48);
  const [extrusionDepth, setExtrusionDepth] = useState(0.5);

  const { t } = useTranslation();

  const handleCreate = useCallback(() => {
    if (!text.trim()) return;
    onCreateText(text.trim(), fontSize, extrusionDepth);
  }, [onCreateText, text, fontSize, extrusionDepth]);

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('textMesh.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-1">{t('textMesh.text')}</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            rows={3}
            className="model-input min-h-[4.5rem] resize-none"
            placeholder={t('textMesh.placeholder')}
          />
        </div>

        <div className="model-panel-section">
          <div className="flex items-center justify-between mb-1">
            <span className="model-section-title">{t('textMesh.fontSize')}</span>
            <span className="text-[10px] text-[var(--model-fg-secondary)]">{fontSize}</span>
          </div>
          <input
            type="range"
            min={1}
            max={200}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            disabled={disabled}
            className="model-range"
          />
        </div>

        <div className="model-panel-section">
          <div className="flex items-center justify-between mb-1">
            <span className="model-section-title">{t('textMesh.depth')}</span>
            <span className="text-[10px] text-[var(--model-fg-secondary)]">
              {extrusionDepth.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.01}
            max={10}
            step={0.01}
            value={extrusionDepth}
            onChange={(e) => setExtrusionDepth(parseFloat(e.target.value))}
            disabled={disabled}
            className="model-range"
          />
        </div>

        <div className="px-3 py-3">
          <button
            onClick={handleCreate}
            disabled={disabled || !text.trim()}
            className="model-btn-primary w-full"
          >
            {t('textMesh.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
