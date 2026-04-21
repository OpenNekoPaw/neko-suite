/**
 * FlowSwitcher Tests
 *
 * Covers:
 * - Initial state (default + overridden)
 * - Idempotent transitions (no event when target == current)
 * - Semantic trigger sugar (onApplyTriggered, onRunCompleted, ...)
 * - Listener subscription + unsubscribe
 * - Listener exceptions do not block transitions
 * - Deterministic timestamps via injected clock
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createFlowSwitcher,
  FlowSwitcher,
  skillNameForFlow,
  CREATION_FLOW_SKILL_NAME,
  EXECUTION_FLOW_SKILL_NAME,
  type FlowTransitionEvent,
} from '../flow-switcher';

describe('FlowSwitcher', () => {
  describe('initial state', () => {
    it('defaults to creation flow with session-start reason', () => {
      const sw = createFlowSwitcher({ now: () => 1000 });
      expect(sw.kind).toBe('creation');
      expect(sw.context.reason).toBe('session-start');
      expect(sw.context.enteredAt).toBe(1000);
    });

    it('respects initialKind override', () => {
      const sw = createFlowSwitcher({ initialKind: 'execution', now: () => 42 });
      expect(sw.kind).toBe('execution');
      expect(sw.context.enteredAt).toBe(42);
    });
  });

  describe('transitions', () => {
    it('transitionTo moves to target and emits event', () => {
      const sw = new FlowSwitcher({ now: () => 100 });
      const events: FlowTransitionEvent[] = [];
      sw.onTransition((e) => events.push(e));

      const changed = sw.transitionTo('execution', 'apply-triggered');

      expect(changed).toBe(true);
      expect(sw.kind).toBe('execution');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        from: 'creation',
        to: 'execution',
        reason: 'apply-triggered',
        at: 100,
      });
    });

    it('transitioning to the same flow is a no-op (no event)', () => {
      const sw = new FlowSwitcher();
      const listener = vi.fn();
      sw.onTransition(listener);

      const changed = sw.transitionTo('creation', 'user-requested');

      expect(changed).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });

    it('updates enteredAt and reason on each transition', () => {
      let now = 0;
      const sw = new FlowSwitcher({ now: () => now });

      now = 10;
      sw.transitionTo('execution', 'apply-triggered');
      expect(sw.context).toEqual({ kind: 'execution', enteredAt: 10, reason: 'apply-triggered' });

      now = 25;
      sw.transitionTo('creation', 'run-completed');
      expect(sw.context).toEqual({ kind: 'creation', enteredAt: 25, reason: 'run-completed' });
    });
  });

  describe('semantic triggers', () => {
    it('onApplyTriggered moves creation → execution', () => {
      const sw = new FlowSwitcher();
      expect(sw.onApplyTriggered()).toBe(true);
      expect(sw.kind).toBe('execution');
      expect(sw.context.reason).toBe('apply-triggered');
    });

    it('onRunCompleted moves execution → creation', () => {
      const sw = new FlowSwitcher({ initialKind: 'execution' });
      expect(sw.onRunCompleted()).toBe(true);
      expect(sw.kind).toBe('creation');
      expect(sw.context.reason).toBe('run-completed');
    });

    it('onMacroCorrectionRequired moves execution → creation', () => {
      const sw = new FlowSwitcher({ initialKind: 'execution' });
      expect(sw.onMacroCorrectionRequired()).toBe(true);
      expect(sw.kind).toBe('creation');
      expect(sw.context.reason).toBe('macro-correction-required');
    });

    it('onUserRequested honors the requested target', () => {
      const sw = new FlowSwitcher();
      expect(sw.onUserRequested('execution')).toBe(true);
      expect(sw.context.reason).toBe('user-requested');
    });
  });

  describe('listeners', () => {
    it('supports multiple subscribers', () => {
      const sw = new FlowSwitcher();
      const a = vi.fn();
      const b = vi.fn();
      sw.onTransition(a);
      sw.onTransition(b);

      sw.transitionTo('execution', 'apply-triggered');

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further notifications', () => {
      const sw = new FlowSwitcher();
      const listener = vi.fn();
      const off = sw.onTransition(listener);

      sw.transitionTo('execution', 'apply-triggered');
      off();
      sw.transitionTo('creation', 'run-completed');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('listener exceptions do not block the transition or other listeners', () => {
      const sw = new FlowSwitcher();
      const bad = vi.fn(() => {
        throw new Error('boom');
      });
      const good = vi.fn();
      sw.onTransition(bad);
      sw.onTransition(good);

      expect(() => sw.transitionTo('execution', 'apply-triggered')).not.toThrow();
      expect(sw.kind).toBe('execution');
      expect(good).toHaveBeenCalledTimes(1);
    });

    it('dispose clears all listeners', () => {
      const sw = new FlowSwitcher();
      const listener = vi.fn();
      sw.onTransition(listener);
      sw.dispose();

      sw.transitionTo('execution', 'apply-triggered');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('skillNameForFlow', () => {
    it('maps creation → flow-creation', () => {
      expect(skillNameForFlow('creation')).toBe(CREATION_FLOW_SKILL_NAME);
      expect(CREATION_FLOW_SKILL_NAME).toBe('flow-creation');
    });

    it('maps execution → flow-execution', () => {
      expect(skillNameForFlow('execution')).toBe(EXECUTION_FLOW_SKILL_NAME);
      expect(EXECUTION_FLOW_SKILL_NAME).toBe('flow-execution');
    });
  });
});
