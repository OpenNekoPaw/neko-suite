import type {
  ConversationActivationTransaction,
  ConversationRenderMutation,
  ConversationRenderSnapshot,
  ConversationStreamingSnapshot,
} from './conversation-render-contract';
import {
  ConversationRenderLifecycleError,
  DEFAULT_CONVERSATION_VIEWPORT,
} from './conversation-render-contract';

type RevisionedMutation = Extract<ConversationRenderMutation, { readonly baseRevision: number }>;
type ActivationMutation = Extract<ConversationRenderMutation, { readonly kind: 'activation' }>;
type DisposalMutation = Extract<ConversationRenderMutation, { readonly kind: 'disposal' }>;

export class ConversationRenderCoordinator {
  private readonly snapshots = new Map<string, ConversationRenderSnapshot>();
  private foregroundId: string | null = null;

  read(conversationId: string): ConversationRenderSnapshot | undefined {
    return this.snapshots.get(conversationId);
  }

  foregroundConversationId(): string | null {
    return this.foregroundId;
  }

  ingest(mutation: RevisionedMutation): ConversationRenderSnapshot {
    const current = this.snapshots.get(mutation.conversationId);
    if (current?.retention === 'disposed') {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} cannot accept ${mutation.kind} after disposal.`,
        conversationId: mutation.conversationId,
        currentRevision: current.revision,
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
    validateTimelineIdentity(next);
    this.snapshots.set(mutation.conversationId, next);
    return next;
  }

  prepareActivation(mutation: ActivationMutation): ConversationActivationTransaction {
    const current = this.snapshots.get(mutation.conversationId);
    if (!current || current.retention === 'disposed') {
      throw lifecycleError({
        code:
          current?.retention === 'disposed'
            ? 'conversation-disposed'
            : 'conversation-snapshot-unavailable',
        message: current
          ? `Conversation ${mutation.conversationId} is disposed.`
          : `Conversation ${mutation.conversationId} has no retained render snapshot.`,
        conversationId: mutation.conversationId,
        activationSource: mutation.source,
        currentRevision: current?.revision,
      });
    }

    const snapshot: ConversationRenderSnapshot = {
      ...current,
      revision: current.revision + 1,
      streaming: releaseUnavailableTimeline(current.streaming),
      visibility: 'foreground',
    };
    let committed = false;

    return {
      snapshot,
      source: mutation.source,
      commit: ({ visibleState, markdown }): void => {
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
        const publication = markdown.prepare(snapshot);
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
        publication.publish();
      },
    };
  }

  dispose(mutation: DisposalMutation): ConversationRenderSnapshot {
    const current = this.snapshots.get(mutation.conversationId);
    if (!current) {
      throw lifecycleError({
        code: 'conversation-snapshot-unavailable',
        message: `Conversation ${mutation.conversationId} has no render snapshot to dispose.`,
        conversationId: mutation.conversationId,
      });
    }
    if (current.retention === 'disposed') {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} is already disposed.`,
        conversationId: mutation.conversationId,
        currentRevision: current.revision,
      });
    }

    const disposed: ConversationRenderSnapshot = {
      ...current,
      revision: current.revision + 1,
      visibility: 'background',
      retention: 'disposed',
    };
    this.snapshots.set(mutation.conversationId, disposed);
    if (this.foregroundId === mutation.conversationId) this.foregroundId = null;
    return disposed;
  }

  private commitForegroundSnapshot(snapshot: ConversationRenderSnapshot): void {
    const previousForegroundId = this.foregroundId;
    if (previousForegroundId && previousForegroundId !== snapshot.conversationId) {
      const previous = this.snapshots.get(previousForegroundId);
      if (previous?.retention === 'retained') {
        this.snapshots.set(previousForegroundId, {
          ...previous,
          revision: previous.revision + 1,
          visibility: 'background',
        });
      }
    }
    this.snapshots.set(snapshot.conversationId, snapshot);
    this.foregroundId = snapshot.conversationId;
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
      viewport: DEFAULT_CONVERSATION_VIEWPORT,
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
        viewport: mutation.viewport ?? base.viewport,
      };
    case 'timeline-commit':
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
          activeTurnTimeline: base.streaming.activeTurnTimeline
            ? { ...base.streaming.activeTurnTimeline, completed: true }
            : null,
        },
      };
  }
}

function emptyStreamingForMutation(mutation: RevisionedMutation): ConversationStreamingSnapshot {
  if (mutation.kind === 'host-snapshot' || mutation.kind === 'timeline-commit') {
    return copyStreaming(mutation.streaming);
  }
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
    activeTurnTimeline: null,
    synchronization: 'synchronized',
  };
}

function copyStreaming(streaming: ConversationStreamingSnapshot): ConversationStreamingSnapshot {
  return {
    ...streaming,
    queuedMessages: [...streaming.queuedMessages],
  };
}

function releaseUnavailableTimeline(
  streaming: ConversationStreamingSnapshot,
): ConversationStreamingSnapshot {
  if (
    streaming.synchronization !== 'unavailable' &&
    streaming.activeTurnTimeline?.synchronization !== 'unavailable'
  ) {
    return streaming;
  }
  return {
    ...streaming,
    streamingMessageId: null,
    isThinking: false,
    activeTurnTimeline: null,
    synchronization: 'unavailable',
  };
}

function validateTimelineIdentity(snapshot: ConversationRenderSnapshot): void {
  const timeline = snapshot.streaming.activeTurnTimeline;
  if (!timeline || timeline.conversationId === snapshot.conversationId) return;
  throw lifecycleError({
    code: 'conversation-identity-mismatch',
    message: `Timeline conversation ${timeline.conversationId} cannot belong to ${snapshot.conversationId}.`,
    conversationId: snapshot.conversationId,
    currentRevision: snapshot.revision - 1,
    targetRevision: snapshot.revision,
    messageId: timeline.messageId,
    turnId: timeline.turnId,
  });
}

function lifecycleError(
  diagnostic: ConstructorParameters<typeof ConversationRenderLifecycleError>[0],
): ConversationRenderLifecycleError {
  return new ConversationRenderLifecycleError(diagnostic);
}
