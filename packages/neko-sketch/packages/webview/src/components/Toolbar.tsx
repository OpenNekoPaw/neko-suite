/**
 * Toolbar - vertical tool selector
 *
 * macOS-style icon toolbar. Base styles come from .sketch-toolbar /
 * .sketch-toolbar button in index.css. Active tool gets accent-soft highlight.
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { ToolType } from '../types';

const TOOLS: { type: ToolType; icon: React.ReactNode; key: string }[] = [
  { type: 'brush',       icon: <BrushIcon />,      key: 'sketch.toolbar.brush' },
  { type: 'eraser',      icon: <EraserIcon />,     key: 'sketch.toolbar.eraser' },
  { type: 'select-rect', icon: <SelectIcon />,     key: 'sketch.toolbar.select' },
  { type: 'move',        icon: <MoveIcon />,       key: 'sketch.toolbar.move' },
  { type: 'shape',       icon: <ShapeIcon />,      key: 'sketch.toolbar.shape' },
  { type: 'transform',   icon: <TransformIcon />,  key: 'sketch.toolbar.transform' },
  { type: 'eyedropper',  icon: <EyedropperIcon />, key: 'sketch.toolbar.eyedropper' },
  { type: 'fill',        icon: <FillIcon />,       key: 'sketch.toolbar.fill' },
  { type: 'zoom',        icon: <ZoomIcon />,       key: 'sketch.toolbar.zoom' },
];

export function Toolbar() {
  const { t } = useTranslation();
  const activeTool    = useSketchStore((s) => s.activeTool);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const showSidebar   = useSketchStore((s) => s.showSidebar);
  const toggleSidebar = useSketchStore((s) => s.toggleSidebar);

  return (
    <div className="sketch-toolbar" role="toolbar" aria-label={t('sketch.toolbar.ariaLabel')}>
      {TOOLS.map((tool) => {
        const label    = t(tool.key);
        const isActive = activeTool === tool.type;
        return (
          <button
            key={tool.type}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            className={isActive ? 'active' : ''}
            onClick={() => setActiveTool(tool.type)}
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Push sidebar toggle to the bottom */}
      <div className="mt-auto" />

      <div className="sketch-toolbar-sep" aria-hidden="true" />

      <button
        title={t('sketch.sidebar.toggle')}
        aria-label={t('sketch.sidebar.toggle')}
        aria-pressed={showSidebar}
        className={showSidebar ? 'active' : ''}
        onClick={toggleSidebar}
      >
        <SidebarIcon />
      </button>
    </div>
  );
}

/* ── Inline SVG icons (16 × 16, currentColor) ─────────────────────────── */

function BrushIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13c1-1 2.5-2.5 4-2.5s2.5 1.5 1.5 2.5-2.5 1-3.5 0" />
      <path d="M9 10.5L13.5 3" />
      <path d="M11.5 3.5l1-2" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3L14 8 8 14H3l-1-1 6-10z" />
      <path d="M6 6l4 4" />
      <path d="M3 14h10" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="3 2">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12M2 8h12" />
      <path d="M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2" />
      <path d="M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />
    </svg>
  );
}

function ShapeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="10" height="10" rx="2" />
    </svg>
  );
}

function TransformIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <path d="M10 6h3v3" />
      <path d="M10 10h3v-3" />
    </svg>
  );
}

function EyedropperIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2l3 3-7 7-3-3 7-7z" />
      <path d="M7 12l-4 2 1-4" />
      <path d="M8 8l1 1" />
    </svg>
  );
}

function FillIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l4 8 4-8" />
      <path d="M3 9h10" />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3" />
      <path d="M5 7h4M7 5v4" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none"
      stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="13" height="13" rx="2" />
      <path d="M10 1v13" />
    </svg>
  );
}
