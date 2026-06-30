import type {
  Skill,
  SkillInjection,
  SkillLifecycleProjection,
  SkillSummary,
  SkillToolDefinition,
} from '@neko/shared';
import { toSkillSummary } from '@neko/shared';

export interface SkillsListMessage {
  type: 'skillsList';
  skills: SkillSummary[];
}

export interface SkillInjectionMessage {
  type: 'skillInjection';
  conversationId?: string;
  skillName: string;
  systemPrompt: string;
  allowedTools?: string[];
  model?: string;
  toolDefinitions?: SkillToolDefinition[];
  lifecycle?: {
    records: Array<{
      id: string;
      skillName: string;
      slot: string;
      owner: string;
      clearable: boolean;
      lockedReason?: string;
      expires?: string;
      status?: string;
      allowedTools?: string[];
    }>;
  };
}

export type SkillsHostMessage = SkillsListMessage;
export type SkillInjectionHostMessage = SkillInjectionMessage;

export function buildSkillsListMessage(skills: readonly Skill[] = []): SkillsListMessage {
  return {
    type: 'skillsList',
    skills: skills.map((skill) => ({
      ...toSkillSummary(skill),
      ...(skill.command ? { command: skill.command } : {}),
      ...(skill.argumentHint ? { argumentHint: skill.argumentHint } : {}),
    })),
  };
}

export function buildSkillInjectionMessage(input: {
  injection: SkillInjection;
  skill?: Skill;
  conversationId?: string;
  lifecycle?: SkillLifecycleProjection;
}): SkillInjectionMessage {
  return {
    type: 'skillInjection',
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    skillName: input.injection.name,
    systemPrompt: input.injection.systemPrompt,
    ...(input.injection.allowedTools ? { allowedTools: input.injection.allowedTools } : {}),
    ...(input.injection.model ? { model: input.injection.model } : {}),
    ...(input.skill?.toolDefinitions ? { toolDefinitions: input.skill.toolDefinitions } : {}),
    ...(input.lifecycle
      ? {
          lifecycle: {
            records: input.lifecycle.visibleIndicators.map((record) => ({
              id: record.id,
              skillName: record.skillName,
              slot: record.slot,
              owner: record.owner,
              clearable: record.clearable,
              ...(record.lockedReason ? { lockedReason: record.lockedReason } : {}),
              ...(record.expires ? { expires: record.expires } : {}),
              ...(record.status ? { status: record.status } : {}),
              ...(record.id === input.lifecycle?.toolPolicy.contributingRecordIds[0] &&
              input.lifecycle.toolPolicy.allowedTools
                ? { allowedTools: [...input.lifecycle.toolPolicy.allowedTools] }
                : {}),
            })),
          },
        }
      : {}),
  };
}
