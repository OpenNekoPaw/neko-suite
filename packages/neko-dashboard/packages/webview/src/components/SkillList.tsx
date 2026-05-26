import { Badge, Button } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardSkill } from '../types';

export interface SkillListProps {
  readonly skills: readonly DashboardSkill[];
  readonly onCommand: (skill: DashboardSkill) => void;
}

export function SkillList({ skills, onCommand }: SkillListProps) {
  const { t } = useTranslation();

  return (
    <section className="panel" aria-label={t('dashboard.skills')}>
      <h2>{t('dashboard.skills')}</h2>
      {skills.length === 0 ? (
        <p className="empty-cell">{t('dashboard.skills.empty')}</p>
      ) : (
        <div className="skill-grid">
          {skills.map((skill) => (
            <SkillCard
              key={`${skill.extensionId}:${skill.id}`}
              skill={skill}
              onCommand={onCommand}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SkillCardProps {
  readonly skill: DashboardSkill;
  readonly onCommand: (skill: DashboardSkill) => void;
}

function SkillCard({ skill, onCommand }: SkillCardProps) {
  const { t } = useTranslation();

  return (
    <div className="skill-card">
      {skill.icon ? <span className="skill-card-icon">{skill.icon}</span> : null}
      <div className="skill-card-body">
        <span className="skill-card-name">{skill.name}</span>
        <span className="skill-card-desc">{skill.description}</span>
      </div>
      {skill.tags && skill.tags.length > 0 ? (
        <div className="skill-card-tags">
          {skill.tags.map((tag) => (
            <Badge key={tag} className="h-auto rounded-full px-2 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      {skill.command ? (
        <Button className="skill-card-run" size="sm" onClick={() => onCommand(skill)}>
          {t('dashboard.skills.run')}
        </Button>
      ) : null}
    </div>
  );
}
