import { Badge, Button } from '@neko/ui/primitives';
import type { SkillCatalogAction, SkillCatalogActionId } from '@neko/shared';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardSkill } from '../types';

export interface SkillListProps {
  readonly skills: readonly DashboardSkill[];
  readonly onCommand: (skill: DashboardSkill) => void;
  readonly onSkillAction: (
    skill: DashboardSkill | undefined,
    action: SkillCatalogActionId,
    input?: { readonly skillName?: string },
  ) => void;
}

interface SkillGroups {
  readonly primary: readonly DashboardSkill[];
  readonly focusedByParent: ReadonlyMap<string, readonly DashboardSkill[]>;
  readonly advanced: readonly DashboardSkill[];
}

type SkillSectionId = 'primary' | 'advanced';

const MAX_VISIBLE_TAGS = 3;
const DEFAULT_EXPANDED_SECTIONS: readonly SkillSectionId[] = ['primary'];
const ALL_SKILL_SECTION_IDS: readonly SkillSectionId[] = ['primary', 'advanced'];

export function SkillList({ skills, onCommand, onSkillAction }: SkillListProps) {
  const { t } = useTranslation();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<SkillSectionId>>(
    () => new Set(DEFAULT_EXPANDED_SECTIONS),
  );
  const [expandedParents, setExpandedParents] = useState<ReadonlySet<string>>(() => new Set());
  const installedSkills = useMemo(() => filterInstalledSkills(skills), [skills]);
  const availableTags = useMemo(() => getAvailableTags(installedSkills), [installedSkills]);
  useEffect(() => {
    if (activeTag !== null && !availableTags.includes(activeTag)) {
      setActiveTag(null);
    }
  }, [activeTag, availableTags]);
  useEffect(() => {
    if (activeTag !== null) {
      setExpandedSections(new Set(ALL_SKILL_SECTION_IDS));
    }
  }, [activeTag]);

  const visibleSkills = useMemo(
    () =>
      activeTag === null
        ? installedSkills
        : installedSkills.filter((skill) => skill.tags?.some((tag) => tag === activeTag) ?? false),
    [activeTag, installedSkills],
  );
  const groups = useMemo(() => groupSkills(visibleSkills), [visibleSkills]);
  const visibleCount = groups.primary.length + groups.advanced.length;
  const skillCountText =
    activeTag === null
      ? t('dashboard.skills.count', { count: installedSkills.length })
      : t('dashboard.skills.filteredCount', {
          shown: visibleSkills.length,
          total: installedSkills.length,
        });

  return (
    <section
      className="panel skill-list-panel"
      aria-label={t('dashboard.skills')}
      data-skill-count={installedSkills.length}
    >
      <div className="skill-list-header">
        <div>
          <h2>{t('dashboard.skills')}</h2>
          <span className="skill-list-count">{skillCountText}</span>
        </div>
        <div className="skill-list-actions">
          {availableTags.length > 0 ? (
            <select
              className="skill-filter-select"
              aria-label={t('dashboard.skills.filterByTag')}
              value={activeTag ?? ''}
              onChange={(event) => setActiveTag(event.currentTarget.value || null)}
            >
              <option value="">{t('dashboard.skills.allTags')}</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const skillName = globalThis.prompt?.(
                t('dashboard.skills.newNamePrompt'),
                'new-skill',
              );
              if (skillName) {
                onSkillAction(undefined, 'create', { skillName });
              }
            }}
          >
            {t('dashboard.skills.new')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSkillAction(undefined, 'rescan')}>
            {t('dashboard.skills.rescan')}
          </Button>
        </div>
      </div>
      {installedSkills.length === 0 ? (
        <p className="empty-cell">{t('dashboard.skills.empty')}</p>
      ) : (
        <>
          {visibleCount === 0 ? (
            <p className="empty-cell">{t('dashboard.skills.noFilteredResults')}</p>
          ) : null}
          {groups.primary.length > 0 ? (
            <SkillSection
              title={t('dashboard.skills.primary')}
              count={groups.primary.length}
              expanded={expandedSections.has('primary')}
              onToggle={() =>
                setExpandedSections((sections) => toggleSetValue(sections, 'primary'))
              }
            >
              <div className="skill-row-list" role="list">
                {groups.primary.map((skill) => (
                  <Fragment key={getSkillKey(skill)}>
                    <SkillRow
                      skill={skill}
                      childCount={(groups.focusedByParent.get(skill.id) ?? []).length}
                      childrenExpanded={expandedParents.has(getSkillKey(skill))}
                      onToggleChildren={() =>
                        setExpandedParents((parents) => toggleSetValue(parents, getSkillKey(skill)))
                      }
                      onCommand={onCommand}
                      onSkillAction={onSkillAction}
                    />
                    {expandedParents.has(getSkillKey(skill))
                      ? (groups.focusedByParent.get(skill.id) ?? []).map((child) => (
                          <SkillRow
                            key={getSkillKey(child)}
                            skill={child}
                            density="child"
                            onCommand={onCommand}
                            onSkillAction={onSkillAction}
                          />
                        ))
                      : null}
                  </Fragment>
                ))}
              </div>
            </SkillSection>
          ) : null}
          {groups.advanced.length > 0 ? (
            <SkillSection
              title={t('dashboard.skills.advanced')}
              count={groups.advanced.length}
              expanded={expandedSections.has('advanced')}
              onToggle={() =>
                setExpandedSections((sections) => toggleSetValue(sections, 'advanced'))
              }
            >
              <div className="skill-row-list advanced" role="list">
                {groups.advanced.map((skill) => (
                  <SkillRow
                    key={`${getSkillKey(skill)}:advanced`}
                    skill={skill}
                    density="compact"
                    onCommand={onCommand}
                    onSkillAction={onSkillAction}
                  />
                ))}
              </div>
            </SkillSection>
          ) : null}
        </>
      )}
    </section>
  );
}

function SkillSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="skill-section">
      <button
        type="button"
        className="skill-section-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="skill-section-title">
          <span className="skill-section-caret" aria-hidden="true" />
          <span>{title}</span>
        </span>
        <span className="skill-section-count">{count}</span>
      </button>
      {expanded ? children : null}
    </section>
  );
}

function getAvailableTags(skills: readonly DashboardSkill[]): readonly string[] {
  const counts = new Map<string, number>();

  for (const skill of skills) {
    for (const tag of skill.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([leftTag, leftCount], [rightTag, rightCount]) => {
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }
      return leftTag.localeCompare(rightTag);
    })
    .map(([tag]) => tag);
}

function filterInstalledSkills(skills: readonly DashboardSkill[]): readonly DashboardSkill[] {
  return skills.filter(
    (skill) =>
      skill.catalog.visibility !== 'hidden' &&
      skill.catalog.role !== 'quick-action' &&
      skill.catalog.role !== 'persona',
  );
}

function groupSkills(skills: readonly DashboardSkill[]): SkillGroups {
  const visible = skills.filter((skill) => skill.catalog.visibility !== 'hidden');
  const focused = visible.filter((skill) => skill.catalog.role === 'focused-skill');
  const focusedByParent = new Map<string, DashboardSkill[]>();
  for (const skill of focused) {
    const parentIds =
      skill.catalog.parentSkillIds ?? (skill.catalog.groupId ? [skill.catalog.groupId] : []);
    for (const parentId of parentIds) {
      const list = focusedByParent.get(parentId) ?? [];
      list.push(skill);
      focusedByParent.set(parentId, list);
    }
  }

  const visibleIds = new Set(visible.map((skill) => skill.id));
  const hasVisibleParent = (skill: DashboardSkill): boolean => {
    const parentIds =
      skill.catalog.parentSkillIds ?? (skill.catalog.groupId ? [skill.catalog.groupId] : []);
    return parentIds.some((parentId) => visibleIds.has(parentId));
  };

  return {
    primary: visible.filter(
      (skill) =>
        skill.catalog.visibility === 'primary' &&
        (skill.catalog.role === 'orchestrator' || skill.catalog.role === 'standalone'),
    ),
    focusedByParent,
    advanced: visible.filter(
      (skill) =>
        (skill.catalog.role !== 'focused-skill' && skill.catalog.visibility === 'advanced') ||
        (skill.catalog.role === 'focused-skill' && !hasVisibleParent(skill)),
    ),
  };
}

interface SkillRowProps {
  readonly skill: DashboardSkill;
  readonly childCount?: number;
  readonly childrenExpanded?: boolean;
  readonly density?: 'default' | 'compact' | 'child';
  readonly onToggleChildren?: () => void;
  readonly onCommand: (skill: DashboardSkill) => void;
  readonly onSkillAction: (
    skill: DashboardSkill | undefined,
    action: SkillCatalogActionId,
    input?: { readonly skillName?: string },
  ) => void;
}

function SkillRow({
  skill,
  childCount = 0,
  childrenExpanded = false,
  density = 'default',
  onToggleChildren,
  onCommand,
  onSkillAction,
}: SkillRowProps) {
  const { t } = useTranslation();
  const visibleTags = getVisibleTags(skill.tags);
  const hiddenTagCount = getHiddenCount(skill.tags, MAX_VISIBLE_TAGS);
  const rowClassName = density === 'default' ? 'skill-row' : `skill-row ${density}`;

  return (
    <div className={rowClassName} role="listitem" data-skill-id={skill.id}>
      <div className="skill-row-main">
        <div className="skill-row-title">
          <SkillIcon skill={skill} />
          <div className="skill-row-heading">
            <span className="skill-row-name">{skill.name}</span>
            <div className="skill-row-badges">
              <Badge className="h-auto rounded-full px-2 py-0.5">
                {t(`dashboard.skills.source.${skill.catalog.source}`)}
              </Badge>
              {skill.catalog.role === 'focused-skill' ? (
                <Badge className="h-auto rounded-full px-2 py-0.5" tone="accent">
                  {t('dashboard.skills.role.focused-skill')}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <span className="skill-row-desc">{skill.description}</span>
        {visibleTags.length > 0 ? (
          <div className="skill-row-tags">
            {visibleTags.map((tag) => (
              <Badge key={tag} className="h-auto rounded-full px-2 py-0.5">
                {tag}
              </Badge>
            ))}
            {hiddenTagCount > 0 ? (
              <Badge className="h-auto rounded-full px-2 py-0.5">+{hiddenTagCount}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="skill-row-actions">
        {childCount > 0 && onToggleChildren ? (
          <button
            type="button"
            className="skill-child-toggle"
            aria-expanded={childrenExpanded}
            onClick={onToggleChildren}
          >
            <span className="skill-child-toggle-caret" aria-hidden="true" />
            {t('dashboard.skills.childSkillsWithCount', { count: childCount })}
          </button>
        ) : null}
        {getRowActions(skill).map((action) => (
          <Button
            key={`${action.id}:${action.targetSource ?? ''}`}
            className="skill-row-action"
            size="sm"
            variant={action.id === 'run' ? 'default' : 'secondary'}
            onClick={() => handleAction(skill, action.id, onCommand, onSkillAction)}
          >
            {t(`dashboard.skills.action.${action.id}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SkillIcon({ skill }: { readonly skill: DashboardSkill }) {
  const Icon = getSkillIcon(skill);

  return (
    <span className={`skill-row-icon skill-row-icon--${skill.catalog.role}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

function getSkillIcon(skill: DashboardSkill): () => ReactNode {
  switch (skill.catalog.role) {
    case 'orchestrator':
      return LayersIcon;
    case 'quick-action':
      return PlayIcon;
    case 'focused-skill':
      return FileIcon;
    case 'persona':
      return SettingsIcon;
    case 'standalone':
      return PackageIcon;
    default:
      return CodeIcon;
  }
}

function iconBase() {
  return {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: false,
  };
}

function CodeIcon() {
  return (
    <svg {...iconBase()}>
      <polyline points="16,18 22,12 16,6" />
      <polyline points="8,6 2,12 8,18" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13,2 13,9 20,9" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg {...iconBase()}>
      <polygon points="12,2 2,7 12,12 22,7" />
      <polyline points="2,17 12,22 22,17" />
      <polyline points="2,12 12,17 22,12" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg {...iconBase()}>
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconBase()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function getVisibleTags(tags: readonly string[] | undefined): readonly string[] {
  return tags?.slice(0, MAX_VISIBLE_TAGS) ?? [];
}

function getHiddenCount(items: readonly unknown[] | undefined, visibleLimit: number): number {
  return Math.max(0, (items?.length ?? 0) - visibleLimit);
}

function getRowActions(skill: DashboardSkill): readonly SkillCatalogAction[] {
  return skill.catalog.actions.filter(
    (action) =>
      action.id === 'run' ||
      action.id === 'edit' ||
      action.id === 'reveal' ||
      action.id === 'fork' ||
      action.id === 'duplicate',
  );
}

function getSkillKey(skill: DashboardSkill): string {
  return `${skill.extensionId}:${skill.id}:${skill.catalog.source}`;
}

function toggleSetValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(values);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function handleAction(
  skill: DashboardSkill,
  action: SkillCatalogActionId,
  onCommand: (skill: DashboardSkill) => void,
  onSkillAction: (
    skill: DashboardSkill | undefined,
    action: SkillCatalogActionId,
    input?: { readonly skillName?: string },
  ) => void,
): void {
  if (action === 'run' && skill.command) {
    onCommand(skill);
    return;
  }
  if (action === 'duplicate') {
    const skillName = globalThis.prompt?.('New skill name', `${skill.id}-copy`) ?? undefined;
    if (!skillName) return;
    onSkillAction(skill, action, { skillName });
    return;
  }
  onSkillAction(skill, action);
}
