import type { AgentTurnTimelineMessage } from '@neko-agent/types';

export interface TimelineRenderFramePort {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface TimelineRenderCommitSchedulerMetrics {
  readonly scheduledDeliveries: number;
  readonly immediateDeliveries: number;
  readonly renderCommits: number;
  readonly maxPendingDeliveries: number;
  readonly pendingDeliveries: number;
  readonly disposed: boolean;
}

export interface TimelineRenderCommitScheduler {
  enqueue(
    message: AgentTurnTimelineMessage,
    commit: (messages: readonly AgentTurnTimelineMessage[]) => void,
  ): void;
  flushConversation(conversationId: string): void;
  discardTurn(conversationId: string, messageId: string): void;
  discardConversation(conversationId: string): void;
  flushAll(): void;
  dispose(): void;
  metrics(): TimelineRenderCommitSchedulerMetrics;
}

interface PendingTimelineCommit {
  readonly messages: AgentTurnTimelineMessage[];
  commit: (messages: readonly AgentTurnTimelineMessage[]) => void;
}

export function createTimelineRenderCommitScheduler(
  framePort: TimelineRenderFramePort = createBrowserTimelineRenderFramePort(),
): TimelineRenderCommitScheduler {
  const pending = new Map<string, PendingTimelineCommit>();
  let frameHandle: number | null = null;
  let disposed = false;
  let scheduledDeliveries = 0;
  let immediateDeliveries = 0;
  let renderCommits = 0;
  let maxPendingDeliveries = 0;

  const pendingDeliveryCount = (): number =>
    Array.from(pending.values()).reduce((total, entry) => total + entry.messages.length, 0);

  const cancelFrameIfIdle = (): void => {
    if (pending.size > 0 || frameHandle === null) return;
    framePort.cancel(frameHandle);
    frameHandle = null;
  };

  const flushKey = (key: string): void => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    entry.commit(entry.messages);
    renderCommits += 1;
    cancelFrameIfIdle();
  };

  const matchingKeys = (predicate: (message: AgentTurnTimelineMessage) => boolean): string[] => {
    const keys: string[] = [];
    for (const [key, entry] of pending) {
      const first = entry.messages[0];
      if (first && predicate(first)) keys.push(key);
    }
    return keys;
  };

  const flushMatching = (predicate: (message: AgentTurnTimelineMessage) => boolean): void => {
    for (const key of matchingKeys(predicate)) flushKey(key);
  };

  const discardMatching = (predicate: (message: AgentTurnTimelineMessage) => boolean): void => {
    for (const key of matchingKeys(predicate)) pending.delete(key);
    cancelFrameIfIdle();
  };

  const scheduleFrame = (): void => {
    if (frameHandle !== null) return;
    frameHandle = framePort.request(() => {
      frameHandle = null;
      for (const key of Array.from(pending.keys())) flushKey(key);
    });
  };

  return {
    enqueue(message, commit): void {
      if (disposed) {
        throw new Error('Timeline render commit scheduler is disposed.');
      }
      const key = toTimelineRenderKey(message);
      if (requiresImmediateCommit(message)) {
        flushKey(key);
        commit([message]);
        immediateDeliveries += 1;
        renderCommits += 1;
        return;
      }

      const entry = pending.get(key);
      if (entry) {
        entry.messages.push(message);
        entry.commit = commit;
      } else {
        pending.set(key, { messages: [message], commit });
      }
      scheduledDeliveries += 1;
      maxPendingDeliveries = Math.max(maxPendingDeliveries, pendingDeliveryCount());
      scheduleFrame();
    },
    flushConversation(conversationId): void {
      flushMatching((message) => message.conversationId === conversationId);
    },
    discardTurn(conversationId, messageId): void {
      discardMatching(
        (message) => message.conversationId === conversationId && message.messageId === messageId,
      );
    },
    discardConversation(conversationId): void {
      discardMatching((message) => message.conversationId === conversationId);
    },
    flushAll(): void {
      for (const key of Array.from(pending.keys())) flushKey(key);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== null) framePort.cancel(frameHandle);
      frameHandle = null;
      pending.clear();
    },
    metrics(): TimelineRenderCommitSchedulerMetrics {
      return {
        scheduledDeliveries,
        immediateDeliveries,
        renderCommits,
        maxPendingDeliveries,
        pendingDeliveries: pendingDeliveryCount(),
        disposed,
      };
    },
  };
}

function requiresImmediateCommit(message: AgentTurnTimelineMessage): boolean {
  if (message.batchKind === 'snapshot' || message.completion) return true;
  return message.operations.some(
    (operation) =>
      operation.operation !== 'append' ||
      (operation.item.kind !== 'assistant_text' && operation.item.kind !== 'thinking'),
  );
}

function toTimelineRenderKey(message: AgentTurnTimelineMessage): string {
  return [message.connectionEpoch, message.conversationId, message.turnId, message.messageId].join(
    '\u0000',
  );
}

function createBrowserTimelineRenderFramePort(): TimelineRenderFramePort {
  return {
    request(callback): number {
      return window.requestAnimationFrame(callback);
    },
    cancel(handle): void {
      window.cancelAnimationFrame(handle);
    },
  };
}
