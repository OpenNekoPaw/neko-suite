/**
 * Hook Runner — Shared utility for executing hooks by event name
 *
 * Extracted from AgentExecutor to allow think-phase and act-phase modules
 * to invoke hooks without coupling to the executor class.
 */

import type { ExecutorHooks } from '@neko/shared';
import type { AgentTraceContext } from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('Hooks');

/**
 * Run all hooks for a specific event in order
 */
export async function runHooks(
  hooks: ExecutorHooks[],
  event: keyof ExecutorHooks,
  ...args: unknown[]
): Promise<void> {
  await runHooksWithTrace(hooks, event, undefined, ...args);
}

export async function runHooksWithTrace(
  hooks: ExecutorHooks[],
  event: keyof ExecutorHooks,
  trace: AgentTraceContext | undefined,
  ...args: unknown[]
): Promise<void> {
  const hookTrace = deriveAgentTraceContext(trace, { phase: 'hook' });
  for (const hook of hooks) {
    const handler = hook[event];
    if (typeof handler === 'function') {
      const startedAt = Date.now();
      const hookName = hook.name ?? 'anonymous';
      logger.debug(
        'neko.agent.hook.start',
        withAgentTrace(hookTrace, {
          hookName,
          event,
          argCount: args.length,
        }),
      );
      try {
        await (handler as (...args: unknown[]) => Promise<void> | void).apply(hook, args);
        logger.debug(
          'neko.agent.hook.end',
          withAgentTrace(hookTrace, {
            hookName,
            event,
            durationMs: Date.now() - startedAt,
          }),
        );
      } catch (error) {
        logger.warn(
          'neko.agent.hook.error',
          withAgentTrace(hookTrace, {
            hookName,
            event,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        throw error;
      }
    }
  }
}
