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
      className="fixed z-50 min-w-[200px] py-[4px]"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--vscode-menu-background, #252526)',
        border: '1px solid var(--vscode-menu-border, #454545)',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.36)',
        color: 'var(--vscode-menu-foreground, #cccccc)',
      }}
    >
      {items.map((entry, i) => {
        if (entry.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="my-[4px] mx-0 h-px"
              style={{ backgroundColor: 'var(--vscode-menu-separatorBackground, #454545)' }}
            />
          );
        }

        const item = entry as MenuItem;
        return (
          <button
            key={`item-${i}`}
            className="w-full h-[26px] px-0 flex items-center text-[12px] text-left border-0 bg-transparent"
            style={{
              color: item.disabled
                ? 'var(--vscode-disabledForeground, #6b6b6b)'
                : 'var(--vscode-menu-foreground, #cccccc)',
              cursor: item.disabled ? 'default' : 'pointer',
              fontFamily: 'var(--vscode-font-family)',
              opacity: 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor =
                  'var(--vscode-menu-selectionBackground, #094771)';
                e.currentTarget.style.color = 'var(--vscode-menu-selectionForeground, #ffffff)';
                // Also update shortcut color
                const shortcut = e.currentTarget.querySelector(
                  '[data-shortcut]',
                ) as HTMLElement | null;
                if (shortcut)
                  shortcut.style.color = 'var(--vscode-menu-selectionForeground, #ffffff)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = item.disabled
                ? 'var(--vscode-disabledForeground, #6b6b6b)'
                : 'var(--vscode-menu-foreground, #cccccc)';
              const shortcut = e.currentTarget.querySelector(
                '[data-shortcut]',
              ) as HTMLElement | null;
              if (shortcut) shortcut.style.color = 'var(--vscode-descriptionForeground, #717171)';
            }}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
          >
            {/* Icon area - fixed width for alignment */}
            <span className="w-[28px] flex-shrink-0 flex items-center justify-center text-[13px]">
              {item.icon ?? ''}
            </span>
            {/* Label */}
            <span className="flex-1 pr-4">{item.label}</span>
            {/* Shortcut */}
            {item.shortcut && (
              <span
                data-shortcut
                className="pr-[10px] text-[11px]"
                style={{ color: 'var(--vscode-descriptionForeground, #717171)' }}
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
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
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
    { label: t('menu.bringToFront'), icon: '⬆', action: () => {} },
    { label: t('menu.sendToBack'), icon: '⬇', action: () => {} },
    { separator: true },
    { label: t('menu.addText'), icon: '📝', action: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', action: () => ctx.onAddScene(ctx.canvasPosition) },
  ];

  return items;
}
