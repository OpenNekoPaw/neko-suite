import type { Skill, SkillInjection } from '@neko/shared';
import type { ISkillProvider, SkillContextSummary } from '../tools/core/meta-tools';
import type { SkillService } from './skill-service';

export interface ConversationSkillProviderEffects {
  getActiveSkill(): Skill | undefined;
  applySkillInjection(injection: SkillInjection, skill: Skill): void | Promise<void>;
  clearActiveSkill(): void | Promise<void>;
}

export interface ConversationSkillProviderOptions {
  skillService: SkillService;
  effects: ConversationSkillProviderEffects;
  logger?: {
    warn?(message: string, details?: unknown): void;
    error?(message: string, details?: unknown): void;
  };
}

export function createConversationSkillProvider(
  options: ConversationSkillProviderOptions,
): ISkillProvider {
  const { skillService, effects, logger } = options;

  return {
    listSkills: () =>
      skillService.registry
        .listSkills()
        .filter((skill) => skill.enabled !== false)
        .map(projectSkillContextSummary),

    getActiveSkill: () => {
      const skill = effects.getActiveSkill();
      return skill ? projectSkillContextSummary(skill) : null;
    },

    activateSkill: async (name) => {
      try {
        const skill = await skillService.registry.ensureLoaded(name);
        if (!skill) {
          logger?.warn?.(`Skill "${name}" not found during activation`);
          return { success: false, message: `Skill "${name}" not found` };
        }

        const injection = await skillService.apply(skill);
        await effects.applySkillInjection(injection, skill);
        return {
          success: true,
          message: `Activated skill "${name}"`,
          allowedTools: injection.allowedTools ?? skill.allowedTools,
        };
      } catch (error) {
        logger?.error?.('Failed to activate skill', { name, error });
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    deactivateSkill: async () => {
      await effects.clearActiveSkill();
      return { success: true, message: 'Skill deactivated' };
    },
  };
}

function projectSkillContextSummary(skill: Skill): SkillContextSummary {
  return {
    name: skill.name,
    description: skill.description || '',
    ...(skill.domain ? { domain: skill.domain } : {}),
    ...(skill.referencedSkills && skill.referencedSkills.length > 0
      ? { relatedSkills: skill.referencedSkills }
      : {}),
    ...(skill.mediaWorkflow ? { mediaWorkflow: skill.mediaWorkflow } : {}),
  };
}
