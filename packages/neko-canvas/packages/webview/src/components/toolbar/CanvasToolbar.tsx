/**
 * CanvasToolbar - Left vertical toolbar
 *
 * Provides quick access to:
 * - Right node tree/library panel toggle
 * - Undo / Redo
 * - Canvas settings
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import {
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
  VerticalToolbar,
} from '@neko/ui/primitives';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';
import {
  DownloadIcon,
  PlayIcon,
  UndoIcon,
  RedoIcon,
  LayersIcon,
  PackageIcon,
  RightPanelIcon,
  RightPanelOffIcon,
} from '@neko/ui/icons';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  /** Node tree/library panel visibility */
  isNodeLibraryVisible?: boolean;
  onToggleNodeLibrary?: () => void;
  /** Reveals the same-Webview playback workspace. */
  onRevealPlaybackWorkspace?: () => void;
  /** Opens the Extension Host-owned rendered export picker */
  onOpenExport?: () => void;
  /** Opens the Extension Host-owned no-engine project package flow */
  onOpenPackage?: () => void;
  /** Canvas HUD visibility (minimap, zoom controls) */
  isHudVisible?: boolean;
  onToggleHud?: () => void;
  /** Hand tool (drag-to-pan) mode */
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function CanvasToolbar({
  onUndo,
  onRedo,
  isNodeLibraryVisible = true,
  onToggleNodeLibrary,
  onRevealPlaybackWorkspace,
  onOpenExport,
  onOpenPackage,
  isHudVisible = true,
  onToggleHud,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const nodeLibraryTitle = isNodeLibraryVisible
    ? t('toolbar.hideRightNodeTree')
    : t('toolbar.showRightNodeTree');
  const hudTitle = isHudVisible ? t('toolbar.hideHudControls') : t('toolbar.showHudControls');
  const hasVisibilityToggles = onToggleHud !== undefined || onToggleNodeLibrary !== undefined;

  return (
    <VerticalToolbar
      className="canvas-left-toolbar relative z-20"
      width={48}
      aria-label={t('toolbar.leftRail')}
      {...getKeyboardBoundaryMetadata({
        scope: 'popover',
        ownerId: 'canvas-toolbar',
        priority: 20,
        ownedKeys: ['Enter', 'Escape', 'Space', 'Tab', 'ArrowUp', 'ArrowDown'],
      })}
    >
      {/* Hand Tool (drag-to-pan) */}
      <ToolbarButton
        data-creative-left-rail-action="toggle-pan-mode"
        data-creative-left-rail-kind="common-action"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6" />
          </svg>
        }
        title={`${t('toolbar.handTool') ?? '移动工具'} (H)`}
        active={isPanMode}
        onClick={onTogglePanMode}
      />

      {onRevealPlaybackWorkspace ? (
        <ToolbarButton
          data-creative-left-rail-action="reveal-playback-workspace"
          data-creative-left-rail-kind="common-action"
          icon={<PlayIcon size={18} />}
          title={t('toolbar.playbackWorkspace')}
          onClick={onRevealPlaybackWorkspace}
        />
      ) : null}

      {onOpenExport && (
        <ToolbarButton
          data-creative-left-rail-action="open-export"
          data-creative-left-rail-kind="common-action"
          icon={<DownloadIcon size={18} />}
          title={t('toolbar.export')}
          onClick={onOpenExport}
        />
      )}

      {onOpenPackage && (
        <ToolbarButton
          data-creative-left-rail-action="open-package"
          data-creative-left-rail-kind="common-action"
          icon={<PackageIcon size={18} />}
          title={t('toolbar.package')}
          onClick={onOpenPackage}
        />
      )}

      <ToolbarSeparator />

      {/* Undo */}
      <ToolbarButton
        data-creative-left-rail-action="undo"
        data-creative-left-rail-kind="common-action"
        icon={<UndoIcon size={18} />}
        title={`${t('toolbar.undo')} (⌘Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      />

      {/* Redo */}
      <ToolbarButton
        data-creative-left-rail-action="redo"
        data-creative-left-rail-kind="common-action"
        icon={<RedoIcon size={18} />}
        title={`${t('toolbar.redo')} (⇧⌘Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      />

      {hasVisibilityToggles && (
        <>
          <ToolbarSpacer />
          <ToolbarSeparator />
        </>
      )}

      {onToggleNodeLibrary && (
        <ToolbarButton
          aria-controls="canvas-right-node-tree-panel"
          aria-expanded={isNodeLibraryVisible}
          data-creative-left-rail-action="toggle-right-node-tree"
          data-creative-left-rail-kind="visibility-toggle"
          data-creative-left-rail-target="right-panel"
          icon={
            isNodeLibraryVisible ? <RightPanelIcon size={18} /> : <RightPanelOffIcon size={18} />
          }
          title={nodeLibraryTitle}
          active={isNodeLibraryVisible}
          onClick={onToggleNodeLibrary}
        />
      )}

      {onToggleHud && (
        <ToolbarButton
          aria-controls="canvas-hud-controls"
          aria-expanded={isHudVisible}
          data-creative-left-rail-action="toggle-hud-controls"
          data-creative-left-rail-kind="visibility-toggle"
          data-creative-left-rail-target="hud"
          icon={<LayersIcon size={18} />}
          title={hudTitle}
          active={isHudVisible}
          onClick={onToggleHud}
        />
      )}
    </VerticalToolbar>
  );
}
