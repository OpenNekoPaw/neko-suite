import {
  buildSubAgentEventMessage,
  projectSubAgentEventToWorkItem,
  type SubAgentEventMessage,
  type SubAgentWorkItemEvent,
  type AgentWorkflowIdentity,
} from '@neko-agent/types';
import type { SubAgentEvent } from '../subagent/types';

export interface ProjectSubAgentEventForConversationInput {
  readonly conversationId: string;
  readonly event: SubAgentEvent;
  readonly workflow?: AgentWorkflowIdentity;
}

export interface SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null;
}

export function createSubAgentEventRuntime(): SubAgentEventRuntime {
  return new DefaultSubAgentEventRuntime();
}

class DefaultSubAgentEventRuntime implements SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null {
    if (input.event.conversationId !== input.conversationId) {
      return null;
    }

    const event = input.event satisfies SubAgentWorkItemEvent;
    return buildSubAgentEventMessage({
      event,
      workItem: projectSubAgentEventToWorkItem(event, input.workflow),
    });
  }
}
