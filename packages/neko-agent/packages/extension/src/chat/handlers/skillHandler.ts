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
  SlashCommand,
  SkillInjection,
  SkillDiscoveryResult,
  SkillApplicationResult,
  IToolGuard,
  SkillService,
} from '@neko/agent';
import { toSkillSummary, createToolGuard } from '@neko/agent';
import type { SkillToolDefinition } from '@neko/shared';

export interface SkillHandlerDeps {
  skillService?: SkillService;
}

/**
 * Skill application state - Tracks active skill for tool restriction
 */
export interface ActiveSkillState {
  /** Applied skill */
  skill: Skill;
  /** Injection result */
  injection: SkillInjection;
  /** Tool guard for runtime enforcement */
  toolGuard?: IToolGuard;
  /** Timestamp when skill was applied */
  appliedAt: number;
}

/**
 * Skill confirmation request message
 */
export interface SkillConfirmRequest {
  type: 'skillConfirmRequest';
  skillName: string;
  skillDescription: string;
  relevance: number;
  reason: string;
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
      const summaries: SkillSummary[] = allSkills.map((skill: Skill) =>
        toSkillSummary(skill)
      );

      webview.postMessage({ type: 'skillsList', skills: summaries });
    } catch (error) {
      console.error('[SkillHandler] Failed to get skills:', error);
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
  handleSlashCommand(
    webview: vscode.Webview,
    command: string,
    args?: string
  ): SkillApplicationResult | null {
    const { skillService } = this._deps;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }

    // Look up slash command by name
    const slashCommand = skillService.registry.getCommand(command);
    if (!slashCommand) {
      return { applied: false, error: `Unknown command: /${command}` };
    }

    // Apply the slash command with argument interpolation
    const injection = skillService.applyCommand(slashCommand, args);

    // Send injection to webview for conversation context
    // Note: SlashCommand doesn't have toolDefinitions, only Skill does
    this._sendSkillInjection(webview, injection);

    return { applied: true, injection };
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

  /**
   * Handle semantic skill discovery with optional confirmation
   *
   * Note: Skills discovered via semantic matching do NOT support arguments.
   * Arguments are only for slash commands (use handleSlashCommand for that).
   *
   * @param webview Webview for UI communication
   * @param userInput User's message
   */
  async handleDiscoverAndApply(
    webview: vscode.Webview,
    userInput: string
  ): Promise<SkillApplicationResult | null> {
    const { skillService } = this._deps;
    if (!skillService) {
      return null;
    }

    // Use the skill service's discovery and application flow
    // Note: Skills don't support args - only slash commands do
    const result = await skillService.discoverAndApply(
      userInput,
      // Confirmation callback - Ask user via webview
      async (skill: Skill, match: { relevance: number; reason: string }) => {
        return this._requestUserConfirmation(webview, skill, match);
      }
    );

    if (result?.applied && result.injection) {
      // Store active skill state
      this._activeSkill = {
        skill: result.skill!,
        injection: result.injection,
        toolGuard: result.toolGuard,
        appliedAt: Date.now(),
      };

      // Send injection to webview with tool definitions
      this._sendSkillInjection(webview, result.injection, result.skill);
    }

    return result;
  }

  // ===========================================================================
  // Tool Guard (Runtime Enforcement)
  // ===========================================================================

  /**
   * Check if a tool call is allowed by the active skill
   *
   * @param toolName Tool name to check
   * @param args Tool arguments
   * @returns true if allowed, false if blocked
   */
  isToolAllowed(toolName: string, args?: Record<string, unknown>): boolean {
    if (!this._activeSkill?.toolGuard) {
      return true; // No restrictions
    }

    return this._activeSkill.toolGuard.check({ name: toolName, arguments: args }).allowed;
  }

  /**
   * Get the active skill's tool guard
   */
  getActiveToolGuard(): IToolGuard | undefined {
    return this._activeSkill?.toolGuard;
  }

  /**
   * Get the active skill state
   */
  getActiveSkill(): ActiveSkillState | undefined {
    return this._activeSkill;
  }

  /**
   * Clear the active skill (e.g., when conversation ends)
   */
  clearActiveSkill(): void {
    this._activeSkill = undefined;
    this._deps.skillService?.clearActiveSkill();
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
  handleExecuteSkill(
    webview: vscode.Webview,
    skillId: string,
    input: Record<string, unknown>
  ): SkillApplicationResult | null {
    const { skillService } = this._deps;
    if (!skillService) {
      return { applied: false, error: 'SkillService not initialized' };
    }

    // Look up skill by name
    const skill = skillService.registry.getSkill(skillId);
    if (!skill) {
      return { applied: false, error: `Unknown skill: ${skillId}` };
    }

    // Apply the skill
    const injection = skillService.apply(skill);

    // Create tool guard for runtime enforcement
    const toolGuard = createToolGuard(injection.allowedTools, skill.name);

    // Store active skill state
    this._activeSkill = {
      skill,
      injection,
      toolGuard,
      appliedAt: Date.now(),
    };

    // Send injection to webview with tool definitions
    this._sendSkillInjection(webview, injection, skill);

    return { applied: true, injection, skill, toolGuard };
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
    skill?: Skill
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

  /**
   * Request user confirmation for skill application
   * Returns a promise that resolves when user responds
   */
  private _requestUserConfirmation(
    webview: vscode.Webview,
    skill: Skill,
    match: { relevance: number; reason: string }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Send confirmation request to webview
      const request: SkillConfirmRequest = {
        type: 'skillConfirmRequest',
        skillName: skill.name,
        skillDescription: skill.description,
        relevance: match.relevance,
        reason: match.reason,
      };

      webview.postMessage(request);

      // Set up one-time listener for response
      // Note: In real implementation, this would use a proper message handler
      // For now, we'll use VS Code's quick pick as fallback
      vscode.window
        .showQuickPick(['Yes, apply this skill', 'No, skip'], {
          title: `Apply skill "${skill.name}"?`,
          placeHolder: match.reason,
        })
        .then((selection) => {
          resolve(selection === 'Yes, apply this skill');
        });
    });
  }
}
