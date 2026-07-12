import type {
  ConversationActivationTransaction,
  ConversationRenderMutation,
  ConversationRenderSnapshot,
  ConversationStreamingSnapshot,
} from './conversation-render-contract';
import { ConversationRenderLifecycleError } from './conversation-render-contract';

type RevisionedMutation = Extract<ConversationRenderMutation, { readonly baseRevision: number }>;
type ActivationMutation = Extract<ConversationRenderMutation, { readonly kind: 'activation' }>;
type DisposalMutation = Extract<ConversationRenderMutation, { readonly kind: 'disposal' }>;

export class ConversationRenderCoordinator {
  private readonly snapshots = new Map<string, ConversationRenderSnapshot>();
  private readonly disposedRevisions = new Map<string, number>();
  private readonly revisionListeners = new Map<string, Set<() => void>>();
  private foregroundId: string | null = null;

  read(conversationId: string): ConversationRenderSnapshot | undefined {
    return this.snapshots.get(conversationId);
  }

  foregroundConversationId(): string | null {
    return this.foregroundId;
  }

  revision(conversationId: string): number {
    return (
      this.snapshots.get(conversationId)?.revision ??
      this.disposedRevisions.get(conversationId) ??
      0
    );
  }

  isDisposed(conversationId: string): boolean {
    return this.disposedRevisions.has(conversationId);
  }

  subscribeRevision(conversationId: string, listener: () => void): () => void {
    const listeners = this.revisionListeners.get(conversationId) ?? new Set<() => void>();
    listeners.add(listener);
    this.revisionListeners.set(conversationId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.revisionListeners.delete(conversationId);
    };
  }

  ingest(mutation: RevisionedMutation): ConversationRenderSnapshot {
    const current = this.snapshots.get(mutation.conversationId);
    const disposedRevision = this.disposedRevisions.get(mutation.conversationId);
    if (disposedRevision !== undefined) {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} cannot accept ${mutation.kind} after disposal.`,
        conversationId: mutation.conversationId,
        currentRevision: disposedRevision,
        targetRevision: mutation.baseRevision,
      });
    }
    const currentRevision = current?.revision ?? 0;
    if (mutation.baseRevision !== currentRevision) {
      throw lifecycleError({
        code: 'stale-revision',
        message: `Expected base revision ${currentRevision}, received ${mutation.baseRevision}.`,
        conversationId: mutation.conversationId,
        currentRevision,
        targetRevision: mutation.baseRevision,
      });
    }

    const next = createNextSnapshot(current, mutation);
    if (next === current) return current;
    this.snapshots.set(mutation.conversationId, next);
    this.publishRevisions([mutation.conversationId]);
    return next;
  }

  prepareActivation(mutation: ActivationMutation): ConversationActivationTransaction {
    const current = this.snapshots.get(mutation.conversationId);
    const disposedRevision = this.disposedRevisions.get(mutation.conversationId);
    if (!current || disposedRevision !== undefined) {
      throw lifecycleError({
        code:
          disposedRevision !== undefined
            ? 'conversation-disposed'
            : 'conversation-snapshot-unavailable',
        message:
          disposedRevision !== undefined
            ? `Conversation ${mutation.conversationId} is disposed.`
            : `Conversation ${mutation.conversationId} has no retained render snapshot.`,
        conversationId: mutation.conversationId,
        activationSource: mutation.source,
        currentRevision: disposedRevision,
      });
    }

    const snapshot: ConversationRenderSnapshot = {
      ...current,
      revision: current.revision + 1,
      streaming: current.streaming,
      visibility: 'foreground',
    };
    let committed = false;

    return {
      snapshot,
      source: mutation.source,
      commit: ({ visibleState }): void => {
        if (committed) {
          throw lifecycleError({
            code: 'activation-already-committed',
            message: `Activation for ${mutation.conversationId} may only commit once.`,
            conversationId: mutation.conversationId,
            activationSource: mutation.source,
            targetRevision: snapshot.revision,
          });
        }
        committed = true;
        visibleState.commit(snapshot);
        if (visibleState.currentConversationId() !== mutation.conversationId) {
          throw lifecycleError({
            code: 'visible-state-commit-mismatch',
            message: `Visible state did not commit ${mutation.conversationId}.`,
            conversationId: mutation.conversationId,
            activationSource: mutation.source,
            currentRevision: current.revision,
            targetRevision: snapshot.revision,
          });
        }

        this.commitForegroundSnapshot(snapshot);
        if (
          visibleState.currentConversationId() !== mutation.conversationId ||
          this.foregroundId !== mutation.conversationId
        ) {
          throw lifecycleError({
            code: 'activation-publication-order-invalid',
            message: `Conversation ${mutation.conversationId} cannot publish renderer state before foreground ownership commits.`,
            conversationId: mutation.conversationId,
            activationSource: mutation.source,
            currentRevision: current.revision,
            targetRevision: snapshot.revision,
          });
        }
      },
    };
  }

  dispose(mutation: DisposalMutation): ConversationRenderSnapshot {
    const existingDisposedRevision = this.disposedRevisions.get(mutation.conversationId);
    if (existingDisposedRevision !== undefined) {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} is already disposed.`,
        conversationId: mutation.conversationId,
        currentRevision: existingDisposedRevision,
      });
    }
    const current = this.snapshots.get(mutation.conversationId);
    if (!current) {
      throw lifecycleError({
        code: 'conversation-snapshot-unavailable',
        message: `Conversation ${mutation.conversationId} has no render snapshot to dispose.`,
        conversationId: mutation.conversationId,
      });
    }

    const disposed: ConversationRenderSnapshot = {
      ...current,
      revision: current.revision + 1,
      visibility: 'background',
      retention: 'disposed',
    };
    this.snapshots.delete(mutation.conversationId);
    this.disposedRevisions.set(mutation.conversationId, disposed.revision);
    if (this.foregroundId === mutation.conversationId) this.foregroundId = null;
    this.publishRevisions([mutation.conversationId]);
    this.revisionListeners.delete(mutation.conversationId);
    return disposed;
  }

  private commitForegroundSnapshot(snapshot: ConversationRenderSnapshot): void {
    const previousForegroundId = this.foregroundId;
    const changedConversationIds = [snapshot.conversationId];
    if (previousForegroundId && previousForegroundId !== snapshot.conversationId) {
      const previous = this.snapshots.get(previousForegroundId);
      if (previous?.retention === 'retained') {
        this.snapshots.set(previousForegroundId, {
          ...previous,
          revision: previous.revision + 1,
          visibility: 'background',
        });
        changedConversationIds.push(previousForegroundId);
      }
    }
    this.snapshots.set(snapshot.conversationId, snapshot);
    this.foregroundId = snapshot.conversationId;
    this.publishRevisions(changedConversationIds);
  }

  private publishRevisions(conversationIds: readonly string[]): void {
    for (const conversationId of new Set(conversationIds)) {
      const listeners = this.revisionListeners.get(conversationId);
      if (!listeners) continue;
      for (const listener of [...listeners]) listener();
    }
  }
}

function createNextSnapshot(
  current: ConversationRenderSnapshot | undefined,
  mutation: RevisionedMutation,
): ConversationRenderSnapshot {
  const base: ConversationRenderSnapshot =
    current ??
    ({
      conversationId: mutation.conversationId,
      revision: 0,
      messages: [],
      streaming: emptyStreamingForMutation(mutation),
      visibility: 'background',
      retention: 'retained',
    } satisfies ConversationRenderSnapshot);

  switch (mutation.kind) {
    case 'host-snapshot':
      return {
        ...base,
        revision: base.revision + 1,
        messages: [...mutation.messages],
        streaming: copyStreaming(mutation.streaming),
      };
    case 'queue-status':
      return {
        ...base,
        revision: base.revision + 1,
        streaming: {
          ...base.streaming,
          queuedMessageCount: mutation.queuedMessageCount,
          queuedMessages: [...mutation.queuedMessages],
          ...(mutation.messageQueueVersion !== undefined
            ? { messageQueueVersion: mutation.messageQueueVersion }
            : {}),
          ...(mutation.isThinking !== undefined ? { isThinking: mutation.isThinking } : {}),
        },
      };
    case 'completion':
      return {
        ...base,
        revision: base.revision + 1,
        messages: [...mutation.messages],
        streaming: {
          ...base.streaming,
          streamingMessageId: null,
          isThinking: false,
        },
      };
  }
}

function emptyStreamingForMutation(mutation: RevisionedMutation): ConversationStreamingSnapshot {
  if (mutation.kind === 'host-snapshot') {
    return copyStreaming(mutation.streaming);
  }
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}

function copyStreaming(streaming: ConversationStreamingSnapshot): ConversationStreamingSnapshot {
  return {
    ...streaming,
    queuedMessages: [...streaming.queuedMessages],
  };
}

function lifecycleError(
  diagnostic: ConstructorParameters<typeof ConversationRenderLifecycleError>[0],
): ConversationRenderLifecycleError {
  return new ConversationRenderLifecycleError(diagnostic);
}
