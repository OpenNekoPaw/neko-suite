import * as SelectPrimitive from '@radix-ui/react-select';
import type React from 'react';
import { toCodiconClassName } from '../icons/codicon';
import { cn } from '../utils';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly label?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onValueChange: (value: string) => void;
}

export function Select({
  className,
  disabled,
  label,
  onValueChange,
  options,
  placeholder,
  value,
}: SelectProps): React.ReactElement {
  return (
    <SelectPrimitive.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          'inline-flex h-7 min-w-28 items-center justify-between gap-2 rounded-[var(--neko-radius-sm,6px)]',
          'border border-[var(--neko-border)] bg-[var(--vscode-dropdown-background)] px-2 text-xs',
          'text-[var(--vscode-dropdown-foreground)] outline-none focus-visible:border-[var(--vscode-focusBorder)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon aria-hidden="true">
          <span className={toCodiconClassName('chevron-down')} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            'z-50 overflow-hidden rounded-[var(--neko-radius-md,8px)] border border-[var(--neko-border)]',
            'bg-[var(--vscode-dropdown-background)] text-xs text-[var(--vscode-dropdown-foreground)]',
            'shadow-[var(--neko-shadow-md,0_8px_24px_rgba(0,0,0,0.28))]',
          )}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                className={cn(
                  'relative flex h-7 cursor-default select-none items-center rounded-[var(--neko-radius-sm,6px)] px-2 outline-none',
                  'focus:bg-[var(--neko-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
                disabled={option.disabled}
                value={option.value}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
