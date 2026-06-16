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

type SlashCommandDisplayGroup = 'agent' | 'creation' | 'skill';

interface SlashCommandSection {
  group: SlashCommandDisplayGroup;
  title: string | null;
  commands: SlashCommandCatalogItem[];
  startIndex: number;
}

const slashCommandDisplayGroupOrder: readonly SlashCommandDisplayGroup[] = [
  'agent',
  'creation',
  'skill',
];

const creationBuiltinCommands = new Set(['skills', 'tools', 'tasks']);

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

  const sections = buildSlashCommandSections(commands, t);

  return (
    <div ref={menuRef} className="agent-composer-popover agent-composer-command-menu" role="menu">
      <div className="agent-composer-popover-scroll">
        {sections.map((section) => (
          <div key={section.group}>
            {section.title && <div className="agent-composer-popover-section">{section.title}</div>}
            {section.commands.map((cmd, itemIndex) => {
              const flatIndex = section.startIndex + itemIndex;
              const description = resolveSlashCommandDescription(cmd, t);
              const sourceLabel = resolveSlashCommandSourceLabel(cmd);
              const isSelected = flatIndex === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => onSelect(cmd)}
                  className={`agent-composer-popover-row agent-composer-command-row ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  role="menuitem"
                >
                  <span
                    className={`agent-composer-popover-primary ${isSelected ? 'is-selected' : ''}`}
                  >
                    {cmd.name}
                  </span>
                  <span className="agent-composer-popover-secondary">{description}</span>
                  {sourceLabel && (
                    <span className="agent-composer-popover-badge">
                      {resolveSlashCommandSourceLabelText(sourceLabel, t)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSlashCommandSections(
  commands: SlashCommandCatalogItem[],
  translate: (key: string, params?: Record<string, string | number>) => string,
): SlashCommandSection[] {
  const sections: SlashCommandSection[] = [];
  let startIndex = 0;
  const sortedCommands = sortSlashCommandsForDisplay(commands);

  for (const group of slashCommandDisplayGroupOrder) {
    const sectionCommands = sortedCommands.filter(
      (command) => projectSlashCommandGroup(command) === group,
    );
    if (sectionCommands.length === 0) continue;
    sections.push({
      group,
      title: resolveSlashCommandSectionTitle(group, translate),
      commands: sectionCommands,
      startIndex,
    });
    startIndex += sectionCommands.length;
  }

  return sections;
}

export function sortSlashCommandsForDisplay(
  commands: readonly SlashCommandCatalogItem[],
): SlashCommandCatalogItem[] {
  return [...commands].sort((a, b) => {
    const groupOrder =
      slashCommandDisplayGroupOrder.indexOf(projectSlashCommandGroup(a)) -
      slashCommandDisplayGroupOrder.indexOf(projectSlashCommandGroup(b));
    if (groupOrder !== 0) return groupOrder;
    return commands.indexOf(a) - commands.indexOf(b);
  });
}

export function projectSlashCommandGroup(
  command: SlashCommandCatalogItem,
): SlashCommandDisplayGroup {
  if (command.source === 'skill') return 'skill';
  if (command.source === 'plugin') return 'creation';
  if (creationBuiltinCommands.has(command.commandId ?? command.id)) return 'creation';
  return 'agent';
}

function resolveSlashCommandSectionTitle(
  group: SlashCommandDisplayGroup,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `chat.commands.sections.${group}`;
  const translated = translate(key);
  if (translated !== key) return translated;
  if (group === 'creation') return 'Creation';
  if (group === 'skill') return 'Skills';
  return 'Agent';
}

function resolveSlashCommandSourceLabelText(
  sourceLabel: string,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `chat.commands.source.${sourceLabel}`;
  const translated = translate(key);
  return translated === key ? sourceLabel : translated;
}
