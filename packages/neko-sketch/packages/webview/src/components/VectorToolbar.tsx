/**
 * VectorToolbar - vector drawing tool options
 *
 * Shown in the sidebar when activeTool === 'shape'. Uses Zustand store
 * for all shape state so SketchCanvas can read polygon sides / star points.
 *
 * Shape sub-types: path, rectangle, ellipse, polygon, star.
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { ShapeType } from '../types';

type VectorShapeTool = 'path' | 'rectangle' | 'ellipse' | 'polygon' | 'star';

const SHAPE_ICONS: Record<VectorShapeTool, string> = {
  path: '✐',
  rectangle: '▭',
  ellipse: '◯',
  polygon: '⬠',
  star: '★',
};

export function VectorToolbar() {
  const { t } = useTranslation();
  const activeShapeType = useSketchStore((s) => s.activeShapeType);
  const setActiveShapeType = useSketchStore((s) => s.setActiveShapeType);
  const polygonSides = useSketchStore((s) => s.polygonSides);
  const setPolygonSides = useSketchStore((s) => s.setPolygonSides);
  const starPoints = useSketchStore((s) => s.starPoints);
  const setStarPoints = useSketchStore((s) => s.setStarPoints);

  // Map VectorShapeTool to the broader ShapeType for toolbar display
  const activeShape = (
    ['path', 'rectangle', 'ellipse', 'polygon', 'star'] as VectorShapeTool[]
  ).includes(activeShapeType as VectorShapeTool)
    ? (activeShapeType as VectorShapeTool)
    : 'rectangle';

  const handleShapeSelect = (shape: VectorShapeTool) => {
    setActiveShapeType(shape as ShapeType);
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
          <span
            className="w-4 text-right tabular-nums text-xs"
            style={{ color: 'var(--sketch-text-secondary)' }}
          >
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
          <span
            className="w-4 text-right tabular-nums text-xs"
            style={{ color: 'var(--sketch-text-secondary)' }}
          >
            {starPoints}
          </span>
        </div>
      )}
    </div>
  );
}
