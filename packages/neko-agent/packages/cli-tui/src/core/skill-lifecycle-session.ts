import {
  defaultSkillLifecycleRequest,
  SkillLifecycleRuntime as AgentSkillLifecycleRuntime,
  type IAgentSession,
  type SkillLifecycleRuntime,
  type SkillService,
} from '@neko/agent';
import type {
  CreateSkillInput,
  CreateSkillResult,
  Skill,
  SkillLifecycleDeactivationRequest,
  SkillLifecycleDiagnostic,
  SkillLifecycleProjection,
} from '@neko/shared';

export interface CliSkillLifecycleSessionBridge {
  readonly runtime: SkillLifecycleRuntime;
  syncProjection(): SkillLifecycleProjection;
}

interface CliSkillLifecycleProjectionState {
  readonly activatedToolSets: Set<string>;
}

export function createCliSkillLifecycleRuntime(skillService: SkillService): SkillLifecycleRuntime {
  return new AgentSkillLifecycleRuntime({ skillService });
}

export function wireCliSkillLifecycleSession(input: {
  readonly session: IAgentSession;
  readonly skillService: SkillService;
  readonly conversationId: string;
  readonly lifecycleRuntime: SkillLifecycleRuntime;
  readonly createSkill?: (input: CreateSkillInput) => Promise<CreateSkillResult>;
  readonly onProjection?: (projection: SkillLifecycleProjection) => void;
}): CliSkillLifecycleSessionBridge {
  const projectionState: CliSkillLifecycleProjectionState = {
    activatedToolSets: new Set<string>(),
  };
  const syncProjection = () => {
    const projection = input.lifecycleRuntime.project(input.conversationId);
    input.onProjection?.(projection);
    synchronizeSessionProjectionAdapter(input.session, projection, projectionState);
    return projection;
  };

  syncProjection();
  const createSkill = input.createSkill;

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
    ...(createSkill
      ? {
          createSkill: (request: CreateSkillInput) => createSkill(request),
        }
      : {}),
    activateSkill: async (request) => {
      const result = await input.lifecycleRuntime.activate(
        defaultSkillLifecycleRequest({
          conversationId: input.conversationId,
          skillName: request.name,
          ...(request.slot ? { slot: request.slot } : {}),
          owner: 'agent',
          source: 'explicit-agent',
        }),
      );
      const diagnostics = withActivationReasonDetails(result.diagnostics, request.reason);
      syncProjection();
      if (!result.ok) {
        return {
          success: false,
          message: diagnostics[0]?.message ?? `Skill "${request.name}" was not activated`,
          diagnostics,
        };
      }
      return {
        success: true,
        message: `Activated skill "${result.record?.skillName ?? request.name}"`,
        ...(result.record?.injection.allowedTools
          ? { allowedTools: result.record.injection.allowedTools }
          : {}),
        ...(result.record?.id ? { lifecycleRecordId: result.record.id } : {}),
        diagnostics,
      };
    },
    deactivateSkill: (target) => {
      const requestedSlot = target?.slot;
      const defaultSlot =
        !target?.recordId && !target?.slot && !target?.skillName
          ? ('domainSkill' as const)
          : undefined;
      const result = input.lifecycleRuntime.deactivate({
        conversationId: input.conversationId,
        ...(target?.recordId ? { recordId: target.recordId } : {}),
        ...(isSkillLifecycleSlot(requestedSlot) ? { slot: requestedSlot } : {}),
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
  state: CliSkillLifecycleProjectionState,
): void {
  for (const toolSetName of state.activatedToolSets) {
    session.deactivateToolSet(toolSetName);
  }
  state.activatedToolSets.clear();

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

  if (projection.toolPolicy.activationTools?.length) {
    for (const toolSetName of session.activateToolSetsForTools(
      projection.toolPolicy.activationTools,
    )) {
      state.activatedToolSets.add(toolSetName);
    }
  }
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

function withActivationReasonDetails(
  diagnostics: readonly SkillLifecycleDiagnostic[],
  reason: string,
): readonly SkillLifecycleDiagnostic[] {
  if (diagnostics.length === 0) {
    return diagnostics;
  }
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    details: {
      ...diagnostic.details,
      activationReason: reason,
    },
  }));
}
