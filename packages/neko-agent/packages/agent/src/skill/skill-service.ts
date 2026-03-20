/**
 * Skill Service — Stateless orchestration of skill discovery and injection
 *
 * This service integrates:
 * - SkillMatcher: Semantic skill discovery
 * - SkillInjector: Prompt injection preparation
 *
 * IMPORTANT: This service is fully stateless — it only builds injection payloads
 * and performs discovery/matching. Active skill state is owned exclusively by
 * SkillInjectionCoordinator (accessed via AgentSession).
 */

import type {
  Skill,
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

export type { SkillDiscoveryResult, SkillApplicationResult };

export type ConfirmSkillCallback = (skill: Skill, match: SkillMatch) => Promise<boolean>;

export interface SkillServiceConfig {
  registry?: ISkillRegistry;
  matcher?: ISkillMatcher;
  injector?: ISkillInjector;
  minRelevanceThreshold?: number;
  autoApplyThreshold?: number;
}

// =============================================================================
// Service
// =============================================================================

export class SkillService {
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
  // Core
  // ===========================================================================

  /**
   * Apply a skill — prepare injection payload.
   * @param skill Skill to apply
   * @param args Optional arguments (for skills with command trigger)
   */
  apply(skill: Skill, args?: string): SkillInjection {
    return this._injector.injectSkill(skill, args);
  }

  // ===========================================================================
  // Discovery
  // ===========================================================================

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
  // Convenience
  // ===========================================================================

  get skillCount(): number {
    return this.registry.skillCount;
  }
}

export function createSkillService(config?: SkillServiceConfig): SkillService {
  return new SkillService(config);
}
