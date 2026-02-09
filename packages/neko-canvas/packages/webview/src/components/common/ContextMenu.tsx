/**
 * ContextMenu - Canvas right-click context menu
 */

import { useEffect, useRef, useCallback } from 'react';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  separator?: false;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled) return;
    item.action();
    onClose();
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] py-1 rounded-md shadow-xl border"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--toolbar-bg)',
        borderColor: 'var(--toolbar-border)',
      }}
    >
      {items.map((entry, i) => {
        if (entry.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 mx-2 h-px"
              style={{ backgroundColor: 'var(--toolbar-border)' }}
            />
          );
        }

        const item = entry as MenuItem;
        return (
          <button
            key={`item-${i}`}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left transition-colors"
            style={{
              color: item.disabled ? 'var(--toolbar-fg-secondary)' : 'var(--toolbar-fg)',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor = 'var(--control-hover)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            {item.icon && <span className="w-4 text-center">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-[10px]" style={{ color: 'var(--toolbar-fg-secondary)' }}>
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Menu Builders
// =============================================================================

export interface CanvasMenuContext {
  canvasPosition: { x: number; y: number };
  hasSelection: boolean;
  selectedCount: number;
  isNodeLocked?: boolean;
  onAddText: (pos: { x: number; y: number }) => void;
  onAddScene: (pos: { x: number; y: number }) => void;
  onAddMedia: (type: 'image' | 'video' | 'audio') => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onFitContent: () => void;
  onResetView: () => void;
}

/**
 * Build context menu items for canvas background right-click
 */
export function buildCanvasMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: t('menu.addText'), icon: '📝', action: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', action: () => ctx.onAddScene(ctx.canvasPosition) },
    { separator: true },
    { label: t('menu.addImage'), icon: '🖼️', action: () => ctx.onAddMedia('image') },
    { label: t('menu.addVideo'), icon: '🎥', action: () => ctx.onAddMedia('video') },
    { label: t('menu.addAudio'), icon: '🎵', action: () => ctx.onAddMedia('audio') },
    { separator: true },
    { label: t('menu.selectAll'), icon: '☐', shortcut: '⌘A', action: ctx.onSelectAll },
    { label: t('menu.fitContent'), icon: '⊞', action: ctx.onFitContent },
    { label: t('menu.resetView'), icon: '↺', action: ctx.onResetView },
  ];

  return items;
}

/**
 * Build context menu items for node right-click
 */
export function buildNodeMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: t('menu.delete'), icon: '🗑', shortcut: '⌫', action: ctx.onDelete },
    { separator: true },
    { label: t('menu.addText'), icon: '📝', action: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', action: () => ctx.onAddScene(ctx.canvasPosition) },
  ];

  return items;
}
