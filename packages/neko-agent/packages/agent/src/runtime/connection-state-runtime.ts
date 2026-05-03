import type {
  ConnectionServiceType,
  ConnectionState,
  ConnectionStateChangeEvent,
  ConnectionStateListener,
  ConnectionStatus,
} from '@neko-agent/types';
import type { ProtocolConnectionState, ProtocolConnectionStateMap } from '@neko-agent/types';

export interface RuntimeConnectionStateStoreOptions {
  readonly now?: () => number;
  readonly onListenerError?: (error: unknown) => void;
}

export interface RuntimeConnectionStateUpdate {
  readonly id: string;
  readonly name: string;
  readonly type: ConnectionServiceType;
  readonly status: ConnectionStatus;
  readonly error?: string;
}

export interface RuntimeConnectionStateStore {
  updateState(input: RuntimeConnectionStateUpdate): void;
  getState(id: string, type: ConnectionServiceType): ConnectionState | undefined;
  getStatesByType(type: ConnectionServiceType): ConnectionState[];
  getAllStates(): ConnectionState[];
  getStatesMap(): ProtocolConnectionStateMap;
  addListener(listener: ConnectionStateListener): () => void;
  removeState(id: string, type: ConnectionServiceType): void;
  clear(): void;
  dispose(): void;
}

export function createRuntimeConnectionStateStore(
  options: RuntimeConnectionStateStoreOptions = {},
): RuntimeConnectionStateStore {
  return new DefaultRuntimeConnectionStateStore(options);
}

export function getRuntimeConnectionStateKey(type: ConnectionServiceType, id: string): string {
  return `${type}:${id}`;
}

class DefaultRuntimeConnectionStateStore implements RuntimeConnectionStateStore {
  private readonly states = new Map<string, ConnectionState>();
  private readonly listeners = new Set<ConnectionStateListener>();
  private readonly now: () => number;
  private readonly onListenerError?: (error: unknown) => void;

  constructor(options: RuntimeConnectionStateStoreOptions) {
    this.now = options.now ?? Date.now;
    this.onListenerError = options.onListenerError;
  }

  updateState(input: RuntimeConnectionStateUpdate): void {
    const key = getRuntimeConnectionStateKey(input.type, input.id);
    const existing = this.states.get(key);
    const oldStatus = existing?.status ?? 'disconnected';

    this.states.set(key, {
      id: input.id,
      name: input.name,
      type: input.type,
      status: input.status,
      ...(input.error !== undefined ? { error: input.error } : {}),
      lastChecked: this.now(),
    });

    if (oldStatus !== input.status) {
      this.notifyListeners({
        id: input.id,
        type: input.type,
        oldStatus,
        newStatus: input.status,
        ...(input.error !== undefined ? { error: input.error } : {}),
      });
    }
  }

  getState(id: string, type: ConnectionServiceType): ConnectionState | undefined {
    const state = this.states.get(getRuntimeConnectionStateKey(type, id));
    return state ? { ...state } : undefined;
  }

  getStatesByType(type: ConnectionServiceType): ConnectionState[] {
    return Array.from(this.states.values())
      .filter((state) => state.type === type)
      .map((state) => ({ ...state }));
  }

  getAllStates(): ConnectionState[] {
    return Array.from(this.states.values()).map((state) => ({ ...state }));
  }

  getStatesMap(): ProtocolConnectionStateMap {
    const result: ProtocolConnectionStateMap = {};
    for (const state of this.states.values()) {
      const projected: ProtocolConnectionState = {
        status: state.status,
        ...(state.error !== undefined ? { error: state.error } : {}),
      };
      result[getRuntimeConnectionStateKey(state.type, state.id)] = projected;
    }
    return result;
  }

  addListener(listener: ConnectionStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  removeState(id: string, type: ConnectionServiceType): void {
    this.states.delete(getRuntimeConnectionStateKey(type, id));
  }

  clear(): void {
    this.states.clear();
  }

  dispose(): void {
    this.states.clear();
    this.listeners.clear();
  }

  private notifyListeners(event: ConnectionStateChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.onListenerError?.(error);
      }
    }
  }
}

export type {
  ConnectionServiceType,
  ConnectionState,
  ConnectionStateChangeEvent,
  ConnectionStateListener,
  ConnectionStatus,
};
