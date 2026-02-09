/**
 * CanvasToolbar - Left vertical toolbar
 *
 * Provides quick access to:
 * - Add node (expandable panel)
 * - Layer panel toggle
 * - Undo / Redo
 * - Canvas settings
 *
 * Inspired by TapNow's left sidebar design.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onAddText: () => void;
  onAddScene: () => void;
  onAddMedia: (type: 'image' | 'video' | 'audio') => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLayerPanel: () => void;
  isLayerPanelOpen: boolean;
}

type ExpandedPanel = 'add' | null;

// =============================================================================
// Component
// =============================================================================

export function CanvasToolbar({
  onAddText,
  onAddScene,
  onAddMedia,
  onUndo,
  onRedo,
  onToggleLayerPanel,
  isLayerPanelOpen,
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
    <div ref={toolbarRef} className="relative flex flex-col items-center py-1 gap-0.5 z-20"
      style={{
        backgroundColor: 'var(--vscode-activityBar-background, var(--toolbar-bg))',
        borderRight: '1px solid var(--toolbar-border)',
        width: 48,
      }}
    >
      {/* Add Node Button */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
        }
        title={t('toolbar.addNode')}
        isActive={expandedPanel === 'add'}
        onClick={() => togglePanel('add')}
      />

      {/* Layer Panel Toggle */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        }
        title={t('toolbar.layers')}
        isActive={isLayerPanelOpen}
        onClick={onToggleLayerPanel}
      />

      <div className="w-6 h-px my-1" style={{ backgroundColor: 'var(--toolbar-border)' }} />

      {/* Undo */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
          </svg>
        }
        title={`${t('toolbar.undo')} (⌘Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      />

      {/* Redo */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
          </svg>
        }
        title={`${t('toolbar.redo')} (⇧⌘Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* ============================================================= */}
      {/* Expanded Panels (positioned to the right of the toolbar)      */}
      {/* ============================================================= */}

      {expandedPanel === 'add' && (
        <div
          className="absolute left-full top-0 ml-1 py-[4px] min-w-[220px]"
          style={{
            backgroundColor: 'var(--vscode-menu-background, #252526)',
            border: '1px solid var(--vscode-menu-border, #454545)',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.36)',
            color: 'var(--vscode-menu-foreground, #cccccc)',
          }}
        >
          <div
            className="px-[28px] py-[4px] text-[11px] uppercase tracking-wide"
            style={{ color: 'var(--vscode-descriptionForeground, #717171)' }}
          >
            {t('toolbar.addNode')}
          </div>

          <AddPanelItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
              </svg>
            }
            label={t('toolbar.text')}
            shortcut=""
            onClick={() => handleAddAndClose(onAddText)}
          />

          <AddPanelItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
              </svg>
            }
            label={t('toolbar.scene')}
            shortcut=""
            onClick={() => handleAddAndClose(onAddScene)}
          />

          <div
            className="my-[4px] mx-0 h-px"
            style={{ backgroundColor: 'var(--vscode-menu-separatorBackground, #454545)' }}
          />

          <div
            className="px-[28px] py-[4px] text-[11px] uppercase tracking-wide"
            style={{ color: 'var(--vscode-descriptionForeground, #717171)' }}
          >
            {t('toolbar.addMedia')}
          </div>

          <AddPanelItem
            icon={<span className="text-[13px]">🖼️</span>}
            label={t('menu.addImage')}
            onClick={() => handleAddAndClose(() => onAddMedia('image'))}
          />

          <AddPanelItem
            icon={<span className="text-[13px]">🎥</span>}
            label={t('menu.addVideo')}
            onClick={() => handleAddAndClose(() => onAddMedia('video'))}
          />

          <AddPanelItem
            icon={<span className="text-[13px]">🎵</span>}
            label={t('menu.addAudio')}
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

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ icon, title, onClick, isActive, disabled }: ToolbarButtonProps) {
  return (
    <button
      className="w-full h-12 flex items-center justify-center relative transition-all duration-150"
      style={{
        color: disabled
          ? 'var(--vscode-activityBar-inactiveForeground, var(--toolbar-fg-secondary))'
          : isActive
            ? 'var(--vscode-activityBar-foreground, var(--toolbar-fg))'
            : 'var(--vscode-activityBar-inactiveForeground, var(--toolbar-fg-secondary))',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--vscode-activityBar-foreground, var(--toolbar-fg))';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !disabled) {
          e.currentTarget.style.color = 'var(--vscode-activityBar-inactiveForeground, var(--toolbar-fg-secondary))';
        }
      }}
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
    >
      {/* Active indicator bar (left edge) */}
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-r"
          style={{ backgroundColor: 'var(--vscode-activityBar-foreground, var(--toolbar-fg))' }}
        />
      )}
      {icon}
    </button>
  );
}

interface AddPanelItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}

function AddPanelItem({ icon, label, shortcut, onClick }: AddPanelItemProps) {
  return (
    <button
      className="w-full h-[26px] px-0 flex items-center text-[12px] text-left border-0 bg-transparent"
      style={{
        color: 'var(--vscode-menu-foreground, #cccccc)',
        cursor: 'pointer',
        fontFamily: 'var(--vscode-font-family)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--vscode-menu-selectionBackground, #094771)';
        e.currentTarget.style.color = 'var(--vscode-menu-selectionForeground, #ffffff)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--vscode-menu-foreground, #cccccc)';
      }}
      onClick={onClick}
    >
      {/* Icon area - fixed width for alignment (matches ContextMenu) */}
      <span className="w-[28px] flex-shrink-0 flex items-center justify-center text-[13px]">
        {icon}
      </span>
      {/* Label */}
      <span className="flex-1 pr-4">{label}</span>
      {/* Shortcut */}
      {shortcut && (
        <span
          className="pr-[10px] text-[11px]"
          style={{ color: 'var(--vscode-descriptionForeground, #717171)' }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
