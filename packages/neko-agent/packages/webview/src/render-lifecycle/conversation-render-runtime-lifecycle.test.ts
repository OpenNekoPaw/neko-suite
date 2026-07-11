import { describe, expect, it, vi } from 'vitest';
import { createAgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-registry';
import {
  createTimelineRenderCommitScheduler,
  type TimelineRenderFramePort,
} from '@/handlers/timeline-render-commit-scheduler';
import { createIdleConversationStreamingSnapshot } from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import { createConversationRenderRuntimeLifecycle } from './conversation-render-runtime-lifecycle';
import type { AgentTurnTimelineMessage } from '@neko-agent/types';

describe('conversation render runtime lifecycle', () => {
  it('separates component detach, hide/reveal, and realm teardown', () => {
    const frame = createFrameHarness();
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({
      coordinator,
      markdown,
      createScheduler: () => createTimelineRenderCommitScheduler(frame.port),
    });
    const commit = vi.fn();
    coordinator.ingest(hostSnapshot('conv-a'));
    runtime.attachComponent();
    runtime.scheduler.enqueue(appendMessage('conv-a', 'message-a'), commit);

    runtime.setVisibility('hidden');
    runtime.setVisibility('visible');
    expect(coordinator.read('conv-a')).toBeDefined();
    expect(runtime.metrics()).toMatchObject({
      componentAttached: true,
      realmDisposed: false,
      visibility: 'visible',
    });

    runtime.detachComponent();
    expect(frame.pending()).toBe(0);
    expect(coordinator.read('conv-a')).toBeDefined();
    runtime.attachComponent();
    runtime.scheduler.enqueue(appendMessage('conv-a', 'message-a'), commit);
    frame.flush();
    expect(commit).toHaveBeenCalledTimes(1);

    runtime.disposeRealm();
    expect(runtime.metrics()).toMatchObject({ componentAttached: false, realmDisposed: true });
    expect(() => runtime.scheduler.enqueue(appendMessage('conv-a', 'message-a'), commit)).toThrow(
      'realm is disposed',
    );
    expect(coordinator.read('conv-a')).toBeDefined();
  });

  it('disposes only one conversation and releases only one active turn', () => {
    const frame = createFrameHarness();
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({
      coordinator,
      markdown,
      createScheduler: () => createTimelineRenderCommitScheduler(frame.port),
    });
    const commitA = vi.fn();
    const commitB = vi.fn();
    coordinator.ingest(hostSnapshot('conv-a'));
    coordinator.ingest(hostSnapshot('conv-b'));
    runtime.attachComponent();
    runtime.scheduler.enqueue(appendMessage('conv-a', 'message-a'), commitA);
    runtime.scheduler.enqueue(appendMessage('conv-b', 'message-b'), commitB);
    markdown.applyTimelineDeliveries([
      appendMessage('conv-a', 'message-a'),
      appendMessage('conv-b', 'message-b'),
    ]);

    runtime.releaseTurn('conv-a', 'message-a');
    expect(markdown.metrics().activeSessions).toBe(1);
    expect(runtime.scheduler.metrics().pendingDeliveries).toBe(1);
    expect(coordinator.read('conv-a')).toBeDefined();

    runtime.disposeConversation('conv-a', 'conversation-delete');
    expect(coordinator.read('conv-a')).toBeUndefined();
    expect(coordinator.isDisposed('conv-a')).toBe(true);
    expect(coordinator.read('conv-b')).toBeDefined();
    expect(markdown.metrics().activeSessions).toBe(1);
    frame.flush();
    expect(commitA).not.toHaveBeenCalled();
    expect(commitB).toHaveBeenCalledTimes(1);
  });
});

function hostSnapshot(conversationId: string) {
  return {
    kind: 'host-snapshot' as const,
    conversationId,
    baseRevision: 0,
    messages: [],
    streaming: createIdleConversationStreamingSnapshot(),
  };
}

function appendMessage(conversationId: string, messageId: string): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    schemaVersion: 2,
    connectionEpoch: 'epoch-1',
    conversationId,
    turnId: `turn-${conversationId}`,
    messageId,
    batchKind: 'delta',
    deliveryRevision: 1,
    operations: [
      {
        operation: 'append',
        item: {
          conversationId,
          turnId: `turn-${conversationId}`,
          messageId,
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 1,
          kind: 'assistant_text',
          status: 'streaming',
          payload: { content: conversationId, format: 'markdown', sourceGeneration: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ],
  };
}

function createFrameHarness(): {
  readonly port: TimelineRenderFramePort;
  pending(): number;
  flush(): void;
} {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  return {
    port: {
      request(callback): number {
        const handle = nextHandle++;
        callbacks.set(handle, callback);
        return handle;
      },
      cancel(handle): void {
        callbacks.delete(handle);
      },
    },
    pending: () => callbacks.size,
    flush(): void {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback();
    },
  };
}
