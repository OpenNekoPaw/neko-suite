import {
  AUTOHEAL_EVENT_CHANNELS,
  AUTOHEAL_LEVEL_LABEL,
  DEFAULT_AUTOHEAL_POLICY,
  type AutohealChainConfig,
  type AutohealContext,
  type AutohealFailure,
  type AutohealHandler,
  type AutohealHandlers,
  type AutohealLevel,
  type AutohealOutcome,
  type AutohealPolicy,
  type IAutohealChain,
} from '@neko/shared';

/**
 * Skill-owned 5-level recovery chain.
 *
 * Agent core owns the ReAct loop hook point; this package owns the concrete
 * default recovery policy and emits only shared autoheal runtime events.
 */

function makeDefaultL1(policy: Required<AutohealPolicy>): AutohealHandler {
  return async (failure) => {
    if (failure.attempt < policy.maxRetries) {
      return { resolution: 'healed', level: 1, note: `retry #${failure.attempt + 1}` };
    }
    return { resolution: 'pass', level: 1, note: 'max retries exhausted' };
  };
}

const defaultL2Degrade: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 2,
  note: 'no default degrade policy',
});

const defaultL3Substitute: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 3,
  note: 'no default substitute policy',
});

const defaultL4Subagent: AutohealHandler = async () => ({
  resolution: 'pass',
  level: 4,
  note: 'no RecoverySubagent installed',
});

const defaultL5Escalate: AutohealHandler = async () => ({
  resolution: 'aborted',
  level: 5,
  reason: 'retry-exhausted',
});

class AutohealChain implements IAutohealChain {
  private readonly policy: Required<AutohealPolicy>;
  private readonly handlers: Required<AutohealHandlers>;
  private readonly now: () => number;

  constructor(private readonly config: AutohealChainConfig = {}) {
    this.policy = { ...DEFAULT_AUTOHEAL_POLICY, ...config.policy };
    this.handlers = {
      l1Retry: config.handlers?.l1Retry ?? makeDefaultL1(this.policy),
      l2Degrade: config.handlers?.l2Degrade ?? defaultL2Degrade,
      l3Substitute: config.handlers?.l3Substitute ?? defaultL3Substitute,
      l4Subagent: config.handlers?.l4Subagent ?? defaultL4Subagent,
      l5Escalate: config.handlers?.l5Escalate ?? defaultL5Escalate,
    };
    this.now = config.now ?? (() => Date.now());
  }

  async run(failure: AutohealFailure, context: AutohealContext): Promise<AutohealOutcome> {
    const l1 = await this.runLevel(1, this.handlers.l1Retry, failure, context);
    if (l1.resolution !== 'pass') return l1;

    if (!this.policy.skipDegrade) {
      const l2 = await this.runLevel(2, this.handlers.l2Degrade, failure, context);
      if (l2.resolution !== 'pass') return l2;
    }

    if (!this.policy.skipSubstitute) {
      const l3 = await this.runLevel(3, this.handlers.l3Substitute, failure, context);
      if (l3.resolution !== 'pass') return l3;
    }

    if (!this.policy.skipSubagent) {
      const l4 = await this.runLevel(4, this.handlers.l4Subagent, failure, context);
      if (l4.resolution !== 'pass') return l4;
    }

    return this.runLevel(5, this.handlers.l5Escalate, failure, context);
  }

  private async runLevel(
    level: AutohealLevel,
    handler: AutohealHandler,
    failure: AutohealFailure,
    context: AutohealContext,
  ): Promise<AutohealOutcome> {
    let outcome: AutohealOutcome;
    try {
      outcome = await handler(failure, context);
    } catch (error) {
      this.config.diagnostics?.warn(`Autoheal L${level} handler threw; treating as pass`, {
        error,
      });
      outcome = { resolution: 'pass', level, note: `handler-error:${String(error)}` };
    }
    this.emit(level, failure, context, outcome);
    return outcome;
  }

  private emit(
    level: AutohealLevel,
    failure: AutohealFailure,
    context: AutohealContext,
    outcome: AutohealOutcome,
  ): void {
    if (!this.config.eventBus || !context.runId) return;
    const base = {
      runId: context.runId,
      trigger: { subject: failure.subject, errorCode: failure.errorCode },
      at: this.now(),
    };
    switch (level) {
      case 1:
        this.config.eventBus.emit({
          channel: AUTOHEAL_EVENT_CHANNELS.L1_RETRY,
          ...base,
          attempt: failure.attempt,
        });
        break;
      case 2:
        this.config.eventBus.emit({
          channel: AUTOHEAL_EVENT_CHANNELS.L2_DEGRADE,
          ...base,
          note: noteOf(outcome) ?? 'degrade considered',
        });
        break;
      case 3:
        this.config.eventBus.emit({
          channel: AUTOHEAL_EVENT_CHANNELS.L3_SUBSTITUTE,
          ...base,
          substitute: noteOf(outcome) ?? 'substitute considered',
        });
        break;
      case 4:
        this.config.eventBus.emit({
          channel: AUTOHEAL_EVENT_CHANNELS.L4_TRIGGERED,
          ...base,
          subagent: 'recovery',
        });
        break;
      case 5: {
        const chainReason = outcome.resolution === 'aborted' ? outcome.reason : 'retry-exhausted';
        const wireReason =
          chainReason === 'user-decline' || chainReason === 'policy'
            ? 'user-suppressed'
            : chainReason;
        this.config.eventBus.emit({
          channel: AUTOHEAL_EVENT_CHANNELS.L5_ESCALATED,
          ...base,
          reason: wireReason,
        });
        break;
      }
    }

    this.config.diagnostics?.info?.(
      `autoheal L${level} ${AUTOHEAL_LEVEL_LABEL[level]} -> ${outcome.resolution}`,
    );
  }
}

function noteOf(outcome: AutohealOutcome): string | undefined {
  return outcome.resolution === 'aborted' ? undefined : outcome.note;
}

export function createAutohealChain(config?: AutohealChainConfig): IAutohealChain {
  return new AutohealChain(config);
}
