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
import { PlusIcon, LayersIcon, UndoIcon, RedoIcon } from '@neko/shared/icons';

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
  onTogglePropertyPanel: () => void;
  isPropertyPanelOpen: boolean;
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
  onTogglePropertyPanel,
  isPropertyPanelOpen,
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
    <div
      ref={toolbarRef}
      className="relative flex flex-col items-center py-1 gap-0.5 z-20"
      style={{
        backgroundColor: 'var(--vscode-activityBar-background, var(--toolbar-bg))',
        borderRight: '1px solid var(--toolbar-border)',
        width: 48,
      }}
    >
      {/* Add Node Button */}
      <ToolbarButton
        icon={<PlusIcon size={18} />}
        title={t('toolbar.addNode')}
        isActive={expandedPanel === 'add'}
        onClick={() => togglePanel('add')}
      />

      {/* Layer Panel Toggle */}
      <ToolbarButton
        icon={<LayersIcon size={18} />}
        title={t('toolbar.layers')}
        isActive={isLayerPanelOpen}
        onClick={onToggleLayerPanel}
      />

      <div className="w-6 h-px my-1" style={{ backgroundColor: 'var(--toolbar-border)' }} />

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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Property Panel Toggle */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM15 5v14h-2V5h2z" />
          </svg>
        }
        title={t('toolbar.toggleProperties')}
        isActive={isPropertyPanelOpen}
        onClick={onTogglePropertyPanel}
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
            background: 'rgba(32, 32, 36, 0.92)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.40)',
            color: 'var(--toolbar-fg, #e8e8ed)',
          }}
        >
          <div
            style={{
              padding: '4px 10px 4px 12px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--toolbar-fg-secondary, #8e8e93)',
              userSelect: 'none',
            }}
          >
            {t('toolbar.addNode')}
          </div>

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
            label={t('toolbar.text')}
            shortcut=""
            onClick={() => handleAddAndClose(onAddText)}
          />

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
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
            }
            label={t('toolbar.scene')}
            shortcut=""
            onClick={() => handleAddAndClose(onAddScene)}
          />

          <div
            style={{
              height: 1,
              margin: '4px 4px',
              background: 'rgba(255,255,255,0.07)',
            }}
          />

          <div
            style={{
              padding: '4px 10px 4px 12px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--toolbar-fg-secondary, #8e8e93)',
              userSelect: 'none',
            }}
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
          e.currentTarget.style.color =
            'var(--vscode-activityBar-inactiveForeground, var(--toolbar-fg-secondary))';
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
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 28,
        padding: '0 6px 0 4px',
        fontSize: 13,
        textAlign: 'left',
        border: 'none',
        borderRadius: 7,
        background: 'transparent',
        color: 'var(--toolbar-fg, #e8e8ed)',
        cursor: 'pointer',
        fontFamily: 'var(--vscode-font-family, inherit)',
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(59,130,246,0.75)';
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--toolbar-fg, #e8e8ed)';
      }}
      onClick={onClick}
    >
      <span
        style={{
          width: 26,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, paddingRight: 12 }}>{label}</span>
      {shortcut && (
        <span
          style={{
            fontSize: 11,
            paddingRight: 4,
            color: 'rgba(232,232,237,0.35)',
          }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
