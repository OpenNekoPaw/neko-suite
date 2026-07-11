import type { AgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-registry';
import {
  createTimelineRenderCommitScheduler,
  type TimelineRenderCommitScheduler,
} from '@/handlers/timeline-render-commit-scheduler';
import type { ConversationRenderCoordinator } from './conversation-render-coordinator';

export type WebviewRenderVisibility = 'hidden' | 'visible';

export interface ConversationRenderRuntimeMetrics {
  readonly componentAttached: boolean;
  readonly realmDisposed: boolean;
  readonly visibility: WebviewRenderVisibility;
}

export interface ConversationRenderRuntimeLifecycle {
  readonly scheduler: TimelineRenderCommitScheduler;
  attachComponent(): void;
  detachComponent(): void;
  setVisibility(visibility: WebviewRenderVisibility): void;
  releaseTurn(conversationId: string, messageId: string): void;
  disposeConversation(
    conversationId: string,
    reason: 'conversation-delete' | 'confirmed-empty-conversation',
  ): void;
  disposeRealm(): void;
  metrics(): ConversationRenderRuntimeMetrics;
}

export function createConversationRenderRuntimeLifecycle(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly markdown: AgentMarkdownSessionRegistry;
  readonly createScheduler?: () => TimelineRenderCommitScheduler;
}): ConversationRenderRuntimeLifecycle {
  const createScheduler = input.createScheduler ?? createTimelineRenderCommitScheduler;
  let schedulerOwner = createScheduler();
  let componentAttached = false;
  let realmDisposed = false;
  let visibility: WebviewRenderVisibility =
    typeof document === 'undefined' || document.visibilityState === 'visible'
      ? 'visible'
      : 'hidden';

  const requireScheduler = (): TimelineRenderCommitScheduler => {
    if (realmDisposed) {
      throw new Error('Conversation render runtime realm is disposed.');
    }
    return schedulerOwner;
  };

  const scheduler: TimelineRenderCommitScheduler = {
    enqueue: (message, commit) => requireScheduler().enqueue(message, commit),
    flushConversation: (conversationId) => requireScheduler().flushConversation(conversationId),
    discardTurn: (conversationId, messageId) =>
      requireScheduler().discardTurn(conversationId, messageId),
    discardConversation: (conversationId) => requireScheduler().discardConversation(conversationId),
    flushAll: () => requireScheduler().flushAll(),
    dispose: () => requireScheduler().dispose(),
    metrics: () => schedulerOwner.metrics(),
  };

  return {
    scheduler,
    attachComponent(): void {
      if (realmDisposed) {
        throw new Error('Cannot attach a component to a disposed Webview render realm.');
      }
      if (schedulerOwner.metrics().disposed) schedulerOwner = createScheduler();
      componentAttached = true;
    },
    detachComponent(): void {
      if (realmDisposed || !componentAttached) return;
      schedulerOwner.dispose();
      componentAttached = false;
    },
    setVisibility(nextVisibility): void {
      if (realmDisposed) {
        throw new Error('Cannot change visibility for a disposed Webview render realm.');
      }
      visibility = nextVisibility;
    },
    releaseTurn(conversationId, messageId): void {
      requireScheduler().discardTurn(conversationId, messageId);
      input.markdown.releaseTurn(conversationId, messageId);
    },
    disposeConversation(conversationId, reason): void {
      requireScheduler().discardConversation(conversationId);
      input.markdown.disposeConversation(conversationId);
      if (input.coordinator.isDisposed(conversationId)) return;
      if (input.coordinator.read(conversationId)) {
        input.coordinator.dispose({ kind: 'disposal', conversationId, reason });
      }
    },
    disposeRealm(): void {
      if (realmDisposed) return;
      schedulerOwner.dispose();
      input.markdown.disposeAll();
      componentAttached = false;
      realmDisposed = true;
    },
    metrics(): ConversationRenderRuntimeMetrics {
      return { componentAttached, realmDisposed, visibility };
    },
  };
}
