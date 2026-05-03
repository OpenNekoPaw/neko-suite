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
  ActiveSkillState,
  SkillDiscoveryResult,
  SkillApplicationResult,
  SkillService,
} from '@neko/agent';
import { ConversationSkillRuntime } from '@neko/agent';
import { getLogger } from '../../base';

const logger = getLogger('SkillHandler');

export interface SkillHandlerDeps {
  skillService?: SkillService;
  /** AgentManager for applying skill injection to the active session */
  agentManager?: import('../../ai/agentManager').IAgentManager;
}

export class SkillHandler {
  private _deps: SkillHandlerDeps;
  private readonly _runtime: ConversationSkillRuntime;

  constructor(deps: SkillHandlerDeps = {}) {
    this._deps = deps;
    this._runtime = new ConversationSkillRuntime(this._createRuntimeDeps(deps));
  }

  /**
   * Update dependencies after service initialization
   */
  setDependencies(deps: SkillHandlerDeps): void {
    this._deps = deps;
    this._runtime.setDependencies(this._createRuntimeDeps(deps));
  }

  getSkillService(): SkillService | undefined {
    return this._runtime.getSkillService();
  }

  getRuntime(): ConversationSkillRuntime {
    return this._runtime;
  }

  // ===========================================================================
  // Skill List (for UI)
  // ===========================================================================

  /**
   * Send available skills list to webview
   * Used for slash command autocomplete menu
   */
  sendSkillsList(webview: vscode.Webview): void {
    webview.postMessage(this._runtime.buildSkillsListMessage());
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
   * @param conversationId Conversation that owns the skill state
   * @param args Arguments passed to the command
   */
  async handleSlashCommand(
    webview: vscode.Webview,
    command: string,
    conversationId: string,
    args?: string,
  ): Promise<SkillApplicationResult | null> {
    const result = await this._runtime.applySlashCommand({
      command,
      conversationId,
      ...(args !== undefined ? { args } : {}),
    });

    if (result?.applied) {
      this._sendSkillInjection(webview, result, conversationId);
    }
    return result;
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
    return this._runtime.discoverSkills(userInput);
  }

  // ===========================================================================
  // Tool Guard (Runtime Enforcement)
  // ===========================================================================

  /**
   * Check if a tool call is allowed by the active skill.
   * Delegates to AgentSession via agentManager.
   */
  isToolAllowed(toolName: string, conversationId: string): boolean {
    return this._runtime.isToolAllowed(toolName, conversationId);
  }

  /**
   * Get the active skill state
   */
  getActiveSkill(conversationId: string): ActiveSkillState | undefined {
    return this._runtime.getActiveSkill(conversationId);
  }

  /**
   * Clear the active skill (e.g., when conversation ends).
   * Delegates to AgentManager → AgentSession → SkillInjectionCoordinator.
   */
  clearActiveSkill(conversationId: string): void {
    this._runtime.clearActiveSkill(conversationId);
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
   * @param conversationId Conversation that owns the skill state
   * @param input Input data for the skill
   */
  async handleExecuteSkill(
    webview: vscode.Webview,
    skillId: string,
    conversationId: string,
    input: Record<string, unknown> = {},
  ): Promise<SkillApplicationResult | null> {
    void input;
    const result = await this._runtime.executeSkill({ skillId, conversationId });
    if (result?.applied) {
      this._sendSkillInjection(webview, result, conversationId);
    }
    return result;
  }

  /**
   * Handle skill cancellation request
   *
   * @param skillId Skill ID to cancel
   */
  handleCancelSkill(skillId: string, conversationId: string): void {
    this._runtime.cancelSkill(skillId, conversationId);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Send skill injection to webview
   */
  private _sendSkillInjection(
    webview: vscode.Webview,
    result: SkillApplicationResult,
    conversationId: string,
  ): void {
    const message = this._runtime.buildSkillInjectionMessage(result, conversationId);
    if (message) {
      webview.postMessage(message);
    }
  }

  private _createRuntimeDeps(deps: SkillHandlerDeps) {
    const agentManager = deps.agentManager;
    return {
      skillService: deps.skillService,
      ...(agentManager
        ? {
            agentBridge: {
              applySkillInjection: (conversationId, injection, skill) =>
                agentManager.applySkillInjection(conversationId, injection, skill),
              clearActiveSkill: (conversationId) => agentManager.clearActiveSkill(conversationId),
              isToolAllowed: (conversationId, toolName) =>
                agentManager.get(conversationId)?.isToolAllowed(toolName),
            },
          }
        : {}),
      logger,
    } satisfies ConstructorParameters<typeof ConversationSkillRuntime>[0];
  }
}
