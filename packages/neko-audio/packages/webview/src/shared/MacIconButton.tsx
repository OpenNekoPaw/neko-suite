/**
 * MacIconButton - macOS-style icon button (local copy from neko-preview)
 *
 * Circular button with icon, commonly used in media controls.
 */

import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface MacIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  children: ReactNode;
  active?: boolean;
  variant?: 'default' | 'primary';
}

const sizeClasses: Record<IconButtonSize, { button: string; icon: string }> = {
  sm: { button: 'w-7 h-7', icon: 'w-4 h-4' },
  md: { button: 'w-9 h-9', icon: 'w-5 h-5' },
  lg: { button: 'w-11 h-11', icon: 'w-6 h-6' },
  xl: { button: 'w-14 h-14', icon: 'w-7 h-7' },
};

export function MacIconButton({
  size = 'md',
  children,
  active = false,
  variant = 'default',
  className = '',
  disabled = false,
  ...props
}: MacIconButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full transition-all duration-150 outline-none focus:ring-2 focus:ring-neko-preview-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses =
    variant === 'primary'
      ? 'bg-neko-preview-primary text-white shadow-neko-sm hover:opacity-90 active:scale-95'
      : 'bg-[var(--btn-bg)] border border-[var(--btn-border)] text-[var(--editor-fg)] hover:bg-[var(--btn-bg-hover)] active:bg-[var(--btn-bg-active)] active:scale-95 transition-all duration-100';

  const activeClass = active
    ? '!bg-[var(--accent)] !text-white !border-transparent shadow-neko-sm'
    : '';
  const { button: buttonSize } = sizeClasses[size];

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${buttonSize} ${activeClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
