/**
 * Skill Service — Stateless orchestration of skill discovery and injection
 *
 * This service integrates:
 * - SkillMatcher: candidate discovery for UI/context hints
 * - SkillInjector: Prompt injection preparation
 *
 * IMPORTANT: This service is fully stateless — it only builds injection payloads
 * and performs discovery/matching. Discovery returns candidates only; it must
 * not inject prompts or create active state. Active skill state is owned exclusively by
 * SkillInjectionCoordinator (accessed via AgentSession).
 */

import type {
  Skill,
  SkillMatch,
  SkillInjection,
  ISkillRegistry,
  IToolRegistry,
  ISkillInjector,
  ISkillMatcher,
  SkillDiscoveryResult,
  SkillApplicationResult,
} from '@neko/shared';
import { SkillRegistry } from './skill-registry';
import { SkillInjector } from './skill-injector';
import { createDefaultMatcher } from './skill-matcher';
import { assertSubpackagesAvailable, type ISubpackageResolver } from './subpackage-guard';
import { getLogger } from '../utils/logger';

// =============================================================================
// Types
// =============================================================================

export type { SkillDiscoveryResult, SkillApplicationResult };

export type ConfirmSkillCallback = (skill: Skill, match: SkillMatch) => Promise<boolean>;

export interface SkillServiceConfig {
  registry?: ISkillRegistry;
  injector?: ISkillInjector;
  matcher?: ISkillMatcher;
  /** Optional tool registry for validating skill allowedTools references */
  toolRegistry?: IToolRegistry;
  /**
   * Optional host resolver used by the activation-time subpackage guard
   * (ADR §5.2.10). Omit on platforms without a subpackage registry;
   * the guard will log once per Skill declaring deps and skip.
   */
  subpackageResolver?: ISubpackageResolver;
}

// =============================================================================
// Service
// =============================================================================

export class SkillService {
  readonly registry: ISkillRegistry;

  private readonly _injector: ISkillInjector;
  private readonly _matcher: ISkillMatcher;
  private readonly _toolRegistry: IToolRegistry | undefined;
  private readonly _subpackageResolver: ISubpackageResolver | null;
  private readonly _logger = getLogger('SkillService');

  constructor(config: SkillServiceConfig = {}) {
    this.registry = config.registry || new SkillRegistry();
    this._injector = config.injector || new SkillInjector();
    this._matcher = config.matcher || createDefaultMatcher();
    this._toolRegistry = config.toolRegistry;
    this._subpackageResolver = config.subpackageResolver ?? null;
  }

  // ===========================================================================
  // Core
  // ===========================================================================

  /**
   * Apply a skill — prepare injection payload.
   *
   * Runs two activation-time guards in order:
   *   1. Subpackage dependency check (ADR §5.2.10) — throws
   *      `SkillActivationError` if a required subpackage is missing or
   *      version-incompatible. Optional subpackages only log a warn.
   *   2. allowedTools reference validation — warn-only.
   *
   * @param skill Skill to apply
   * @param args Optional arguments (for skills with command trigger)
   * @throws SkillActivationError when blocking subpackage deps are unmet
   */
  async apply(skill: Skill, args?: string): Promise<SkillInjection> {
    assertSubpackagesAvailable(skill, this._subpackageResolver);
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
    const matches = this._matcher.match(userInput, this.registry.listSkills());
    if (matches.length === 0) {
      return {
        found: false,
        matches: [],
        requiresConfirmation: false,
      };
    }

    return {
      found: true,
      matches,
      topMatch: matches[0],
      requiresConfirmation: (matches[0]?.relevance ?? 0) < 0.8,
    };
  }

  async discoverAndApply(
    userInput: string,
    confirmCallback?: ConfirmSkillCallback,
  ): Promise<SkillApplicationResult | null> {
    void userInput;
    void confirmCallback;
    return null;
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
