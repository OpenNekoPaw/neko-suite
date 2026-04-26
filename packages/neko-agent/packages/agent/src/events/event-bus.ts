/**
 * EventBus — typed in-process pub/sub for dual-flow events.
 *
 * See: docs/architecture/agent-unified-workflow.md §11.6
 *      plan v2 §3 Epic P5 + R9 (telemetry compaction)
 *      agent-types/{creation-events,execution-events}.ts for payload types
 *
 * Design rules:
 * - Typed per channel. Subscribers bind to a specific channel string
 *   and receive the matching payload type via TypeScript overload resolution.
 * - Subscribers are isolated: one listener's throw does not affect others.
 * - Channel tiers (`milestone` / `diagnostic` / `debug`) ride as metadata
 *   on the event payload; consumers may filter. This matches plan v2 R5
 *   (channel tiering) without adding transport-level complexity.
 * - In-process only. Cross-process transport (webview ↔ extension ↔
 *   engine) is explicitly out of scope — P5 shipping in one process
 *   keeps the contract narrow; later implementations can wrap this bus.
 *
 * Intentional non-goals:
 * - No persistence.
 * - No backpressure / ordering guarantees beyond FIFO dispatch per
 *   channel.
 * - No wildcard subscriptions — use subscribeAny() when a sink needs
 *   everything (e.g. debug panel, journal writer).
 */

import type {
  CreationChannel,
  CreationEvent,
  ExecutionChannel,
  ExecutionEvent,
} from '@neko-agent/types';
import { CREATION_CHANNELS, EXECUTION_CHANNELS } from '@neko-agent/types';
import { getLogger } from '../utils/logger';

const logger = getLogger('EventBus');

// =============================================================================
// Types
// =============================================================================

export type DualFlowChannel = CreationChannel | ExecutionChannel;
export type DualFlowEvent = CreationEvent | ExecutionEvent;

/** A subscriber for a specific channel. */
export type ChannelListener<E extends DualFlowEvent> = (event: E) => void;

/** A catch-all subscriber (debug panels, journal writers). */
export type AnyListener = (event: DualFlowEvent) => void;

export interface IEventBus {
  /**
   * Subscribe to a specific channel. The listener's event parameter is
   * narrowed via the generic C so callers get the correct payload shape
   * without casting.
   */
  on<C extends DualFlowChannel>(
    channel: C,
    listener: (event: DualFlowEvent & { channel: C }) => void,
  ): () => void;
  /** Catch-all subscriber; fires for every event on every channel. */
  onAny(listener: AnyListener): () => void;
  /** Publish an event. The event's `channel` field selects listeners. */
  emit(event: DualFlowEvent): void;
  /** Remove every subscriber. */
  clear(): void;
  /** Number of subscribers for a specific channel (0 if none). */
  listenerCount(channel: DualFlowChannel): number;
}

// =============================================================================
// Implementation
// =============================================================================

class EventBus implements IEventBus {
  private readonly _channels = new Map<string, Set<AnyListener>>();
  private readonly _anyListeners = new Set<AnyListener>();

  // Overloads mirror IEventBus so call sites get the correct payload
  // type. The implementation signature uses the widened union and casts
  // internally — safe because emit() only dispatches when event.channel
  // matches the key the subscriber registered.
  on<C extends DualFlowChannel>(
    channel: C,
    listener: (event: DualFlowEvent & { channel: C }) => void,
  ): () => void {
    const generic = listener as AnyListener;
    let set = this._channels.get(channel);
    if (!set) {
      set = new Set();
      this._channels.set(channel, set);
    }
    set.add(generic);
    return () => {
      set!.delete(generic);
      if (set!.size === 0) {
        this._channels.delete(channel);
      }
    };
  }

  onAny(listener: AnyListener): () => void {
    this._anyListeners.add(listener);
    return () => {
      this._anyListeners.delete(listener);
    };
  }

  emit(event: DualFlowEvent): void {
    const set = this._channels.get(event.channel);
    if (set) {
      for (const listener of set) {
        this._safeDispatch(listener, event);
      }
    }
    for (const listener of this._anyListeners) {
      this._safeDispatch(listener, event);
    }
  }

  clear(): void {
    this._channels.clear();
    this._anyListeners.clear();
  }

  listenerCount(channel: DualFlowChannel): number {
    return this._channels.get(channel)?.size ?? 0;
  }

  private _safeDispatch(listener: AnyListener, event: DualFlowEvent): void {
    try {
      listener(event);
    } catch (err) {
      // Listener failures must not affect siblings or subsequent emits.
      logger.warn(`Listener on channel ${event.channel} threw: ${String(err)}`);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createEventBus(): IEventBus {
  return new EventBus();
}

// =============================================================================
// Channel namespace re-exports (convenience)
// =============================================================================

export { CREATION_CHANNELS, EXECUTION_CHANNELS };
