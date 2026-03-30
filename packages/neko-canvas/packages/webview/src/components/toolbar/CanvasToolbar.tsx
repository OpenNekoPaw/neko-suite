/**
 * CanvasToolbar - Left vertical toolbar
 *
 * Provides quick access to:
 * - Add node (expandable panel)
 * - Layer panel toggle
 * - Undo / Redo
 * - Canvas settings
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolbarButton, ToolbarSeparator } from '@neko/shared/components';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';
import { PlusIcon, LayersIcon, UndoIcon, RedoIcon } from '@neko/shared/icons';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onAddText: () => void;
  onAddMedia: (type: 'image' | 'video' | 'audio') => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLayerPanel: () => void;
  isLayerPanelOpen: boolean;
  /** Storyboard node creation callbacks */
  onAddShot?: () => void;
  onAddSceneGroup?: () => void;
  onAddGallery?: () => void;
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
  onAddMedia,
  onUndo,
  onRedo,
  onToggleLayerPanel,
  isLayerPanelOpen,
  onAddShot,
  onAddSceneGroup,
  onAddGallery,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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

  return (
    <div ref={toolbarRef} className="neko-vtoolbar relative z-20" style={{ width: 48 }}>
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

      {/* Layer Panel Toggle */}
      <ToolbarButton
        icon={<LayersIcon size={18} />}
        title={t('toolbar.layers')}
        active={isLayerPanelOpen}
        onClick={onToggleLayerPanel}
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

      {/* ============================================================= */}
      {/* Expanded Panels (positioned to the right of the toolbar)      */}
      {/* ============================================================= */}

      {expandedPanel === 'add' && (
        <div
          className="absolute left-full top-0 ml-1.5"
          style={{
            minWidth: 210,
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
          {/* Primary storyboard tools (shown first when available) */}
          {onAddShot && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎬</span>}
              label="镜头"
              onClick={() => handleAddAndClose(onAddShot)}
            />
          )}
          {onAddSceneGroup && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎞</span>}
              label="场景"
              onClick={() => handleAddAndClose(onAddSceneGroup)}
            />
          )}
          {onAddGallery && (
            <AddPanelItem
              icon={<span className="text-[13px]">🖼</span>}
              label="角色画廊"
              onClick={() => handleAddAndClose(onAddGallery)}
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
            label="备注"
            onClick={() => handleAddAndClose(onAddText)}
          />

          <div className="neko-menu-sep" />

          <AddPanelItem
            icon={<span className="text-[13px]">🖼️</span>}
            label="图片"
            onClick={() => handleAddAndClose(() => onAddMedia('image'))}
          />
          <AddPanelItem
            icon={<span className="text-[13px]">🎥</span>}
            label="视频"
            onClick={() => handleAddAndClose(() => onAddMedia('video'))}
          />
          <AddPanelItem
            icon={<span className="text-[13px]">🎵</span>}
            label="音频"
            onClick={() => handleAddAndClose(() => onAddMedia('audio'))}
          />
        </div>
      )}
    </div>
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
