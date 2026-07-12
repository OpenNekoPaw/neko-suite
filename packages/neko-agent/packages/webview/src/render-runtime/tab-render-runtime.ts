export type TabRenderRuntimeLifecycle = 'attaching' | 'ready' | 'detached' | 'disposed';
export type TabRenderVisibility = 'visible' | 'hidden';

export interface TabRenderBinding {
  readonly tabId: string;
  readonly conversationId: string;
}

export interface TabRenderStoreSnapshot extends TabRenderBinding {
  readonly visibility: TabRenderVisibility;
  readonly revision: number;
}

export interface TabRenderStore {
  getSnapshot(): TabRenderStoreSnapshot;
  subscribe(listener: () => void): () => void;
  setVisibility(visibility: TabRenderVisibility): void;
  dispose(): void;
}

export interface TabRenderRuntime extends TabRenderBinding {
  readonly store: TabRenderStore;
  readonly lifecycle: TabRenderRuntimeLifecycle;
  markReady(): void;
  beginAttach(): void;
  detach(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface TabRenderRuntimeRegistry {
  readonly size: number;
  get(tabId: string): TabRenderRuntime | undefined;
  require(tabId: string): TabRenderRuntime;
  reconcile(bindings: readonly TabRenderBinding[], activeTabId: string | null): void;
  dispose(): void;
}

export function createTabRenderRuntime(binding: TabRenderBinding): TabRenderRuntime {
  return new DefaultTabRenderRuntime(binding);
}

export function createTabRenderRuntimeRegistry(): TabRenderRuntimeRegistry {
  return new DefaultTabRenderRuntimeRegistry();
}

class DefaultTabRenderStore implements TabRenderStore {
  private snapshot: TabRenderStoreSnapshot;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(binding: TabRenderBinding) {
    this.snapshot = Object.freeze({
      ...binding,
      visibility: 'hidden',
      revision: 0,
    });
  }

  getSnapshot(): TabRenderStoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setVisibility(visibility: TabRenderVisibility): void {
    this.assertActive();
    if (this.snapshot.visibility === visibility) return;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      visibility,
      revision: this.snapshot.revision + 1,
    });
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Tab render store ${this.snapshot.tabId} is disposed.`);
    }
  }
}

class DefaultTabRenderRuntime implements TabRenderRuntime {
  readonly tabId: string;
  readonly conversationId: string;
  readonly store: TabRenderStore;
  private currentLifecycle: TabRenderRuntimeLifecycle = 'attaching';

  constructor(binding: TabRenderBinding) {
    assertBinding(binding);
    this.tabId = binding.tabId;
    this.conversationId = binding.conversationId;
    this.store = new DefaultTabRenderStore({
      tabId: binding.tabId,
      conversationId: binding.conversationId,
    });
  }

  get lifecycle(): TabRenderRuntimeLifecycle {
    return this.currentLifecycle;
  }

  markReady(): void {
    this.assertLifecycle('attaching', 'become ready');
    this.currentLifecycle = 'ready';
  }

  beginAttach(): void {
    this.assertLifecycle('detached', 'begin attaching');
    this.currentLifecycle = 'attaching';
  }

  detach(): void {
    if (this.currentLifecycle !== 'attaching' && this.currentLifecycle !== 'ready') {
      throw new Error(
        `Tab render runtime ${this.tabId} cannot detach from ${this.currentLifecycle}.`,
      );
    }
    this.currentLifecycle = 'detached';
  }

  setVisible(visible: boolean): void {
    if (this.currentLifecycle === 'disposed') {
      throw new Error(`Tab render runtime ${this.tabId} is disposed.`);
    }
    this.store.setVisibility(visible ? 'visible' : 'hidden');
  }

  dispose(): void {
    if (this.currentLifecycle === 'disposed') return;
    this.currentLifecycle = 'disposed';
    this.store.dispose();
  }

  private assertLifecycle(expected: TabRenderRuntimeLifecycle, operation: string): void {
    if (this.currentLifecycle !== expected) {
      throw new Error(
        `Tab render runtime ${this.tabId} cannot ${operation} from ${this.currentLifecycle}.`,
      );
    }
  }
}

class DefaultTabRenderRuntimeRegistry implements TabRenderRuntimeRegistry {
  private readonly runtimes = new Map<string, TabRenderRuntime>();
  private disposed = false;

  get size(): number {
    return this.runtimes.size;
  }

  get(tabId: string): TabRenderRuntime | undefined {
    return this.runtimes.get(tabId);
  }

  require(tabId: string): TabRenderRuntime {
    const runtime = this.runtimes.get(tabId);
    if (!runtime) {
      throw new Error(`Tab render runtime ${tabId} is not registered.`);
    }
    return runtime;
  }

  reconcile(bindings: readonly TabRenderBinding[], activeTabId: string | null): void {
    this.assertActive();
    const nextBindings = new Map<string, TabRenderBinding>();
    for (const binding of bindings) {
      assertBinding(binding);
      if (nextBindings.has(binding.tabId)) {
        throw new Error(`Duplicate Tab render binding for ${binding.tabId}.`);
      }
      nextBindings.set(binding.tabId, binding);
    }
    if (activeTabId !== null && !nextBindings.has(activeTabId)) {
      throw new Error(`Active Tab ${activeTabId} has no open render binding.`);
    }

    for (const [tabId, runtime] of this.runtimes) {
      const binding = nextBindings.get(tabId);
      if (binding && runtime.conversationId !== binding.conversationId) {
        throw new Error(
          `Tab render runtime ${tabId} is bound to ${runtime.conversationId} and cannot rebind to ${binding.conversationId}.`,
        );
      }
    }

    for (const [tabId, runtime] of this.runtimes) {
      if (!nextBindings.has(tabId)) {
        runtime.dispose();
        this.runtimes.delete(tabId);
      }
    }

    for (const binding of nextBindings.values()) {
      let runtime = this.runtimes.get(binding.tabId);
      if (!runtime) {
        runtime = createTabRenderRuntime(binding);
        runtime.markReady();
        this.runtimes.set(binding.tabId, runtime);
      }
      runtime.setVisible(binding.tabId === activeTabId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Tab render runtime registry is disposed.');
    }
  }
}

function assertBinding(binding: TabRenderBinding): void {
  if (binding.tabId.trim().length === 0) {
    throw new Error('tabId is required for a Tab render runtime.');
  }
  if (binding.conversationId.trim().length === 0) {
    throw new Error('conversationId is required for a Tab render runtime.');
  }
}
