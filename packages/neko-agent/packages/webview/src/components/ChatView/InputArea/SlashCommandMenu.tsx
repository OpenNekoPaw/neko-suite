/**
 * SlashCommandMenu Component
 * Presentational menu for a precomputed slash command catalog.
 */

import { useRef } from 'react';
import { SlashCommand } from './types';
import {
  resolveSlashCommandDescription,
  resolveSlashCommandSourceLabel,
  type SlashCommandCatalogItem,
} from './slash-command-catalog';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommandCatalogItem[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen || commands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-1 w-full bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg max-h-[200px] overflow-y-auto py-1 z-50"
    >
      {commands.map((cmd, index) => {
        const description = resolveSlashCommandDescription(cmd, t);
        const sourceLabel = resolveSlashCommandSourceLabel(cmd);

        return (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors flex items-center gap-2 ${
              index === selectedIndex ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
            }`}
          >
            <span>{cmd.icon}</span>
            <span className="font-medium text-[var(--vscode-textLink-foreground)]">{cmd.name}</span>
            <span className="text-[var(--vscode-descriptionForeground)]">{description}</span>
            {sourceLabel && (
              <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                {sourceLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
