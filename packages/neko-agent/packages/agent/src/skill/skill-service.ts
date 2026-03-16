/**
 * Skill Service - Orchestrates skill discovery, confirmation, and execution
 *
 * This service integrates:
 * - SkillMatcher: Semantic skill discovery
 * - SkillInjector: Prompt injection
 * - ToolGuard: Runtime tool restrictions
 * - User confirmation flow
 *
 * IMPORTANT: This service focuses on orchestration only.
 * For registry operations (register, get, list), use the registry directly:
 *   const registry = skillService.registry;
 *   registry.registerSkill(skill);
 */

import type {
  Skill,
  SlashCommand,
  SkillMatch,
  SkillInjection,
  ISkillRegistry,
  ISkillMatcher,
  ISkillInjector,
  IToolInjectionManager,
} from '@neko/shared';
import { SkillRegistry } from './skill-registry';
import { SkillInjector } from './skill-injector';
import { KeywordSkillMatcher } from './skill-matcher';
import { createToolGuard, type IToolGuard } from './tool-guard';

// =============================================================================
// Types
// =============================================================================

/**
 * Skill discovery result
 */
export interface SkillDiscoveryResult {
  /** Whether any skills were matched */
  found: boolean;
  /** Matched skills (sorted by relevance) */
  matches: SkillMatch[];
  /** Top match (if any) */
  topMatch?: SkillMatch;
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
}

/**
 * Skill application result
 */
export interface SkillApplicationResult {
  /** Whether skill was applied */
  applied: boolean;
  /** Injection result (if applied) */
  injection?: SkillInjection;
  /** Applied skill */
  skill?: Skill;
  /** Error message if failed */
  error?: string;
}

/**
 * User confirmation callback
 * Returns true if user confirms, false if rejected
 */
export type ConfirmSkillCallback = (skill: Skill, match: SkillMatch) => Promise<boolean>;

/**
 * Skill service configuration
 */
export interface SkillServiceConfig {
  /** Skill registry */
  registry?: ISkillRegistry;
  /** Skill matcher */
  matcher?: ISkillMatcher;
  /** Skill injector */
  injector?: ISkillInjector;
  /** Minimum relevance score to suggest skill (0-1) */
  minRelevanceThreshold?: number;
  /** Auto-apply skills above this threshold without confirmation */
  autoApplyThreshold?: number;
  /**
   * Tool injection manager for Track D: automatically activate skill.toolSets when a skill is applied.
   * Optional — existing callers are unaffected when omitted.
   */
  injectionManager?: IToolInjectionManager;
}

// =============================================================================
// Service
// =============================================================================

/**
 * Skill Service implementation
 *
 * Focuses on orchestration: discovery, application, and runtime enforcement.
 * For registry operations, access the registry directly via `skillService.registry`.
 */
export class SkillService {
  /** Skill registry - use directly for register/get/list operations */
  readonly registry: ISkillRegistry;

  private readonly _matcher: ISkillMatcher;
  private readonly _injector: ISkillInjector;
  private readonly _minRelevanceThreshold: number;
  private readonly _autoApplyThreshold: number;
  private readonly _injectionManager?: IToolInjectionManager;

  /** Currently active skill (if any) */
  private _activeSkill?: Skill;
  private _activeToolGuard?: IToolGuard;

  constructor(config: SkillServiceConfig = {}) {
    this.registry = config.registry || new SkillRegistry();
    this._matcher = config.matcher || new KeywordSkillMatcher();
    this._injector = config.injector || new SkillInjector();
    this._minRelevanceThreshold = config.minRelevanceThreshold ?? 0.3;
    this._autoApplyThreshold = config.autoApplyThreshold ?? 0.9;
    this._injectionManager = config.injectionManager;
  }

  // ===========================================================================
  // Core Orchestration Methods
  // ===========================================================================

  /**
   * Match user input to skills
   */
  match(input: string, limit?: number): SkillMatch[] {
    const skills = this.registry.listSkills();
    const matches = this._matcher.match(input, skills);
    return limit ? matches.slice(0, limit) : matches;
  }

  /**
   * Apply a skill (inject into conversation)
   */
  apply(skill: Skill): SkillInjection {
    // Create injection (no argument interpolation for skills)
    const injection = this._injector.injectSkill(skill);

    // Create tool guard
    const toolGuard = createToolGuard(injection.allowedTools, skill.name);

    // Set as active
    this._activeSkill = skill;
    this._activeToolGuard = toolGuard;

    // Track D: activate associated ToolSets in the dynamic injection layer
    if (skill.toolSets && skill.toolSets.length > 0 && this._injectionManager) {
      const state = this._injectionManager.getState();
      for (const toolSetName of skill.toolSets) {
        if (!state.activeToolSets.includes(toolSetName)) {
          this._injectionManager.activateToolSet(toolSetName);
        }
      }
    }

    return injection;
  }

  /**
   * Apply a slash command with arguments
   */
  applyCommand(command: SlashCommand, args?: string): SkillInjection {
    // Create injection with argument interpolation
    return this._injector.injectCommand(command, args);
  }

  /**
   * Get currently active skill (if any)
   */
  getActiveSkill(): Skill | undefined {
    return this._activeSkill;
  }

  /**
   * Clear active skill
   */
  clearActiveSkill(): void {
    // Track D: deactivate toolSets that were activated with the skill
    if (
      this._activeSkill?.toolSets &&
      this._activeSkill.toolSets.length > 0 &&
      this._injectionManager
    ) {
      for (const toolSetName of this._activeSkill.toolSets) {
        this._injectionManager.deactivateToolSet(toolSetName);
      }
    }
    this._activeSkill = undefined;
    this._activeToolGuard = undefined;
  }

  // ===========================================================================
  // Discovery
  // ===========================================================================

  /**
   * Discover skills that match the user's input
   *
   * @param userInput The user's message
   * @returns Discovery result with matched skills
   */
  discover(userInput: string): SkillDiscoveryResult {
    // Get all enabled skills
    const skills = this.registry.listSkills();

    // Run matcher
    const allMatches = this._matcher.match(userInput, skills);

    // Filter by minimum relevance
    const matches = allMatches.filter((m) => m.relevance >= this._minRelevanceThreshold);

    if (matches.length === 0) {
      return {
        found: false,
        matches: [],
        requiresConfirmation: false,
      };
    }

    const topMatch = matches[0];
    const requiresConfirmation =
      topMatch !== undefined && topMatch.relevance < this._autoApplyThreshold;

    return {
      found: true,
      matches,
      topMatch,
      requiresConfirmation,
    };
  }

  // ===========================================================================
  // Application with Full Result
  // ===========================================================================

  /**
   * Apply a skill with full result (including tool guard)
   *
   * Note: For skills, args are NOT supported (no interpolation).
   * Use applyCommandWithResult() for slash commands with arguments.
   *
   * @param skill Skill to apply
   * @returns Application result
   */
  applyWithResult(skill: Skill): SkillApplicationResult {
    try {
      // Create injection (no argument interpolation for skills)
      const injection = this._injector.injectSkill(skill);

      // Set as active (tool guard is now managed by AgentSession)
      this._activeSkill = skill;
      this._activeToolGuard = createToolGuard(injection.allowedTools, skill.name);

      return {
        applied: true,
        injection,
        skill,
      };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply a slash command with full result
   *
   * @param command Slash command to apply
   * @param args Optional arguments for interpolation
   * @returns Application result
   */
  applyCommandWithResult(command: SlashCommand, args?: string): SkillApplicationResult {
    try {
      // Create injection with argument interpolation
      const injection = this._injector.injectCommand(command, args);

      return {
        applied: true,
        injection,
      };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Discover and apply skill with optional confirmation
   *
   * Note: Skills do NOT support arguments. Use registry.getCommand() and applyCommand()
   * for slash commands with arguments.
   *
   * @param userInput User's message
   * @param confirmCallback Callback for user confirmation (if required)
   * @returns Application result or null if no skill matched
   */
  async discoverAndApply(
    userInput: string,
    confirmCallback?: ConfirmSkillCallback,
  ): Promise<SkillApplicationResult | null> {
    // Discover skills
    const discovery = this.discover(userInput);

    if (!discovery.found || !discovery.topMatch) {
      return null;
    }

    const { topMatch, requiresConfirmation } = discovery;

    // If confirmation required and callback provided, ask user
    if (requiresConfirmation && confirmCallback) {
      const confirmed = await confirmCallback(topMatch.skill, topMatch);
      if (!confirmed) {
        return {
          applied: false,
          error: 'User declined skill application',
        };
      }
    }

    // Apply the skill (no args for semantic discovery)
    return this.applyWithResult(topMatch.skill);
  }

  // ===========================================================================
  // Runtime
  // ===========================================================================

  /**
   * Get the active tool guard
   */
  getToolGuard(): IToolGuard | undefined {
    return this._activeToolGuard;
  }

  /**
   * Check if a tool call is allowed by the active skill
   */
  isToolAllowed(toolName: string, args?: Record<string, unknown>): boolean {
    if (!this._activeToolGuard) {
      return true;
    }

    const result = this._activeToolGuard.check({ name: toolName, arguments: args });
    return result.allowed;
  }

  // ===========================================================================
  // Convenience Getters (delegate to registry)
  // ===========================================================================

  /** Number of registered skills */
  get skillCount(): number {
    return this.registry.skillCount;
  }

  /** Number of registered commands */
  get commandCount(): number {
    return this.registry.commandCount;
  }
}

/**
 * Create a skill service with default configuration
 */
export function createSkillService(config?: SkillServiceConfig): SkillService {
  return new SkillService(config);
}
