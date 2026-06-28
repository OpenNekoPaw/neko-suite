import type { SkillSummary } from '@/components/ChatView/InputArea/types';
import type { BoundActiveSkillIndicator } from '@/handlers/types';
import type { ActiveSkillLifecycleIndicator } from '@/components/ChatView/SkillIndicator';

export interface ProtocolSkillSummaryForUi {
  name: string;
  description: string;
  icon?: string;
  command?: string;
  source: 'builtin' | 'personal' | 'project' | 'market';
  enabled: boolean;
}

export interface SkillInjectionProjection {
  activeSkill: BoundActiveSkillIndicator;
}

function projectSkillsList<TSkill>(skills: readonly TSkill[] | undefined): TSkill[] {
  return Array.isArray(skills) ? [...skills] : [];
}

export function projectInputSkillSummaries(
  skills: readonly ProtocolSkillSummaryForUi[] | undefined,
): SkillSummary[] {
  return projectSkillsList(skills).map(projectInputSkillSummary);
}

function projectInputSkillSummary(skill: ProtocolSkillSummaryForUi): SkillSummary {
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

export function projectSkillInjectionState(input: {
  conversationId: string;
  skillName: string;
  allowedTools?: readonly string[];
  lifecycle?: {
    records?: readonly ActiveSkillLifecycleIndicator[];
  };
}): SkillInjectionProjection {
  const records =
    input.lifecycle?.records && input.lifecycle.records.length > 0
      ? input.lifecycle.records.map((record) => ({ ...record }))
      : [
          {
            id: input.skillName,
            skillName: input.skillName,
            slot: 'domainSkill',
            owner: 'user',
            clearable: true,
            ...(input.allowedTools ? { allowedTools: [...input.allowedTools] } : {}),
          },
        ];

  return {
    activeSkill: {
      skillName: input.skillName,
      allowedTools: input.allowedTools ? [...input.allowedTools] : undefined,
      records,
      conversationId: input.conversationId,
    },
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
