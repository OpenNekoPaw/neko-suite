/**
 * Event Adapter
 *
 * Maps AgentEvent stream from @neko/agent to TUI store actions.
 * Single responsibility: event → state transition mapping.
 *
 * This is the critical bridge between the agent execution layer
 * and the Ink rendering layer.
 */

import type { AgentEvent } from '@neko/agent';
import type { useConversationStore } from '../stores/conversation-store';
import type { useAgentStore } from '../stores/agent-store';
import type { useUIStore, PendingApproval } from '../stores/ui-store';
import {
  createTerminalTimelineProjector,
  type TerminalTimelineMessage,
} from '../core/timeline-projector';

type ConversationStore = ReturnType<typeof useConversationStore.getState>;
type AgentStore = ReturnType<typeof useAgentStore.getState>;
type UIStore = ReturnType<typeof useUIStore.getState>;
type StoreAccessor<TStore> = TStore | (() => TStore);

/**
 * Event adapter interface
 */
export interface IEventAdapter {
  /** Process a single agent event and dispatch to stores */
  handleEvent(event: AgentEvent): void;
  /** Process a host-neutral timeline/task message and dispatch to stores */
  handleMessage(message: TerminalTimelineMessage): void;
  /** Reset adapter state between executions */
  reset(): void;
}

export interface EventAdapterDeps {
  readonly conversationStore: StoreAccessor<ConversationStore>;
  readonly agentStore: StoreAccessor<AgentStore>;
  readonly uiStore: StoreAccessor<UIStore>;
}

/**
 * Create an event adapter that routes AgentEvent to Zustand stores.
 *
 * Event mapping:
 * - text_delta     → conversationStore.appendDelta
 * - text           → conversationStore.completeMessage
 * - thinking_content → conversationStore.setThinking
 * - tool_call/result/progress → conversationStore.applyTimelineRows
 * - tool_confirmation → uiStore.showToolApproval
 * - iteration      → agentStore.setIteration
 * - done           → agentStore.setIdle + updateUsage
 * - error          → agentStore.setError
 */
export function createEventAdapter(deps: EventAdapterDeps): IEventAdapter {
  const conversationStore = createStoreAccessor(deps.conversationStore);
  const agentStore = createStoreAccessor(deps.agentStore);
  const uiStore = createStoreAccessor(deps.uiStore);
  const timelineProjector = createTerminalTimelineProjector();
  let hasStartedMessage = false;
  let currentDelta = '';

  const ensureAssistantMessage = (): void => {
    if (hasStartedMessage) {
      return;
    }
    conversationStore().startAssistantMessage();
    hasStartedMessage = true;
  };

  const applyTimeline = (
    event: AgentEvent,
    options: { readonly ensureAssistant?: boolean } = {},
  ): void => {
    if (options.ensureAssistant) {
      ensureAssistantMessage();
    }
    const rows = timelineProjector.projectEvent(event);
    if (rows.length > 0) {
      conversationStore().applyTimelineRows(rows);
      hasStartedMessage = true;
    }
  };

  return {
    handleEvent(event: AgentEvent): void {
      switch (event.type) {
        case 'text_delta': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.content) {
            currentDelta += event.content;
            conversationStore().appendDelta(event.content);
          }
          break;
        }

        case 'assistant_text_replacement': {
          applyTimeline(event, { ensureAssistant: true });
          currentDelta = '';
          break;
        }

        case 'text': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.content) {
            conversationStore().completeMessage(event.content);
            currentDelta = '';
          }
          break;
        }

        case 'thinking':
        case 'thinking_content': {
          applyTimeline(event, { ensureAssistant: true });
          if (event.thinking) {
            conversationStore().setThinking(event.thinking);
          }
          break;
        }

        case 'tool_call': {
          applyTimeline(event, { ensureAssistant: true });
          break;
        }

        case 'tool_progress': {
          applyTimeline(event, { ensureAssistant: true });
          break;
        }

        case 'tool_result': {
          applyTimeline(event);
          break;
        }

        case 'tool_result_backfill': {
          applyTimeline(event);
          break;
        }

        case 'tool_confirmation': {
          applyTimeline(event);
          if (event.toolConfirmation) {
            agentStore().setWaitingConfirmation();
            const approval: PendingApproval = {
              toolCallId: event.toolConfirmation.toolCall.id,
              toolName: event.toolConfirmation.toolCall.name,
              arguments: event.toolConfirmation.toolCall.arguments,
              resolve: () => {
                // Resolved via session.confirmTool — handled by useAgentSession
              },
            };
            uiStore().showToolApproval(approval);
          }
          break;
        }

        case 'iteration': {
          if (event.iteration) {
            agentStore().setIteration(event.iteration.current, event.iteration.max);
          }
          break;
        }

        case 'done': {
          applyTimeline(event);
          agentStore().setIdle();
          if (event.usage) {
            agentStore().updateUsage(event.usage);
          }
          // Finalize streaming message with accumulated delta
          if (currentDelta) {
            conversationStore().completeMessage(currentDelta);
          }
          currentDelta = '';
          hasStartedMessage = false;
          break;
        }

        case 'error': {
          applyTimeline(event);
          if (event.error) {
            const error =
              event.error instanceof Error ? event.error : new Error(event.error.message);
            agentStore().setError(error);
            conversationStore().addError(error);
          }
          currentDelta = '';
          hasStartedMessage = false;
          break;
        }

        case 'messageQueued':
          if (event.messageQueueSnapshot) {
            agentStore().setMessageQueueSnapshot(event.messageQueueSnapshot);
          } else if (typeof event.pendingCount === 'number') {
            const current = agentStore().messageQueue.snapshot;
            agentStore().setMessageQueueSnapshot({
              conversationId: current?.conversationId ?? 'unknown',
              items: current?.items ?? [],
              pendingCount: event.pendingCount,
              version: current?.version ?? 0,
            });
          }
          if (event.queuedMessageItem) {
            conversationStore().addSystemMessage(
              `Queued message: ${event.queuedMessageItem.id} (${event.pendingCount ?? 1} pending)`,
            );
          }
          break;
      }
    },

    handleMessage(message: TerminalTimelineMessage): void {
      const rows = timelineProjector.projectMessage(message);
      if (rows.length > 0) {
        conversationStore().applyTimelineRows(rows);
        hasStartedMessage = true;
      }
    },

    reset(): void {
      timelineProjector.reset();
      hasStartedMessage = false;
      currentDelta = '';
    },
  };
}

function createStoreAccessor<TStore>(store: StoreAccessor<TStore>): () => TStore {
  return typeof store === 'function' ? (store as () => TStore) : () => store;
}
