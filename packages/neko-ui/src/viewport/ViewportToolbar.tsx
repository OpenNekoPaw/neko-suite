import React from 'react';
import type { ViewportToolbarItem } from '@neko/shared';

export interface ViewportToolbarProps {
  readonly items: readonly ViewportToolbarItem[];
  readonly className?: string;
  readonly onAction?: (item: ViewportToolbarItem) => void;
}

export function ViewportToolbar({
  items,
  className,
  onAction,
}: ViewportToolbarProps): React.JSX.Element {
  const sorted = [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

  return (
    <div className={className ?? 'neko-viewport-toolbar'} role="toolbar">
      {sorted.map((item) =>
        item.kind === 'separator' ? (
          <span key={item.id} className="neko-viewport-toolbar-separator" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            className="neko-viewport-toolbar-button"
            title={item.label}
            aria-pressed={item.kind === 'toggle' ? item.toggled === true : undefined}
            disabled={item.disabled}
            data-action={item.action}
            onClick={() => onAction?.(item)}
          >
            <span aria-hidden="true">{item.icon ?? item.label ?? item.id}</span>
          </button>
        ),
      )}
    </div>
  );
}
