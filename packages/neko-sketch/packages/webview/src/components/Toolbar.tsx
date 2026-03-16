/**
 * Toolbar - vertical tool selector
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { ToolType } from '../types';

const TOOLS: { type: ToolType; icon: string; key: string }[] = [
  { type: 'brush', icon: 'B', key: 'sketch.toolbar.brush' },
  { type: 'eraser', icon: 'E', key: 'sketch.toolbar.eraser' },
  { type: 'select-rect', icon: 'S', key: 'sketch.toolbar.select' },
  { type: 'move', icon: 'M', key: 'sketch.toolbar.move' },
  { type: 'shape', icon: 'R', key: 'sketch.toolbar.shape' },
  { type: 'transform', icon: 'T', key: 'sketch.toolbar.transform' },
  { type: 'eyedropper', icon: 'I', key: 'sketch.toolbar.eyedropper' },
  { type: 'fill', icon: 'F', key: 'sketch.toolbar.fill' },
  { type: 'zoom', icon: 'Z', key: 'sketch.toolbar.zoom' },
];

export function Toolbar() {
  const { t } = useTranslation();
  const activeTool = useSketchStore((s) => s.activeTool);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const showSidebar = useSketchStore((s) => s.showSidebar);
  const toggleSidebar = useSketchStore((s) => s.toggleSidebar);

  return (
    <div className="sketch-toolbar" role="toolbar" aria-label={t('sketch.toolbar.ariaLabel')}>
      {TOOLS.map((tool) => {
        const label = t(tool.key);
        return (
          <button
            key={tool.type}
            title={label}
            aria-label={label}
            aria-pressed={activeTool === tool.type}
            className={activeTool === tool.type ? 'active' : ''}
            onClick={() => setActiveTool(tool.type)}
          >
            {tool.icon}
          </button>
        );
      })}
      <div className="mt-auto">
        <button
          title={t('sketch.sidebar.toggle')}
          aria-label={t('sketch.sidebar.toggle')}
          aria-pressed={showSidebar}
          className={showSidebar ? 'active' : ''}
          onClick={toggleSidebar}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM15 5v14h-2V5h2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
