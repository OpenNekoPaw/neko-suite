import type {
  AgentCapabilityActivationProgressEvent,
  Skill,
  SkillApplicationResult,
  SkillDiscoveryResult,
  SkillInjection,
  SkillLifecycleLifetime,
  SkillLifecycleProjection,
  SkillLifecycleRecord,
  SkillLifecycleSlot,
} from '@neko/shared';
import {
  buildAgentPromptChainStartedObservation,
  type AgentPromptChainObservation,
} from '@neko-agent/types';
import {
  createAgentCapabilityActivationIntent,
  createAgentCapabilityActivationProgressEvent,
} from '@neko/shared';
import { normalizeAgentInputTriggerName } from '@neko-agent/types';
import type { SkillService } from './skill-service';
import { defaultSkillLifecycleRequest, SkillLifecycleRuntime } from './skill-lifecycle-runtime';
import {
  buildSkillInjectionMessage,
  buildSkillsListMessage,
  type SkillInjectionMessage,
  type SkillsListMessage,
} from './skill-webview-presenter';

export interface ActiveSkillState {
  readonly skill: Skill;
  readonly injection: SkillInjection;
  readonly appliedAt: number;
}

export interface ConversationSkillAgentBridge {
  applySkillInjection(conversationId: string, injection: SkillInjection, skill?: Skill): void;
  clearActiveSkill(conversationId: string): void;
  isToolAllowed?(conversationId: string, toolName: string): boolean | undefined;
}

export interface ConversationSkillRuntimeLogger {
  error(message: string, details?: unknown): void;
}

export interface ConversationSkillPromptChainObservationPort {
  recordPromptChainObservation(input: AgentPromptChainObservation): AgentPromptChainObservation;
}

export interface ConversationSkillPromptChainContext {
  readonly creationId: string;
  readonly iterationId: string;
  readonly promptChainId: string;
  readonly checkpointId?: string;
  readonly skillRecordId?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ConversationSkillRuntimeDeps {
  readonly skillService?: SkillService;
  readonly agentBridge?: ConversationSkillAgentBridge;
  readonly promptChainObservationPort?: ConversationSkillPromptChainObservationPort;
  readonly onActivationProgress?: (
    conversationId: string,
    events: readonly AgentCapabilityActivationProgressEvent[],
  ) => void;
  readonly now?: () => number;
  readonly logger?: ConversationSkillRuntimeLogger;
}

export interface ApplySlashSkillCommandInput {
  readonly command: string;
  readonly conversationId: string;
  readonly args?: string;
  readonly source?: 'user-explicit' | 'agent-tool';
  readonly requestedBy?: 'user' | 'agent';
  readonly reason?: string;
  readonly creation?: ConversationSkillPromptChainContext;
}

export interface ApplySkillInvocationInput {
  readonly skillName: string;
  readonly conversationId: string;
  readonly args?: string;
  readonly source?: 'user-explicit' | 'agent-tool';
  readonly requestedBy?: 'user' | 'agent';
  readonly reason?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly lifetime?: SkillLifecycleLifetime;
  readonly creation?: ConversationSkillPromptChainContext;
}

export interface ExecuteSkillInput {
  readonly skillId: string;
  readonly conversationId: string;
  readonly creation?: ConversationSkillPromptChainContext;
}

export interface AutoActivateSkillInput {
  readonly userInput: string;
  readonly conversationId: string;
}

const LEGACY_SKILL_ALIASES: Readonly<Record<string, string>> = {
  'quality-assessment': 'media-quality-review',
};

/**
 * Owns per-conversation skill activation state without depending on VSCode.
 *
 * SkillService remains stateless; this runtime coordinates explicit UI-driven
 * activation and exposes the active injection so newly-created AgentSessions
 * can receive the same skill prompt before execution.
 */
export class ConversationSkillRuntime {
  private _deps: ConversationSkillRuntimeDeps;
  private _lifecycleRuntime: SkillLifecycleRuntime | null = null;

  constructor(deps: ConversationSkillRuntimeDeps = {}) {
    this._deps = deps;
  }

  setDependencies(deps: ConversationSkillRuntimeDeps): void {
    this._deps = deps;
    this._lifecycleRuntime = null;
  }

  getSkillService(): SkillService | undefined {
    return this._deps.skillService;
  }

  buildSkillsListMessage(): SkillsListMessage {
    const skillService = this._deps.skillService;
    if (!skillService) {
      return buildSkillsListMessage();
    }

    try {
      return buildSkillsListMessage(skillService.registry.listSkills());
    } catch (error) {
      this._deps.logger?.error('Failed to get skills:', error);
      return buildSkillsListMessage();
    }
  }

  async applySlashCommand(
    input: ApplySlashSkillCommandInput,
  ): Promise<SkillApplicationResult | null> {
    const skillService = this._deps.skillService;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }
    if (!input.conversationId) {
      return { applied: false, error: 'No active conversation' };
    }

    const skill = skillService.registry.getSkillByCommand(input.command);
    if (!skill) {
      return { applied: false, error: `Unknown command: /${input.command}` };
    }
    if (skill.entryPointKind !== 'command-artifact') {
      return {
        applied: false,
        error: `Legacy slash Skill alias is not canonical: /${input.command}. Use ${formatSkillInvocationName(skill.name)}.`,
      };
    }

    return this._applySkill(
      input.conversationId,
      skill,
      input.args,
      {
        source: input.source ?? 'user-explicit',
        requestedBy: input.requestedBy ?? 'user',
        reason: input.reason ?? `Slash command /${input.command}`,
      },
      input.creation,
    );
  }

  async applySkillInvocation(
    input: ApplySkillInvocationInput,
  ): Promise<SkillApplicationResult | null> {
    const requestedSkillName = normalizeAgentInputTriggerName(input.skillName);
    const skillName = resolveCanonicalSkillName(requestedSkillName);
    const skillService = this._deps.skillService;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }
    if (!input.conversationId) {
      return { applied: false, error: 'No active conversation' };
    }

    const skill = skillService.registry.getSkill(skillName);
    if (!skill) {
      return { applied: false, error: `Unknown skill: ${formatSkillInvocationName(skillName)}` };
    }
    if (skill.enabled === false) {
      return {
        applied: false,
        error: `Skill is disabled: ${formatSkillInvocationName(skillName)}`,
      };
    }

    let loadedSkill: Skill | undefined;
    try {
      loadedSkill = await skillService.registry.ensureLoaded(skillName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        applied: false,
        error: `Failed to load skill: ${formatSkillInvocationName(skillName)}: ${reason}`,
      };
    }
    if (!loadedSkill) {
      return {
        applied: false,
        error: `Failed to load skill: ${formatSkillInvocationName(skillName)}`,
      };
    }
    if (loadedSkill.enabled === false) {
      return {
        applied: false,
        error: `Skill is disabled: ${formatSkillInvocationName(skillName)}`,
      };
    }
    if (!loadedSkill.content) {
      return {
        applied: false,
        error: `Skill has no content: ${formatSkillInvocationName(skillName)}`,
      };
    }

    return this._applySkill(
      input.conversationId,
      loadedSkill,
      input.args,
      {
        source: input.source ?? 'user-explicit',
        requestedBy: input.requestedBy ?? 'user',
        reason: input.reason ?? `Skill invocation ${formatSkillInvocationName(skillName)}`,
        ...(input.slot ? { slot: input.slot } : {}),
        ...(input.lifetime ? { lifetime: input.lifetime } : {}),
      },
      input.creation,
    );
  }

  async executeSkill(input: ExecuteSkillInput): Promise<SkillApplicationResult | null> {
    const skillService = this._deps.skillService;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }
    if (!input.conversationId) {
      return { applied: false, error: 'No active conversation' };
    }

    const skill = skillService.registry.getSkill(input.skillId);
    if (!skill) {
      return { applied: false, error: `Unknown skill: ${input.skillId}` };
    }

    return this._applySkill(
      input.conversationId,
      skill,
      undefined,
      {
        source: 'user-explicit',
        requestedBy: 'user',
        reason: `Execute skill ${skill.name}`,
      },
      input.creation,
    );
  }

  async activateDomainSkill(input: ApplySkillInvocationInput): Promise<{
    success: boolean;
    message: string;
    skillName?: string;
    requestedSkillName?: string;
    allowedTools?: string[];
    lifecycleRecordId?: string;
    diagnostics?: readonly import('@neko/shared').SkillLifecycleDiagnostic[];
  }> {
    return this.activateLifecycleSkill({ ...input, slot: 'domainSkill' });
  }

  async activateLifecycleSkill(input: ApplySkillInvocationInput): Promise<{
    success: boolean;
    message: string;
    skillName?: string;
    requestedSkillName?: string;
    allowedTools?: string[];
    lifecycleRecordId?: string;
    diagnostics?: readonly import('@neko/shared').SkillLifecycleDiagnostic[];
  }> {
    const slot = input.slot ?? 'domainSkill';
    const requestedSkillName = normalizeAgentInputTriggerName(input.skillName);
    const canonicalSkillName = resolveCanonicalSkillName(requestedSkillName);
    const aliasDiagnostics = buildLegacySkillAliasDiagnostics(
      requestedSkillName,
      canonicalSkillName,
      input.conversationId,
      slot,
    );
    const result = await this.applySkillInvocation({
      ...input,
      skillName: canonicalSkillName,
      source: input.source ?? 'agent-tool',
      requestedBy: input.requestedBy ?? 'agent',
      reason: input.reason ?? `ActivateSkill requested ${input.skillName}`,
      slot,
    });
    if (!result?.applied) {
      return {
        success: false,
        message: result?.error ?? `Skill "${input.skillName}" was not activated`,
      };
    }

    const record = this.getActiveLifecycleRecords(input.conversationId).find(
      (candidate) => candidate.slot === slot && candidate.skillName === result.skill?.name,
    );
    const activatedSkillName = result.skill?.name ?? canonicalSkillName;
    return {
      success: true,
      message: `Activated skill "${activatedSkillName}"`,
      skillName: activatedSkillName,
      ...(requestedSkillName !== activatedSkillName ? { requestedSkillName } : {}),
      allowedTools: result.injection?.allowedTools ?? result.skill?.allowedTools,
      ...(record ? { lifecycleRecordId: record.id } : {}),
      ...(aliasDiagnostics.length > 0 ? { diagnostics: aliasDiagnostics } : {}),
    };
  }

  async deactivateLifecycleSkill(input: {
    readonly conversationId: string;
    readonly recordId?: string;
    readonly slot?: import('@neko/shared').SkillLifecycleSlot;
    readonly skillName?: string;
    readonly actor?: import('@neko/shared').SkillLifecycleDeactivationActor;
  }): Promise<{
    success: boolean;
    message: string;
    removedRecordIds?: readonly string[];
    diagnostics?: readonly import('@neko/shared').SkillLifecycleDiagnostic[];
  }> {
    const lifecycle = this._getLifecycleRuntime();
    if (!lifecycle) {
      return { success: false, message: 'SkillService not initialized' };
    }

    const result = lifecycle.deactivate({
      conversationId: input.conversationId,
      ...(input.recordId ? { recordId: input.recordId } : {}),
      slot: input.slot ?? 'domainSkill',
      ...(input.skillName ? { skillName: input.skillName } : {}),
      actor: input.actor ?? 'agent',
      reason: 'explicit-clear',
    });
    if (!result.ok) {
      return {
        success: false,
        message: result.diagnostics[0]?.message ?? 'Skill lifecycle deactivation rejected',
        diagnostics: result.diagnostics,
      };
    }

    this._deps.agentBridge?.clearActiveSkill(input.conversationId);
    return {
      success: true,
      message: 'Skill deactivated',
      removedRecordIds: result.removedRecordIds,
      diagnostics: result.diagnostics,
    };
  }

  discoverSkills(userInput: string): SkillDiscoveryResult | null {
    return this._deps.skillService?.discover(userInput) ?? null;
  }

  async autoActivateSkill(input: AutoActivateSkillInput): Promise<SkillApplicationResult | null> {
    if (!input.conversationId) {
      return { applied: false, error: 'No active conversation' };
    }
    return {
      applied: false,
      error: 'Natural-language Skill auto-activation is disabled; use $skill or ActivateSkill.',
    };
  }

  isToolAllowed(toolName: string, conversationId: string): boolean {
    if (!conversationId) return false;
    return this._deps.agentBridge?.isToolAllowed?.(conversationId, toolName) ?? true;
  }

  getActiveSkill(conversationId: string): ActiveSkillState | undefined {
    if (!conversationId) return undefined;
    const records = this.getActiveLifecycleRecords(conversationId);
    const record =
      records.find((candidate) => candidate.slot === 'domainSkill') ??
      records.find((candidate) => candidate.status === 'active');
    return record ? projectLifecycleRecordAsActiveSkill(record) : undefined;
  }

  getActiveLifecycleRecords(conversationId: string): readonly SkillLifecycleRecord[] {
    if (!conversationId) return [];
    return this._getLifecycleRuntime()?.list(conversationId) ?? [];
  }

  getSkillLifecycleRuntime(): SkillLifecycleRuntime | null {
    return this._getLifecycleRuntime();
  }

  projectSkillLifecycle(conversationId: string): SkillLifecycleProjection {
    const lifecycle = this._getLifecycleRuntime();
    if (lifecycle) {
      return lifecycle.project(conversationId);
    }
    return {
      promptSections: [],
      toolPolicy: {
        mode: 'unrestricted',
        contributingRecordIds: [],
        diagnostics: [],
      },
      diagnostics: [],
      visibleIndicators: [],
    };
  }

  applySkillInjection(conversationId: string, injection: SkillInjection, skill: Skill): void {
    if (!conversationId) return;
    this._deps.agentBridge?.applySkillInjection(conversationId, injection, skill);
  }

  clearActiveSkill(conversationId: string): void {
    if (!conversationId) return;
    const lifecycle = this._getLifecycleRuntime();
    lifecycle?.deactivate({
      conversationId,
      slot: 'domainSkill',
      actor: 'user',
      reason: 'explicit-clear',
    });
    this._deps.agentBridge?.clearActiveSkill(conversationId);
  }

  buildSkillInjectionMessage(
    result: SkillApplicationResult,
    conversationId: string,
  ): SkillInjectionMessage | null {
    if (!result.injection) {
      return null;
    }

    return buildSkillInjectionMessage({
      injection: result.injection,
      ...(result.skill ? { skill: result.skill } : {}),
      conversationId,
      lifecycle: this.projectSkillLifecycle(conversationId),
    });
  }

  private async _applySkill(
    conversationId: string,
    skill: Skill,
    args?: string,
    activation: {
      readonly source: 'user-explicit' | 'agent-tool';
      readonly requestedBy: 'user' | 'agent';
      readonly reason?: string;
      readonly slot?: SkillLifecycleSlot;
      readonly lifetime?: SkillLifecycleLifetime;
    } = { source: 'user-explicit', requestedBy: 'user' },
    creation?: ConversationSkillPromptChainContext,
  ): Promise<SkillApplicationResult> {
    const now = this._deps.now?.() ?? Date.now();
    if (creation && !this._deps.promptChainObservationPort) {
      return {
        applied: false,
        error:
          'Agent-native creation metadata was supplied, but no prompt-chain observation port is configured.',
      };
    }
    const intent = createAgentCapabilityActivationIntent({
      conversationId,
      source: activation.source,
      target: 'skill',
      action: 'activate',
      name: skill.name,
      requestedBy: activation.requestedBy,
      ...(activation.reason ? { reason: activation.reason } : {}),
      createdAt: now,
    });
    const events: AgentCapabilityActivationProgressEvent[] = [];
    const emit = (
      step: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['step'],
      status: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['status'],
      extra: Partial<Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]> = {},
    ) => {
      const event = createAgentCapabilityActivationProgressEvent({
        intent,
        step,
        status,
        at: this._deps.now?.() ?? Date.now(),
        ...(extra.recordId !== undefined ? { recordId: extra.recordId } : {}),
        ...(extra.diagnostics !== undefined ? { diagnostics: extra.diagnostics } : {}),
        ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
      });
      events.push(event);
      this._deps.onActivationProgress?.(conversationId, [event]);
    };
    try {
      const skillService = this._deps.skillService;
      if (!skillService) {
        emit('failed', 'failed', {
          diagnostics: [
            {
              severity: 'error',
              code: 'skill-service-missing',
              message: 'SkillService not initialized',
            },
          ],
        });
        return { applied: false, error: 'SkillService not initialized' };
      }

      emit('requested', 'succeeded');
      emit('validated', 'succeeded');
      const injection =
        args === undefined
          ? await skillService.apply(skill)
          : await skillService.apply(skill, args);
      emit('loaded', 'succeeded');
      emit('prepared', 'succeeded', {
        metadata: {
          hasAllowedTools: Boolean(injection.allowedTools?.length),
          hasModelOverride: Boolean(injection.model),
        },
      });
      const lifecycle = this._getLifecycleRuntime();
      let lifecycleRecordId: string | undefined;
      if (lifecycle) {
        const lifecycleRequest = defaultSkillLifecycleRequest({
          conversationId,
          skillName: skill.name,
          owner: activation.requestedBy,
          source: activation.source === 'agent-tool' ? 'explicit-agent' : 'explicit-user',
          ...(args !== undefined ? { args } : {}),
          now,
        });
        const result = lifecycle.activatePrepared({
          ...lifecycleRequest,
          ...(activation.slot ? { slot: activation.slot } : {}),
          ...(activation.lifetime ? { lifetime: activation.lifetime } : {}),
          provenance: {
            intentId: intent.id,
            source: activation.source,
            target: 'skill',
            action: 'activate',
            requestedBy: activation.requestedBy,
            ...(activation.reason ? { reason: activation.reason } : {}),
          },
          skill,
          injection,
        });
        if (!result.ok) {
          emit('failed', 'failed', {
            diagnostics: result.diagnostics.map((diagnostic) => ({
              severity: 'error',
              code: diagnostic.code,
              message: diagnostic.message,
              ...(diagnostic.details ? { details: diagnostic.details } : {}),
            })),
          });
          return {
            applied: false,
            error:
              result.diagnostics[0]?.message ??
              `Failed to activate skill: ${formatSkillInvocationName(skill.name)}`,
          };
        }
        lifecycleRecordId = result.record?.id;
        emit('record-created', 'succeeded', {
          ...(lifecycleRecordId ? { recordId: lifecycleRecordId } : {}),
          metadata: {
            replacedRecordIds: result.replacedRecordIds ?? [],
          },
        });
      }
      this.applySkillInjection(conversationId, injection, skill);
      this._recordPromptChainObservation({
        conversationId,
        skill,
        lifecycleRecordId,
        activation,
        creation,
      });
      emit('projected', 'succeeded', {
        ...(lifecycleRecordId ? { recordId: lifecycleRecordId } : {}),
      });
      emit('active', 'succeeded', {
        ...(lifecycleRecordId ? { recordId: lifecycleRecordId } : {}),
      });
      return { applied: true, injection, skill };
    } catch (error) {
      emit('failed', 'failed', {
        diagnostics: [
          {
            severity: 'error',
            code: 'skill-activation-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private _recordPromptChainObservation(input: {
    readonly conversationId: string;
    readonly skill: Skill;
    readonly lifecycleRecordId?: string;
    readonly activation: {
      readonly source: 'user-explicit' | 'agent-tool';
      readonly requestedBy: 'user' | 'agent';
      readonly reason?: string;
    };
    readonly creation?: ConversationSkillPromptChainContext;
  }): void {
    const creation = input.creation;
    if (!creation) return;

    this._deps.promptChainObservationPort?.recordPromptChainObservation(
      buildAgentPromptChainStartedObservation({
        creationId: creation.creationId,
        iterationId: creation.iterationId,
        promptChainId: creation.promptChainId,
        observedAt: this._deps.now?.() ?? Date.now(),
        skillName: input.skill.name,
        skillRecordId: creation.skillRecordId ?? input.lifecycleRecordId,
        reason: creation.reason ?? input.activation.reason,
        metadata: {
          ...(creation.metadata ?? {}),
          conversationId: input.conversationId,
          source: input.activation.source,
          requestedBy: input.activation.requestedBy,
          ...(creation.checkpointId ? { checkpointId: creation.checkpointId } : {}),
        },
      }),
    );
  }

  private _getLifecycleRuntime(): SkillLifecycleRuntime | null {
    const skillService = this._deps.skillService;
    if (!skillService) return null;
    if (!this._lifecycleRuntime) {
      this._lifecycleRuntime = new SkillLifecycleRuntime({
        skillService,
        now: this._deps.now,
      });
    }
    return this._lifecycleRuntime;
  }
}

function resolveCanonicalSkillName(skillName: string): string {
  return LEGACY_SKILL_ALIASES[skillName] ?? skillName;
}

function buildLegacySkillAliasDiagnostics(
  requestedSkillName: string,
  canonicalSkillName: string,
  conversationId: string,
  slot: SkillLifecycleSlot,
): readonly import('@neko/shared').SkillLifecycleDiagnostic[] {
  if (requestedSkillName === canonicalSkillName) {
    return [];
  }

  return [
    {
      code: 'legacy-skill-alias',
      message: `Legacy skill $${requestedSkillName} was replaced by $${canonicalSkillName}.`,
      conversationId,
      skillName: canonicalSkillName,
      slot,
      details: { requestedSkillName, canonicalSkillName },
    },
  ];
}

function formatSkillInvocationName(skillName: string): string {
  return `$${skillName}`;
}

function projectLifecycleRecordAsActiveSkill(record: SkillLifecycleRecord): ActiveSkillState {
  return {
    skill: {
      name: record.skillName,
      description: record.skillSummary.description,
      content: record.injection.systemPrompt,
      source: record.skillSummary.source,
      enabled: record.status === 'active',
      ...(record.skillSummary.domain ? { domain: record.skillSummary.domain } : {}),
      ...(record.skillSummary.relatedSkills
        ? { referencedSkills: [...record.skillSummary.relatedSkills] }
        : {}),
      ...(record.skillSummary.mediaWorkflow
        ? { mediaWorkflow: record.skillSummary.mediaWorkflow }
        : {}),
    },
    injection: record.injection,
    appliedAt: record.createdAt,
  };
}
