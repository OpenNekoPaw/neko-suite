/**
 * Stage Persona Binding — swaps the persona Skill when the active SDD stage
 * changes.
 *
 * See: docs/architecture/agent-unified-workflow.md §4, §6.5
 *
 * Replaces FlowBinding. Listens to StageTracker.onEntered and, for each
 * stage, applies the corresponding persona Skill via SkillService +
 * SkillInjectionCoordinator.
 *
 * Default mapping (matches the two builtin persona Skills shipped today):
 *   specify / plan / tasks  → creation-persona  (discussion + proposal persona)
 *   implement               → execution-persona (operator persona)
 *
 * Sites that want a different persona layout can pass a custom
 * `skillNameForStage` — e.g. the 4-persona split the ADR hints at.
 *
 * Intentional scope limits:
 *   - Handles persona Skills only. Business Skills (canvas, cut, etc.) are
 *     still applied via SkillService.apply() + session.applySkillInjection.
 *   - SkillInjectionCoordinator currently has a single active slot, so
 *     applying a persona evicts the previous injection — same constraint
 *     that FlowBinding had.
 */

import type { Skill, SkillInjection, ISkillRegistry } from '@neko/shared';
import type { SddStage } from '@neko-agent/types';
import type { SkillInjectionCoordinator } from './skill-injection-coordinator';
import type { SkillService } from './skill-service';
import type { StageTracker } from './stage-tracker';
import { getLogger } from '../utils/logger';

const logger = getLogger('StagePersonaBinding');

// =============================================================================
// Skill name constants
// =============================================================================

/** Builtin skill name for Specify / Plan / Tasks — creative discussion persona. */
export const CREATION_PERSONA_SKILL_NAME = 'creation-persona';
/** Builtin skill name for Implement — system-operator persona. */
export const EXECUTION_PERSONA_SKILL_NAME = 'execution-persona';

/**
 * Default stage → persona-skill mapping. Specify / Plan / Tasks share the
 * creative persona because they are all pre-Implement discussion / planning;
 * only Implement flips to the operator persona.
 */
export function defaultSkillNameForStage(stage: SddStage): string {
  return stage === 'implement' ? EXECUTION_PERSONA_SKILL_NAME : CREATION_PERSONA_SKILL_NAME;
}

// =============================================================================
// Types
// =============================================================================

export interface StagePersonaBindingDeps {
  /** Source of truth for the current SDD stage. */
  stageTracker: StageTracker;
  /** Source for the persona Skills. */
  skillRegistry: ISkillRegistry;
  /** Prepares the SkillInjection payload from a Skill. */
  skillService: SkillService;
  /** Applies / removes the injection across the 4 tracks atomically. */
  coordinator: SkillInjectionCoordinator;
  /**
   * Override for the stage → skill-name mapping. Defaults to
   * `defaultSkillNameForStage` (specify/plan/tasks → creation-persona,
   * implement → execution-persona).
   */
  skillNameForStage?: (stage: SddStage) => string;
}

export interface IStagePersonaBinding {
  /** Apply the persona Skill for the current stage (call after first enter). */
  syncCurrent(): Promise<void>;
  /** Stop listening for stage transitions. Idempotent. */
  dispose(): void;
  /** Which stage's persona is currently applied (null before the first sync). */
  getActiveStage(): SddStage | null;
}

// =============================================================================
// Implementation
// =============================================================================

class StagePersonaBinding implements IStagePersonaBinding {
  private _unsubscribe: (() => void) | null = null;
  private _activeStage: SddStage | null = null;
  private readonly _skillNameForStage: (stage: SddStage) => string;

  constructor(private readonly _deps: StagePersonaBindingDeps) {
    this._skillNameForStage = _deps.skillNameForStage ?? defaultSkillNameForStage;
    this._unsubscribe = this._deps.stageTracker.onEntered((event) => {
      void this._onEntered(event.stage);
    });
  }

  async syncCurrent(): Promise<void> {
    const stage = this._deps.stageTracker.current;
    if (stage) await this._applyPersonaFor(stage);
  }

  getActiveStage(): SddStage | null {
    return this._activeStage;
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _onEntered(stage: SddStage): Promise<void> {
    try {
      await this._applyPersonaFor(stage);
    } catch (err) {
      logger.error(`Failed to swap persona on stage enter "${stage}": ${String(err)}`);
    }
  }

  private async _applyPersonaFor(stage: SddStage): Promise<void> {
    const skillName = this._skillNameForStage(stage);
    // If the target skill is the same as the already-active persona, no swap
    // needed — specify→plan→tasks all map to creation-persona, so most stage
    // transitions are actually persona no-ops.
    const currentSkillName = this._activeStage ? this._skillNameForStage(this._activeStage) : null;
    if (currentSkillName === skillName) {
      this._activeStage = stage;
      return;
    }

    const skill = this._deps.skillRegistry.getSkill(skillName);
    if (!skill) {
      logger.warn(`Persona skill "${skillName}" not registered; skipping swap`);
      return;
    }

    const injection: SkillInjection = await this._deps.skillService.apply(skill);
    this._applyViaCoordinator(injection, skill);
    this._activeStage = stage;
  }

  private _applyViaCoordinator(injection: SkillInjection, skill: Skill): void {
    this._deps.coordinator.apply(injection, skill);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createStagePersonaBinding(deps: StagePersonaBindingDeps): IStagePersonaBinding {
  return new StagePersonaBinding(deps);
}
