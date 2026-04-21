/**
 * Flow Binding — Glue between FlowSwitcher and SkillInjectionCoordinator.
 *
 * Responsibility: on every FlowKind transition, resolve the corresponding
 * persona Skill from the registry (`flow-creation` / `flow-execution`) and
 * swap it into the coordinator, replacing any previously injected persona.
 *
 * Why a separate module: keeps FlowSwitcher pure (no skill-system import)
 * and keeps SkillInjectionCoordinator single-slot (W3 scope). P1.6 will
 * introduce multi-slot injection tracks if needed; this module is the one
 * place that would be refactored then.
 *
 * Intentional scope limits:
 *   - Handles persona Skills only. Business Skills (canvas, cut, etc.) are
 *     still applied via SkillService.apply() + session.applySkillInjection.
 *   - Since the coordinator currently has a single active slot, applying a
 *     persona Skill will evict the previous injection. That is fine for W3
 *     because persona is the session-level default — business Skills are
 *     expected to be short-lived and re-apply the persona on deactivate.
 *     (Proper multi-slot support is the P1.6 / P2 work.)
 */

import type { Skill, SkillInjection, ISkillRegistry } from '@neko/shared';
import type { FlowKind, FlowTransitionEvent, FlowSwitcher } from './flow-switcher';
import { skillNameForFlow } from './flow-switcher';
import type { SkillInjectionCoordinator } from './skill-injection-coordinator';
import type { SkillService } from './skill-service';
import { getLogger } from '../utils/logger';

const logger = getLogger('FlowBinding');

// =============================================================================
// Types
// =============================================================================

export interface FlowBindingDeps {
  /** Owns current FlowKind + emits transitions. */
  flowSwitcher: FlowSwitcher;
  /** Source for the persona Skills (flow-creation / flow-execution). */
  skillRegistry: ISkillRegistry;
  /** Prepares the SkillInjection payload from a Skill. */
  skillService: SkillService;
  /** Applies / removes the injection across 4 tracks atomically. */
  coordinator: SkillInjectionCoordinator;
}

export interface IFlowBinding {
  /** Apply the persona Skill for the current FlowKind (call once after init). */
  syncInitial(): Promise<void>;
  /** Stop listening for transitions. Idempotent. */
  dispose(): void;
  /** Which flow's persona is currently applied (may be null before syncInitial). */
  getActivePersona(): FlowKind | null;
}

// =============================================================================
// Implementation
// =============================================================================

class FlowBinding implements IFlowBinding {
  private _unsubscribe: (() => void) | null = null;
  private _activePersona: FlowKind | null = null;

  constructor(private readonly _deps: FlowBindingDeps) {
    this._unsubscribe = this._deps.flowSwitcher.onTransition((event) => {
      // Fire-and-forget: transition listener must not block; errors are
      // logged but not thrown (FlowSwitcher swallows listener throws anyway).
      void this._onTransition(event);
    });
  }

  async syncInitial(): Promise<void> {
    await this._applyPersonaFor(this._deps.flowSwitcher.kind);
  }

  getActivePersona(): FlowKind | null {
    return this._activePersona;
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  private async _onTransition(event: FlowTransitionEvent): Promise<void> {
    try {
      await this._applyPersonaFor(event.to);
    } catch (err) {
      logger.error(
        `Failed to swap persona on transition ${event.from} → ${event.to}: ${String(err)}`,
      );
    }
  }

  private async _applyPersonaFor(kind: FlowKind): Promise<void> {
    const skillName = skillNameForFlow(kind);
    const skill = this._deps.skillRegistry.getSkill(skillName);
    if (!skill) {
      // Persona skill missing is a configuration error, not a runtime one.
      // We log and leave any previous injection in place — better to keep
      // the session working than to wipe the prompt.
      logger.warn(`Persona skill "${skillName}" not registered; skipping swap`);
      return;
    }

    const injection: SkillInjection = await this._deps.skillService.apply(skill);
    this._applyViaCoordinator(injection, skill);
    this._activePersona = kind;
  }

  private _applyViaCoordinator(injection: SkillInjection, skill: Skill): void {
    this._deps.coordinator.apply(injection, skill);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFlowBinding(deps: FlowBindingDeps): IFlowBinding {
  return new FlowBinding(deps);
}
