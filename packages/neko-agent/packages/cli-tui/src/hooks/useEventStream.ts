/**
 * useEventStream Hook
 *
 * Consumes an AsyncIterable<AgentEvent> and routes events
 * to the EventAdapter. This hook is used internally by
 * useAgentSession — most components won't need it directly.
 */

import { useCallback, useRef } from 'react';
import type { AgentEvent } from '@neko/agent';
import type { IEventAdapter } from '../adapters/event-adapter';

/**
 * Hook that consumes an async event stream and dispatches to adapter.
 * Returns a function to start consuming from a new iterable.
 */
export function useEventStream(adapter: IEventAdapter | null) {
  const abortRef = useRef<AbortController | null>(null);

  const consume = useCallback(
    async (events: AsyncIterable<AgentEvent>) => {
      if (!adapter) return;

      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      adapter.reset();

      try {
        for await (const event of events) {
          if (controller.signal.aborted) break;
          adapter.handleEvent(event);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          throw error;
        }
      }
    },
    [adapter]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { consume, abort };
}
