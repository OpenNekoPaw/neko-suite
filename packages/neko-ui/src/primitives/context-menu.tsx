import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

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
          className={cn(
            'z-50 min-w-40 overflow-hidden rounded-[var(--neko-radius-md,8px)]',
            'border border-[var(--neko-border)] bg-[var(--vscode-menu-background,var(--vscode-editorWidget-background))]',
            'p-1 text-xs text-[var(--vscode-menu-foreground,var(--vscode-foreground))]',
            'shadow-[var(--neko-shadow-md,0_8px_24px_rgba(0,0,0,0.28))]',
            className,
          )}
        >
          {items.map((item) =>
            item.type === 'separator' ? (
              <ContextMenuPrimitive.Separator
                key={item.id}
                className="my-1 h-px bg-[var(--neko-border)]"
              />
            ) : (
              <ContextMenuPrimitive.Item
                key={item.id}
                className={cn(
                  'relative flex h-7 cursor-default select-none items-center justify-between gap-4',
                  'rounded-[var(--neko-radius-sm,6px)] px-2 outline-none',
                  'focus:bg-[var(--vscode-menu-selectionBackground,var(--neko-hover))]',
                  'focus:text-[var(--vscode-menu-selectionForeground,var(--vscode-foreground))]',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  item.danger ? 'text-[var(--vscode-errorForeground,var(--neko-danger))]' : null,
                )}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                <span>{item.label}</span>
                {item.shortcut ? (
                  <span className="text-[var(--vscode-descriptionForeground)]">
                    {item.shortcut}
                  </span>
                ) : null}
              </ContextMenuPrimitive.Item>
            ),
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
