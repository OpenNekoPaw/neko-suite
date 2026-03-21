/**
 * DropdownMenu Component
 * Reusable dropdown menu with keyboard navigation
 */

import { useRef } from 'react';
import { useClickOutsideSingle } from './useClickOutside';
export { ChevronDownIcon } from '@neko/shared/icons';

interface DropdownMenuProps<T> {
  isOpen: boolean;
  onClose: () => void;
  items: T[];
  selectedIndex?: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  onSelect: (item: T, index: number) => void;
  className?: string;
  emptyMessage?: string;
}

export function DropdownMenu<T>({
  isOpen,
  onClose,
  items,
  selectedIndex = -1,
  renderItem,
  onSelect,
  className = '',
  emptyMessage,
}: DropdownMenuProps<T>) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen) return null;

  if (items.length === 0 && emptyMessage) {
    return (
      <div
        ref={menuRef}
        className={`absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg py-1 z-50 ${className}`}
      >
        <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className={`absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg max-h-[300px] overflow-y-auto py-1 z-50 ${className}`}
    >
      {items.map((item, index) => (
        <div key={index} onClick={() => onSelect(item, index)} className="cursor-pointer">
          {renderItem(item, index, index === selectedIndex)}
        </div>
      ))}
    </div>
  );
}

