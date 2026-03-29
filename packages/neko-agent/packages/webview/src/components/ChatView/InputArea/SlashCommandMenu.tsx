/**
 * SlashCommandMenu Component
 * Autocomplete menu for slash commands (builtin + skills)
 */

import { useRef, useMemo } from 'react';
import { SlashCommand, SkillSummary, PluginSlashCommandDef, getAllCommands } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';

interface SlashCommandMenuProps {
  isOpen: boolean;
  filter: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  /** Skills loaded from Extension Host */
  skills?: SkillSummary[];
  /** Plugin commands from external extensions */
  pluginCommands?: PluginSlashCommandDef[];
}

export function SlashCommandMenu({
  isOpen,
  filter,
  selectedIndex,
  onSelect,
  onClose,
  skills = [],
  pluginCommands = [],
}: SlashCommandMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  // Merge builtin + skill + plugin commands
  const allCommands = useMemo(
    () => getAllCommands(skills, pluginCommands),
    [skills, pluginCommands],
  );

  // Filter commands by name or description
  const filteredCommands = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return allCommands.filter((cmd) => {
      const nameMatch = cmd.name.toLowerCase().includes(lowerFilter);
      // For builtin commands, use i18n; for skills, use direct description
      const description = cmd.source === 'skill' ? cmd.descriptionKey : t(cmd.descriptionKey);
      const descMatch = description.toLowerCase().includes(lowerFilter);
      return nameMatch || descMatch;
    });
  }, [allCommands, filter, t]);

  if (!isOpen || filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-1 w-full bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg max-h-[200px] overflow-y-auto py-1 z-50"
    >
      {filteredCommands.map((cmd, index) => {
        // For builtin commands, translate; for skills, use direct description
        const description = cmd.source === 'skill' ? cmd.descriptionKey : t(cmd.descriptionKey);

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
            {cmd.source === 'skill' && (
              <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                skill
              </span>
            )}
            {cmd.source === 'plugin' && (
              <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                plugin
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Export filtered commands helper
export function getFilteredCommands(
  filter: string,
  skills: SkillSummary[] = [],
  pluginCommands: PluginSlashCommandDef[] = [],
): SlashCommand[] {
  const allCommands = getAllCommands(skills, pluginCommands);
  return allCommands.filter((cmd) => cmd.name.toLowerCase().includes(filter.toLowerCase()));
}
