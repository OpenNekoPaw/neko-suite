import type {
  AgentTurnTimelineCompletion,
  AgentTurnTimelineItem,
  AgentTurnTimelineMessage,
  AgentTurnTimelineOperation,
} from '@neko-agent/types';
import { buildAgentTurnTimelineMessage } from '@neko-agent/types';
import {
  createConversationProjectionOperationBuffer,
  isCoalescibleConversationProjectionOperation,
  type ConversationProjectionOperationBuffer,
} from '@neko/agent/runtime';

export interface AgentTimelineDeliveryPort {
  postMessage(message: AgentTurnTimelineMessage): Promise<boolean>;
}

export interface AgentTimelineDeliveryTimer {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface AgentTimelineDeliveryPolicy {
  readonly maxLatencyMs: number;
  readonly maxPendingTextBytes: number;
  readonly maxPendingOperations: number;
  readonly deliverFirstAppendImmediately: boolean;
}

export interface AgentTimelineDeliveryInput {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface AgentTimelineSnapshotSource {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface AgentTimelineDeliveryIdentity {
  readonly connectionEpoch: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
}

export interface AgentTimelineDeliveryMetrics {
  readonly inputBatches: number;
  readonly inputOperations: number;
  readonly deliveredBatches: number;
  readonly deliveredOperations: number;
  readonly deliveredBytes: number;
  readonly pendingBytesHighWaterMark: number;
  readonly pendingOperationsHighWaterMark: number;
  readonly flushCount: number;
  readonly maximumFlushLatencyMs: number;
  readonly failedDeliveries: number;
  readonly pendingOperations: number;
  readonly pendingTextBytes: number;
  readonly timerScheduled: boolean;
  readonly accepting: boolean;
  readonly disposed: boolean;
}

export interface AgentTimelineDeliveryResult {
  readonly delivered: boolean;
  readonly deliveryRevision: number;
  readonly diagnostic?: 'endpoint-unavailable' | 'disposed';
}

export type AgentTimelineSnapshotResult =
  | { readonly available: false; readonly diagnostic: 'turn-snapshot-unavailable' | 'disposed' }
  | { readonly available: true; readonly message: AgentTurnTimelineMessage };

const DEFAULT_POLICY: AgentTimelineDeliveryPolicy = {
  maxLatencyMs: 32,
  maxPendingTextBytes: 32 * 1024,
  maxPendingOperations: 256,
  deliverFirstAppendImmediately: true,
};

const SYSTEM_TIMER: AgentTimelineDeliveryTimer = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * Serialized delivery channel for one active turn and one Webview endpoint generation.
 * Runtime batch frequency is intentionally not observable at the postMessage boundary.
 */
export class AgentTimelineDeliveryChannel {
  private readonly policy: AgentTimelineDeliveryPolicy;
  private readonly timer: AgentTimelineDeliveryTimer;
  private readonly operationBuffer: ConversationProjectionOperationBuffer =
    createConversationProjectionOperationBuffer();
  private pendingSince: number | undefined;
  private timerHandle: unknown | undefined;
  private deliveryRevision = 0;
  private deliveryTail: Promise<AgentTimelineDeliveryResult> = Promise.resolve({
    delivered: true,
    deliveryRevision: 0,
  });
  private accepting = true;
  private disposed = false;
  private acceptedFirstAppend = false;
  private readonly mutableMetrics = {
    inputBatches: 0,
    inputOperations: 0,
    deliveredBatches: 0,
    deliveredOperations: 0,
    deliveredBytes: 0,
    pendingBytesHighWaterMark: 0,
    pendingOperationsHighWaterMark: 0,
    flushCount: 0,
    maximumFlushLatencyMs: 0,
    failedDeliveries: 0,
  };

  constructor(
    private readonly identity: AgentTimelineDeliveryIdentity,
    private readonly port: AgentTimelineDeliveryPort,
    options: {
      readonly policy?: Partial<AgentTimelineDeliveryPolicy>;
      readonly timer?: AgentTimelineDeliveryTimer;
    } = {},
  ) {
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.timer = options.timer ?? SYSTEM_TIMER;
  }

  enqueue(message: AgentTimelineDeliveryInput): Promise<AgentTimelineDeliveryResult> {
    if (!this.accepting) return Promise.resolve(this.disposedResult());
    this.assertIdentity(message);
    this.mutableMetrics.inputBatches += 1;
    this.mutableMetrics.inputOperations += message.operations.length;
    if (isCoalescibleBatch(message)) {
      for (const operation of message.operations) this.bufferOperation(operation);
      if (!this.acceptedFirstAppend && containsAppend(message.operations)) {
        this.acceptedFirstAppend = true;
        if (this.policy.deliverFirstAppendImmediately) return this.flushPending();
      }
      if (containsAppend(message.operations)) this.acceptedFirstAppend = true;
      if (
        this.operationBuffer.textBytes >= this.policy.maxPendingTextBytes ||
        this.operationBuffer.operationCount >= this.policy.maxPendingOperations
      ) {
        return this.flushPending();
      }
      this.scheduleFlush();
      return Promise.resolve({ delivered: true, deliveryRevision: this.deliveryRevision });
    }

    // Replacement/tool/error/completion are hard boundaries. Earlier buffered source is
    // assigned the preceding revision and the whole semantic boundary remains one batch.
    this.flushPending();
    return this.queueDelivery(message.operations, message.completion);
  }

  flush(): Promise<AgentTimelineDeliveryResult> {
    if (this.disposed) return Promise.resolve(this.disposedResult());
    this.flushPending();
    return this.deliveryTail;
  }

  async snapshot(source: AgentTimelineSnapshotSource): Promise<AgentTimelineSnapshotResult> {
    if (this.disposed) return { available: false, diagnostic: 'disposed' };
    this.assertIdentity(source);
    await this.flush();
    if (source.items.length === 0 && !source.completion) {
      return { available: false, diagnostic: 'turn-snapshot-unavailable' };
    }
    return {
      available: true,
      message: buildAgentTurnTimelineMessage({
        ...this.identity,
        batchKind: 'snapshot',
        deliveryRevision: this.deliveryRevision,
        operations: source.items.map((item) => ({ operation: 'snapshot' as const, item })),
        ...(source.completion ? { completion: source.completion } : {}),
      }),
    };
  }

  snapshotIdentity(): AgentTimelineDeliveryIdentity {
    return { ...this.identity };
  }

  metrics(): AgentTimelineDeliveryMetrics {
    return {
      ...this.mutableMetrics,
      pendingOperations: this.operationBuffer.operationCount,
      pendingTextBytes: this.operationBuffer.textBytes,
      timerScheduled: this.timerHandle !== undefined,
      accepting: this.accepting,
      disposed: this.disposed,
    };
  }

  async dispose(): Promise<AgentTimelineDeliveryResult> {
    if (this.disposed) return this.disposedResult();
    this.accepting = false;
    this.cancelTimer();
    this.flushPending();
    const result = await this.deliveryTail;
    this.disposed = true;
    return result;
  }

  private bufferOperation(operation: AgentTurnTimelineOperation): void {
    if (this.pendingSince === undefined) this.pendingSince = this.timer.now();
    this.operationBuffer.push(operation);
    this.mutableMetrics.pendingBytesHighWaterMark = Math.max(
      this.mutableMetrics.pendingBytesHighWaterMark,
      this.operationBuffer.textBytesHighWaterMark,
    );
    this.mutableMetrics.pendingOperationsHighWaterMark = Math.max(
      this.mutableMetrics.pendingOperationsHighWaterMark,
      this.operationBuffer.operationCountHighWaterMark,
    );
  }

  private flushPending(): Promise<AgentTimelineDeliveryResult> {
    this.cancelTimer();
    if (this.operationBuffer.operationCount === 0) return this.deliveryTail;
    const operations = this.operationBuffer.drain();
    const pendingSince = this.pendingSince;
    this.pendingSince = undefined;
    return this.queueDelivery(operations, undefined, pendingSince);
  }

  private queueDelivery(
    operations: readonly AgentTurnTimelineOperation[],
    completion?: AgentTurnTimelineCompletion,
    pendingSince = this.timer.now(),
  ): Promise<AgentTimelineDeliveryResult> {
    const deliveryRevision = this.deliveryRevision + 1;
    this.deliveryRevision = deliveryRevision;
    this.mutableMetrics.flushCount += 1;
    this.mutableMetrics.maximumFlushLatencyMs = Math.max(
      this.mutableMetrics.maximumFlushLatencyMs,
      this.timer.now() - pendingSince,
    );
    const batch = buildAgentTurnTimelineMessage({
      ...this.identity,
      batchKind: 'delta',
      deliveryRevision,
      operations,
      ...(completion ? { completion } : {}),
    });

    this.deliveryTail = this.deliveryTail.then(async () => {
      try {
        const delivered = await this.port.postMessage(batch);
        if (!delivered) return this.recordDeliveryFailure(deliveryRevision);
        this.mutableMetrics.deliveredBatches += 1;
        this.mutableMetrics.deliveredOperations += operations.length;
        this.mutableMetrics.deliveredBytes += byteLength(JSON.stringify(batch));
        return { delivered: true, deliveryRevision };
      } catch {
        return this.recordDeliveryFailure(deliveryRevision);
      }
    });
    return this.deliveryTail;
  }

  private recordDeliveryFailure(deliveryRevision: number): AgentTimelineDeliveryResult {
    this.mutableMetrics.failedDeliveries += 1;
    return { delivered: false, deliveryRevision, diagnostic: 'endpoint-unavailable' };
  }

  private scheduleFlush(): void {
    if (this.timerHandle !== undefined) return;
    this.timerHandle = this.timer.setTimeout(() => {
      this.timerHandle = undefined;
      void this.flushPending();
    }, this.policy.maxLatencyMs);
  }

  private cancelTimer(): void {
    if (this.timerHandle === undefined) return;
    this.timer.clearTimeout(this.timerHandle);
    this.timerHandle = undefined;
  }

  private disposedResult(): AgentTimelineDeliveryResult {
    return {
      delivered: false,
      deliveryRevision: this.deliveryRevision,
      diagnostic: 'disposed',
    };
  }

  private assertIdentity(message: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageId: string;
  }): void {
    if (
      message.conversationId !== this.identity.conversationId ||
      message.turnId !== this.identity.turnId ||
      message.messageId !== this.identity.messageId
    ) {
      throw new Error('Timeline delivery channel received a batch for a different identity.');
    }
  }
}

function isCoalescibleBatch(message: AgentTimelineDeliveryInput): boolean {
  return (
    message.completion === undefined &&
    message.operations.length > 0 &&
    message.operations.every(isCoalescibleConversationProjectionOperation)
  );
}

function containsAppend(operations: readonly AgentTurnTimelineOperation[]): boolean {
  return operations.some((operation) => operation.operation === 'append');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
