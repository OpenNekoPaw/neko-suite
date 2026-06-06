import { Badge, Button } from '@neko/ui/primitives';
import type { SkillCatalogAction, SkillCatalogActionId } from '@neko/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  readonly orchestrators: readonly DashboardSkill[];
  readonly standalone: readonly DashboardSkill[];
  readonly quickActions: readonly DashboardSkill[];
  readonly focusedByParent: ReadonlyMap<string, readonly DashboardSkill[]>;
  readonly advanced: readonly DashboardSkill[];
}

const MAX_VISIBLE_TAGS = 3;
const MAX_VISIBLE_CHILDREN = 3;

export function SkillList({ skills, onCommand, onSkillAction }: SkillListProps) {
  const { t } = useTranslation();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const availableTags = useMemo(() => getAvailableTags(skills), [skills]);
  useEffect(() => {
    if (activeTag !== null && !availableTags.includes(activeTag)) {
      setActiveTag(null);
    }
  }, [activeTag, availableTags]);

  const visibleSkills = useMemo(
    () =>
      activeTag === null
        ? skills
        : skills.filter((skill) => skill.tags?.some((tag) => tag === activeTag) ?? false),
    [activeTag, skills],
  );
  const groups = useMemo(() => groupSkills(visibleSkills), [visibleSkills]);
  const visibleCount =
    groups.orchestrators.length +
    groups.standalone.length +
    groups.quickActions.length +
    groups.advanced.length;
  const skillCountText =
    activeTag === null
      ? t('dashboard.skills.count', { count: skills.length })
      : t('dashboard.skills.filteredCount', {
          shown: visibleSkills.length,
          total: skills.length,
        });

  return (
    <section className="panel" aria-label={t('dashboard.skills')}>
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
          <Button size="sm" onClick={() => onSkillAction(undefined, 'rescan')}>
            {t('dashboard.skills.rescan')}
          </Button>
        </div>
      </div>
      {skills.length === 0 ? (
        <p className="empty-cell">{t('dashboard.skills.empty')}</p>
      ) : (
        <>
          {visibleCount === 0 ? (
            <p className="empty-cell">{t('dashboard.skills.noFilteredResults')}</p>
          ) : null}
          {groups.orchestrators.length > 0 ? (
            <SkillSection title={t('dashboard.skills.orchestrators')}>
              <div className="skill-grid">
                {groups.orchestrators.map((skill) => (
                  <SkillCard
                    key={`${skill.extensionId}:${skill.id}:${skill.catalog.source}`}
                    skill={skill}
                    children={groups.focusedByParent.get(skill.id) ?? []}
                    onCommand={onCommand}
                    onSkillAction={onSkillAction}
                  />
                ))}
              </div>
            </SkillSection>
          ) : null}
          {groups.standalone.length > 0 ? (
            <SkillSection title={t('dashboard.skills.standalone')}>
              <div className="skill-grid">
                {groups.standalone.map((skill) => (
                  <SkillCard
                    key={`${skill.extensionId}:${skill.id}:${skill.catalog.source}`}
                    skill={skill}
                    onCommand={onCommand}
                    onSkillAction={onSkillAction}
                  />
                ))}
              </div>
            </SkillSection>
          ) : null}
          {groups.quickActions.length > 0 ? (
            <SkillSection title={t('dashboard.skills.quickActions')}>
              <div className="skill-mini-grid">
                {groups.quickActions.map((skill) => (
                  <SkillMiniCard
                    key={`${skill.extensionId}:${skill.id}:${skill.catalog.source}`}
                    skill={skill}
                    onCommand={onCommand}
                    onSkillAction={onSkillAction}
                  />
                ))}
              </div>
            </SkillSection>
          ) : null}
          {groups.advanced.length > 0 ? (
            <div className="skill-advanced">
              <button
                type="button"
                className="skill-advanced-toggle"
                onClick={() => setShowAdvanced((value) => !value)}
              >
                {showAdvanced
                  ? t('dashboard.skills.hideAdvanced')
                  : t('dashboard.skills.showAdvanced', { count: groups.advanced.length })}
              </button>
              {showAdvanced ? (
                <div className="skill-mini-grid advanced">
                  {groups.advanced.map((skill) => (
                    <SkillMiniCard
                      key={`${skill.extensionId}:${skill.id}:${skill.catalog.source}:advanced`}
                      skill={skill}
                      onCommand={onCommand}
                      onSkillAction={onSkillAction}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SkillSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="skill-section">
      <h3>{title}</h3>
      {children}
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

  return {
    orchestrators: visible.filter(
      (skill) => skill.catalog.role === 'orchestrator' && skill.catalog.visibility === 'primary',
    ),
    standalone: visible.filter(
      (skill) => skill.catalog.role === 'standalone' && skill.catalog.visibility === 'primary',
    ),
    quickActions: visible.filter(
      (skill) => skill.catalog.role === 'quick-action' && skill.catalog.visibility === 'primary',
    ),
    focusedByParent,
    advanced: visible.filter(
      (skill) =>
        skill.catalog.visibility === 'advanced' ||
        skill.catalog.role === 'focused-skill' ||
        skill.catalog.role === 'persona',
    ),
  };
}

interface SkillCardProps {
  readonly skill: DashboardSkill;
  readonly children?: readonly DashboardSkill[];
  readonly onCommand: (skill: DashboardSkill) => void;
  readonly onSkillAction: (
    skill: DashboardSkill | undefined,
    action: SkillCatalogActionId,
    input?: { readonly skillName?: string },
  ) => void;
}

function SkillCard({ skill, children = [], onCommand, onSkillAction }: SkillCardProps) {
  const { t } = useTranslation();
  const visibleTags = getVisibleTags(skill.tags);
  const hiddenTagCount = getHiddenCount(skill.tags, MAX_VISIBLE_TAGS);
  const visibleChildren = children.slice(0, MAX_VISIBLE_CHILDREN);
  const hiddenChildCount = Math.max(0, children.length - visibleChildren.length);

  return (
    <div className="skill-card">
      <div className="skill-card-top">
        {skill.icon ? <span className="skill-card-icon">{skill.icon}</span> : null}
        <div className="skill-card-badges">
          <Badge className="h-auto rounded-full px-2 py-0.5">
            {t(`dashboard.skills.source.${skill.catalog.source}`)}
          </Badge>
          <Badge className="h-auto rounded-full px-2 py-0.5">
            {t(`dashboard.skills.role.${skill.catalog.role}`)}
          </Badge>
        </div>
      </div>
      <div className="skill-card-body">
        <span className="skill-card-name">{skill.name}</span>
        <span className="skill-card-desc">{skill.description}</span>
      </div>
      {visibleTags.length > 0 ? (
        <div className="skill-card-tags">
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
      {children.length > 0 ? (
        <div className="skill-child-chip-list" aria-label={t('dashboard.skills.childSkills')}>
          {visibleChildren.map((child) => (
            <span
              key={`${child.extensionId}:${child.id}:${child.catalog.source}`}
              className="skill-child-chip"
            >
              {child.name}
            </span>
          ))}
          {hiddenChildCount > 0 ? (
            <span className="skill-child-chip muted">+{hiddenChildCount}</span>
          ) : null}
        </div>
      ) : null}
      <div className="skill-card-actions">
        {getCardActions(skill).map((action) => (
          <Button
            key={`${action.id}:${action.targetSource ?? ''}`}
            className="skill-card-run"
            size="sm"
            onClick={() => handleAction(skill, action.id, onCommand, onSkillAction)}
          >
            {t(`dashboard.skills.action.${action.id}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SkillMiniCard({ skill, onCommand, onSkillAction }: Omit<SkillCardProps, 'children'>) {
  const { t } = useTranslation();
  const visibleTags = getVisibleTags(skill.tags);
  const hiddenTagCount = getHiddenCount(skill.tags, MAX_VISIBLE_TAGS);

  return (
    <div className="skill-mini-card">
      <div className="skill-mini-main">
        <div className="skill-mini-title">
          {skill.icon ? <span className="skill-card-icon">{skill.icon}</span> : null}
          <span className="skill-card-name">{skill.name}</span>
        </div>
        <div className="skill-mini-badges">
          <Badge className="h-auto rounded-full px-2 py-0.5">
            {t(`dashboard.skills.source.${skill.catalog.source}`)}
          </Badge>
          <Badge className="h-auto rounded-full px-2 py-0.5">
            {t(`dashboard.skills.role.${skill.catalog.role}`)}
          </Badge>
        </div>
        <span className="skill-mini-desc">{skill.description}</span>
        {visibleTags.length > 0 ? (
          <div className="skill-card-tags">
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
      <div className="skill-mini-actions">
        {getCardActions(skill).map((action) => (
          <Button
            key={`${action.id}:${action.targetSource ?? ''}`}
            className="skill-card-run"
            size="sm"
            onClick={() => handleAction(skill, action.id, onCommand, onSkillAction)}
          >
            {t(`dashboard.skills.action.${action.id}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function getVisibleTags(tags: readonly string[] | undefined): readonly string[] {
  return tags?.slice(0, MAX_VISIBLE_TAGS) ?? [];
}

function getHiddenCount(items: readonly unknown[] | undefined, visibleLimit: number): number {
  return Math.max(0, (items?.length ?? 0) - visibleLimit);
}

function getCardActions(skill: DashboardSkill): readonly SkillCatalogAction[] {
  return skill.catalog.actions.filter(
    (action) =>
      action.id === 'run' ||
      action.id === 'edit' ||
      action.id === 'reveal' ||
      action.id === 'fork' ||
      action.id === 'duplicate',
  );
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
