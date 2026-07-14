import type { AgentResult, ExecutorHooks, ToolResultWithMeta } from '@neko/shared';
import type { AutohealOutcome, IAutohealChain } from '@neko/shared/types/agent-autoheal';
import { DEFAULT_READ_ONLY_TOOLS } from '../permission/types';
import type { IEventBus } from '../events/event-bus';
import { AGENT_RUNTIME_CHANNELS } from '../events/event-bus';
import { getLogger } from '../utils/logger';

const logger = getLogger('ReActLoopRunner');

export interface ReActLoopRunnerDeps {
  readonly eventBus?: IEventBus;
  readonly autohealChain?: IAutohealChain;
  readonly now?: () => number;
}

export interface ReActLoopRunnerState {
  readonly nextObserveHint: 'retry' | 'user-cancel' | 'normal';
  readonly round: number;
  readonly lastAutohealOutcome: AutohealOutcome | null;
}

/**
 * Session-scoped hooks for ordinary ReAct execution.
 *
 * This hook observes Tool results, emits conversation/turn logging events and
 * runs bounded recovery. It deliberately owns no stage, plan, persona or run
 * lifecycle; the Agent chooses its next action from the next model turn.
 */
export function createReActLoopRunner(deps: ReActLoopRunnerDeps = {}): {
  hooks: ExecutorHooks;
  state: Readonly<ReActLoopRunnerState>;
} {
  const clock = deps.now ?? (() => Date.now());
  const state: {
    nextObserveHint: 'retry' | 'user-cancel' | 'normal';
    round: number;
    lastAutohealOutcome: AutohealOutcome | null;
  } = {
    nextObserveHint: 'normal',
    round: 0,
    lastAutohealOutcome: null,
  };
  let lastHadToolCalls = false;
  const subjectAttempts = new Map<string, number>();

  const hooks: ExecutorHooks = {
    name: 'react-loop-runner',

    async onExecuteStart() {
      state.nextObserveHint = 'normal';
      state.round = 0;
      state.lastAutohealOutcome = null;
      lastHadToolCalls = false;
      subjectAttempts.clear();
    },

    async afterAct(results: ToolResultWithMeta[]) {
      lastHadToolCalls = results.length > 0;
      emitCommittedTools(deps.eventBus, results, clock);

      const failed = results.find((result) => !isSuccessfulToolResult(result));
      if (!failed) {
        state.nextObserveHint = 'normal';
        state.lastAutohealOutcome = null;
        return;
      }
      if (!deps.autohealChain) {
        state.nextObserveHint = 'retry';
        return;
      }

      const subject = getSubject(failed);
      const attempt = subjectAttempts.get(subject) ?? 0;
      subjectAttempts.set(subject, attempt + 1);
      try {
        const outcome = await deps.autohealChain.run(
          {
            subject,
            errorCode: getErrorCode(failed),
            message: getErrorMessage(failed),
            attempt,
            cause: failed,
          },
          { round: state.round },
        );
        state.lastAutohealOutcome = outcome;
        state.nextObserveHint = autohealOutcomeToHint(outcome);
        if (outcome.resolution === 'healed') {
          subjectAttempts.delete(subject);
        }
      } catch (error) {
        logger.warn(`Autoheal chain threw during afterAct: ${String(error)}`);
        state.nextObserveHint = 'retry';
      }
    },

    async onIterationComplete() {
      deps.eventBus?.emit({
        channel: AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
        round: state.round,
        thinkOnly: !lastHadToolCalls,
        at: clock(),
      });
      state.round += 1;
    },

    async onExecuteEnd(_result: AgentResult) {
      // Completion is established by Agent/Tool/Task results, not a runner
      // lifecycle event or a staged creation state.
    },
  };

  return { hooks, state };
}

function emitCommittedTools(
  eventBus: IEventBus | undefined,
  results: readonly ToolResultWithMeta[],
  clock: () => number,
): void {
  if (!eventBus) return;
  for (const result of results) {
    if (!isSuccessfulToolResult(result) || isReadOnlySubject(result)) continue;
    eventBus.emit({
      channel: AGENT_RUNTIME_CHANNELS.TOOL_COMMITTED,
      subject: `tool:${getSubject(result)}`,
      at: clock(),
    });
  }
}

function isSuccessfulToolResult(result: ToolResultWithMeta): boolean {
  return !('success' in result) || result.success !== false;
}

function getSubject(result: ToolResultWithMeta): string {
  const named = result as ToolResultWithMeta & { readonly name?: string };
  return named.name && named.name.length > 0 ? named.name : 'unknown';
}

function isReadOnlySubject(result: ToolResultWithMeta): boolean {
  return DEFAULT_READ_ONLY_TOOLS.includes(getSubject(result));
}

function getErrorCode(result: ToolResultWithMeta): string {
  const coded = result as ToolResultWithMeta & {
    readonly code?: string;
    readonly kind?: string;
  };
  if (coded.code) return coded.code;
  if (coded.kind) return coded.kind;
  return 'TOOL_ERROR';
}

function getErrorMessage(result: ToolResultWithMeta): string {
  const failed = result as ToolResultWithMeta & {
    readonly error?: unknown;
    readonly message?: string;
  };
  if (failed.message) return failed.message;
  const error: unknown = failed.error;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'tool reported failure';
}

function autohealOutcomeToHint(outcome: AutohealOutcome): 'retry' | 'user-cancel' | 'normal' {
  switch (outcome.resolution) {
    case 'healed':
    case 'pass':
      return 'retry';
    case 'aborted':
      return 'user-cancel';
    default:
      return assertNever(outcome);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled autoheal outcome: ${JSON.stringify(value)}`);
}
