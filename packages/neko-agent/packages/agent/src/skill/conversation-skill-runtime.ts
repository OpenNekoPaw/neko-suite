import type {
  Skill,
  SkillApplicationResult,
  SkillDiscoveryResult,
  SkillInjection,
} from '@neko/shared';
import { normalizeAgentInputTriggerName } from '@neko-agent/types';
import type { SkillService } from './skill-service';
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

  constructor(deps: ConversationSkillRuntimeDeps = {}) {
    this._deps = deps;
  }

  setDependencies(deps: ConversationSkillRuntimeDeps): void {
    this._deps = deps;
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
        error: `Legacy slash Skill alias is not canonical: /${input.command}. Use $${skill.name}.`,
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
      return { applied: false, error: `Unknown skill: $${skillName}` };
    }
    if (skill.enabled === false) {
      return { applied: false, error: `Skill is disabled: $${skillName}` };
    }

    let loadedSkill: Skill | undefined;
    try {
      loadedSkill = await skillService.registry.ensureLoaded(skillName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { applied: false, error: `Failed to load skill: $${skillName}: ${reason}` };
    }
    if (!loadedSkill) {
      return { applied: false, error: `Failed to load skill: $${skillName}` };
    }
    if (loadedSkill.enabled === false) {
      return { applied: false, error: `Skill is disabled: $${skillName}` };
    }
    if (!loadedSkill.content) {
      return { applied: false, error: `Skill has no content: $${skillName}` };
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

  applySkillInjection(conversationId: string, injection: SkillInjection, skill: Skill): void {
    if (!conversationId) return;
    this._activeSkills.set(conversationId, {
      skill,
      injection,
      appliedAt: this._deps.now?.() ?? Date.now(),
    });
    this._deps.agentBridge?.applySkillInjection(conversationId, injection, skill);
  }

  clearActiveSkill(conversationId: string): void {
    if (!conversationId) return;
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
      this.applySkillInjection(conversationId, injection, skill);
      return { applied: true, injection, skill };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
