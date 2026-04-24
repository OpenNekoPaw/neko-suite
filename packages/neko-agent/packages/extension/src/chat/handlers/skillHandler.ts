/**
 * Skill Handler - Claude-compatible Skill System
 *
 * Handles skill-related operations:
 * - Get available skills for slash command menu
 * - Apply skills (inject prompt into conversation)
 * - Semantic skill discovery
 * - User confirmation flow
 *
 * Claude Skill Architecture:
 * - Skills are Markdown documents that teach Claude how to perform tasks
 * - Skills inject system prompts into conversation context
 * - ToolGuard restricts which tools can be used during skill execution
 */

import * as vscode from 'vscode';
import type {
  SkillSummary,
  Skill,
  SkillInjection,
  SkillDiscoveryResult,
  SkillApplicationResult,
  SkillService,
} from '@neko/agent';
import { toSkillSummary } from '@neko/agent';
import type { SkillToolDefinition } from '@neko/shared';
import { getLogger } from '../../base';

const logger = getLogger('SkillHandler');

export interface SkillHandlerDeps {
  skillService?: SkillService;
  /** AgentManager for applying skill injection to the active session */
  agentManager?: import('../../ai/agentManager').IAgentManager;
  /** Returns the currently active conversation ID */
  getActiveConversationId?: () => string | undefined;
}

/**
 * Skill application state - Tracks active skill for UI state
 */
export interface ActiveSkillState {
  /** Applied skill */
  skill: Skill;
  /** Injection result */
  injection: SkillInjection;
  /** Timestamp when skill was applied */
  appliedAt: number;
}

/**
 * Skill injection message - Sent when skill is applied
 */
export interface SkillInjectionMessage {
  type: 'skillInjection';
  skillName: string;
  systemPrompt: string;
  allowedTools?: string[];
  model?: string;
  /** Tool definitions from skill's tools.md - to be injected into AI request */
  toolDefinitions?: SkillToolDefinition[];
}

export class SkillHandler {
  private _deps: SkillHandlerDeps;
  private _activeSkill?: ActiveSkillState;

  constructor(deps: SkillHandlerDeps = {}) {
    this._deps = deps;
  }

  /**
   * Update dependencies after service initialization
   */
  setDependencies(deps: SkillHandlerDeps): void {
    this._deps = deps;
  }

  // ===========================================================================
  // Skill List (for UI)
  // ===========================================================================

  /**
   * Send available skills list to webview
   * Used for slash command autocomplete menu
   */
  sendSkillsList(webview: vscode.Webview): void {
    const { skillService } = this._deps;
    if (!skillService) {
      webview.postMessage({ type: 'skillsList', skills: [] });
      return;
    }

    try {
      // Get all skills from registry via skillService
      const allSkills = skillService.registry.listSkills();

      // Convert to SkillSummary format for UI
      const summaries: SkillSummary[] = allSkills.map((skill: Skill) => toSkillSummary(skill));

      webview.postMessage({ type: 'skillsList', skills: summaries });
    } catch (error) {
      logger.error('Failed to get skills:', error);
      webview.postMessage({ type: 'skillsList', skills: [] });
    }
  }

  // ===========================================================================
  // Slash Command Invocation
  // ===========================================================================

  /**
   * Handle slash command invocation
   * e.g., /commit "fix bug", /review-pr 123
   *
   * Note: Slash commands support argument interpolation ($ARGUMENTS, $1, $2, etc.)
   *
   * @param webview Webview to send messages to
   * @param command Slash command name (without /)
   * @param args Arguments passed to the command
   */
  async handleSlashCommand(
    webview: vscode.Webview,
    command: string,
    args?: string,
  ): Promise<SkillApplicationResult | null> {
    const { skillService } = this._deps;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }

    // Look up skill by command name
    const skill = skillService.registry.getSkillByCommand(command);
    if (!skill) {
      return { applied: false, error: `Unknown command: /${command}` };
    }

    // Apply the skill with argument interpolation
    try {
      const injection = await skillService.apply(skill, args);
      this._activeSkill = {
        skill,
        injection,
        appliedAt: Date.now(),
      };

      // Send injection to webview for conversation context
      this._sendSkillInjection(webview, injection);

      return { applied: true, injection, skill };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Semantic Discovery
  // ===========================================================================

  /**
   * Discover skills that match user input
   * Used for automatic skill suggestion
   *
   * @param userInput User's message text
   * @returns Discovery result with matched skills
   */
  discoverSkills(userInput: string): SkillDiscoveryResult | null {
    const { skillService } = this._deps;
    if (!skillService) {
      return null;
    }

    return skillService.discover(userInput);
  }

  // ===========================================================================
  // Tool Guard (Runtime Enforcement)
  // ===========================================================================

  /**
   * Check if a tool call is allowed by the active skill.
   * Delegates to AgentSession via agentManager.
   */
  isToolAllowed(toolName: string, conversationId?: string): boolean {
    if (!conversationId) return true;
    const agent = this._deps.agentManager?.get(conversationId);
    return agent?.isToolAllowed(toolName) ?? true;
  }

  /**
   * Get the active skill state
   */
  getActiveSkill(): ActiveSkillState | undefined {
    return this._activeSkill;
  }

  /**
   * Clear the active skill (e.g., when conversation ends).
   * Delegates to AgentManager → AgentSession → SkillInjectionCoordinator.
   */
  clearActiveSkill(): void {
    this._activeSkill = undefined;
    const conversationId = this._deps.getActiveConversationId?.();
    if (conversationId) {
      this._deps.agentManager?.clearActiveSkill(conversationId);
    }
  }

  // ===========================================================================
  // Skill Execution (for workflow-based skills)
  // ===========================================================================

  /**
   * Handle skill execution request from webview
   * Used for skills that require input before execution
   *
   * @param webview Webview to send messages to
   * @param skillId Skill ID to execute
   * @param input Input data for the skill
   */
  async handleExecuteSkill(
    webview: vscode.Webview,
    skillId: string,
    input: Record<string, unknown>,
  ): Promise<SkillApplicationResult | null> {
    const { skillService } = this._deps;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }

    // Look up skill by name
    const skill = skillService.registry.getSkill(skillId);
    if (!skill) {
      return { applied: false, error: `Unknown skill: ${skillId}` };
    }

    // Apply the skill (async: may execute shell commands)
    const injection = await skillService.apply(skill);

    // Store active skill state (tool guard is now managed by AgentSession)
    this._activeSkill = {
      skill,
      injection,
      appliedAt: Date.now(),
    };

    // Send injection to webview with tool definitions
    this._sendSkillInjection(webview, injection, skill);

    // Apply injection to the active AgentSession so LLM receives the skill prompt
    // Pass skill for Coordinator to track active skill state + activate ToolSets
    const conversationId = this._deps.getActiveConversationId?.();
    if (conversationId) {
      this._deps.agentManager?.applySkillInjection(conversationId, injection, skill);
    }

    return { applied: true, injection, skill };
  }

  /**
   * Handle skill cancellation request
   *
   * @param skillId Skill ID to cancel
   */
  handleCancelSkill(skillId: string): void {
    // Clear active skill if it matches the cancelled one
    if (this._activeSkill?.skill.name === skillId) {
      this.clearActiveSkill();
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Send skill injection to webview
   */
  private _sendSkillInjection(
    webview: vscode.Webview,
    injection: SkillInjection,
    skill?: Skill,
  ): void {
    const message: SkillInjectionMessage = {
      type: 'skillInjection',
      skillName: injection.name,
      systemPrompt: injection.systemPrompt,
      allowedTools: injection.allowedTools,
      model: injection.model,
      toolDefinitions: skill?.toolDefinitions,
    };

    webview.postMessage(message);
  }
}
