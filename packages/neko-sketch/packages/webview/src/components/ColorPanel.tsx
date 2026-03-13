/**
 * ColorPanel - color picker and palette
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';

export function ColorPanel() {
  const { t } = useTranslation();
  const color = useSketchStore((s) => s.brushSettings.color);
  const setBrushColor = useSketchStore((s) => s.setBrushColor);
  const show = useSketchStore((s) => s.showColorPanel);

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.color')}>
      <h3 className="sketch-panel-title">{t('sketch.panel.color')}</h3>

      <div className="sketch-panel-row">
        <input
          type="color"
          aria-label={t('sketch.color.brushColor')}
          value={color}
          onChange={(e) => setBrushColor(e.target.value)}
          className="w-8 h-8 cursor-pointer border-0 p-0"
        />
        <span className="text-xs opacity-70">{color}</span>
      </div>

      {/* Quick palette */}
      <div className="flex flex-wrap gap-1 mt-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={t('sketch.color.colorLabel', { color: c })}
            className="w-5 h-5 rounded border border-[var(--vscode-panel-border)]"
            style={{ backgroundColor: c }}
            onClick={() => setBrushColor(c)}
          />
        ))}
      </div>
    </div>
  );
}

const PALETTE = [
  '#000000',
  '#ffffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#ff8800',
  '#8800ff',
  '#0088ff',
  '#88ff00',
  '#ff0088',
  '#00ff88',
  '#884400',
  '#666666',
];
