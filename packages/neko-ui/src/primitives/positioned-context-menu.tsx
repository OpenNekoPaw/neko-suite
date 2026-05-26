import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuSeparator = { readonly separator: true };

export type MenuAction = {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly submenu?: readonly MenuItem[];
  readonly onClick: () => void;
};

export type MenuItem = MenuAction | MenuSeparator;

export interface PositionedContextMenuProps {
  readonly items: readonly MenuItem[];
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
  readonly className?: string;
  /** @internal Links parent and sub-menu portals for outside-click detection. */
  readonly menuGroupId?: string;
}

const MENU_GROUP_ATTR = 'data-neko-menu-group';

export function PositionedContextMenu({
  className,
  items,
  menuGroupId,
  onClose,
  x,
  y,
}: PositionedContextMenuProps): React.ReactPortal {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const ownId = useId();
  const groupId = menuGroupId ?? ownId;
  const isRoot = menuGroupId === undefined;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      x: rect.right > window.innerWidth ? Math.max(0, x - rect.width) : x,
      y: rect.bottom > window.innerHeight ? Math.max(0, y - rect.height) : y,
    });
  }, [x, y]);

  useEffect(() => {
    if (!isRoot) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(`[${MENU_GROUP_ATTR}="${cssEscape(groupId)}"]`)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    const handleBlur = () => onClose();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [groupId, isRoot, onClose]);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className={className ? `neko-menu ${className}` : 'neko-menu'}
      role="menu"
      style={{ left: position.x, top: position.y }}
      tabIndex={-1}
      {...{ [MENU_GROUP_ATTR]: groupId }}
    >
      {items.map((item, index) =>
        isSeparator(item) ? (
          <div key={index} className="neko-menu-sep" role="separator" />
        ) : (
          <PositionedContextMenuItem
            key={index}
            item={item}
            menuGroupId={groupId}
            onClose={onClose}
          />
        ),
      )}
    </div>,
    document.body,
  );
}

function PositionedContextMenuItem({
  item,
  menuGroupId,
  onClose,
}: {
  readonly item: MenuAction;
  readonly menuGroupId: string;
  readonly onClose: () => void;
}): React.ReactElement {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const hasSubmenu = (item.submenu?.length ?? 0) > 0;

  const handleMouseEnter = useCallback(() => {
    if (!hasSubmenu) return;
    hoverTimerRef.current = setTimeout(() => setSubmenuOpen(true), 150);
  }, [hasSubmenu]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (item.disabled) return;
    if (!hasSubmenu) {
      item.onClick();
      onClose();
    }
  }, [hasSubmenu, item, onClose]);

  const submenuPosition = getSubmenuPosition(rowRef.current);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={rowRef}
        className={item.danger ? 'neko-menu-item danger' : 'neko-menu-item'}
        disabled={item.disabled}
        role="menuitem"
        onClick={handleClick}
      >
        {item.icon !== undefined ? <span className="neko-menu-item-icon">{item.icon}</span> : null}
        <span className="neko-menu-item-label">{item.label}</span>
        {item.shortcut !== undefined ? (
          <span className="neko-menu-item-shortcut">{item.shortcut}</span>
        ) : null}
        {hasSubmenu ? <span className="neko-menu-item-arrow">›</span> : null}
      </button>

      {submenuOpen && hasSubmenu ? (
        <PositionedContextMenu
          items={item.submenu ?? []}
          menuGroupId={menuGroupId}
          x={submenuPosition.x}
          y={submenuPosition.y}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}

function isSeparator(item: MenuItem): item is MenuSeparator {
  return 'separator' in item && item.separator === true;
}

function getSubmenuPosition(row: HTMLButtonElement | null): { x: number; y: number } {
  const rect = row?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const submenuWidth = 180;
  const x = rect.right + submenuWidth > window.innerWidth ? rect.left - submenuWidth : rect.right;
  return { x, y: rect.top };
}

function cssEscape(value: string): string {
  const css = globalThis.CSS as { escape?: (raw: string) => string } | undefined;
  return css?.escape ? css.escape(value) : value.replace(/"/g, '\\"');
}
