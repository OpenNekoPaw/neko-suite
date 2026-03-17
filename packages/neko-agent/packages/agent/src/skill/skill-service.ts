/**
 * Skill Service — Stateless orchestration of skill discovery and injection
 *
 * This service integrates:
 * - SkillMatcher: Semantic skill discovery
 * - SkillInjector: Prompt injection preparation
 * - User confirmation flow
 *
 * IMPORTANT: This service is fully stateless — it only builds injection payloads
 * and performs discovery/matching. Active skill state is owned exclusively by
 * SkillInjectionCoordinator (accessed via AgentSession).
 *
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
  SkillDiscoveryResult,
  SkillApplicationResult,
} from '@neko/shared';
import { SkillRegistry } from './skill-registry';
import { SkillInjector } from './skill-injector';
import { KeywordSkillMatcher } from './skill-matcher';

// =============================================================================
// Types
// =============================================================================

// SkillDiscoveryResult and SkillApplicationResult are imported from @neko/shared
export type { SkillDiscoveryResult, SkillApplicationResult };

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
}

// =============================================================================
// Service
// =============================================================================

/**
 * Skill Service — Stateless orchestration
 *
 * Focuses on: discovery, matching, injection preparation.
 * For registry operations, access the registry directly via `skillService.registry`.
 *
 * Active skill state is NOT managed here — use SkillInjectionCoordinator
 * (via AgentSession) for getActiveSkill/clearActiveSkill/isToolAllowed.
 */
export class SkillService {
  /** Skill registry - use directly for register/get/list operations */
  readonly registry: ISkillRegistry;

  private readonly _matcher: ISkillMatcher;
  private readonly _injector: ISkillInjector;
  private readonly _minRelevanceThreshold: number;
  private readonly _autoApplyThreshold: number;

  constructor(config: SkillServiceConfig = {}) {
    this.registry = config.registry || new SkillRegistry();
    this._matcher = config.matcher || new KeywordSkillMatcher();
    this._injector = config.injector || new SkillInjector();
    this._minRelevanceThreshold = config.minRelevanceThreshold ?? 0.3;
    this._autoApplyThreshold = config.autoApplyThreshold ?? 0.9;
  }

  // ===========================================================================
  // Core Orchestration Methods
  // ===========================================================================

  /**
   * Apply a skill — prepare injection payload (no argument interpolation)
   */
  apply(skill: Skill): SkillInjection {
    return this._injector.injectSkill(skill);
  }

  /**
   * Apply a slash command with arguments
   */
  applyCommand(command: SlashCommand, args?: string): SkillApplicationResult {
    try {
      const injection = this._injector.injectCommand(command, args);
      return { applied: true, injection };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
    const skills = this.registry.listSkills();
    const allMatches = this._matcher.match(userInput, skills);
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

  /**
   * Discover and apply skill with optional confirmation
   *
   * @param userInput User's message
   * @param confirmCallback Callback for user confirmation (if required)
   * @returns Application result or null if no skill matched
   */
  async discoverAndApply(
    userInput: string,
    confirmCallback?: ConfirmSkillCallback,
  ): Promise<SkillApplicationResult | null> {
    const discovery = this.discover(userInput);

    if (!discovery.found || !discovery.topMatch) {
      return null;
    }

    const { topMatch, requiresConfirmation } = discovery;

    if (requiresConfirmation && confirmCallback) {
      const confirmed = await confirmCallback(topMatch.skill, topMatch);
      if (!confirmed) {
        return {
          applied: false,
          error: 'User declined skill application',
        };
      }
    }

    const injection = this.apply(topMatch.skill);
    return { applied: true, injection, skill: topMatch.skill };
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
