/**
 * Hook Runner — Shared utility for executing hooks by event name
 *
 * Extracted from AgentExecutor to allow think-phase and act-phase modules
 * to invoke hooks without coupling to the executor class.
 */

import type { ExecutorHooks } from '@neko/shared';

/**
 * Run all hooks for a specific event in order
 */
export async function runHooks(
  hooks: ExecutorHooks[],
  event: keyof ExecutorHooks,
  ...args: unknown[]
): Promise<void> {
  for (const hook of hooks) {
    const handler = hook[event];
    if (typeof handler === 'function') {
      await (handler as (...args: unknown[]) => Promise<void> | void).apply(hook, args);
    }
  }
}
