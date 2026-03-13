/**
 * StatusBar - zoom, canvas size, tool, layer count
 */
import { useSketchStore } from '../stores';
import { t } from '../i18n';

export function StatusBar() {
  const viewport = useSketchStore((s) => s.viewport);
  const canvas = useSketchStore((s) => s.canvas);
  const activeTool = useSketchStore((s) => s.activeTool);
  const layers = useSketchStore((s) => s.layers);

  return (
    <div className="sketch-statusbar" role="status">
      <span>{Math.round(viewport.zoom * 100)}%</span>
      <span>
        {canvas.width} x {canvas.height}
      </span>
      <span>{activeTool}</span>
      <span>
        {layers.length} {t('sketch.status.layers')}
      </span>
    </div>
  );
}
