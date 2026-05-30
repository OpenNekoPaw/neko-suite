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
    <div
      ref={menuRef}
      className="absolute bottom-full left-1/2 z-50 mb-2 max-h-[min(260px,38vh)] w-[min(480px,calc(100%_-_40px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--agent-fg)_8%,transparent)] bg-[color-mix(in_srgb,var(--agent-elevated)_96%,var(--agent-bg)_4%)] shadow-[0_18px_48px_var(--vscode-widget-shadow,rgba(0,0,0,0.26))]"
    >
      <div className="max-h-[min(260px,38vh)] overflow-y-auto px-2 py-2">
        {sections.map((section) => (
          <div key={section.group}>
            {section.title && (
              <div className="px-3 pb-1.5 pt-2 text-[12px] font-medium leading-4 text-[var(--agent-fg-secondary)]">
                {section.title}
              </div>
            )}
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
                  className={`grid h-10 w-full grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2 rounded-[13px] px-3 text-left transition-colors ${
                    isSelected
                      ? 'bg-[color-mix(in_srgb,var(--agent-fg)_10%,transparent)] text-[var(--agent-fg)]'
                      : 'text-[var(--agent-fg)] hover:bg-[color-mix(in_srgb,var(--agent-fg)_5%,transparent)]'
                  }`}
                >
                  <span
                    className={`truncate text-[13px] font-semibold leading-5 ${
                      isSelected ? '' : 'text-[var(--vscode-textLink-foreground)]'
                    }`}
                  >
                    {cmd.name}
                  </span>
                  <span
                    className={`min-w-0 truncate text-[12px] leading-5 ${
                      isSelected
                        ? 'text-[var(--agent-fg)] opacity-80'
                        : 'text-[var(--agent-fg-secondary)]'
                    }`}
                  >
                    {description}
                  </span>
                  {sourceLabel && (
                    <span
                      className={`max-w-[88px] truncate rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-none ${
                        isSelected
                          ? 'bg-[color-mix(in_srgb,var(--agent-bg)_58%,transparent)] text-[var(--agent-fg)]'
                          : 'text-[var(--agent-fg-secondary)]'
                      }`}
                    >
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
