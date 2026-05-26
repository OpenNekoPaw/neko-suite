import type React from 'react';
import { cn } from '../utils';

export interface VerticalToolbarProps {
  readonly width?: number;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function VerticalToolbar({
  children,
  className,
  width = 48,
}: VerticalToolbarProps): React.ReactElement {
  return (
    <div className={cn('neko-vtoolbar', className)} style={{ width }}>
      {children}
    </div>
  );
}

export interface ToolbarButtonProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

export function ToolbarButton({
  active,
  className,
  disabled,
  icon,
  onClick,
  title,
}: ToolbarButtonProps): React.ReactElement {
  return (
    <button
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
