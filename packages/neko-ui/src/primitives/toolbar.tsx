import type React from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';

export interface VerticalToolbarProps {
  readonly width?: number;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export const VerticalToolbar = forwardRef<HTMLDivElement, VerticalToolbarProps>(
  function VerticalToolbar({ children, className, width = 48 }, ref): React.ReactElement {
    return (
      <div ref={ref} className={cn('neko-vtoolbar', className)} style={{ width }}>
        {children}
      </div>
    );
  },
);

export interface ToolbarButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'title'
> {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly active?: boolean;
}

export function ToolbarButton({
  active,
  className,
  disabled,
  icon,
  onClick,
  title,
  ...buttonProps
}: ToolbarButtonProps): React.ReactElement {
  return (
    <button
      {...buttonProps}
      aria-label={title}
      aria-pressed={active}
      className={cn('neko-toolbar-btn', active ? 'active' : null, className)}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );
}

export function ToolbarSeparator(): React.ReactElement {
  return <div className="neko-toolbar-sep" role="separator" />;
}

export function ToolbarSpacer(): React.ReactElement {
  return <div style={{ flex: 1 }} />;
}
