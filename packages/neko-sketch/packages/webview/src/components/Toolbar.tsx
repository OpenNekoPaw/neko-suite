/**
 * Toolbar - vertical tool selector
 *
 * macOS-style icon toolbar. Uses shared VerticalToolbar + ToolbarButton
 * from @neko/ui/primitives with the unified .neko-toolbar-btn CSS class.
 */
import type { ReactNode } from 'react';
import {
  VerticalToolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@neko/ui/primitives';
import {
  DownloadIcon,
  LayersIcon,
  PackageIcon,
  RightPanelIcon,
  RightPanelOffIcon,
} from '@neko/ui/icons';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { ToolType } from '../types';

interface ToolButtonConfig {
  readonly type: ToolType;
  readonly icon: ReactNode;
  readonly key: string;
}

const TOOL_GROUPS: readonly (readonly ToolButtonConfig[])[] = [
  [
    { type: 'brush', icon: <BrushIcon />, key: 'sketch.toolbar.brush' },
    { type: 'eraser', icon: <EraserIcon />, key: 'sketch.toolbar.eraser' },
    { type: 'fill', icon: <FillIcon />, key: 'sketch.toolbar.fill' },
    { type: 'gradient', icon: <GradientIcon />, key: 'sketch.toolbar.gradient' },
    { type: 'eyedropper', icon: <EyedropperIcon />, key: 'sketch.toolbar.eyedropper' },
  ],
  [
    { type: 'select-rect', icon: <SelectIcon />, key: 'sketch.toolbar.select' },
    { type: 'select-lasso', icon: <LassoIcon />, key: 'sketch.toolbar.lasso' },
    { type: 'select-wand', icon: <WandIcon />, key: 'sketch.toolbar.wand' },
  ],
  [
    { type: 'move', icon: <MoveIcon />, key: 'sketch.toolbar.move' },
    { type: 'transform', icon: <TransformIcon />, key: 'sketch.toolbar.transform' },
    { type: 'clone', icon: <CloneIcon />, key: 'sketch.toolbar.clone' },
  ],
  [
    { type: 'shape', icon: <ShapeIcon />, key: 'sketch.toolbar.shape' },
    { type: 'vector', icon: <VectorNodeIcon />, key: 'sketch.toolbar.vector' },
    { type: 'text', icon: <TextIcon />, key: 'sketch.toolbar.text' },
  ],
  [{ type: 'zoom', icon: <ZoomIcon />, key: 'sketch.toolbar.zoom' }],
];

export interface ToolbarProps {
  readonly onOpenExport?: () => void;
  readonly onOpenPackage?: () => void;
}

export function Toolbar({ onOpenExport, onOpenPackage }: ToolbarProps = {}) {
  const { t } = useTranslation();
  const activeTool = useSketchStore((s) => s.activeTool);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const showSidebar = useSketchStore((s) => s.showSidebar);
  const toggleSidebar = useSketchStore((s) => s.toggleSidebar);
  const showFrameTimeline = useSketchStore((s) => s.showFrameTimeline);
  const toggleFrameTimeline = useSketchStore((s) => s.toggleFrameTimeline);

  return (
    <VerticalToolbar className="sketch-left-toolbar" aria-label={t('sketch.toolbar.ariaLabel')}>
      {onOpenExport && (
        <ToolbarButton
          data-creative-left-rail-action="open-export"
          data-creative-left-rail-kind="common-action"
          icon={<DownloadIcon size={16} />}
          title={t('sketch.toolbar.export')}
          onClick={onOpenExport}
        />
      )}
      {onOpenPackage && (
        <ToolbarButton
          data-creative-left-rail-action="open-package"
          data-creative-left-rail-kind="common-action"
          icon={<PackageIcon size={16} />}
          title={t('sketch.toolbar.package')}
          onClick={onOpenPackage}
        />
      )}
      {(onOpenExport || onOpenPackage) && <ToolbarSeparator />}

      {TOOL_GROUPS.map((group, groupIndex) => (
        <ToolGroup
          key={groupIndex}
          activeTool={activeTool}
          group={group}
          showSeparator={groupIndex < TOOL_GROUPS.length - 1}
          setActiveTool={setActiveTool}
          translate={t}
        />
      ))}

      <ToolbarSpacer />
      <ToolbarSeparator />

      <ToolbarButton
        aria-controls="sketch-frame-timeline"
        aria-expanded={showFrameTimeline}
        data-creative-left-rail-action="toggle-frame-timeline"
        data-creative-left-rail-kind="visibility-toggle"
        data-creative-left-rail-target="main-panel"
        icon={<LayersIcon size={16} />}
        title={
          showFrameTimeline
            ? t('sketch.timeline.hideFrameTimeline')
            : t('sketch.timeline.showFrameTimeline')
        }
        active={showFrameTimeline}
        onClick={toggleFrameTimeline}
      />

      <ToolbarButton
        aria-controls="sketch-right-sidebar"
        aria-expanded={showSidebar}
        data-creative-left-rail-action="toggle-right-sidebar"
        data-creative-left-rail-kind="visibility-toggle"
        data-creative-left-rail-target="right-panel"
        icon={showSidebar ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />}
        title={t('sketch.sidebar.toggle')}
        active={showSidebar}
        onClick={toggleSidebar}
      />
    </VerticalToolbar>
  );
}

function ToolGroup({
  activeTool,
  group,
  showSeparator,
  setActiveTool,
  translate,
}: {
  readonly activeTool: ToolType;
  readonly group: readonly ToolButtonConfig[];
  readonly showSeparator: boolean;
  readonly setActiveTool: (tool: ToolType) => void;
  readonly translate: (key: string) => string;
}) {
  return (
    <>
      {group.map((tool) => (
        <ToolbarButton
          key={tool.type}
          data-creative-left-rail-action={`select-${tool.type}`}
          data-creative-left-rail-kind="common-action"
          icon={tool.icon}
          title={translate(tool.key)}
          active={activeTool === tool.type}
          onClick={() => setActiveTool(tool.type)}
        />
      ))}
      {showSeparator && <ToolbarSeparator />}
    </>
  );
}

/* ── Inline SVG icons (16 × 16, currentColor) ─────────────────────────── */

function BrushIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13c1-1 2.5-2.5 4-2.5s2.5 1.5 1.5 2.5-2.5 1-3.5 0" />
      <path d="M9 10.5L13.5 3" />
      <path d="M11.5 3.5l1-2" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3L14 8 8 14H3l-1-1 6-10z" />
      <path d="M6 6l4 4" />
      <path d="M3 14h10" />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="3 2"
    >
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v12M2 8h12" />
      <path d="M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2" />
      <path d="M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />
    </svg>
  );
}

function ShapeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="10" height="10" rx="2" />
    </svg>
  );
}

function VectorNodeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11C5 3 11 3 13 8" />
      <circle cx="3" cy="11" r="1.4" />
      <circle cx="8" cy="4" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
      <path d="M4.4 10.4L6.8 5.1M9.4 4.4l2.4 2.6" opacity="0.55" />
    </svg>
  );
}

function TransformIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <path d="M10 6h3v3" />
      <path d="M10 10h3v-3" />
    </svg>
  );
}

function EyedropperIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 2l3 3-7 7-3-3 7-7z" />
      <path d="M7 12l-4 2 1-4" />
      <path d="M8 8l1 1" />
    </svg>
  );
}

function FillIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l4 8 4-8" />
      <path d="M3 9h10" />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3" />
      <path d="M5 7h4M7 5v4" />
    </svg>
  );
}

function LassoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5C4 3 6 2 8 2s4 1 4 3-2 4-4 5-4 2-4 4" />
      <circle cx="4" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13L13 3" />
      <path d="M10 2l1 1M14 6l-1-1M7 3l.5 1.5M13 9l-1.5-.5" />
    </svg>
  );
}

function GradientIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="5" y1="3" x2="5" y2="13" opacity="0.2" />
      <line x1="7" y1="3" x2="7" y2="13" opacity="0.4" />
      <line x1="9" y1="3" x2="9" y2="13" opacity="0.6" />
      <line x1="11" y1="3" x2="11" y2="13" opacity="0.8" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h8M8 4v9" />
      <path d="M6 13h4" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="4" />
      <circle cx="10" cy="10" r="4" strokeDasharray="2 2" />
    </svg>
  );
}
