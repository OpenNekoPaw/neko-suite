/**
 * Skill Injection Indicator
 *
 * Shows when a skill is actively injected into the conversation.
 */
import { PackageIcon } from '@neko/shared/icons';
import type { AgentCapabilityActivationProvenance } from '@neko/shared';
import { useTranslation } from '@/i18n/I18nContext';

export interface ActiveSkillIndicator {
  skillName: string;
  allowedTools?: readonly string[];
  records?: readonly ActiveSkillLifecycleIndicator[];
}

export interface ActiveSkillLifecycleIndicator {
  id: string;
  skillName: string;
  slot: string;
  owner: string;
  clearable: boolean;
  lockedReason?: string;
  expires?: string;
  status?: string;
  allowedTools?: readonly string[];
  provenance?: AgentCapabilityActivationProvenance;
}

interface SkillIndicatorProps {
  skill: ActiveSkillIndicator;
  onClear?: (recordId?: string) => void;
}

export function SkillIndicator({ skill, onClear }: SkillIndicatorProps) {
  const { t } = useTranslation();
  const records =
    skill.records && skill.records.length > 0 ? skill.records : [skillToRecord(skill)];

  return (
    <div className="agent-skill-notice" role="note" aria-label={t('chat.skill.active')}>
      <span className="agent-skill-notice-icon" aria-hidden="true">
        <PackageIcon size={14} />
      </span>
      <span className="agent-skill-notice-label">{t('chat.skill.active')}</span>
      <span className="agent-skill-notice-records">
        {records.map((record) => (
          <span key={record.id} className="agent-skill-notice-record">
            <code className="agent-skill-notice-name">{record.skillName}</code>
            <span className="agent-skill-notice-meta" title={record.slot}>
              {projectSkillLifecycleToken(t, 'slot', record.slot)}
            </span>
            {record.owner ? (
              <span className="agent-skill-notice-meta" title={record.owner}>
                {projectSkillLifecycleToken(t, 'owner', record.owner)}
              </span>
            ) : null}
            {record.provenance ? (
              <span className="agent-skill-notice-meta" title={record.provenance.reason}>
                {formatSkillActivationProvenance(t, record.provenance)}
              </span>
            ) : null}
            {record.allowedTools && record.allowedTools.length > 0 ? (
              <span className="agent-skill-notice-meta">
                {t('chat.skill.toolLimit', { count: record.allowedTools.length })}
              </span>
            ) : null}
            {record.lockedReason ? (
              <span className="agent-skill-notice-meta" title={record.lockedReason}>
                {projectSkillLockedReason(t, record.lockedReason)}
              </span>
            ) : !record.clearable ? (
              <span className="agent-skill-notice-meta">{t('chat.skill.locked')}</span>
            ) : null}
            {record.expires ? (
              <span className="agent-skill-notice-meta">
                {t('chat.skill.expires', { expires: record.expires })}
              </span>
            ) : null}
            {onClear && record.clearable ? (
              <button
                type="button"
                onClick={() => onClear(record.id)}
                className="agent-skill-notice-clear"
                aria-label={`${t('chat.skill.clear')}: ${record.skillName} (${projectSkillLifecycleToken(t, 'slot', record.slot)})`}
              >
                {t('chat.skill.clear')}
              </button>
            ) : null}
          </span>
        ))}
      </span>
    </div>
  );
}

function skillToRecord(skill: ActiveSkillIndicator): ActiveSkillLifecycleIndicator {
  return {
    id: skill.skillName,
    skillName: skill.skillName,
    slot: 'domainSkill',
    owner: 'user',
    clearable: true,
    ...(skill.allowedTools ? { allowedTools: skill.allowedTools } : {}),
  };
}

function formatSkillActivationProvenance(
  t: (key: string) => string,
  provenance: AgentCapabilityActivationProvenance,
): string {
  const key = `chat.skill.provenance.${provenance.source}`;
  const label = t(key);
  if (label !== key) return label;
  return provenance.source === 'agent-tool' ? 'Agent tool' : 'User';
}

type SkillTranslation = (key: string, params?: Record<string, string | number>) => string;

function projectSkillLifecycleToken(
  t: SkillTranslation,
  kind: 'slot' | 'owner',
  token: string,
): string {
  const key = `chat.skill.${kind}.${token}`;
  const label = t(key);
  return label === key ? token : label;
}

function projectSkillLockedReason(_t: SkillTranslation, reason: string): string {
  return reason;
}
