import type { IdcRuntimeStateInput, IIdcRuntimeStateStore } from '../workspace';

export interface SessionPersistenceOptions {
  readonly debounceMs: number;
  readonly buildSnapshot: () => IdcRuntimeStateInput | null;
  readonly onWarn?: (message: string, data?: Record<string, unknown>) => void;
}

export class SessionPersistence {
  private _store: IIdcRuntimeStateStore | null = null;
  private readonly _debounceMs: number;
  private readonly _buildSnapshot: () => IdcRuntimeStateInput | null;
  private readonly _onWarn?: (message: string, data?: Record<string, unknown>) => void;
  private _restoreReady: Promise<void> | null = null;
  private _restorePending = false;
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;
  private _persistScheduled = false;
  private _unsubscribers: Array<() => void> = [];

  constructor(options: SessionPersistenceOptions) {
    this._debounceMs = options.debounceMs;
    this._buildSnapshot = options.buildSnapshot;
    this._onWarn = options.onWarn;
  }

  get hasStore(): boolean {
    return this._store !== null;
  }

  get isRestorePending(): boolean {
    return this._restorePending;
  }

  setStore(store: IIdcRuntimeStateStore | null): void {
    if (this._store && this._store !== store) {
      void this._store.dispose().catch((error) => {
        this._warn('Failed to dispose previous IDC runtime state store', { error });
      });
    }
    this._store = store;
  }

  restoreFrom<T>(
    read: Promise<T | null>,
    apply: (state: T) => void,
    shouldPersistAfterRestore: () => boolean,
  ): void {
    this._restorePending = true;
    this._restoreReady = read
      .then((restored) => {
        if (restored) {
          apply(restored);
        }
      })
      .then(() => undefined)
      .finally(() => {
        this._restorePending = false;
        if (shouldPersistAfterRestore()) {
          this.schedule();
        }
      });
  }

  whenRestoreReady(): Promise<void> {
    return this._restoreReady ?? Promise.resolve();
  }

  addUnsubscriber(unsubscribe: () => void): void {
    this._unsubscribers.push(unsubscribe);
  }

  schedule(): void {
    if (!this._store) return;
    if (this._restorePending) return;
    if (this._persistScheduled) return;

    this._persistScheduled = true;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistScheduled = false;
      this.persistNow();
    }, this._debounceMs);
  }

  flushPending(): void {
    if (!this._persistScheduled) return;

    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    this._persistScheduled = false;
    this.persistNow();
  }

  persistNow(): void {
    if (!this._store) return;
    if (this._restorePending) return;

    const snapshot = this._buildSnapshot();
    if (!snapshot) return;
    this._store.update(snapshot);
  }

  flush(): Promise<void> {
    return this._store ? this._store.flush() : Promise.resolve();
  }

  dispose(): void {
    this.flushPending();
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }
    this._unsubscribers = [];

    const store = this._store;
    if (store) {
      void store.dispose().catch((error) => {
        this._warn('Failed to dispose IDC runtime state store', { error });
      });
    }
    this._store = null;
    this._restoreReady = null;
    this._restorePending = false;
  }

  private _warn(message: string, data?: Record<string, unknown>): void {
    this._onWarn?.(message, data);
  }
}
