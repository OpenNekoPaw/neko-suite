import {
  defaultSkillLifecycleRequest,
  SkillLifecycleRuntime as AgentSkillLifecycleRuntime,
  type IAgentSession,
  type SkillLifecycleRuntime,
  type SkillService,
} from '@neko/agent';
import type {
  Skill,
  SkillLifecycleDeactivationRequest,
  SkillLifecycleProjection,
} from '@neko/shared';

export interface CliSkillLifecycleSessionBridge {
  readonly runtime: SkillLifecycleRuntime;
  syncProjection(): SkillLifecycleProjection;
}

export function createCliSkillLifecycleRuntime(skillService: SkillService): SkillLifecycleRuntime {
  return new AgentSkillLifecycleRuntime({ skillService });
}

export function wireCliSkillLifecycleSession(input: {
  readonly session: IAgentSession;
  readonly skillService: SkillService;
  readonly conversationId: string;
  readonly lifecycleRuntime: SkillLifecycleRuntime;
  readonly onProjection?: (projection: SkillLifecycleProjection) => void;
}): CliSkillLifecycleSessionBridge {
  const syncProjection = () => {
    const projection = input.lifecycleRuntime.project(input.conversationId);
    input.onProjection?.(projection);
    synchronizeSessionProjectionAdapter(input.session, projection);
    return projection;
  };

  syncProjection();

  input.session.setSkillProvider({
    listSkills: () =>
      input.skillService.registry
        .listSkills()
        .filter((s) => s.enabled !== false)
        .map((s) => ({ name: s.name, description: s.description || '' })),
    getActiveSkill: () => {
      const record = input.lifecycleRuntime.getActiveDomainRecord(input.conversationId);
      return record
        ? {
            name: record.skillSummary.name,
            description: record.skillSummary.description || '',
          }
        : null;
    },
    getActiveSkillLifecycle: () => {
      const projection = input.lifecycleRuntime.project(input.conversationId);
      return {
        records: projection.visibleIndicators,
        diagnostics: projection.diagnostics,
      };
    },
    activateSkill: async (name: string) => {
      const result = await input.lifecycleRuntime.activate(
        defaultSkillLifecycleRequest({
          conversationId: input.conversationId,
          skillName: name,
          owner: 'agent',
          source: 'explicit-agent',
        }),
      );
      syncProjection();
      if (!result.ok) {
        return {
          success: false,
          message: result.diagnostics[0]?.message ?? `Skill "${name}" was not activated`,
          diagnostics: result.diagnostics,
        };
      }
      return {
        success: true,
        message: `Activated skill "${result.record?.skillName ?? name}"`,
        ...(result.record?.injection.allowedTools
          ? { allowedTools: result.record.injection.allowedTools }
          : {}),
        ...(result.record?.id ? { lifecycleRecordId: result.record.id } : {}),
        diagnostics: result.diagnostics,
      };
    },
    deactivateSkill: (target) => {
      const defaultSlot =
        !target?.recordId && !target?.slot && !target?.skillName
          ? ('domainSkill' as const)
          : undefined;
      const result = input.lifecycleRuntime.deactivate({
        conversationId: input.conversationId,
        ...(target?.recordId ? { recordId: target.recordId } : {}),
        ...(isSkillLifecycleSlot(target?.slot) ? { slot: target.slot } : {}),
        ...(defaultSlot ? { slot: defaultSlot } : {}),
        ...(target?.skillName ? { skillName: target.skillName } : {}),
        actor: 'agent',
        reason: 'explicit-clear',
      });
      syncProjection();
      if (!result.ok) {
        return {
          success: false,
          message: result.diagnostics[0]?.message ?? 'Skill lifecycle deactivation rejected',
          diagnostics: result.diagnostics,
        };
      }
      return {
        success: true,
        message: 'Skill deactivated',
        removedRecordIds: result.removedRecordIds,
        diagnostics: result.diagnostics,
      };
    },
  });

  return {
    runtime: input.lifecycleRuntime,
    syncProjection,
  };
}

export async function activateCliDomainSkill(input: {
  readonly lifecycleRuntime: SkillLifecycleRuntime;
  readonly conversationId: string;
  readonly skillName: string;
  readonly args?: string;
  readonly actor: 'user' | 'agent';
  readonly syncProjection: () => SkillLifecycleProjection;
}): Promise<{
  readonly ok: boolean;
  readonly message?: string;
}> {
  const result = await input.lifecycleRuntime.activate(
    defaultSkillLifecycleRequest({
      conversationId: input.conversationId,
      skillName: input.skillName,
      owner: input.actor,
      source: input.actor === 'user' ? 'explicit-user' : 'explicit-agent',
      ...(input.args !== undefined ? { args: input.args } : {}),
    }),
  );
  input.syncProjection();
  if (!result.ok) {
    return {
      ok: false,
      message: result.diagnostics[0]?.message ?? `Skill "${input.skillName}" was not activated`,
    };
  }
  return { ok: true };
}

export function deactivateCliSkillLifecycle(input: {
  readonly lifecycleRuntime: SkillLifecycleRuntime;
  readonly conversationId: string;
  readonly actor: 'user' | 'agent';
  readonly syncProjection: () => SkillLifecycleProjection;
  readonly target?: {
    readonly recordId?: string;
    readonly slot?: SkillLifecycleDeactivationRequest['slot'];
    readonly skillName?: string;
  };
}): {
  readonly ok: boolean;
  readonly message?: string;
} {
  const defaultSlot =
    !input.target?.recordId && !input.target?.slot && !input.target?.skillName
      ? ('domainSkill' as const)
      : undefined;
  const result = input.lifecycleRuntime.deactivate({
    conversationId: input.conversationId,
    ...(input.target?.recordId ? { recordId: input.target.recordId } : {}),
    ...(input.target?.slot ? { slot: input.target.slot } : {}),
    ...(defaultSlot ? { slot: defaultSlot } : {}),
    ...(input.target?.skillName ? { skillName: input.target.skillName } : {}),
    actor: input.actor,
    reason: 'explicit-clear',
  });
  input.syncProjection();
  if (!result.ok) {
    return {
      ok: false,
      message: result.diagnostics[0]?.message ?? 'Skill lifecycle clear rejected',
    };
  }
  return { ok: true };
}

function synchronizeSessionProjectionAdapter(
  session: IAgentSession,
  projection: SkillLifecycleProjection,
): void {
  if (projection.promptSections.length === 0 && projection.toolPolicy.mode === 'unrestricted') {
    session.clearActiveSkill();
    return;
  }

  const projectedSkill: Skill = {
    name: 'lifecycle-projection',
    description: 'Projected active Skill lifecycle records',
    content: projection.promptSections.map((section) => section.content).join('\n\n'),
    source: 'builtin',
    enabled: true,
  };
  session.applySkillInjection(
    {
      name: projectedSkill.name,
      type: 'skill',
      systemPrompt: projectedSkill.content,
      ...(projection.toolPolicy.allowedTools
        ? { allowedTools: [...projection.toolPolicy.allowedTools] }
        : {}),
      ...(projection.modelOverride ? { model: projection.modelOverride.model } : {}),
    },
    projectedSkill,
  );
}

function isSkillLifecycleSlot(value: unknown): value is SkillLifecycleDeactivationRequest['slot'] {
  return (
    value === 'stagePersona' ||
    value === 'domainSkill' ||
    value === 'referenceSkill' ||
    value === 'ephemeralSkill' ||
    value === 'workflowSkill'
  );
}
