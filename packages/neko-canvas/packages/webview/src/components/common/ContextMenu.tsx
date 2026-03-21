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

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (item.disabled) return;
      item.action();
      onClose();
    },
    [onClose],
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50"
      style={{
        left: x,
        top: y,
        minWidth: 210,
        padding: '5px',
        /* macOS-style frosted popover */
        background: 'rgba(32, 32, 36, 0.92)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.40)',
        color: 'var(--toolbar-fg, #e8e8ed)',
      }}
    >
      {items.map((entry, i) => {
        if (entry.separator) {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                margin: '4px 4px',
                background: 'rgba(255,255,255,0.07)',
              }}
            />
          );
        }

        const item = entry as MenuItem;
        return (
          <button
            key={`item-${i}`}
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
              color: item.disabled
                ? 'rgba(232,232,237,0.30)'
                : 'var(--toolbar-fg, #e8e8ed)',
              cursor: item.disabled ? 'default' : 'pointer',
              fontFamily: 'var(--vscode-font-family, inherit)',
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = 'rgba(59,130,246,0.75)';
                e.currentTarget.style.color = '#fff';
                const sc = e.currentTarget.querySelector('[data-shortcut]') as HTMLElement | null;
                if (sc) sc.style.color = 'rgba(255,255,255,0.65)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = item.disabled
                ? 'rgba(232,232,237,0.30)'
                : 'var(--toolbar-fg, #e8e8ed)';
              const sc = e.currentTarget.querySelector('[data-shortcut]') as HTMLElement | null;
              if (sc) sc.style.color = 'rgba(232,232,237,0.35)';
            }}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            {/* Icon — fixed width */}
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
              {item.icon ?? ''}
            </span>
            {/* Label */}
            <span style={{ flex: 1, paddingRight: 12 }}>{item.label}</span>
            {/* Shortcut */}
            {item.shortcut && (
              <span
                data-shortcut
                style={{
                  fontSize: 11,
                  paddingRight: 4,
                  color: 'rgba(232,232,237,0.35)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
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
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onPasteInPlace?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  canPaste?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
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
    {
      label: t('menu.paste'),
      icon: '📋',
      shortcut: '⌘V',
      action: () => ctx.onPaste?.(),
      disabled: !ctx.canPaste,
    },
    {
      label: t('menu.pasteInPlace'),
      icon: '📌',
      shortcut: '⇧⌘V',
      action: () => ctx.onPasteInPlace?.(),
      disabled: !ctx.canPaste,
    },
    { separator: true },
    {
      label: t('menu.undo'),
      icon: '↩',
      shortcut: '⌘Z',
      action: () => ctx.onUndo?.(),
      disabled: !ctx.canUndo,
    },
    {
      label: t('menu.redo'),
      icon: '↪',
      shortcut: '⇧⌘Z',
      action: () => ctx.onRedo?.(),
      disabled: !ctx.canRedo,
    },
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
    { label: t('menu.copy'), icon: '📄', shortcut: '⌘C', action: () => ctx.onCopy?.() },
    { label: t('menu.cut'), icon: '✂️', shortcut: '⌘X', action: () => ctx.onCut?.() },
    { label: t('menu.duplicate'), icon: '⧉', shortcut: '⌘D', action: () => ctx.onDuplicate?.() },
    { separator: true },
    { label: t('menu.delete'), icon: '🗑', shortcut: '⌫', action: ctx.onDelete },
    { separator: true },
    {
      label: t('menu.group'),
      icon: '📁',
      shortcut: '⌘G',
      action: () => ctx.onGroup?.(),
      disabled: !ctx.canGroup,
    },
    {
      label: t('menu.ungroup'),
      icon: '📂',
      shortcut: '⇧⌘G',
      action: () => ctx.onUngroup?.(),
      disabled: !ctx.canUngroup,
    },
    { separator: true },
    { label: t('menu.bringToFront'), icon: '⬆', action: () => {} },
    { label: t('menu.sendToBack'), icon: '⬇', action: () => {} },
    { separator: true },
    { label: t('menu.addText'), icon: '📝', action: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', action: () => ctx.onAddScene(ctx.canvasPosition) },
  ];

  return items;
}
