/**
 * Autoheal Chain — 5-level recovery orchestrator.
 *
 * See: docs/architecture/dual-flow-architecture.md §7
 *      plan v2 P3 (autoheal = ReAct "skip mode" pattern)
 *
 * Levels execute in order; each may `heal` (chain stops, caller retries
 * with the new plan), `pass` (move to next level), or `abort` (chain
 * exits). Handlers are supplied by the caller via AutohealHandlers;
 * default handlers below implement sane no-op / conservative behavior
 * so the chain can be instantiated without any wiring.
 *
 * The chain does **not** re-execute the failed tool — it returns an
 * outcome. The ReAct loop runner is responsible for acting on the
 * outcome (e.g. retry same tool, substitute tool, escalate to user).
 *
 * Events are optional — when an EventBus is supplied, the chain emits
 * the matching execution.autoheal.* channel for each level it walks.
 */

import type { IEventBus } from '../events/event-bus';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import { getLogger } from '../utils/logger';
import {
  AUTOHEAL_LEVEL_LABEL,
  DEFAULT_AUTOHEAL_POLICY,
  type AutohealContext,
  type AutohealFailure,
  type AutohealLevel,
  type AutohealOutcome,
  type AutohealPolicy,
} from './autoheal-types';

const logger = getLogger('AutohealChain');

// =============================================================================
// Handler surface
// =============================================================================

/**
 * Per-level handler. Each returns an AutohealOutcome describing what
 * happened. Async — levels may call a subagent, LLM, or external
 * approval engine.
 */
export type AutohealHandler = (
  failure: AutohealFailure,
  context: AutohealContext,
) => Promise<AutohealOutcome>;

export interface AutohealHandlers {
  l1Retry?: AutohealHandler;
  l2Degrade?: AutohealHandler;
  l3Substitute?: AutohealHandler;
  l4Subagent?: AutohealHandler;
  l5Escalate?: AutohealHandler;
}

// =============================================================================
// Default handlers (no-op or simple policy)
// =============================================================================

/** L1 — say "ok, retry" up to `policy.maxRetries` attempts. */
function makeDefaultL1(policy: Required<AutohealPolicy>): AutohealHandler {
  return async (failure) => {
    if (failure.attempt < policy.maxRetries) {
      return { resolution: 'healed', level: 1, note: `retry #${failure.attempt + 1}` };
    }
    return { resolution: 'pass', level: 1, note: 'max retries exhausted' };
  };
}

/** L2 default — no quality knob to tune, pass. Callers override to degrade. */
const defaultL2Degrade: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 2,
  note: 'no default degrade policy',
});

/** L3 default — no substitution catalog available, pass. */
const defaultL3Substitute: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 3,
  note: 'no default substitute policy',
});

/**
 * L4 default — no RecoverySubagent installed, pass. P3 ships a real
 * RecoverySubagent later; callers can inject it via handlers.
 */
const defaultL4Subagent: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 4,
  note: 'no RecoverySubagent installed',
});

/** L5 default — escalate as 'retry-exhausted' (the caller decides UI). */
const defaultL5Escalate: AutohealHandler = async () => ({
  resolution: 'aborted',
  level: 5,
  reason: 'retry-exhausted',
});

// =============================================================================
// Chain
// =============================================================================

export interface AutohealChainConfig {
  policy?: AutohealPolicy;
  handlers?: AutohealHandlers;
  /** Optional EventBus for `execution.autoheal.*` channels. */
  eventBus?: IEventBus;
  /** Clock injection. */
  now?: () => number;
}

export interface IAutohealChain {
  run(failure: AutohealFailure, context: AutohealContext): Promise<AutohealOutcome>;
}

class AutohealChain implements IAutohealChain {
  private readonly _policy: Required<AutohealPolicy>;
  private readonly _handlers: Required<AutohealHandlers>;
  private readonly _eventBus: IEventBus | undefined;
  private readonly _now: () => number;

  constructor(config: AutohealChainConfig = {}) {
    this._policy = { ...DEFAULT_AUTOHEAL_POLICY, ...config.policy };
    this._handlers = {
      l1Retry: config.handlers?.l1Retry ?? makeDefaultL1(this._policy),
      l2Degrade: config.handlers?.l2Degrade ?? defaultL2Degrade,
      l3Substitute: config.handlers?.l3Substitute ?? defaultL3Substitute,
      l4Subagent: config.handlers?.l4Subagent ?? defaultL4Subagent,
      l5Escalate: config.handlers?.l5Escalate ?? defaultL5Escalate,
    };
    this._eventBus = config.eventBus;
    this._now = config.now ?? (() => Date.now());
  }

  async run(failure: AutohealFailure, context: AutohealContext): Promise<AutohealOutcome> {
    // L1
    const l1 = await this._runLevel(1, this._handlers.l1Retry, failure, context);
    if (l1.resolution !== 'pass') return l1;

    // L2
    if (!this._policy.skipDegrade) {
      const l2 = await this._runLevel(2, this._handlers.l2Degrade, failure, context);
      if (l2.resolution !== 'pass') return l2;
    }

    // L3
    if (!this._policy.skipSubstitute) {
      const l3 = await this._runLevel(3, this._handlers.l3Substitute, failure, context);
      if (l3.resolution !== 'pass') return l3;
    }

    // L4
    if (!this._policy.skipSubagent) {
      const l4 = await this._runLevel(4, this._handlers.l4Subagent, failure, context);
      if (l4.resolution !== 'pass') return l4;
    }

    // L5 — always runs; this is the user-facing exit.
    return this._runLevel(5, this._handlers.l5Escalate, failure, context);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _runLevel(
    level: AutohealLevel,
    handler: AutohealHandler,
    failure: AutohealFailure,
    context: AutohealContext,
  ): Promise<AutohealOutcome> {
    let outcome: AutohealOutcome;
    try {
      outcome = await handler(failure, context);
    } catch (err) {
      logger.warn(`Autoheal L${level} handler threw; treating as pass: ${String(err)}`);
      outcome = { resolution: 'pass', level, note: `handler-error:${String(err)}` };
    }
    this._emit(level, failure, context, outcome);
    return outcome;
  }

  private _emit(
    level: AutohealLevel,
    failure: AutohealFailure,
    context: AutohealContext,
    outcome: AutohealOutcome,
  ): void {
    if (!this._eventBus || !context.runId) return;
    const base = {
      runId: context.runId,
      trigger: { subject: failure.subject, errorCode: failure.errorCode },
      at: this._now(),
    };
    switch (level) {
      case 1:
        this._eventBus.emit({
          channel: EXECUTION_CHANNELS.AUTOHEAL_L1_RETRY,
          ...base,
          attempt: failure.attempt,
        });
        break;
      case 2:
        this._eventBus.emit({
          channel: EXECUTION_CHANNELS.AUTOHEAL_L2_DEGRADE,
          ...base,
          note: noteOf(outcome) ?? 'degrade considered',
        });
        break;
      case 3:
        this._eventBus.emit({
          channel: EXECUTION_CHANNELS.AUTOHEAL_L3_SUBSTITUTE,
          ...base,
          fallback: noteOf(outcome) ?? 'substitute considered',
        });
        break;
      case 4:
        this._eventBus.emit({
          channel: EXECUTION_CHANNELS.AUTOHEAL_L4_TRIGGERED,
          ...base,
          subagent: 'recovery',
        });
        break;
      case 5: {
        // Event payload's `reason` union is narrower than the chain's
        // outcome reasons — 'user-decline' and 'policy' are collapsed
        // onto 'user-suppressed' (a PrimitiveSkipReason) for the wire.
        const chainReason = outcome.resolution === 'aborted' ? outcome.reason : 'retry-exhausted';
        const wireReason =
          chainReason === 'user-decline' || chainReason === 'policy'
            ? ('user-suppressed' as const)
            : chainReason;
        this._eventBus.emit({
          channel: EXECUTION_CHANNELS.AUTOHEAL_L5_ESCALATED,
          ...base,
          reason: wireReason,
        });
        break;
      }
    }

    // Leave a breadcrumb for anyone reading live logs.
    logger.info(`autoheal L${level} ${AUTOHEAL_LEVEL_LABEL[level]} → ${outcome.resolution}`);
  }
}

function noteOf(outcome: AutohealOutcome): string | undefined {
  return outcome.resolution === 'aborted' ? undefined : outcome.note;
}

// =============================================================================
// Factory
// =============================================================================

export function createAutohealChain(config?: AutohealChainConfig): IAutohealChain {
  return new AutohealChain(config);
}
