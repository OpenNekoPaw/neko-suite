/**
 * Skill Content Editor Component
 *
 * Displays skill directory content for viewing:
 * - SKILL.md content preview (click to open in editor)
 * - references/ documents (click to open)
 * - scripts/ files (click to open)
 *
 * Directory structure:
 * my-skill/
 * ├── SKILL.md           # Main instruction
 * ├── references/
 * │   ├── REFERENCE.md   # API documentation
 * │   └── EXAMPLES.md    # Usage examples
 * └── scripts/
 *     └── helper.py      # Helper scripts
 */
import type { SkillReference, SkillScript, SkillSource } from '@uniedit/shared';
import { useTranslation } from '@/i18n/I18nContext';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

// =============================================================================
// Types
// =============================================================================

interface SkillContentEditorProps {
  /** Skill name */
  skillName: string;
  /** Skill source */
  source: SkillSource;
  /** SKILL.md content preview */
  skillContent?: string;
  /** Available references from skill directory */
  availableReferences?: SkillReference[];
  /** Available scripts from skill directory */
  availableScripts?: SkillScript[];
}

// =============================================================================
// ScrollableSection Component
// =============================================================================

interface ScrollableSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  maxHeight?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  t: (key: string) => string;
}

function ScrollableSection({
  title,
  count,
  children,
  emptyMessage,
  isEmpty,
  maxHeight = '120px',
  collapsible = false,
  defaultExpanded = true,
  t,
}: ScrollableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-2 py-1 bg-[var(--vscode-sideBarSectionHeader-background)] border-b border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]"
        onClick={() => collapsible && setExpanded(!expanded)}
        disabled={!collapsible}
      >
        <div className="flex items-center gap-1.5">
          {collapsible && (
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className="text-[10px] font-medium text-[var(--vscode-sideBarSectionHeader-foreground)]">
            {title}
          </span>
        </div>
        {count !== undefined && count > 0 && (
          <span className="text-[9px] px-1 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
            {count}
          </span>
        )}
      </button>
      {/* Content */}
      {expanded && (
        isEmpty ? (
          <p className="px-2 py-2 text-[9px] text-[var(--vscode-descriptionForeground)] italic">
            {emptyMessage ?? t('settings.skills.noItems')}
          </p>
        ) : (
          <div className="overflow-y-auto p-1" style={{ maxHeight }}>
            {children}
          </div>
        )
      )}
    </div>
  );
}

// =============================================================================
// FileItem Component - Clickable file item
// =============================================================================

interface FileItemProps {
  name: string;
  icon: string;
  description?: string;
  suffix?: string;
  onClick: () => void;
}

function FileItem({ name, icon, description, suffix, onClick }: FileItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[var(--vscode-list-hoverBackground)] text-left group"
      title={description || name}
    >
      <span className="text-[10px] flex-shrink-0">{icon}</span>
      <span className="text-[10px] truncate flex-1">{name}</span>
      {suffix && (
        <span className="text-[9px] text-[var(--vscode-descriptionForeground)] flex-shrink-0">
          {suffix}
        </span>
      )}
      <svg
        className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  );
}

// =============================================================================
// Imports
// =============================================================================

import { useState } from 'react';

// =============================================================================
// Main Component
// =============================================================================

export function SkillContentEditor({
  skillName,
  source,
  skillContent,
  availableReferences = [],
  availableScripts = [],
}: SkillContentEditorProps) {
  const { t } = useTranslation();

  // ==========================================================================
  // File Open Handlers
  // ==========================================================================

  const handleOpenSkillFile = () => {
    if (source === 'builtin') return;
    VSCodeMessages.openSkillFile(skillName, source as 'personal' | 'project', 'skill');
  };

  const handleOpenReference = (ref: SkillReference) => {
    if (source === 'builtin') return;
    VSCodeMessages.openSkillFile(skillName, source as 'personal' | 'project', 'reference', ref.path);
  };

  const handleOpenScript = (script: SkillScript) => {
    if (source === 'builtin') return;
    VSCodeMessages.openSkillFile(skillName, source as 'personal' | 'project', 'script', script.path);
  };

  // ==========================================================================
  // Helpers
  // ==========================================================================

  const getLanguageIcon = (lang: string) => {
    switch (lang) {
      case 'python': return '🐍';
      case 'typescript':
      case 'javascript': return '📜';
      case 'shell': return '🖥️';
      default: return '📄';
    }
  };

  const getLanguageSuffix = (lang: string) => {
    switch (lang) {
      case 'python': return '.py';
      case 'typescript': return '.ts';
      case 'javascript': return '.js';
      case 'shell': return '.sh';
      default: return '';
    }
  };

  const isBuiltin = source === 'builtin';

  return (
    <div className="space-y-1.5">
      {/* SKILL.md Preview */}
      <ScrollableSection
        title={`SKILL.md - ${skillName}`}
        maxHeight="100px"
        collapsible
        defaultExpanded={true}
        t={t}
      >
        {skillContent ? (
          <div className="relative">
            <pre className="text-[9px] text-[var(--vscode-descriptionForeground)] whitespace-pre-wrap font-mono p-1">
              {skillContent.slice(0, 500)}
              {skillContent.length > 500 && '...'}
            </pre>
            {!isBuiltin && (
              <button
                onClick={handleOpenSkillFile}
                className="absolute top-1 right-1 p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
                title={t('settings.skills.openInVSCode')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <p className="text-[9px] text-[var(--vscode-descriptionForeground)] italic p-1">
            {isBuiltin ? t('settings.skills.builtinNoEdit') : t('settings.skills.noSkillContent')}
          </p>
        )}
      </ScrollableSection>

      {/* References */}
      <ScrollableSection
        title={t('settings.skills.references')}
        count={availableReferences.length}
        isEmpty={availableReferences.length === 0}
        emptyMessage={t('settings.skills.noReferences')}
        maxHeight="100px"
        t={t}
      >
        <div className="space-y-0.5">
          {availableReferences.map((ref) => (
            <FileItem
              key={ref.path}
              name={ref.name}
              icon="📄"
              description={ref.description || ref.path}
              onClick={() => handleOpenReference(ref)}
            />
          ))}
        </div>
      </ScrollableSection>

      {/* Scripts */}
      <ScrollableSection
        title={t('settings.skills.scripts')}
        count={availableScripts.length}
        isEmpty={availableScripts.length === 0}
        emptyMessage={t('settings.skills.noScripts')}
        maxHeight="100px"
        t={t}
      >
        <div className="space-y-0.5">
          {availableScripts.map((script) => (
            <FileItem
              key={script.path}
              name={script.name}
              icon={getLanguageIcon(script.language)}
              description={script.description || script.path}
              suffix={getLanguageSuffix(script.language)}
              onClick={() => handleOpenScript(script)}
            />
          ))}
        </div>
      </ScrollableSection>
    </div>
  );
}

export default SkillContentEditor;
