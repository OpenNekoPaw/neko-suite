/**
 * Skill Handler - Claude-compatible Skill System
 *
 * Handles skill-related operations:
 * - Get available skills for slash command menu
 * - Apply skills (inject prompt into conversation)
 * - Preserve explicit $skill and ActivateSkill activation boundaries
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
import type { SkillLifecycleProjection } from '@neko/shared';
import { ConversationSkillRuntime } from '@neko/agent';
import { buildAgentCapabilityActivationProgressMessage } from '@neko-agent/types';
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
  private readonly _webviewsByConversation = new Map<string, vscode.Webview>();

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

  bindConversationWebview(webview: vscode.Webview, conversationId: string): void {
    if (!conversationId) return;
    this._webviewsByConversation.set(conversationId, webview);
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
    this.bindConversationWebview(webview, conversationId);
    const result = await this._runtime.applySlashCommand({
      command,
      conversationId,
      ...(args !== undefined ? { args } : {}),
      source: 'user-explicit',
      requestedBy: 'user',
      reason: `Slash command /${command}`,
    });

    if (result?.applied) {
      this._sendSkillInjection(webview, result, conversationId);
    }
    return result;
  }

  /**
   * Handle explicit $skill invocation.
   */
  async handleSkillInvocation(
    webview: vscode.Webview,
    skillName: string,
    conversationId: string,
    args?: string,
  ): Promise<SkillApplicationResult | null> {
    this.bindConversationWebview(webview, conversationId);
    const result = await this._runtime.applySkillInvocation({
      skillName,
      conversationId,
      ...(args !== undefined ? { args } : {}),
      source: 'user-explicit',
      requestedBy: 'user',
      reason: `Skill invocation $${skillName}`,
    });

    if (result?.applied) {
      this._sendSkillInjection(webview, result, conversationId);
    }
    return result;
  }

  /**
   * Discover matching Skills for UI hints and pre-turn artifact validator routing.
   */
  discoverSkills(userInput: string): SkillDiscoveryResult | null {
    return this._runtime.discoverSkills(userInput);
  }

  async autoActivateSkill(
    webview: vscode.Webview,
    input: {
      readonly conversationId: string;
      readonly userInput: string;
    },
  ): Promise<SkillApplicationResult | null> {
    this.bindConversationWebview(webview, input.conversationId);
    const result = await this._runtime.autoActivateSkill(input);
    if (result?.applied) {
      this._sendSkillInjection(webview, result, input.conversationId);
    }
    return result;
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

  projectSkillLifecycle(conversationId: string): SkillLifecycleProjection {
    return this._runtime.projectSkillLifecycle(conversationId);
  }

  /**
   * Clear the active skill (e.g., when conversation ends).
   * Delegates to AgentManager → AgentSession → SkillInjectionCoordinator.
   */
  clearActiveSkill(
    conversationId: string,
    input?: { readonly recordId?: string; readonly slot?: string; readonly skillName?: string },
  ): void {
    if (input?.recordId || input?.slot || input?.skillName) {
      void this._runtime.deactivateLifecycleSkill({
        conversationId,
        ...(input.recordId ? { recordId: input.recordId } : {}),
        ...(isSkillLifecycleSlot(input.slot) ? { slot: input.slot } : {}),
        ...(input.skillName ? { skillName: input.skillName } : {}),
        actor: 'user',
      });
      return;
    }
    this._runtime.clearActiveSkill(conversationId);
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
      onActivationProgress: (conversationId, events) => {
        if (events.length === 0) return;
        this._postActivationProgress(conversationId, events);
      },
      logger,
    } satisfies ConstructorParameters<typeof ConversationSkillRuntime>[0];
  }

  private _postActivationProgress(
    conversationId: string,
    events: Parameters<typeof buildAgentCapabilityActivationProgressMessage>[0]['events'],
  ): void {
    const webview = this._webviewsByConversation.get(conversationId);
    if (!webview) {
      return;
    }
    const message = buildAgentCapabilityActivationProgressMessage({ conversationId, events });
    void webview.postMessage(message);
  }
}

function isSkillLifecycleSlot(
  value: string | undefined,
): value is import('@neko/shared').SkillLifecycleSlot {
  return (
    value === 'stagePersona' ||
    value === 'domainSkill' ||
    value === 'referenceSkill' ||
    value === 'ephemeralSkill' ||
    value === 'workflowSkill'
  );
}
