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

type ConversationStore = ReturnType<typeof useConversationStore.getState>;
type AgentStore = ReturnType<typeof useAgentStore.getState>;
type UIStore = ReturnType<typeof useUIStore.getState>;

/**
 * Event adapter interface
 */
export interface IEventAdapter {
  /** Process a single agent event and dispatch to stores */
  handleEvent(event: AgentEvent): void;
  /** Reset adapter state between executions */
  reset(): void;
}

export interface EventAdapterDeps {
  readonly conversationStore: ConversationStore;
  readonly agentStore: AgentStore;
  readonly uiStore: UIStore;
}

/**
 * Create an event adapter that routes AgentEvent to Zustand stores.
 *
 * Event mapping:
 * - text_delta     → conversationStore.appendDelta
 * - text           → conversationStore.completeMessage
 * - thinking_content → conversationStore.setThinking
 * - tool_call      → conversationStore.addToolCall
 * - tool_result    → conversationStore.updateToolResult
 * - tool_confirmation → uiStore.showToolApproval
 * - iteration      → agentStore.setIteration
 * - done           → agentStore.setIdle + updateUsage
 * - error          → agentStore.setError
 */
export function createEventAdapter(deps: EventAdapterDeps): IEventAdapter {
  const { conversationStore, agentStore, uiStore } = deps;
  let hasStartedMessage = false;

  return {
    handleEvent(event: AgentEvent): void {
      switch (event.type) {
        case 'text_delta': {
          if (!hasStartedMessage) {
            conversationStore.startAssistantMessage();
            hasStartedMessage = true;
          }
          if (event.content) {
            conversationStore.appendDelta(event.content);
          }
          break;
        }

        case 'text': {
          if (!hasStartedMessage) {
            conversationStore.startAssistantMessage();
            hasStartedMessage = true;
          }
          if (event.content) {
            conversationStore.completeMessage(event.content);
          }
          break;
        }

        case 'thinking':
        case 'thinking_content': {
          if (!hasStartedMessage) {
            conversationStore.startAssistantMessage();
            hasStartedMessage = true;
          }
          if (event.thinking) {
            conversationStore.setThinking(event.thinking);
          }
          break;
        }

        case 'tool_call': {
          if (!hasStartedMessage) {
            conversationStore.startAssistantMessage();
            hasStartedMessage = true;
          }
          if (event.toolCall) {
            conversationStore.addToolCall(event.toolCall);
          }
          break;
        }

        case 'tool_result': {
          if (event.toolResult) {
            conversationStore.updateToolResult(event.toolResult);
          }
          break;
        }

        case 'tool_confirmation': {
          if (event.toolConfirmation) {
            agentStore.setWaitingConfirmation();
            const approval: PendingApproval = {
              toolCallId: event.toolConfirmation.toolCall.id,
              toolName: event.toolConfirmation.toolCall.name,
              arguments: event.toolConfirmation.toolCall.arguments,
              resolve: () => {
                // Resolved via session.confirmTool — handled by useAgentSession
              },
            };
            uiStore.showToolApproval(approval);
          }
          break;
        }

        case 'iteration': {
          if (event.iteration) {
            agentStore.setIteration(event.iteration.current, event.iteration.max);
          }
          break;
        }

        case 'done': {
          agentStore.setIdle();
          if (event.usage) {
            agentStore.updateUsage(event.usage);
          }
          // Finalize streaming message with accumulated delta
          const currentDelta = conversationStore.currentDelta;
          if (currentDelta) {
            conversationStore.completeMessage(currentDelta);
          }
          hasStartedMessage = false;
          break;
        }

        case 'error': {
          if (event.error) {
            agentStore.setError(event.error);
            conversationStore.addError(event.error);
          }
          hasStartedMessage = false;
          break;
        }

        case 'messageQueued':
          // No-op for TUI — messages are handled via execute()
          break;
      }
    },

    reset(): void {
      hasStartedMessage = false;
    },
  };
}
