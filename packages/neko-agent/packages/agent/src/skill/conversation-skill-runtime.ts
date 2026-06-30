import type {
  Skill,
  SkillApplicationResult,
  SkillDiscoveryResult,
  SkillInjection,
  SkillLifecycleProjection,
  SkillLifecycleRecord,
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

export interface ConversationSkillRuntimeDeps {
  readonly skillService?: SkillService;
  readonly agentBridge?: ConversationSkillAgentBridge;
  readonly now?: () => number;
  readonly logger?: ConversationSkillRuntimeLogger;
}

export interface ApplySlashSkillCommandInput {
  readonly command: string;
  readonly conversationId: string;
  readonly args?: string;
}

export interface ApplySkillInvocationInput {
  readonly skillName: string;
  readonly conversationId: string;
  readonly args?: string;
}

export interface ExecuteSkillInput {
  readonly skillId: string;
  readonly conversationId: string;
}

export interface AutoActivateSkillInput {
  readonly userInput: string;
  readonly conversationId: string;
}

/**
 * Owns per-conversation skill activation state without depending on VSCode.
 *
 * SkillService remains stateless; this runtime coordinates explicit UI-driven
 * activation and exposes the active injection so newly-created AgentSessions
 * can receive the same skill prompt before execution.
 */
export class ConversationSkillRuntime {
  private _deps: ConversationSkillRuntimeDeps;
  private readonly _activeSkills = new Map<string, ActiveSkillState>();
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

    return this._applySkill(input.conversationId, skill, input.args);
  }

  async applySkillInvocation(
    input: ApplySkillInvocationInput,
  ): Promise<SkillApplicationResult | null> {
    const skillName = normalizeAgentInputTriggerName(input.skillName);
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

    return this._applySkill(input.conversationId, loadedSkill, input.args);
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

    return this._applySkill(input.conversationId, skill);
  }

  async activateDomainSkill(input: ApplySkillInvocationInput): Promise<{
    success: boolean;
    message: string;
    allowedTools?: string[];
    lifecycleRecordId?: string;
    diagnostics?: readonly import('@neko/shared').SkillLifecycleDiagnostic[];
  }> {
    const result = await this.applySkillInvocation(input);
    if (!result?.applied) {
      return {
        success: false,
        message: result?.error ?? `Skill "${input.skillName}" was not activated`,
      };
    }

    const record = this.getActiveLifecycleRecords(input.conversationId).find(
      (candidate) => candidate.slot === 'domainSkill' && candidate.skillName === result.skill?.name,
    );
    return {
      success: true,
      message: `Activated skill "${result.skill?.name ?? input.skillName}"`,
      allowedTools: result.injection?.allowedTools ?? result.skill?.allowedTools,
      ...(record ? { lifecycleRecordId: record.id } : {}),
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

    this._activeSkills.delete(input.conversationId);
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
    void input;
    return null;
  }

  isToolAllowed(toolName: string, conversationId: string): boolean {
    if (!conversationId) return false;
    return this._deps.agentBridge?.isToolAllowed?.(conversationId, toolName) ?? true;
  }

  getActiveSkill(conversationId: string): ActiveSkillState | undefined {
    if (!conversationId) return undefined;
    return this._activeSkills.get(conversationId);
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
    this._activeSkills.set(conversationId, {
      skill,
      injection,
      appliedAt: this._deps.now?.() ?? Date.now(),
    });
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
    this._activeSkills.delete(conversationId);
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
  ): Promise<SkillApplicationResult> {
    try {
      const skillService = this._deps.skillService;
      if (!skillService) {
        return { applied: false, error: 'SkillService not initialized' };
      }

      const injection =
        args === undefined
          ? await skillService.apply(skill)
          : await skillService.apply(skill, args);
      const lifecycle = this._getLifecycleRuntime();
      if (lifecycle) {
        const result = lifecycle.activatePrepared({
          ...defaultSkillLifecycleRequest({
            conversationId,
            skillName: skill.name,
            owner: 'user',
            source: 'explicit-user',
            ...(args !== undefined ? { args } : {}),
            now: this._deps.now?.() ?? Date.now(),
          }),
          skill,
          injection,
        });
        if (!result.ok) {
          return {
            applied: false,
            error:
              result.diagnostics[0]?.message ??
              `Failed to activate skill: ${formatSkillInvocationName(skill.name)}`,
          };
        }
      }
      this.applySkillInjection(conversationId, injection, skill);
      return { applied: true, injection, skill };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

function formatSkillInvocationName(skillName: string): string {
  return `$${skillName}`;
}
