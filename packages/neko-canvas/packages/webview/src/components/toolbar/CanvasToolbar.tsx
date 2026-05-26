/**
 * CanvasToolbar - Left vertical toolbar
 *
 * Provides quick access to:
 * - Add node (expandable panel)
 * - Right node tree/library panel toggle
 * - Undo / Redo
 * - Canvas settings
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
  VerticalToolbar,
} from '@neko/ui/primitives';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';
import {
  PlusIcon,
  UploadIcon,
  UndoIcon,
  RedoIcon,
  RightPanelIcon,
  RightPanelOffIcon,
} from '@neko/ui/icons';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onAddText: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Storyboard node creation callbacks */
  onAddShot?: () => void;
  onAddSceneGroup?: () => void;
  onAddGallery?: () => void;
  onAddTable?: () => void;
  /** Unified file import — opens file picker, auto-detects type */
  onImportFile?: () => void;
  /** Node tree/library panel visibility */
  isNodeLibraryVisible?: boolean;
  onToggleNodeLibrary?: () => void;
  /** Hand tool (drag-to-pan) mode */
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
}

type ExpandedPanel = 'add' | null;

// =============================================================================
// Component
// =============================================================================

export function CanvasToolbar({
  onAddText,
  onUndo,
  onRedo,
  onAddShot,
  onAddSceneGroup,
  onAddGallery,
  onAddTable,
  onImportFile,
  isNodeLibraryVisible = true,
  onToggleNodeLibrary,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expandedPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setExpandedPanel(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedPanel(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expandedPanel]);

  const togglePanel = useCallback((panel: ExpandedPanel) => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleAddAndClose = useCallback((action: () => void) => {
    action();
    setExpandedPanel(null);
  }, []);
  const nodeLibraryTitle = isNodeLibraryVisible
    ? t('toolbar.hideRightNodeTree')
    : t('toolbar.showRightNodeTree');

  return (
    <VerticalToolbar ref={toolbarRef} className="relative z-20" width={48}>
      {/* Hand Tool (drag-to-pan) */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6" />
          </svg>
        }
        title={`${t('toolbar.handTool') ?? '移动工具'} (H)`}
        active={isPanMode}
        onClick={onTogglePanMode}
      />

      {/* Add Node Button */}
      <ToolbarButton
        icon={<PlusIcon size={18} />}
        title={t('toolbar.addNode')}
        active={expandedPanel === 'add'}
        onClick={() => togglePanel('add')}
      />

      {/* Import File Button */}
      <ToolbarButton
        icon={<UploadIcon size={18} />}
        title={t('toolbar.importFile')}
        onClick={() => {
          setExpandedPanel(null);
          onImportFile?.();
        }}
      />

      <ToolbarSeparator />

      {/* Undo */}
      <ToolbarButton
        icon={<UndoIcon size={18} />}
        title={`${t('toolbar.undo')} (⌘Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      />

      {/* Redo */}
      <ToolbarButton
        icon={<RedoIcon size={18} />}
        title={`${t('toolbar.redo')} (⇧⌘Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      />

      <ToolbarSpacer />

      {onToggleNodeLibrary && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            aria-controls="canvas-right-node-tree-panel"
            aria-expanded={isNodeLibraryVisible}
            data-canvas-toolbar-action="toggle-right-node-tree"
            icon={
              isNodeLibraryVisible ? <RightPanelIcon size={18} /> : <RightPanelOffIcon size={18} />
            }
            title={nodeLibraryTitle}
            active={isNodeLibraryVisible}
            onClick={onToggleNodeLibrary}
          />
        </>
      )}

      {/* ============================================================= */}
      {/* Add Node Panel                                                */}
      {/* ============================================================= */}

      {expandedPanel === 'add' && (
        <div
          className="absolute left-full top-0 ml-1.5"
          style={{
            minWidth: 180,
            padding: '5px',
            background: 'var(--neko-glass-bg)',
            backdropFilter: 'var(--neko-glass-blur)',
            WebkitBackdropFilter: 'var(--neko-glass-blur)',
            border: '1px solid var(--neko-glass-border)',
            borderRadius: 'var(--neko-radius-lg)',
            boxShadow: 'var(--neko-glass-shadow)',
            color: 'var(--neko-fg)',
          }}
        >
          {onAddShot && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎬</span>}
              label={t('toolbar.shot')}
              onClick={() => handleAddAndClose(onAddShot)}
            />
          )}
          {onAddSceneGroup && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎞</span>}
              label={t('toolbar.sceneGroup')}
              onClick={() => handleAddAndClose(onAddSceneGroup)}
            />
          )}
          {onAddGallery && (
            <AddPanelItem
              icon={<span className="text-[13px]">🖼</span>}
              label={t('toolbar.gallery')}
              onClick={() => handleAddAndClose(onAddGallery)}
            />
          )}

          {onAddTable && (
            <AddPanelItem
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M3 15h18" />
                  <path d="M9 3v18" />
                  <path d="M15 3v18" />
                </svg>
              }
              label={t('toolbar.table')}
              onClick={() => handleAddAndClose(onAddTable)}
            />
          )}

          <div className="neko-menu-sep" />

          <AddPanelItem
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 7V4h16v3" />
                <path d="M9 20h6" />
                <path d="M12 4v16" />
              </svg>
            }
            label={t('toolbar.annotation')}
            onClick={() => handleAddAndClose(onAddText)}
          />
        </div>
      )}
    </VerticalToolbar>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface AddPanelItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}

function AddPanelItem({ icon, label, shortcut, onClick }: AddPanelItemProps) {
  return (
    <button className="neko-menu-item" onClick={onClick}>
      <span className="neko-menu-item-icon">{icon}</span>
      <span className="neko-menu-item-label">{label}</span>
      {shortcut !== undefined && <span className="neko-menu-item-shortcut">{shortcut}</span>}
    </button>
  );
}
