import type { SkillSummary } from '@/components/ChatView/InputArea/types';
import type { BoundActiveSkillIndicator, BoundSkillConfirmRequest } from '@/handlers/types';

export interface ProtocolSkillSummaryForUi {
  name: string;
  description: string;
  icon?: string;
  command?: string;
  source: 'builtin' | 'personal' | 'project' | 'market';
  enabled: boolean;
}

export interface SkillInjectionProjection<TPending extends { conversationId: string } | null> {
  activeSkill: BoundActiveSkillIndicator;
  pendingSkillConfirm: TPending | null;
}

export function projectSkillsList<TSkill>(skills: readonly TSkill[] | undefined): TSkill[] {
  return Array.isArray(skills) ? [...skills] : [];
}

export function projectInputSkillSummaries(
  skills: readonly ProtocolSkillSummaryForUi[] | undefined,
): SkillSummary[] {
  return projectSkillsList(skills).map(projectInputSkillSummary);
}

export function projectInputSkillSummary(skill: ProtocolSkillSummaryForUi): SkillSummary {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    ...(skill.icon ? { icon: skill.icon } : {}),
    ...(skill.command ? { slashCommand: skill.command } : {}),
    tags: [],
    source: projectInputSkillSource(skill.source),
    enabled: skill.enabled,
  };
}

export function projectSkillInjectionState<
  TPending extends BoundSkillConfirmRequest | null,
>(input: {
  conversationId: string;
  skillName: string;
  allowedTools?: readonly string[];
  pendingSkillConfirm: TPending;
}): SkillInjectionProjection<TPending> {
  return {
    activeSkill: {
      skillName: input.skillName,
      allowedTools: input.allowedTools ? [...input.allowedTools] : undefined,
      conversationId: input.conversationId,
    },
    pendingSkillConfirm:
      input.pendingSkillConfirm?.conversationId === input.conversationId
        ? null
        : input.pendingSkillConfirm,
  };
}

function projectInputSkillSource(
  source: ProtocolSkillSummaryForUi['source'],
): SkillSummary['source'] {
  switch (source) {
    case 'personal':
      return 'user';
    case 'market':
      return 'community';
    case 'builtin':
    case 'project':
      return source;
  }
}
