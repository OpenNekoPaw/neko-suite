/**
 * VectorToolbar - vector drawing tool options
 *
 * Shown in the sidebar when activeTool === 'shape'. Manages its own
 * activeShape state internally so it can be dropped into the sidebar
 * without any props from the parent.
 *
 * Shape sub-types: path, rectangle, ellipse, polygon, star.
 */
import { useState } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';

export type VectorShapeTool = 'path' | 'rectangle' | 'ellipse' | 'polygon' | 'star';

const SHAPE_ICONS: Record<VectorShapeTool, string> = {
  path:      '✐',
  rectangle: '▭',
  ellipse:   '◯',
  polygon:   '⬠',
  star:      '★',
};

export function VectorToolbar() {
  const { t } = useTranslation();
  const setActiveShapeType = useSketchStore((s) => s.setActiveShapeType);

  const [activeShape, setActiveShape] = useState<VectorShapeTool>('rectangle');
  const [polygonSides, setPolygonSides] = useState(6);
  const [starPoints, setStarPoints]     = useState(5);

  const handleShapeSelect = (shape: VectorShapeTool) => {
    setActiveShape(shape);
    // Sync overlapping shapes to the store's ShapeType for canvas rendering
    if (shape === 'rectangle' || shape === 'ellipse') {
      setActiveShapeType(shape);
    }
  };

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.vector')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.vector')}</h3>

      {/* Shape selector */}
      <div className="flex items-center gap-0.5 mb-1">
        {(Object.entries(SHAPE_ICONS) as [VectorShapeTool, string][]).map(([shape, icon]) => (
          <button
            key={shape}
            className={`sketch-button flex-1 justify-center py-1 px-0${
              activeShape === shape ? ' active' : ''
            }`}
            onClick={() => handleShapeSelect(shape)}
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
        <div className="sketch-panel-row">
          <label>{t('sketch.vector.sides')}</label>
          <input
            type="range"
            min={3}
            max={12}
            step={1}
            value={polygonSides}
            onChange={(e) => setPolygonSides(parseInt(e.target.value, 10))}
            className="sketch-slider"
            aria-label={t('sketch.vector.sidesLabel')}
          />
          <span className="w-4 text-right tabular-nums text-xs" style={{ color: 'var(--sketch-text-secondary)' }}>
            {polygonSides}
          </span>
        </div>
      )}

      {/* Star points */}
      {activeShape === 'star' && (
        <div className="sketch-panel-row">
          <label>{t('sketch.vector.points')}</label>
          <input
            type="range"
            min={3}
            max={12}
            step={1}
            value={starPoints}
            onChange={(e) => setStarPoints(parseInt(e.target.value, 10))}
            className="sketch-slider"
            aria-label={t('sketch.vector.pointsLabel')}
          />
          <span className="w-4 text-right tabular-nums text-xs" style={{ color: 'var(--sketch-text-secondary)' }}>
            {starPoints}
          </span>
        </div>
      )}
    </div>
  );
}
