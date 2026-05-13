import { useTranslation } from '../i18n/I18nContext';
import type { DashboardSkill } from '../types';

export interface SkillListProps {
  readonly skills: readonly DashboardSkill[];
}

export function SkillList({ skills }: SkillListProps) {
  const { t } = useTranslation();

  return (
    <section className="panel" aria-label={t('dashboard.skills')}>
      <h2>{t('dashboard.skills')}</h2>
      {skills.length === 0 ? (
        <p className="empty-cell">{t('dashboard.skills.empty')}</p>
      ) : (
        <div className="skill-grid">
          {skills.map((skill) => (
            <SkillCard key={`${skill.extensionId}:${skill.id}`} skill={skill} />
          ))}
        </div>
      )}
    </section>
  );
}

function SkillCard({ skill }: { readonly skill: DashboardSkill }) {
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
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
