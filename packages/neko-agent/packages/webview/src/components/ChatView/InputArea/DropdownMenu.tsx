/**
 * DropdownMenu Component
 * Reusable dropdown menu with keyboard navigation
 */

import { useRef } from 'react';
import { useClickOutsideSingle } from './useClickOutside';

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

/**
 * Chevron Down Icon
 */
export function ChevronDownIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
