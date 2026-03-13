/**
 * VectorToolbar - vector drawing tool options
 *
 * Shape tools (path, rectangle, ellipse, polygon) and fill/stroke controls.
 */
import { useState } from 'react';
import { useTranslation } from '../i18n/I18nContext';

export type VectorShapeTool = 'path' | 'rectangle' | 'ellipse' | 'polygon' | 'star';

interface VectorToolbarProps {
  onShapeSelect: (shape: VectorShapeTool) => void;
  activeShape: VectorShapeTool;
}

const SHAPE_ICONS: Record<VectorShapeTool, string> = {
  path: '✐',
  rectangle: '▭',
  ellipse: '◯',
  polygon: '⬠',
  star: '★',
};

export function VectorToolbar({ onShapeSelect, activeShape }: VectorToolbarProps) {
  const { t } = useTranslation();
  const [polygonSides, setPolygonSides] = useState(6);
  const [starPoints, setStarPoints] = useState(5);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.vector')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.vector')}</h3>

      {/* Shape selector */}
      <div className="flex items-center gap-0.5 mb-1">
        {(Object.entries(SHAPE_ICONS) as [VectorShapeTool, string][]).map(([shape, icon]) => (
          <button
            key={shape}
            className={`flex-1 text-xs py-1 rounded border ${
              activeShape === shape
                ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]'
            }`}
            onClick={() => onShapeSelect(shape)}
            title={shape}
            aria-label={shape}
            aria-pressed={activeShape === shape}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Polygon sides */}
      {activeShape === 'polygon' && (
        <div className="flex items-center gap-1 text-[10px] mb-0.5">
          <span className="w-10 opacity-60">{t('sketch.vector.sides')}</span>
          <input
            type="range"
            min={3}
            max={12}
            step={1}
            value={polygonSides}
            onChange={(e) => setPolygonSides(parseInt(e.target.value, 10))}
            className="flex-1 h-3"
            aria-label={t('sketch.vector.sidesLabel')}
          />
          <span className="w-4 text-right tabular-nums">{polygonSides}</span>
        </div>
      )}

      {/* Star points */}
      {activeShape === 'star' && (
        <div className="flex items-center gap-1 text-[10px] mb-0.5">
          <span className="w-10 opacity-60">{t('sketch.vector.points')}</span>
          <input
            type="range"
            min={3}
            max={12}
            step={1}
            value={starPoints}
            onChange={(e) => setStarPoints(parseInt(e.target.value, 10))}
            className="flex-1 h-3"
            aria-label={t('sketch.vector.pointsLabel')}
          />
          <span className="w-4 text-right tabular-nums">{starPoints}</span>
        </div>
      )}
    </div>
  );
}
