import type {
  ActiveSkillLifecycleProjection,
  CreateSkillInput,
  CreateSkillResult,
  Skill,
  SkillInjection,
  SkillLifecycleDeactivationRequest,
} from '@neko/shared';
import type {
  ISkillProvider,
  SkillActivationRequest,
  SkillContextSummary,
} from '../tools/core/meta-tools';
import type { SkillService } from './skill-service';

export interface ConversationSkillProviderEffects {
  getActiveSkill(): Skill | undefined;
  getActiveSkillLifecycle?(): ActiveSkillLifecycleProjection;
  activateLifecycleSkill?(input: SkillActivationRequest): Promise<{
    success: boolean;
    message: string;
    skillName?: string;
    requestedSkillName?: string;
    allowedTools?: string[];
    lifecycleRecordId?: string;
    diagnostics?: ActiveSkillLifecycleProjection['diagnostics'];
  }>;
  deactivateLifecycleSkill?(input?: {
    readonly recordId?: string;
    readonly slot?: SkillLifecycleDeactivationRequest['slot'];
    readonly skillName?: string;
  }): Promise<{
    success: boolean;
    message: string;
    removedRecordIds?: readonly string[];
    diagnostics?: ActiveSkillLifecycleProjection['diagnostics'];
  }>;
  applySkillInjection(injection: SkillInjection, skill: Skill): void | Promise<void>;
  clearActiveSkill(): void | Promise<void>;
  createSkill?(input: CreateSkillInput): Promise<CreateSkillResult>;
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
  const createSkill = effects.createSkill;

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

    getActiveSkillLifecycle: effects.getActiveSkillLifecycle
      ? () => {
          const projection = effects.getActiveSkillLifecycle?.();
          return {
            records: projection?.records ?? [],
            diagnostics: projection?.diagnostics ?? [],
          };
        }
      : undefined,

    activateSkill: async (input) => {
      if (effects.activateLifecycleSkill) {
        return effects.activateLifecycleSkill(input);
      }

      try {
        const skill = await skillService.registry.ensureLoaded(input.name);
        if (!skill) {
          logger?.warn?.(`Skill "${input.name}" not found during activation`);
          return { success: false, message: `Skill "${input.name}" not found` };
        }

        const injection = await skillService.apply(skill);
        await effects.applySkillInjection(injection, skill);
        return {
          success: true,
          message: `Activated skill "${input.name}"`,
          allowedTools: injection.allowedTools ?? skill.allowedTools,
        };
      } catch (error) {
        logger?.error?.('Failed to activate skill', { name: input.name, error });
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    ...(createSkill
      ? {
          createSkill: (input: CreateSkillInput) => createSkill(input),
        }
      : {}),

    deactivateSkill: async (input) => {
      if (effects.deactivateLifecycleSkill) {
        const requestedSlot = input?.slot;
        return effects.deactivateLifecycleSkill({
          ...(input?.recordId ? { recordId: input.recordId } : {}),
          ...(isSkillLifecycleSlot(requestedSlot) ? { slot: requestedSlot } : {}),
          ...(input?.skillName ? { skillName: input.skillName } : {}),
        });
      }

      await effects.clearActiveSkill();
      return { success: true, message: 'Skill deactivated' };
    },
  };
}

function isSkillLifecycleSlot(value: unknown): value is SkillLifecycleDeactivationRequest['slot'] {
  return (
    value === 'stagePersona' ||
    value === 'domainSkill' ||
    value === 'referenceSkill' ||
    value === 'ephemeralSkill' ||
    value === 'promptChainSkill'
  );
}

function projectSkillContextSummary(skill: Skill): SkillContextSummary {
  const portable = skill.portableDefinition;
  const interfaceMetadata = skill.nekoOverlay?.interface;
  const relationships = skill.nekoOverlay?.relationships;
  return {
    name: portable?.name ?? skill.name,
    description: interfaceMetadata?.shortDescription ?? portable?.description ?? skill.description,
    ...(skill.domain ? { domain: skill.domain } : {}),
    ...(skill.referencedSkills && skill.referencedSkills.length > 0
      ? { relatedSkills: skill.referencedSkills }
      : {}),
    ...(skill.mediaWorkflow ? { mediaWorkflow: skill.mediaWorkflow } : {}),
    ...(interfaceMetadata ? { interface: interfaceMetadata } : {}),
    ...(relationships ? { relationships } : {}),
    ...(skill.hostProjection ? { host: skill.hostProjection } : {}),
  };
}
