/**
 * Skill Injection Coordinator — Atomic multi-track skill injection/removal
 *
 * Responsibility: Coordinate the three independent injection tracks when a skill
 * is applied or removed, ensuring atomicity and proper cleanup.
 *
 * Tracks:
 * - Track A: System prompt section (via SystemPromptComposer)
 * - Track B: Permission allow rules (via PermissionHooks)
 * - Track C: Active allowed tools state (for runtime isToolAllowed checks)
 *
 * NOT to be confused with:
 * - SkillService — skill discovery, matching, and lifecycle orchestration
 * - SkillInjector — prepares SkillInjection from Skill/SlashCommand objects
 * - ToolGuard — runtime tool restriction enforcement during execution
 */

import type { SkillInjection } from '@neko/shared';
import type { ISystemPromptComposer } from '../prompt/system-prompt-composer-types';
import type { PermissionHooks } from '../permission/permission-hooks';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies injected into the coordinator
 */
export interface SkillInjectionCoordinatorDeps {
  /** Prompt composer for section management */
  promptComposer: ISystemPromptComposer;

  /** Permission hooks for allow rule management (may be null during init) */
  getPermissionHooks: () => PermissionHooks | null;

  /** Callback to sync composed prompt into history[0] */
  syncSystemPrompt: () => void;
}

/**
 * Internal state for a single active injection
 */
interface ActiveInjection {
  name: string;
  allowRules: string[];
  allowedTools: string[] | undefined;
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

  /**
   * Apply a skill injection across all three tracks.
   * Automatically removes any previous active injection first.
   */
  apply(injection: SkillInjection): void {
    // Auto-cleanup previous injection to prevent accumulation
    if (this._activeInjection) {
      this.remove(this._activeInjection.name);
    }

    // Track A: Add prompt section
    this._deps.promptComposer.setSection({
      id: `skill:${injection.name}`,
      layer: 'skill',
      content: injection.systemPrompt,
      priority: 50,
    });
    this._deps.syncSystemPrompt();

    // Track B: Add permission allow rules
    const allowRules: string[] = [];
    const permissionHooks = this._deps.getPermissionHooks();
    if (injection.allowedTools && injection.allowedTools.length > 0 && permissionHooks) {
      for (const tool of injection.allowedTools) {
        permissionHooks.addAllowRule(tool);
        allowRules.push(tool);
      }
    }

    // Track C: Record allowed tools for runtime checks
    this._activeInjection = {
      name: injection.name,
      allowRules,
      allowedTools: injection.allowedTools,
    };
  }

  /**
   * Remove a skill injection, reversing all three tracks.
   */
  remove(name: string): void {
    // Track A: Remove prompt section
    this._deps.promptComposer.removeSection(`skill:${name}`);
    this._deps.syncSystemPrompt();

    // Track B: Remove permission allow rules
    if (this._activeInjection && this._activeInjection.name === name) {
      const permissionHooks = this._deps.getPermissionHooks();
      if (permissionHooks && this._activeInjection.allowRules.length > 0) {
        for (const rule of this._activeInjection.allowRules) {
          permissionHooks.removeAllowRule(rule);
        }
      }
    }

    // Track C: Clear state
    if (this._activeInjection?.name === name) {
      this._activeInjection = null;
    }
  }

  /**
   * Get the allowed tools for the currently active skill.
   * Returns undefined if no skill is active (meaning all tools are allowed).
   */
  getActiveSkillAllowedTools(): string[] | undefined {
    return this._activeInjection?.allowedTools;
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
