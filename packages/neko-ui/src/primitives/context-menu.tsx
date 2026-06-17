import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { useState } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';

export interface ContextMenuActionItem {
  readonly type?: 'item';
  readonly id: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly shortcut?: ReactNode;
  readonly onSelect?: () => void;
}

export interface ContextMenuSeparatorItem {
  readonly type: 'separator';
  readonly id: string;
}

export type ContextMenuItem = ContextMenuActionItem | ContextMenuSeparatorItem;

export interface ContextMenuProps {
  readonly trigger: ReactNode;
  readonly items: readonly ContextMenuItem[];
  readonly alignOffset?: number;
  readonly className?: string;
  readonly onOpenChange?: (open: boolean) => void;
}

export function ContextMenu({
  alignOffset,
  className,
  items,
  onOpenChange,
  trigger,
}: ContextMenuProps): React.ReactElement {
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>{trigger}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          alignOffset={alignOffset}
          className={className}
          style={CONTEXT_MENU_STYLE}
          {...getKeyboardBoundaryMetadata({
            scope: 'menu',
            ownerId: 'context-menu',
            priority: 40,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
        >
          {items.map((item) =>
            item.type === 'separator' ? (
              <ContextMenuPrimitive.Separator
                key={item.id}
                className="neko-menu-sep"
                style={CONTEXT_MENU_SEPARATOR_STYLE}
              />
            ) : (
              <ContextMenuAction key={item.id} item={item} />
            ),
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

function ContextMenuAction({ item }: { readonly item: ContextMenuActionItem }): React.ReactElement {
  const [interactive, setInteractive] = useState(false);

  return (
    <ContextMenuPrimitive.Item
      className={item.danger ? 'neko-menu-item danger' : 'neko-menu-item'}
      disabled={item.disabled}
      onBlur={() => setInteractive(false)}
      onFocus={() => setInteractive(true)}
      onMouseEnter={() => setInteractive(true)}
      onMouseLeave={() => setInteractive(false)}
      onSelect={item.onSelect}
      style={{
        ...CONTEXT_MENU_ITEM_STYLE,
        ...(interactive ? CONTEXT_MENU_ITEM_INTERACTIVE_STYLE : null),
        ...(item.danger ? CONTEXT_MENU_ITEM_DANGER_STYLE : null),
        ...(interactive && item.danger ? CONTEXT_MENU_ITEM_DANGER_INTERACTIVE_STYLE : null),
        ...(item.disabled ? CONTEXT_MENU_ITEM_DISABLED_STYLE : null),
      }}
    >
      <span style={CONTEXT_MENU_ITEM_LABEL_STYLE}>{item.label}</span>
      {item.shortcut ? (
        <span
          className="neko-menu-item-shortcut neko-shortcut-hint"
          data-neko-shortcut-hint="true"
          style={CONTEXT_MENU_ITEM_SHORTCUT_STYLE}
        >
          {item.shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.Item>
  );
}

const CONTEXT_MENU_STYLE: React.CSSProperties = {
  minWidth: 200,
  overflow: 'hidden',
  padding: 5,
  border:
    '1px solid var(--glass-border, var(--neko-glass-border, var(--neko-border, rgba(255, 255, 255, 0.16))))',
  borderRadius: 'var(--radius-lg, var(--neko-radius-md, 10px))',
  background:
    'var(--glass-bg, var(--neko-glass-bg, var(--vscode-menu-background, var(--vscode-editorWidget-background, rgba(32, 32, 36, 0.88)))))',
  backdropFilter: 'var(--glass-blur, var(--neko-glass-blur, blur(22px) saturate(180%)))',
  WebkitBackdropFilter: 'var(--glass-blur, var(--neko-glass-blur, blur(22px) saturate(180%)))',
  boxShadow:
    'var(--glass-shadow, var(--neko-glass-shadow, 0 16px 52px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.24)))',
  color:
    'var(--toolbar-fg, var(--neko-fg, var(--vscode-menu-foreground, var(--vscode-foreground, inherit))))',
  zIndex: 10_000,
};

const CONTEXT_MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  minHeight: 26,
  padding: '5px 10px',
  borderRadius: 'var(--radius-sm, var(--neko-radius-sm, 6px))',
  color: 'inherit',
  cursor: 'default',
  fontSize: 13,
  outline: 'none',
  userSelect: 'none',
};

const CONTEXT_MENU_ITEM_INTERACTIVE_STYLE: React.CSSProperties = {
  background:
    'var(--button-bg, var(--vscode-menu-selectionBackground, var(--neko-accent, #0a84ff)))',
  color: 'var(--button-fg, var(--vscode-menu-selectionForeground, #ffffff))',
};

const CONTEXT_MENU_ITEM_DANGER_STYLE: React.CSSProperties = {
  color: 'var(--vscode-errorForeground, var(--neko-danger, #ff453a))',
};

const CONTEXT_MENU_ITEM_DANGER_INTERACTIVE_STYLE: React.CSSProperties = {
  background: 'var(--neko-danger, var(--vscode-errorForeground, #ff453a))',
  color: '#ffffff',
};

const CONTEXT_MENU_ITEM_DISABLED_STYLE: React.CSSProperties = {
  opacity: 0.38,
  pointerEvents: 'none',
};

const CONTEXT_MENU_ITEM_LABEL_STYLE: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const CONTEXT_MENU_ITEM_SHORTCUT_STYLE: React.CSSProperties = {
  flexShrink: 0,
  color:
    'var(--vscode-menu-selectionForeground, var(--vscode-descriptionForeground, currentColor))',
  opacity: 0.72,
};

const CONTEXT_MENU_SEPARATOR_STYLE: React.CSSProperties = {
  height: 1,
  margin: '4px 5px',
  background:
    'var(--panel-divider, var(--neko-divider, var(--neko-border, rgba(255, 255, 255, 0.12))))',
};
