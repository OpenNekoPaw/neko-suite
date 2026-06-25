/**
 * Skill Injection Coordinator — Atomic multi-track skill injection/removal
 *
 * Responsibility: Coordinate all injection tracks when a skill is applied or
 * removed, ensuring atomicity and proper cleanup. Single source of truth for
 * active skill state.
 *
 * Tracks:
 * - Track A: System prompt section (via SystemPromptComposer)
 * - Track B: Permission allow rules (via PermissionHooks)
 * - Track C: Active allowed tools state + ToolGuard (for runtime isToolAllowed)
 * - Track D: ToolSet auto-activation (via IToolSetActivator, tiered lazy loading)
 *
 * NOT to be confused with:
 * - SkillService — stateless orchestration: discovery, matching, injection preparation
 * - SkillInjector — prepares SkillInjection from Skill/SlashCommand objects
 */

import type { Skill, SkillInjection } from '@neko/shared';
import type { ISystemPromptComposer } from '../prompt/system-prompt-composer-types';
import type { IPermissionManager } from '../permission/permission-manager-types';
import type { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import { freezePromptContext, type PromptContext } from '../prompt/context';
import { isPersistentShellAllowRuleForbidden } from '../permission/permission-hooks';
import { createToolGuard, type IToolGuard } from './tool-guard';
import { getLogger } from '../utils/logger';

function getSkillInjectionLogger() {
  return getLogger('SkillInjectionCoordinator');
}

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal interface for ToolSet activation (avoids coupling to full ToolInjectionManager).
 */
export interface IToolSetActivator {
  /** Activate ToolSets containing the given tools. Returns names of newly activated sets. */
  activateToolSetsForTools(toolNames: string[]): string[];
  deactivateToolSet(toolSetName: string): void;
}

/**
 * Dependencies injected into the coordinator
 */
export interface SkillInjectionCoordinatorDeps {
  /** Prompt composer for section management */
  promptComposer: ISystemPromptComposer;

  /** Permission manager for allow rule management (may be null during init) */
  getPermissionHooks: () => IPermissionManager | null;

  /** Callback to sync composed prompt into history[0] */
  syncSystemPrompt: () => void;

  /** Optional ToolSet activator for eager/lazy ToolSet auto-activation (Track D) */
  toolSetActivator?: IToolSetActivator;

  /**
   * Track A writer. The module owns the prompt section contract
   * (id `skill:${name}`, layer `skill`, priority 50, content verbatim).
   */
  skillInjectionModule: SkillInjectionModule;

  /**
   * When false, `apply()` becomes a no-op — skills can still be matched and
   * activated via ISkillProvider, but nothing is injected into the prompt,
   * no permission rules are added, and no ToolSets are auto-activated.
   * Used by the ablation framework to measure the contribution of skill
   * injection independent of skill discovery. Default: true.
   */
  enableInjection?: boolean;
}

/**
 * Internal state for a single active injection
 */
interface ActiveInjection {
  name: string;
  skill?: Skill;
  allowRules: string[];
  allowedTools: string[] | undefined;
  toolGuard: IToolGuard;
  /** ToolSets activated by Track D (for reversal on remove) */
  activatedToolSets: string[];
}

// =============================================================================
// Implementation
// =============================================================================

export class SkillInjectionCoordinator {
  private _activeInjection: ActiveInjection | null = null;
  private _deps: SkillInjectionCoordinatorDeps;

  constructor(deps: SkillInjectionCoordinatorDeps) {
    this._deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Core: Apply / Remove
  // ---------------------------------------------------------------------------

  /**
   * Apply a skill injection across all tracks with optional Skill reference.
   * Automatically removes any previous active injection first.
   *
   * @param injection The injection payload (prompt, allowedTools, name)
   * @param skill Optional full Skill object for active skill tracking
   */
  apply(injection: SkillInjection, skill?: Skill): void {
    const startTime = Date.now();
    const logger = getSkillInjectionLogger();
    logger.debug('neko.agent.skill.injection.request', {
      skillName: injection.name,
      type: injection.type,
      skillSource: skill ? summarizeSkillSource(skill) : undefined,
      promptChars: injection.systemPrompt.length,
      allowedToolCount: injection.allowedTools?.length ?? 0,
      allowedTools: injection.allowedTools ?? [],
      hasModelOverride: injection.model !== undefined,
      injectionEnabled: this._deps.enableInjection !== false,
    });
    logger.debug('neko.agent.skill.injection.request.raw', {
      skillName: injection.name,
      type: injection.type,
      systemPrompt: injection.systemPrompt,
      allowedTools: injection.allowedTools,
      model: injection.model,
      skill,
    });

    // Ablation: when injection is disabled, short-circuit. Callers can still
    // observe the call succeeded (no throw) but no state changes — consistent
    // with "skill discovered but not injected" semantics.
    if (this._deps.enableInjection === false) {
      logger.debug('neko.agent.skill.injection.skipped', {
        skillName: injection.name,
        type: injection.type,
        reason: 'disabled-by-ablation',
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // Auto-cleanup previous injection to prevent accumulation
    if (this._activeInjection) {
      this._removeInternal(this._activeInjection.name);
    }

    // Track A: Add prompt section first so later track failures can roll it back.
    this._writeTrackASection(injection);
    this._deps.syncSystemPrompt();

    const allowRules: string[] = [];
    try {
      const effectiveAllowedTools = filterPersistentShellAllowRules(injection.allowedTools);
      // Track B: Add permission allow rules
      const permissionHooks = this._deps.getPermissionHooks();
      if (effectiveAllowedTools && effectiveAllowedTools.length > 0 && permissionHooks) {
        for (const tool of effectiveAllowedTools) {
          permissionHooks.addAllowRule(tool);
          allowRules.push(tool);
        }
      }

      // Track C: Record state + create ToolGuard
      const toolGuard = createToolGuard(effectiveAllowedTools, injection.name);

      // Track D: Auto-activate ToolSets whose tools are referenced by allowedTools
      let activatedToolSets: string[] = [];
      if (
        effectiveAllowedTools &&
        effectiveAllowedTools.length > 0 &&
        this._deps.toolSetActivator
      ) {
        activatedToolSets =
          this._deps.toolSetActivator.activateToolSetsForTools(effectiveAllowedTools);
      }

      this._activeInjection = {
        name: injection.name,
        skill,
        allowRules,
        allowedTools: effectiveAllowedTools,
        toolGuard,
        activatedToolSets,
      };
      logger.debug('neko.agent.skill.injection.applied', {
        skillName: injection.name,
        type: injection.type,
        durationMs: Date.now() - startTime,
        allowRuleCount: allowRules.length,
        allowRules,
        activatedToolSetCount: activatedToolSets.length,
        activatedToolSets,
        trackASectionId: `skill:${injection.name}`,
      });
    } catch (error) {
      // Rollback Track A: clear module + remove prompt section
      this._clearTrackASection(injection.name);
      this._deps.syncSystemPrompt();

      // Rollback partial Track B: remove any rules already added
      const ph = this._deps.getPermissionHooks();
      if (ph) {
        for (const rule of allowRules) {
          ph.removeAllowRule(rule);
        }
      }

      logger.warn('neko.agent.skill.injection.failed', {
        skillName: injection.name,
        type: injection.type,
        durationMs: Date.now() - startTime,
        error: summarizeUnknownError(error),
        rollbackAllowRuleCount: allowRules.length,
      });
      throw error;
    }
  }

  /**
   * Remove a skill injection by name, reversing all tracks.
   */
  remove(name: string): void {
    this._removeInternal(name);
  }

  /**
   * Clear the active injection (convenience for remove without knowing the name).
   * Also reverses Track D (ToolSet deactivation).
   */
  clearActive(): void {
    if (this._activeInjection) {
      this._removeInternal(this._activeInjection.name);
    }
  }

  // ---------------------------------------------------------------------------
  // Active Skill Queries
  // ---------------------------------------------------------------------------

  /**
   * Get the full Skill object for the currently active injection.
   */
  getActiveSkill(): Skill | undefined {
    return this._activeInjection?.skill;
  }

  /**
   * Get the allowed tools for the currently active skill.
   * Returns undefined if no skill is active (meaning all tools are allowed).
   */
  getActiveSkillAllowedTools(): string[] | undefined {
    return this._activeInjection?.allowedTools;
  }

  /**
   * Check if a tool is allowed by the active skill using ToolGuard pattern matching.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean {
    if (!this._activeInjection) return true;
    return this._activeInjection.toolGuard.check({ name: toolName }).allowed;
  }

  /**
   * Check if there is an active skill injection.
   */
  hasActiveInjection(): boolean {
    return this._activeInjection !== null;
  }

  /**
   * Get the name of the currently active skill injection.
   */
  getActiveInjectionName(): string | undefined {
    return this._activeInjection?.name;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Internal remove logic — reverses all four tracks.
   */
  private _removeInternal(name: string): void {
    const startTime = Date.now();
    const logger = getSkillInjectionLogger();
    logger.debug('neko.agent.skill.injection.remove.request', {
      skillName: name,
      hasActiveInjection: this._activeInjection !== null,
      activeSkillName: this._activeInjection?.name,
    });

    // Track A: Remove prompt section through the module-owned section contract.
    this._clearTrackASection(name);
    this._deps.syncSystemPrompt();

    let removedAllowRuleCount = 0;
    let deactivatedToolSetCount = 0;
    if (this._activeInjection && this._activeInjection.name === name) {
      // Track B: Remove permission allow rules
      const permissionHooks = this._deps.getPermissionHooks();
      if (permissionHooks && this._activeInjection.allowRules.length > 0) {
        for (const rule of this._activeInjection.allowRules) {
          permissionHooks.removeAllowRule(rule);
        }
        removedAllowRuleCount = this._activeInjection.allowRules.length;
      }

      // Track D: Deactivate ToolSets that were activated by this skill
      if (this._deps.toolSetActivator && this._activeInjection.activatedToolSets.length > 0) {
        for (const setName of this._activeInjection.activatedToolSets) {
          this._deps.toolSetActivator.deactivateToolSet(setName);
        }
        deactivatedToolSetCount = this._activeInjection.activatedToolSets.length;
      }

      // Track C: Clear state
      this._activeInjection = null;
    }

    logger.debug('neko.agent.skill.injection.removed', {
      skillName: name,
      durationMs: Date.now() - startTime,
      removedAllowRuleCount,
      deactivatedToolSetCount,
      trackASectionId: `skill:${name}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Track A helpers
  // ---------------------------------------------------------------------------

  /**
   * Write the Track A prompt section for an active injection through the
   * SkillInjectionModule-owned section projection.
   */
  private _writeTrackASection(injection: SkillInjection): void {
    const mod = this._deps.skillInjectionModule;
    mod.setInjection(injection);
    const sections = mod.renderSync(this._buildMinimalCtx(injection.name));
    if (sections) {
      for (const s of sections) {
        this._deps.promptComposer.setSection({
          id: s.sectionId,
          layer: s.layer,
          content: s.content,
          priority: s.priority ?? 50,
          ...(s.cacheControl && { cacheControl: s.cacheControl }),
        });
      }
    }
  }

  /**
   * Clear the Track A prompt section for a named injection. Mirrors the module
   * write by clearing module state and removing the composer section.
   */
  private _clearTrackASection(name: string): void {
    this._deps.skillInjectionModule.setInjection(null);
    this._deps.promptComposer.removeSection(`skill:${name}`);
  }

  /**
   * Minimal PromptContext for Track A rendering. SkillInjectionModule's
   * renderSync only reads `activeSkillName`; other fields are present for
   * type compliance but unused. Coordinator does not depend on a session
   * context provider to avoid a session ↔ coordinator cycle.
   */
  private _buildMinimalCtx(activeSkillName: string): PromptContext {
    return freezePromptContext({
      runId: null,
      stage: null,
      locale: 'en',
      projectPath: '',
      activeSkillName,
      activeTools: [],
    });
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a SkillInjectionCoordinator instance
 */
export function createSkillInjectionCoordinator(
  deps: SkillInjectionCoordinatorDeps,
): SkillInjectionCoordinator {
  return new SkillInjectionCoordinator(deps);
}

function summarizeSkillSource(skill: Skill): Record<string, unknown> {
  return {
    name: skill.name,
    description: skill.description,
    command: skill.command,
    domain: skill.domain,
    source: skill.source,
    enabled: skill.enabled,
    autoInvoke: skill.autoInvoke,
  };
}

function summarizeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

function filterPersistentShellAllowRules(allowedTools: string[] | undefined): string[] | undefined {
  if (!allowedTools) return undefined;
  return allowedTools.filter((tool) => !isPersistentShellAllowRuleForbidden(tool));
}
