import type { ConversationRecord } from './conversation-record';
import type {
  ConversationCatalogStaleDiagnostic,
  ConversationStorageMutationResult,
} from './conversation-resume-storage';

export interface ConversationPersistenceStoragePort {
  save(record: ConversationRecord): Promise<void | ConversationStorageMutationResult>;
  delete(conversationId: string): Promise<void | ConversationStorageMutationResult>;
  flush?(): Promise<void>;
  dispose?(): void | Promise<void>;
}

export type ConversationPersistenceOperationKind = 'partial' | 'terminal' | 'delete';

export type ConversationPersistenceDiagnosticCode =
  'external-conflict' | 'write-failed' | 'flush-failed' | 'disposed';

export interface ConversationPersistenceDiagnostic {
  readonly code: ConversationPersistenceDiagnosticCode;
  readonly operation: ConversationPersistenceOperationKind;
  readonly conversationId: string;
  readonly revision: number;
  readonly error?: unknown;
}

export type ConversationPersistenceOperationResult =
  | {
      readonly kind: 'written';
      readonly operation: ConversationPersistenceOperationKind;
      readonly conversationId: string;
      readonly revision: number;
      readonly projectionDiagnostic?: ConversationCatalogStaleDiagnostic;
    }
  | {
      readonly kind: 'superseded';
      readonly operation: 'partial';
      readonly conversationId: string;
      readonly revision: number;
      readonly supersededByRevision: number;
    }
  | {
      readonly kind: 'failed';
      readonly operation: ConversationPersistenceOperationKind;
      readonly conversationId: string;
      readonly revision: number;
      readonly diagnostic: ConversationPersistenceDiagnostic;
    }
  | {
      readonly kind: 'rejected';
      readonly operation: ConversationPersistenceOperationKind;
      readonly conversationId: string;
      readonly diagnostic: ConversationPersistenceDiagnostic;
    };

export interface ConversationPersistenceSubmission {
  readonly accepted: true;
  readonly revision: number;
  readonly completion: Promise<ConversationPersistenceOperationResult>;
}

export interface ConversationPersistenceRejectedSubmission {
  readonly accepted: false;
  readonly diagnostic: ConversationPersistenceDiagnostic;
  readonly completion: Promise<ConversationPersistenceOperationResult>;
}

export type ConversationPersistenceSubmitResult =
  ConversationPersistenceSubmission | ConversationPersistenceRejectedSubmission;

export interface ConversationPersistenceFlushResult {
  readonly watermark: number;
  readonly durable: boolean;
  readonly diagnostics: readonly ConversationPersistenceDiagnostic[];
}

export interface ConversationPersistenceDisposeResult extends ConversationPersistenceFlushResult {
  readonly disposed: true;
}

export interface ConversationPersistenceCoordinatorMetrics {
  readonly enqueuedPartials: number;
  readonly supersededPartials: number;
  readonly writtenPartials: number;
  readonly enqueuedTerminals: number;
  readonly writtenTerminals: number;
  readonly enqueuedDeletes: number;
  readonly writtenDeletes: number;
  readonly failedOperations: number;
  readonly externalConflicts: number;
  readonly pendingDepth: number;
  readonly pendingDepthHighWaterMark: number;
  readonly activeMutations: number;
  readonly maximumActiveMutations: number;
  readonly maximumMutationLatencyMs: number;
  readonly maximumFlushLatencyMs: number;
  readonly disposalCompleted: boolean;
}

export interface ConversationPersistenceCoordinatorOptions {
  readonly storage: ConversationPersistenceStoragePort;
  readonly now?: () => number;
  readonly onDiagnostic?: (diagnostic: ConversationPersistenceDiagnostic) => void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface SaveOperation {
  readonly kind: 'partial' | 'terminal';
  readonly conversationId: string;
  readonly revision: number;
  readonly record: ConversationRecord;
  readonly deferred: Deferred<ConversationPersistenceOperationResult>;
}

interface DeleteOperation {
  readonly kind: 'delete';
  readonly conversationId: string;
  readonly revision: number;
  readonly deferred: Deferred<ConversationPersistenceOperationResult>;
}

type PersistenceOperation = SaveOperation | DeleteOperation;

interface FlushWaiter {
  readonly watermark: number;
  readonly startedAt: number;
  readonly deferred: Deferred<ConversationPersistenceFlushResult>;
}

/**
 * One coordinator owns one storage authority. Callers sharing a storage authority must share this
 * instance; the coordinator never retries revision conflicts and never runs storage mutations in
 * parallel.
 */
export class ConversationPersistenceCoordinator {
  private readonly storage: ConversationPersistenceStoragePort;
  private readonly now: () => number;
  private readonly onDiagnostic:
    ((diagnostic: ConversationPersistenceDiagnostic) => void) | undefined;
  private readonly pendingPartials = new Map<string, SaveOperation>();
  private readonly requiredOperations: PersistenceOperation[] = [];
  private readonly settledRevisions = new Set<number>();
  private readonly diagnostics = new Map<number, ConversationPersistenceDiagnostic>();
  private readonly flushWaiters: FlushWaiter[] = [];
  private nextRevision = 0;
  private completedWatermark = 0;
  private drainPromise: Promise<void> | undefined;
  private lifecycle: 'active' | 'draining' | 'disposed' = 'active';
  private disposePromise: Promise<ConversationPersistenceDisposeResult> | undefined;
  private mutableMetrics = {
    enqueuedPartials: 0,
    supersededPartials: 0,
    writtenPartials: 0,
    enqueuedTerminals: 0,
    writtenTerminals: 0,
    enqueuedDeletes: 0,
    writtenDeletes: 0,
    failedOperations: 0,
    externalConflicts: 0,
    pendingDepthHighWaterMark: 0,
    activeMutations: 0,
    maximumActiveMutations: 0,
    maximumMutationLatencyMs: 0,
    maximumFlushLatencyMs: 0,
    disposalCompleted: false,
  };

  constructor(options: ConversationPersistenceCoordinatorOptions) {
    this.storage = options.storage;
    this.now = options.now ?? (() => Date.now());
    this.onDiagnostic = options.onDiagnostic;
  }

  enqueuePartial(record: ConversationRecord): ConversationPersistenceSubmitResult {
    const rejected = this.rejectIfNotActive('partial', record.id);
    if (rejected) return rejected;
    const operation = this.createSaveOperation('partial', record);
    this.mutableMetrics.enqueuedPartials += 1;
    const previous = this.pendingPartials.get(record.id);
    if (previous) {
      this.pendingPartials.delete(record.id);
      this.mutableMetrics.supersededPartials += 1;
      this.settle(previous, {
        kind: 'superseded',
        operation: 'partial',
        conversationId: previous.conversationId,
        revision: previous.revision,
        supersededByRevision: operation.revision,
      });
    }
    this.pendingPartials.set(record.id, operation);
    this.recordPendingDepth();
    this.startDrain();
    return this.submission(operation);
  }

  enqueueTerminal(record: ConversationRecord): ConversationPersistenceSubmitResult {
    const rejected = this.rejectIfNotActive('terminal', record.id);
    if (rejected) return rejected;
    const operation = this.createSaveOperation('terminal', record);
    this.mutableMetrics.enqueuedTerminals += 1;
    this.supersedePendingPartial(record.id, operation.revision);
    this.requiredOperations.push(operation);
    this.recordPendingDepth();
    this.startDrain();
    return this.submission(operation);
  }

  enqueueDelete(conversationId: string): ConversationPersistenceSubmitResult {
    const rejected = this.rejectIfNotActive('delete', conversationId);
    if (rejected) return rejected;
    const operation: DeleteOperation = {
      kind: 'delete',
      conversationId,
      revision: this.allocateRevision(),
      deferred: createDeferred(),
    };
    this.mutableMetrics.enqueuedDeletes += 1;
    this.supersedePendingPartial(conversationId, operation.revision);
    this.requiredOperations.push(operation);
    this.recordPendingDepth();
    this.startDrain();
    return this.submission(operation);
  }

  flush(): Promise<ConversationPersistenceFlushResult> {
    return this.flushToWatermark(this.nextRevision);
  }

  metrics(): ConversationPersistenceCoordinatorMetrics {
    return {
      ...this.mutableMetrics,
      pendingDepth: this.pendingPartials.size + this.requiredOperations.length,
    };
  }

  dispose(): Promise<ConversationPersistenceDisposeResult> {
    if (this.disposePromise) return this.disposePromise;
    this.lifecycle = 'draining';
    const watermark = this.nextRevision;
    this.disposePromise = (async () => {
      const flushResult = await this.flushToWatermark(watermark);
      let diagnostics = [...flushResult.diagnostics];
      const startedAt = this.now();
      try {
        await this.storage.dispose?.();
      } catch (error: unknown) {
        const diagnostic = this.recordFailure({
          code: classifyFailure(error, 'flush-failed'),
          operation: 'terminal',
          conversationId: '<storage>',
          revision: watermark,
          error,
        });
        diagnostics = [...diagnostics, diagnostic];
      }
      this.mutableMetrics.maximumFlushLatencyMs = Math.max(
        this.mutableMetrics.maximumFlushLatencyMs,
        this.now() - startedAt,
      );
      this.lifecycle = 'disposed';
      this.mutableMetrics.disposalCompleted = true;
      return {
        disposed: true,
        watermark,
        durable: diagnostics.length === 0,
        diagnostics,
      };
    })();
    return this.disposePromise;
  }

  private createSaveOperation(
    kind: 'partial' | 'terminal',
    record: ConversationRecord,
  ): SaveOperation {
    return {
      kind,
      conversationId: record.id,
      revision: this.allocateRevision(),
      record: structuredClone(record),
      deferred: createDeferred(),
    };
  }

  private allocateRevision(): number {
    this.nextRevision += 1;
    return this.nextRevision;
  }

  private submission(operation: PersistenceOperation): ConversationPersistenceSubmission {
    return {
      accepted: true,
      revision: operation.revision,
      completion: operation.deferred.promise,
    };
  }

  private rejectIfNotActive(
    operation: ConversationPersistenceOperationKind,
    conversationId: string,
  ): ConversationPersistenceRejectedSubmission | undefined {
    if (this.lifecycle === 'active') return undefined;
    const diagnostic = this.createDiagnostic({
      code: 'disposed',
      operation,
      conversationId,
      revision: this.nextRevision,
    });
    return {
      accepted: false,
      diagnostic,
      completion: Promise.resolve({ kind: 'rejected', operation, conversationId, diagnostic }),
    };
  }

  private supersedePendingPartial(conversationId: string, supersededByRevision: number): void {
    const pending = this.pendingPartials.get(conversationId);
    if (!pending) return;
    this.pendingPartials.delete(conversationId);
    this.mutableMetrics.supersededPartials += 1;
    this.settle(pending, {
      kind: 'superseded',
      operation: 'partial',
      conversationId,
      revision: pending.revision,
      supersededByRevision,
    });
  }

  private recordPendingDepth(): void {
    this.mutableMetrics.pendingDepthHighWaterMark = Math.max(
      this.mutableMetrics.pendingDepthHighWaterMark,
      this.pendingPartials.size + this.requiredOperations.length,
    );
  }

  private startDrain(): void {
    if (this.drainPromise) return;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = undefined;
      if (this.hasPendingOperations()) this.startDrain();
      this.resolveFlushWaiters();
    });
  }

  private async drain(): Promise<void> {
    while (true) {
      const operation = this.takeNextOperation();
      if (!operation) return;
      await this.execute(operation);
    }
  }

  private takeNextOperation(): PersistenceOperation | undefined {
    let candidate = this.requiredOperations[0];
    for (const partial of this.pendingPartials.values()) {
      if (!candidate || partial.revision < candidate.revision) candidate = partial;
    }
    if (!candidate) return undefined;
    if (candidate.kind === 'partial') {
      this.pendingPartials.delete(candidate.conversationId);
    } else {
      const shifted = this.requiredOperations.shift();
      if (shifted !== candidate) {
        throw new Error('Persistence required-operation queue lost ordering.');
      }
    }
    return candidate;
  }

  private async execute(operation: PersistenceOperation): Promise<void> {
    const startedAt = this.now();
    this.mutableMetrics.activeMutations += 1;
    this.mutableMetrics.maximumActiveMutations = Math.max(
      this.mutableMetrics.maximumActiveMutations,
      this.mutableMetrics.activeMutations,
    );
    let result: ConversationPersistenceOperationResult;
    let mutationResult: void | ConversationStorageMutationResult;
    try {
      if (operation.kind === 'delete') {
        mutationResult = await this.storage.delete(operation.conversationId);
      } else {
        mutationResult = await this.storage.save(operation.record);
      }
    } catch (error: unknown) {
      result = this.failedOperationResult(operation, classifyFailure(error, 'write-failed'), error);
      this.finishMutation(operation, result, startedAt);
      return;
    }

    try {
      await this.storage.flush?.();
      if (operation.kind === 'partial') this.mutableMetrics.writtenPartials += 1;
      if (operation.kind === 'terminal') this.mutableMetrics.writtenTerminals += 1;
      if (operation.kind === 'delete') this.mutableMetrics.writtenDeletes += 1;
      result = {
        kind: 'written',
        operation: operation.kind,
        conversationId: operation.conversationId,
        revision: operation.revision,
        ...(mutationResult?.kind === 'authority-durable-projection-stale'
          ? { projectionDiagnostic: mutationResult.diagnostic }
          : {}),
      };
    } catch (error: unknown) {
      result = this.failedOperationResult(operation, classifyFailure(error, 'flush-failed'), error);
    } finally {
      this.mutableMetrics.activeMutations -= 1;
      this.mutableMetrics.maximumMutationLatencyMs = Math.max(
        this.mutableMetrics.maximumMutationLatencyMs,
        this.now() - startedAt,
      );
    }
    this.settle(operation, result);
  }

  private finishMutation(
    operation: PersistenceOperation,
    result: ConversationPersistenceOperationResult,
    startedAt: number,
  ): void {
    this.mutableMetrics.activeMutations -= 1;
    this.mutableMetrics.maximumMutationLatencyMs = Math.max(
      this.mutableMetrics.maximumMutationLatencyMs,
      this.now() - startedAt,
    );
    this.settle(operation, result);
  }

  private failedOperationResult(
    operation: PersistenceOperation,
    code: 'external-conflict' | 'write-failed' | 'flush-failed',
    error: unknown,
  ): ConversationPersistenceOperationResult {
    const diagnostic = this.recordFailure({
      code,
      operation: operation.kind,
      conversationId: operation.conversationId,
      revision: operation.revision,
      error,
    });
    this.diagnostics.set(operation.revision, diagnostic);
    return {
      kind: 'failed',
      operation: operation.kind,
      conversationId: operation.conversationId,
      revision: operation.revision,
      diagnostic,
    };
  }

  private recordFailure(
    diagnostic: ConversationPersistenceDiagnostic,
  ): ConversationPersistenceDiagnostic {
    this.mutableMetrics.failedOperations += 1;
    if (diagnostic.code === 'external-conflict') this.mutableMetrics.externalConflicts += 1;
    return this.createDiagnostic(diagnostic);
  }

  private createDiagnostic(
    diagnostic: ConversationPersistenceDiagnostic,
  ): ConversationPersistenceDiagnostic {
    this.onDiagnostic?.(diagnostic);
    return diagnostic;
  }

  private settle(
    operation: PersistenceOperation,
    result: ConversationPersistenceOperationResult,
  ): void {
    operation.deferred.resolve(result);
    this.settledRevisions.add(operation.revision);
    while (this.settledRevisions.delete(this.completedWatermark + 1)) {
      this.completedWatermark += 1;
    }
    this.resolveFlushWaiters();
  }

  private flushToWatermark(watermark: number): Promise<ConversationPersistenceFlushResult> {
    if (this.completedWatermark >= watermark) {
      return Promise.resolve(this.buildFlushResult(watermark, this.now()));
    }
    const waiter: FlushWaiter = {
      watermark,
      startedAt: this.now(),
      deferred: createDeferred(),
    };
    this.flushWaiters.push(waiter);
    this.startDrain();
    return waiter.deferred.promise;
  }

  private resolveFlushWaiters(): void {
    for (let index = this.flushWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.flushWaiters[index];
      if (!waiter || this.completedWatermark < waiter.watermark) continue;
      this.flushWaiters.splice(index, 1);
      waiter.deferred.resolve(this.buildFlushResult(waiter.watermark, waiter.startedAt));
    }
  }

  private buildFlushResult(
    watermark: number,
    startedAt: number,
  ): ConversationPersistenceFlushResult {
    const latency = this.now() - startedAt;
    this.mutableMetrics.maximumFlushLatencyMs = Math.max(
      this.mutableMetrics.maximumFlushLatencyMs,
      latency,
    );
    const diagnostics = Array.from(this.diagnostics.entries())
      .filter(([revision]) => revision <= watermark)
      .sort(([left], [right]) => left - right)
      .map(([, diagnostic]) => diagnostic);
    return { watermark, durable: diagnostics.length === 0, diagnostics };
  }

  private hasPendingOperations(): boolean {
    return this.pendingPartials.size > 0 || this.requiredOperations.length > 0;
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function classifyFailure(
  error: unknown,
  defaultCode: 'write-failed' | 'flush-failed',
): 'external-conflict' | 'write-failed' | 'flush-failed' {
  if (isRecord(error) && error['code'] === 'stale-json-file-write') return 'external-conflict';
  return defaultCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
