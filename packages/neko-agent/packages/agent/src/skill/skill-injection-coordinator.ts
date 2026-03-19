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
 *
 * NOT to be confused with:
 * - SkillService — stateless orchestration: discovery, matching, injection preparation
 * - SkillInjector — prepares SkillInjection from Skill/SlashCommand objects
 */

import type { Skill, SkillInjection } from '@neko/shared';
import type { ISystemPromptComposer } from '../prompt/system-prompt-composer-types';
import type { IPermissionManager } from '../permission/permission-manager-types';
import { createToolGuard, type IToolGuard } from './tool-guard';

// =============================================================================
// Types
// =============================================================================

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
    // Auto-cleanup previous injection to prevent accumulation
    if (this._activeInjection) {
      this._removeInternal(this._activeInjection.name);
    }

    // Track A: Add prompt section (always first — rollback if subsequent tracks fail)
    this._deps.promptComposer.setSection({
      id: `skill:${injection.name}`,
      layer: 'skill',
      content: injection.systemPrompt,
      priority: 50,
    });
    this._deps.syncSystemPrompt();

    const allowRules: string[] = [];
    try {
      // Track B: Add permission allow rules
      const permissionHooks = this._deps.getPermissionHooks();
      if (injection.allowedTools && injection.allowedTools.length > 0 && permissionHooks) {
        for (const tool of injection.allowedTools) {
          permissionHooks.addAllowRule(tool);
          allowRules.push(tool);
        }
      }

      // Track C: Record state + create ToolGuard
      const toolGuard = createToolGuard(injection.allowedTools, injection.name);

      this._activeInjection = {
        name: injection.name,
        skill,
        allowRules,
        allowedTools: injection.allowedTools,
        toolGuard,
      };
    } catch (error) {
      // Rollback Track A: remove prompt section
      this._deps.promptComposer.removeSection(`skill:${injection.name}`);
      this._deps.syncSystemPrompt();

      // Rollback partial Track B: remove any rules already added
      const ph = this._deps.getPermissionHooks();
      if (ph) {
        for (const rule of allowRules) {
          ph.removeAllowRule(rule);
        }
      }

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
    // Track A: Remove prompt section
    this._deps.promptComposer.removeSection(`skill:${name}`);
    this._deps.syncSystemPrompt();

    if (this._activeInjection && this._activeInjection.name === name) {
      // Track B: Remove permission allow rules
      const permissionHooks = this._deps.getPermissionHooks();
      if (permissionHooks && this._activeInjection.allowRules.length > 0) {
        for (const rule of this._activeInjection.allowRules) {
          permissionHooks.removeAllowRule(rule);
        }
      }

      // Track C: Clear state
      this._activeInjection = null;
    }
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
