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
  IToolRegistry,
  ISkillMatcher,
  ISkillInjector,
  SkillDiscoveryResult,
  SkillApplicationResult,
} from '@neko/shared';
import { SkillRegistry } from './skill-registry';
import { SkillInjector } from './skill-injector';
import { KeywordSkillMatcher } from './skill-matcher';
import { getLogger } from '../utils/logger';

// =============================================================================
// Types
// =============================================================================

export type { SkillDiscoveryResult, SkillApplicationResult };

export type ConfirmSkillCallback = (skill: Skill, match: SkillMatch) => Promise<boolean>;

export interface SkillServiceConfig {
  registry?: ISkillRegistry;
  matcher?: ISkillMatcher;
  injector?: ISkillInjector;
  /** Optional tool registry for validating skill allowedTools references */
  toolRegistry?: IToolRegistry;
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
  private readonly _toolRegistry: IToolRegistry | undefined;
  private readonly _minRelevanceThreshold: number;
  private readonly _autoApplyThreshold: number;
  private readonly _logger = getLogger('SkillService');

  constructor(config: SkillServiceConfig = {}) {
    this.registry = config.registry || new SkillRegistry();
    this._matcher = config.matcher || new KeywordSkillMatcher();
    this._injector = config.injector || new SkillInjector();
    this._toolRegistry = config.toolRegistry;
    this._minRelevanceThreshold = config.minRelevanceThreshold ?? 0.3;
    this._autoApplyThreshold = config.autoApplyThreshold ?? 0.9;
  }

  // ===========================================================================
  // Core
  // ===========================================================================

  /**
   * Apply a skill — prepare injection payload.
   * Validates allowedTools references if toolRegistry is available.
   * @param skill Skill to apply
   * @param args Optional arguments (for skills with command trigger)
   */
  async apply(skill: Skill, args?: string): Promise<SkillInjection> {
    this._validateAllowedTools(skill);
    return this._injector.injectSkill(skill, args);
  }

  /**
   * Warn about allowedTools that reference unregistered tools.
   * Non-blocking: logs warnings but does not prevent skill application.
   */
  private _validateAllowedTools(skill: Skill): void {
    if (!this._toolRegistry || !skill.allowedTools || skill.allowedTools.length === 0) {
      return;
    }

    for (const toolName of skill.allowedTools) {
      if (!this._toolRegistry.get(toolName)) {
        this._logger.warn(`Skill "${skill.name}" references unregistered tool "${toolName}"`);
      }
    }
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

    const injection = await this.apply(topMatch.skill);
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
