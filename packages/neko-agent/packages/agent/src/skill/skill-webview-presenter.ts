import type { Skill, SkillInjection, SkillSummary, SkillToolDefinition } from '@neko/shared';
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
}): SkillInjectionMessage {
  return {
    type: 'skillInjection',
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    skillName: input.injection.name,
    systemPrompt: input.injection.systemPrompt,
    ...(input.injection.allowedTools ? { allowedTools: input.injection.allowedTools } : {}),
    ...(input.injection.model ? { model: input.injection.model } : {}),
    ...(input.skill?.toolDefinitions ? { toolDefinitions: input.skill.toolDefinitions } : {}),
  };
}
