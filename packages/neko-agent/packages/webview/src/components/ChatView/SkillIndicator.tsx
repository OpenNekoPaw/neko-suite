/**
 * Skill Injection Indicator
 *
 * Shows when a skill is actively injected into the conversation.
 */
import { PackageIcon } from '@neko/shared/icons';
import { useTranslation } from '@/i18n/I18nContext';

export interface ActiveSkillIndicator {
  skillName: string;
  allowedTools?: readonly string[];
}

interface SkillIndicatorProps {
  skill: ActiveSkillIndicator;
  onClear?: () => void;
}

export function SkillIndicator({ skill, onClear }: SkillIndicatorProps) {
  const { t } = useTranslation();

  return (
    <div className="agent-skill-notice" role="note" aria-label={t('chat.skill.active')}>
      <span className="agent-skill-notice-icon" aria-hidden="true">
        <PackageIcon size={14} />
      </span>
      <span className="agent-skill-notice-label">{t('chat.skill.active')}</span>
      <code className="agent-skill-notice-name">{skill.skillName}</code>
      {skill.allowedTools && skill.allowedTools.length > 0 ? (
        <span className="agent-skill-notice-meta">
          {t('chat.skill.toolLimit', { count: skill.allowedTools.length })}
        </span>
      ) : null}
      {onClear ? (
        <button type="button" onClick={onClear} className="agent-skill-notice-clear">
          {t('chat.skill.clear')}
        </button>
      ) : null}
    </div>
  );
}
