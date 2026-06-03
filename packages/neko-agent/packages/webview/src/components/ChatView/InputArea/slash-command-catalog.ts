import {
  listBuiltinSlashCommands,
  normalizeSlashCommandName,
  type BuiltinSlashCommandDefinition,
  type BuiltinSlashCommandName,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';
import type { SkillSummary } from './types';

export type SlashCommandSource = 'builtin' | 'skill' | 'plugin';
export type SlashCommandDescriptionKind = 'i18n' | 'literal';

export interface SlashCommandCatalogItem {
  id: string;
  commandId?: string;
  name: string;
  descriptionKey: string;
  icon: string;
  source: SlashCommandSource;
  skillId?: string;
  extensionId?: string;
  descriptionKind: SlashCommandDescriptionKind;
}

export interface SlashCommandCatalogSection {
  readonly source: SlashCommandSource;
  readonly title: string;
  readonly commands: readonly SlashCommandCatalogItem[];
}

export type SlashCommandTranslateFn = (key: string) => string;

const BUILTIN_COMMAND_ICONS: Record<BuiltinSlashCommandName, string> = {
  help: '❓',
  status: '📊',
  clear: '🗑️',
  exit: '🚪',
  as: '🎭',
  'exit-as': '🚪',
  new: '✨',
  resume: '▶️',
  config: '⚙️',
  model: '🤖',
  settings: '⚙️',
  permissions: '🔐',
  init: '🚀',
  compact: '📦',
  plan: '📐',
  skills: '🧠',
  commands: '⌨️',
  tools: '🛠️',
  tasks: '📋',
  mcp: '🔌',
};

const HIDDEN_WEBVIEW_BUILTIN_COMMANDS: ReadonlySet<BuiltinSlashCommandName> = new Set(['as']);

const BUILTIN_SLASH_COMMANDS: readonly SlashCommandCatalogItem[] = listBuiltinSlashCommands(
  'extension',
)
  .filter((command) => !HIDDEN_WEBVIEW_BUILTIN_COMMANDS.has(command.name))
  .map(projectBuiltinSlashCommand);

const SLASH_COMMAND_SECTION_ORDER: readonly SlashCommandSource[] = ['builtin', 'skill', 'plugin'];

const SLASH_COMMAND_SECTION_TITLES: Record<SlashCommandSource, string> = {
  builtin: '**Available Commands:**',
  skill: '**Skill Commands:**',
  plugin: '**Plugin Commands:**',
};

const SLASH_COMMAND_SOURCE_LABELS: Record<SlashCommandSource, string | null> = {
  builtin: null,
  skill: 'skill',
  plugin: 'plugin',
};

export { normalizeSlashCommandName } from '@neko-agent/types';

export function createSlashCommandCatalog(
  skills: readonly SkillSummary[] = [],
  pluginCommands: readonly RegisteredPluginSlashCommand[] = [],
): SlashCommandCatalogItem[] {
  const commands = new Map<string, SlashCommandCatalogItem>();

  for (const command of BUILTIN_SLASH_COMMANDS) {
    registerCommand(commands, command);
  }

  for (const skill of skills) {
    const command = projectSkillSlashCommand(skill);
    if (command) {
      registerCommand(commands, command);
    }
  }

  for (const pluginCommand of pluginCommands) {
    registerCommand(commands, projectPluginSlashCommand(pluginCommand));
  }

  return Array.from(commands.values());
}

export function createSlashCommandCatalogSections(
  commands: readonly SlashCommandCatalogItem[],
): SlashCommandCatalogSection[] {
  return SLASH_COMMAND_SECTION_ORDER.flatMap((source) => {
    const sectionCommands = commands.filter((command) => command.source === source);
    if (sectionCommands.length === 0) {
      return [];
    }

    return [
      {
        source,
        title: SLASH_COMMAND_SECTION_TITLES[source],
        commands: sectionCommands,
      },
    ];
  });
}

export function resolveSlashCommandDescription(
  command: Pick<SlashCommandCatalogItem, 'descriptionKey' | 'descriptionKind'>,
  translate: SlashCommandTranslateFn,
): string {
  return command.descriptionKind === 'i18n'
    ? translate(command.descriptionKey)
    : command.descriptionKey;
}

export function resolveSlashCommandSourceLabel(
  command: Pick<SlashCommandCatalogItem, 'source'>,
): string | null {
  return SLASH_COMMAND_SOURCE_LABELS[command.source];
}

export function formatSlashCommandHelpCatalog(
  commands: readonly SlashCommandCatalogItem[],
  translate: SlashCommandTranslateFn,
): string {
  return createSlashCommandCatalogSections(commands)
    .map((section) =>
      [
        section.title,
        ...section.commands.map(
          (entry) => `- \`${entry.name}\` - ${resolveSlashCommandDescription(entry, translate)}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
}

export function filterSlashCommands(
  commands: readonly SlashCommandCatalogItem[],
  filter: string,
  translate: SlashCommandTranslateFn,
): SlashCommandCatalogItem[] {
  const normalizedFilter = normalizeSlashCommandName(filter);
  if (!normalizedFilter) {
    return [...commands];
  }

  return commands.filter((command) => {
    const nameMatch = normalizeSlashCommandName(command.name).includes(normalizedFilter);
    const description = resolveSlashCommandDescription(command, translate).toLowerCase();
    return nameMatch || description.includes(normalizedFilter);
  });
}

export function extractSlashCommandArgs(
  inputValue: string,
  command: Pick<SlashCommandCatalogItem, 'name' | 'commandId' | 'id'>,
): string | undefined {
  const trimmed = inputValue.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }

  const withoutPrefix = trimmed.slice(1);
  const separatorIndex = withoutPrefix.search(/\s/);
  const typedCommand =
    separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, Math.max(separatorIndex, 0));
  const normalizedTypedCommand = normalizeSlashCommandName(typedCommand);
  const acceptedCommands = new Set([
    normalizeSlashCommandName(command.name),
    normalizeSlashCommandName(command.commandId ?? command.id),
  ]);

  if (!acceptedCommands.has(normalizedTypedCommand)) {
    return undefined;
  }

  if (separatorIndex === -1) {
    return undefined;
  }

  const args = withoutPrefix.slice(separatorIndex + 1).trim();
  return args.length > 0 ? args : undefined;
}

function projectSkillSlashCommand(skill: SkillSummary): SlashCommandCatalogItem | null {
  if (!skill.slashCommand || !skill.enabled) {
    return null;
  }

  return {
    id: skill.id,
    commandId: skill.slashCommand,
    name: `/${skill.slashCommand}`,
    descriptionKey: skill.description,
    icon: skill.icon || '🔧',
    source: 'skill',
    skillId: skill.id,
    descriptionKind: 'literal',
  };
}

function projectPluginSlashCommand(def: RegisteredPluginSlashCommand): SlashCommandCatalogItem {
  return {
    id: `plugin:${def.extensionId}:${def.id}`,
    commandId: def.id,
    name: def.name.startsWith('/') ? def.name : `/${def.name}`,
    descriptionKey: def.description,
    icon: def.icon || '🔌',
    source: 'plugin',
    extensionId: def.extensionId,
    descriptionKind: 'literal',
  };
}

function projectBuiltinSlashCommand(def: BuiltinSlashCommandDefinition): SlashCommandCatalogItem {
  return {
    id: def.name,
    commandId: def.name,
    name: `/${def.name}`,
    descriptionKey: `chat.commands.${def.name}`,
    icon: BUILTIN_COMMAND_ICONS[def.name],
    source: 'builtin',
    descriptionKind: 'i18n',
  };
}

function registerCommand(
  commands: Map<string, SlashCommandCatalogItem>,
  command: SlashCommandCatalogItem,
): void {
  const key = normalizeSlashCommandName(command.name);
  if (!commands.has(key)) {
    commands.set(key, command);
  }
}
