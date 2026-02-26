/**
 * Skill Settings Component
 *
 * Manages skills and slash commands with skill directory structure:
 * - SKILL.md content
 * - references/ documents
 * - scripts/ files
 * - Allowed tools
 *
 * Also manages ToolSkills for dynamic tool injection.
 */
import { useState, useMemo } from 'react';
import {
  SkillSource,
  type ConfiguredSkill,
  type ConfiguredSlashCommand,
  type SkillReference,
  type ConfiguredToolSkill,
  type ToolSkillSource,
} from '@neko/shared';
import { useTranslation } from '@/i18n/I18nContext';
import { SkillContentEditor } from './SkillContentEditor';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

// =============================================================================
// Types
// =============================================================================

type SkillItem = {
  type: 'skill';
  data: ConfiguredSkill;
} | {
  type: 'command';
  data: ConfiguredSlashCommand;
};

interface SkillSettingsProps {
  skills: ConfiguredSkill[];
  commands: ConfiguredSlashCommand[];
  toolSkills?: ConfiguredToolSkill[];
  onUpdateSkill?: (skill: ConfiguredSkill) => void;
  onDeleteSkill?: (skillName: string) => void;
  onUpdateCommand?: (command: ConfiguredSlashCommand) => void;
  onDeleteCommand?: (commandName: string) => void;
  onDuplicateSkill?: (skill: ConfiguredSkill) => void;
  onDuplicateCommand?: (command: ConfiguredSlashCommand) => void;
  onUpdateToolSkill?: (toolSkill: ConfiguredToolSkill) => void;
  onCreateSkill?: (source: 'personal' | 'project') => void;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Group type for display: builtin vs custom
 */
type SkillGroupType = 'builtin' | 'custom';

// =============================================================================
// Helper Functions
// =============================================================================

function getItemName(item: SkillItem): string {
  if (item.type === 'skill') {
    return item.data.name;
  }
  return item.data.command;
}

function getItemKey(item: SkillItem): string {
  return `${item.type}:${getItemName(item)}`;
}

/**
 * Get localized display name for a skill item
 * For builtin skills, use i18n translations if available
 */
function getLocalizedName(item: SkillItem, t: (key: string) => string): string {
  const name = getItemName(item);
  if (item.data.source === 'builtin') {
    // Try to get translated name from i18n
    const translatedName = t(`settings.skills.builtin.${name}.name`);
    // If translation exists and is different from the key, use it
    if (translatedName && !translatedName.startsWith('settings.skills.builtin.')) {
      return translatedName;
    }
  }
  return name;
}

/**
 * Get localized description for a skill item
 * For builtin skills, use i18n translations if available
 */
function getLocalizedDescription(item: SkillItem, t: (key: string) => string): string {
  const name = getItemName(item);
  if (item.data.source === 'builtin') {
    // Try to get translated description from i18n
    const translatedDesc = t(`settings.skills.builtin.${name}.description`);
    // If translation exists and is different from the key, use it
    if (translatedDesc && !translatedDesc.startsWith('settings.skills.builtin.')) {
      return translatedDesc;
    }
  }
  return item.data.description ?? '';
}

/**
 * Group items by builtin vs custom (personal + project)
 */
function groupByType(items: SkillItem[]): Record<SkillGroupType, SkillItem[]> {
  const groups: Record<SkillGroupType, SkillItem[]> = {
    builtin: [],
    custom: [],
  };

  for (const item of items) {
    if (item.data.source === 'builtin') {
      groups.builtin.push(item);
    } else {
      groups.custom.push(item);
    }
  }

  return groups;
}

/**
 * Get source tag label
 */
function getSourceTag(source: SkillSource, t: (key: string) => string): string {
  if (source === 'personal') {
    return t('settings.skills.tagUser');
  }
  if (source === 'project') {
    return t('settings.skills.tagWorkspace');
  }
  return '';
}

/**
 * Get source tag label for ToolSkill
 */
function getToolSkillSourceTag(source: ToolSkillSource, t: (key: string) => string): string {
  if (source === 'personal') {
    return t('settings.skills.tagUser');
  }
  if (source === 'project') {
    return t('settings.skills.tagWorkspace');
  }
  return '';
}

/**
 * Group section header with count
 */
function GroupHeader({ groupType, count, t }: { groupType: SkillGroupType; count: number; t: (key: string) => string }) {
  const labels: Record<SkillGroupType, string> = {
    builtin: t('settings.skills.groupBuiltin'),
    custom: t('settings.skills.groupCustom'),
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
        {labels[groupType]}
      </span>
      <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
        {count}
      </span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SkillSettings({
  skills,
  commands,
  toolSkills = [],
  onUpdateSkill,
  onDeleteSkill,
  onUpdateCommand,
  onDeleteCommand,
  onDuplicateSkill,
  onDuplicateCommand,
  onUpdateToolSkill,
  onCreateSkill,
}: SkillSettingsProps) {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Record<SkillGroupType, boolean>>({
    builtin: true,
    custom: true,
  });
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedToolSkill, setExpandedToolSkill] = useState<string | null>(null);
  const [toolSkillsExpanded, setToolSkillsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Combine skills and commands
  const allItems = useMemo<SkillItem[]>(() => {
    const skillItems: SkillItem[] = skills.map((s) => ({ type: 'skill' as const, data: s }));
    const commandItems: SkillItem[] = commands.map((c) => ({ type: 'command' as const, data: c }));
    return [...skillItems, ...commandItems];
  }, [skills, commands]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const query = searchQuery.toLowerCase();
    return allItems.filter((item) => {
      const name = getItemName(item).toLowerCase();
      const description = item.data.description?.toLowerCase() ?? '';
      return name.includes(query) || description.includes(query);
    });
  }, [allItems, searchQuery]);

  // Group by builtin vs custom
  const groupedItems = useMemo(() => groupByType(filteredItems), [filteredItems]);

  // Toggle enabled state
  const handleToggle = (item: SkillItem) => {
    if (item.type === 'skill') {
      onUpdateSkill?.({ ...item.data, enabled: !item.data.enabled });
    } else {
      onUpdateCommand?.({ ...item.data, enabled: !item.data.enabled });
    }
  };

  // Delete item
  const handleDelete = (item: SkillItem) => {
    if (item.type === 'skill') {
      onDeleteSkill?.(item.data.name);
    } else {
      onDeleteCommand?.(item.data.command);
    }
  };

  // Duplicate item
  // - If duplicating a personal item: keep in personal
  // - If duplicating builtin or project item: add to project
  const handleDuplicate = (item: SkillItem) => {
    const targetSource = item.data.source === 'personal' ? 'personal' : 'project';

    if (item.type === 'skill') {
      onDuplicateSkill?.({ ...item.data, source: targetSource });
    } else {
      onDuplicateCommand?.({ ...item.data, source: targetSource });
    }
  };

  // Toggle detail view
  const handleToggleDetail = (item: SkillItem) => {
    const key = getItemKey(item);
    setExpandedItem(expandedItem === key ? null : key);
  };

  // Open file in VSCode
  const handleOpenInVSCode = (item: SkillItem) => {
    if (item.data.source === 'builtin') return;
    const source = item.data.source as 'personal' | 'project';
    if (item.type === 'skill') {
      VSCodeMessages.openSkillFile(item.data.name, source, 'skill');
    } else {
      VSCodeMessages.openCommandFile(item.data.command, source);
    }
  };

  // Get file path hint for item
  // Note: skill path hints are hidden as they are not useful for users
  const getFilePathHint = (item: SkillItem): string | null => {
    if (item.data.source === 'builtin') return null;
    if (item.type === 'skill') return null; // Hide path hint for skills
    const isPersonal = item.data.source === 'personal';
    if (item.type === 'command') {
      return isPersonal ? t('settings.skills.commandPersonalPath') : t('settings.skills.commandProjectPath');
    }
    return null;
  };

  // Get available references from skill's contentConfig
  const getSkillReferences = (item: SkillItem): SkillReference[] => {
    if (item.type !== 'skill') return [];
    return item.data.contentConfig?.references ?? [];
  };

  // Get available scripts from skill's contentConfig
  const getSkillScripts = (item: SkillItem) => {
    if (item.type !== 'skill') return [];
    return item.data.contentConfig?.scripts ?? [];
  };

  // Toggle group expansion
  const toggleGroup = (groupType: SkillGroupType) => {
    setExpandedGroups(prev => ({ ...prev, [groupType]: !prev[groupType] }));
  };

  // Render a single item
  const renderItem = (item: SkillItem) => {
    const isEnabled = item.data.enabled !== false;
    const isBuiltin = item.data.source === 'builtin';
    const isCommand = item.type === 'command';
    const key = getItemKey(item);
    const isExpanded = expandedItem === key;
    const sourceTag = getSourceTag(item.data.source, t);

    return (
      <div
        key={key}
        className={`border rounded transition-colors ${
          isEnabled
            ? 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'border-[var(--vscode-panel-border)] opacity-60'
        }`}
      >
        <div className="flex items-center gap-2 p-2">
          {/* Toggle Switch */}
          <button
            onClick={() => handleToggle(item)}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
              isEnabled
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
            }`}
            title={isEnabled ? t('common.disable') : t('common.enable')}
          >
            <span
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                isEnabled
                  ? 'left-4 bg-[var(--vscode-button-foreground)]'
                  : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium flex items-center gap-1.5 ${!isEnabled ? 'opacity-50' : ''}`}>
              {isCommand && <span className="text-[var(--vscode-textLink-foreground)]">/</span>}
              {getLocalizedName(item, t)}
              {/* Source tag for custom items */}
              {!isBuiltin && sourceTag && (
                <span className={`text-[8px] px-1 py-0.5 rounded ${
                  item.data.source === 'personal'
                    ? 'bg-[var(--vscode-textLink-foreground)] text-[var(--vscode-editor-background)]'
                    : 'bg-[var(--vscode-charts-purple)] text-[var(--vscode-editor-background)]'
                } opacity-80`}>
                  {sourceTag}
                </span>
              )}
            </div>
            <div className={`text-[9px] text-[var(--vscode-descriptionForeground)] truncate ${!isEnabled ? 'opacity-50' : ''}`}>
              {getLocalizedDescription(item, t)}
            </div>
            {/* File path hint for non-builtin items */}
            {getFilePathHint(item) && (
              <div className="text-[8px] text-[var(--vscode-descriptionForeground)] opacity-70 mt-0.5">
                {getFilePathHint(item)}
              </div>
            )}
          </div>

          {/* Type badge */}
          <span className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded ${!isEnabled ? 'opacity-50' : ''}`}>
            {isCommand ? t('settings.skills.commandType') : t('settings.skills.skillType')}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {/* Open in VSCode button (for non-builtin items) */}
            {!isBuiltin && (
              <button
                onClick={() => handleOpenInVSCode(item)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                title={t('settings.skills.openInVSCode')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}

            {/* View detail button (for non-builtin skills only) */}
            {item.type === 'skill' && !isBuiltin && (
              <button
                onClick={() => handleToggleDetail(item)}
                className={`p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 ${isExpanded ? 'bg-[var(--vscode-toolbar-hoverBackground)] opacity-100' : ''}`}
                title={t('settings.skills.viewDetail')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}

            {/* Duplicate button */}
            <button
              onClick={() => handleDuplicate(item)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('settings.prompts.duplicate')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Delete button (for non-builtin only) */}
            {!isBuiltin && (
              <button
                onClick={() => handleDelete(item)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 text-[var(--vscode-errorForeground)]"
                title={t('common.remove')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Detail View */}
        {isExpanded && item.type === 'skill' && (
          <div className="border-t border-[var(--vscode-panel-border)] p-3 bg-[var(--vscode-editor-background)]">
            <SkillContentEditor
              skillName={item.data.name}
              source={item.data.source}
              skillContent={item.data.content}
              availableReferences={getSkillReferences(item)}
              availableScripts={getSkillScripts(item)}
            />
          </div>
        )}
      </div>
    );
  };

  // Render a group (builtin or custom)
  const renderGroup = (groupType: SkillGroupType, items: SkillItem[]) => {
    if (items.length === 0) return null;

    const isExpanded = expandedGroups[groupType];

    return (
      <div key={groupType} className="mb-4">
        {/* Group Header */}
        <button
          onClick={() => toggleGroup(groupType)}
          className="w-full flex items-center gap-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded p-1 -ml-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <GroupHeader groupType={groupType} count={items.length} t={t} />
        </button>

        {/* Group Content */}
        {isExpanded && (
          <div className="space-y-1.5 ml-4">
            {items.map(item => renderItem(item))}
          </div>
        )}
      </div>
    );
  };

  // Render a single ToolSkill item
  const renderToolSkillItem = (toolSkill: ConfiguredToolSkill) => {
    const isEnabled = toolSkill.enabled !== false;
    const isBuiltin = toolSkill.source === 'builtin';
    const isExpanded = expandedToolSkill === toolSkill.name;
    const sourceTag = getToolSkillSourceTag(toolSkill.source, t);

    return (
      <div
        key={`toolskill:${toolSkill.name}`}
        className={`border rounded transition-colors ${
          isEnabled
            ? 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'border-[var(--vscode-panel-border)] opacity-60'
        }`}
      >
        <div className="flex items-center gap-2 p-2">
          {/* Toggle Switch */}
          <button
            onClick={() => onUpdateToolSkill?.({ ...toolSkill, enabled: !toolSkill.enabled })}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
              isEnabled
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
            }`}
            title={isEnabled ? t('common.disable') : t('common.enable')}
          >
            <span
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                isEnabled
                  ? 'left-4 bg-[var(--vscode-button-foreground)]'
                  : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium flex items-center gap-1.5 ${!isEnabled ? 'opacity-50' : ''}`}>
              {toolSkill.icon && <span>{toolSkill.icon}</span>}
              {toolSkill.name}
              {/* Default active badge */}
              {toolSkill.defaultActive && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--vscode-charts-green)] text-[var(--vscode-editor-background)] opacity-80">
                  {t('settings.skills.toolSkillDefaultActive')}
                </span>
              )}
              {/* Source tag for custom items */}
              {!isBuiltin && sourceTag && (
                <span className={`text-[8px] px-1 py-0.5 rounded ${
                  toolSkill.source === 'personal'
                    ? 'bg-[var(--vscode-textLink-foreground)] text-[var(--vscode-editor-background)]'
                    : 'bg-[var(--vscode-charts-purple)] text-[var(--vscode-editor-background)]'
                } opacity-80`}>
                  {sourceTag}
                </span>
              )}
            </div>
            <div className={`text-[9px] text-[var(--vscode-descriptionForeground)] truncate ${!isEnabled ? 'opacity-50' : ''}`}>
              {toolSkill.description}
            </div>
          </div>

          {/* Tools count badge */}
          <span className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded ${!isEnabled ? 'opacity-50' : ''}`}>
            {toolSkill.tools.length} {t('settings.skills.toolSkillTools')}
          </span>

          {/* Expand button */}
          <button
            onClick={() => setExpandedToolSkill(isExpanded ? null : toolSkill.name)}
            className={`p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 ${isExpanded ? 'bg-[var(--vscode-toolbar-hoverBackground)] opacity-100' : ''}`}
            title={t('settings.skills.viewDetail')}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Detail View */}
        {isExpanded && (
          <div className="border-t border-[var(--vscode-panel-border)] p-3 bg-[var(--vscode-editor-background)]">
            {/* Tools */}
            <div className="mb-3">
              <div className="text-[10px] font-medium mb-1">{t('settings.skills.toolSkillTools')}</div>
              <div className="flex flex-wrap gap-1">
                {toolSkill.tools.map((tool) => (
                  <span
                    key={tool}
                    className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            {/* Trigger Keywords */}
            {toolSkill.triggerKeywords.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-medium mb-1">{t('settings.skills.toolSkillKeywords')}</div>
                <div className="flex flex-wrap gap-1">
                  {toolSkill.triggerKeywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-textLink-foreground)] text-[var(--vscode-editor-background)] rounded opacity-80"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {toolSkill.dependencies && toolSkill.dependencies.length > 0 && (
              <div>
                <div className="text-[10px] font-medium mb-1">{t('settings.skills.toolSkillDependencies')}</div>
                <div className="flex flex-wrap gap-1">
                  {toolSkill.dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-charts-orange)] text-[var(--vscode-editor-background)] rounded opacity-80"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Group ToolSkills by builtin vs custom
  const groupedToolSkills = useMemo(() => {
    const groups: { builtin: ConfiguredToolSkill[]; custom: ConfiguredToolSkill[] } = {
      builtin: [],
      custom: [],
    };
    for (const ts of toolSkills) {
      if (ts.source === 'builtin') {
        groups.builtin.push(ts);
      } else {
        groups.custom.push(ts);
      }
    }
    return groups;
  }, [toolSkills]);

  return (
    <div className="space-y-4">
      {/* Global Agent Instructions (AGENTS.md) */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <h3 className="text-[12px] font-medium mb-2">{t('settings.prompts.agentsTitle')}</h3>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.prompts.agentsDescription')}
        </p>

        {/* AGENTS.md File Locations */}
        <div className="space-y-2">
          {/* Project-level AGENTS.md */}
          <div className="flex items-center justify-between p-2 border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)]">
            <div className="flex items-center gap-2">
              <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--vscode-charts-purple)] text-[var(--vscode-editor-background)]">
                {t('settings.prompts.tagWorkspace')}
              </span>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                .neko/AGENTS.md
              </span>
            </div>
            <button
              onClick={() => VSCodeMessages.openAgentsFile('project')}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t('settings.prompts.openInVSCode')}
            </button>
          </div>

          {/* Personal-level AGENTS.md */}
          <div className="flex items-center justify-between p-2 border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)]">
            <div className="flex items-center gap-2">
              <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--vscode-textLink-foreground)] text-[var(--vscode-editor-background)]">
                {t('settings.prompts.tagUser')}
              </span>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                ~/.neko/AGENTS.md
              </span>
            </div>
            <button
              onClick={() => VSCodeMessages.openAgentsFile('personal')}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t('settings.prompts.openInVSCode')}
            </button>
          </div>
        </div>

        {/* Priority hint */}
        <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-2">
          {t('settings.prompts.agentsPriorityHint')}
        </p>
      </div>

      {/* Skills & Commands */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[12px] font-medium">{t('settings.skills.title')}</h3>
          {/* New Skill Button */}
          {onCreateSkill && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCreateSkill('project')}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors"
                title={t('settings.skills.createSkillProject')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('settings.skills.createSkill')}
              </button>
            </div>
          )}
        </div>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.skills.description')}
        </p>

        {/* Search Box */}
        <div className="relative mb-3">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--vscode-descriptionForeground)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('settings.skills.searchPlaceholder')}
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            >
              <svg className="w-3 h-3 text-[var(--vscode-descriptionForeground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Grouped items */}
        <div className="space-y-2">
          {filteredItems.length === 0 && searchQuery ? (
            <p className="text-[10px] text-[var(--vscode-descriptionForeground)] text-center py-4">
              {t('settings.skills.noSearchResults')}
            </p>
          ) : (
            <>
              {renderGroup('builtin', groupedItems.builtin)}
              {renderGroup('custom', groupedItems.custom)}
            </>
          )}
        </div>

        {/* Help text */}
        <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-3">
          {t('settings.skills.editHelp')}
        </p>
      </div>

      {/* ToolSkills (Dynamic Tool Injection) */}
      {toolSkills.length > 0 && (
        <div className="border border-[var(--vscode-panel-border)] rounded p-3">
          <button
            onClick={() => setToolSkillsExpanded(!toolSkillsExpanded)}
            className="w-full flex items-center gap-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded p-1 -ml-1"
          >
            <svg
              className={`w-3 h-3 transition-transform ${toolSkillsExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-[12px] font-medium">{t('settings.skills.toolSkillsTitle')}</h3>
            <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
              {toolSkills.length}
            </span>
          </button>

          {toolSkillsExpanded && (
            <>
              <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
                {t('settings.skills.toolSkillsDescription')}
              </p>

              {/* Builtin ToolSkills */}
              {groupedToolSkills.builtin.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
                      {t('settings.skills.groupBuiltin')}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                      {groupedToolSkills.builtin.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 ml-4">
                    {groupedToolSkills.builtin.map(renderToolSkillItem)}
                  </div>
                </div>
              )}

              {/* Custom ToolSkills */}
              {groupedToolSkills.custom.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
                      {t('settings.skills.groupCustom')}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                      {groupedToolSkills.custom.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 ml-4">
                    {groupedToolSkills.custom.map(renderToolSkillItem)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SkillSettings;
